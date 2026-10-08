import * as Y from "yjs";
import * as decoding from "lib0/decoding";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  decryptJson,
  deriveDocumentKey,
  deriveRoomHash,
  encodeInvite,
  encryptJson,
  randomSecret,
} from "./private-crypto";
import type { DocumentKey } from "./private-crypto";
import { createPeerConnection, hasTurnRelay, logDirectPeerFailure, logRemoteIceCandidate, prepareIceServers } from "./webrtc-config";
import { splitYUpdate, Y_UPDATE_CHUNK_BYTES, YUpdateAssembler, type YUpdateChunkPayload } from "./y-update-transport";
import { applyCollaborationUpdate } from "./collaboration-update";
import type { ChatMessage, OwnerControlMessage, SessionState } from "@shared/schema";
import { peerSignalSchema, type CollaborationTransport, type InvitePayload, type PeerSignal } from "@shared/collaboration";

export type { CollaborationTransport, InvitePayload } from "@shared/collaboration";

export type SessionPermission = "edit" | "view";

export type JoinStatusCode =
  | "waiting_owner"
  | "owner_signal_retrying"
  | "signaling_reconnecting"
  | "signaling_error"
  | "stopped"
  | "connected_edit"
  | "connected_view"
  | "owner_connection_retrying"
  | "invalid_data_closed"
  | "connection_retrying"
  | "owner_connecting"
  | "waiting_owner_relay"
  | "owner_declined_relay";

export function sessionStateForJoinStatus(status: JoinStatusCode): SessionState {
  if (status === "stopped" || status === "invalid_data_closed") return "stopped";
  if (status === "connected_edit" || status === "connected_view") return "connected";
  if (status === "waiting_owner" || status === "owner_connecting" || status === "waiting_owner_relay") return "waiting";
  if (status === "signaling_error" || status === "owner_declined_relay") return "offline";
  return "reconnecting";
}

export function encodeLocalAwarenessState(awareness: Awareness) {
  return encodeAwarenessUpdate(awareness, [awareness.clientID]);
}

/** Client IDs carried by a Yjs awareness update, including removal updates. */
export function awarenessClientIdsFromUpdate(update: Uint8Array) {
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  const clientIds: number[] = [];
  for (let index = 0; index < count; index += 1) {
    clientIds.push(decoding.readVarUint(decoder));
    decoding.readVarUint(decoder);
    decoding.readVarString(decoder);
  }
  return clientIds;
}

export function canEditSession(permission: SessionPermission) {
  return permission === "edit";
}

type SignalMessage =
  | { type: "peers"; peers: string[] }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; fromPeerId: string; payload: PeerSignal };

type EncryptedPayload =
  | { type: "state-request"; stateVector?: string }
  | { type: "y-update"; update: string }
  | YUpdateChunkPayload
  | { type: "awareness"; update: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "control"; message: OwnerControlMessage }
  | { type: "image-request"; requestId: string; path: string }
  | { type: "image-metadata"; requestId: string; path: string; mimeType: string; sha: string; size: number; chunks: number }
  | { type: "image-chunk"; requestId: string; index: number; data: string }
  | { type: "image-complete"; requestId: string }
  | { type: "image-cancel"; requestId: string }
  | { type: "image-error"; requestId: string; message: string };

export interface CollaborationImageAsset {
  path: string;
  mimeType: string;
  sha: string;
  bytes: Uint8Array;
}

const UPDATE_BATCH_DELAY_MS = 16;
const MAX_BUFFERED_AMOUNT = 1_000_000;
const RECONNECT_DELAY_MS = 3000;
const DIRECT_CONNECTION_TIMEOUT_MS = 16_000;
const OFFER_WAIT_TIMEOUT_MS = 12_000;
const ICE_GATHERING_TIMEOUT_MS = 2_500;
const DISCONNECTED_GRACE_MS = 5_000;
const MAX_DIRECT_CONNECTION_ATTEMPTS = 2;
const IMAGE_CHUNK_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_REQUEST_TIMEOUT_MS = 30_000;
const IMAGE_MIME_ALLOWLIST = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"]);

function dataChannelIsOpen(channel?: RTCDataChannel) {
  return channel?.readyState === "open";
}

export function waitForIceGatheringComplete(
  connection: RTCPeerConnection,
  timeoutMs = ICE_GATHERING_TIMEOUT_MS,
) {
  if (connection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (connection.iceGatheringState === "complete") finish();
    };
    const timeout = setTimeout(finish, timeoutMs);
    connection.addEventListener("icegatheringstatechange", check);
  });
}

export function completeLocalDescription(
  connection: RTCPeerConnection,
  expectedType: "offer" | "answer",
): RTCSessionDescriptionInit {
  const description = connection.localDescription;
  if (!description || description.type !== expectedType || !description.sdp) {
    throw new Error(`WebRTC ${expectedType} was not created.`);
  }
  return { type: expectedType, sdp: description.sdp };
}

export function signalMatchesNegotiation(activeNegotiationId: string | undefined, payload: PeerSignal) {
  return !("negotiationId" in payload) || payload.negotiationId === activeNegotiationId;
}

export function isRetiredNegotiation(
  activeOwnerPeerId: string | undefined,
  activeNegotiationId: string | undefined,
  retiredNegotiationIds: ReadonlySet<string>,
  incomingOwnerPeerId: string,
  incomingNegotiationId: string,
) {
  return activeOwnerPeerId === incomingOwnerPeerId
    && Boolean(activeNegotiationId)
    && activeNegotiationId !== incomingNegotiationId
    && retiredNegotiationIds.has(incomingNegotiationId);
}

export function scheduleDirectConnectionFallback(
  isConnected: () => boolean,
  onTimeout: () => void,
  timeoutMs = DIRECT_CONNECTION_TIMEOUT_MS,
) {
  return setTimeout(() => {
    if (!isConnected()) onTimeout();
  }, timeoutMs);
}

export function directConnectionFailureAction(attempt: number): "retry" | "relay" {
  return attempt < MAX_DIRECT_CONNECTION_ATTEMPTS ? "retry" : "relay";
}

function validChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as ChatMessage;
  return (
    typeof message.id === "string" && message.id.length <= 100 &&
    typeof message.sessionId === "string" && message.sessionId.length <= 100 &&
    typeof message.username === "string" && message.username.length <= 80 &&
    typeof message.message === "string" && message.message.length <= 10_000 &&
    typeof message.timestamp === "number" && Number.isFinite(message.timestamp) &&
    typeof message.color === "string" && message.color.length <= 32
  );
}

function validOwnerControl(value: unknown): value is OwnerControlMessage {
  if (!value || typeof value !== "object") return false;
  const control = value as OwnerControlMessage;
  return (
    control.type === "workspace-control" &&
    Array.isArray(control.selectedScopes) &&
    control.selectedScopes.length <= 100 &&
    control.selectedScopes.every((scope) => typeof scope === "string" && scope.length > 0 && scope.length <= 255) &&
    (control.selectedFileTypes === undefined || (
      Array.isArray(control.selectedFileTypes) &&
    control.selectedFileTypes.length <= 5 &&
      control.selectedFileTypes.every((fileType) => fileType === "markdown" || fileType === "canvas" || fileType === "drawing" || fileType === "image" || fileType === "asset")
    )) &&
    typeof control.syncing === "boolean" &&
    typeof control.workspaceName === "string" && control.workspaceName.length <= 255 &&
    Number.isSafeInteger(control.revision) && control.revision > 0
  );
}

function signalUrl() {
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/signal`;
}

function newPeerConnection(allowTurnRelay = false, diagnosticLabel: "owner" | "joiner" = "joiner") {
  // Direct sessions must remain STUN-only until the owner explicitly approves
  // the encrypted relay fallback. The previous automatic mode fetched TURN
  // credentials during direct startup and let ICE silently switch transports.
  return createPeerConnection(allowTurnRelay, diagnosticLabel, false);
}

function sendSignal(ws: WebSocket, targetPeerId: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "signal", targetPeerId, payload: peerSignalSchema.parse(payload) }));
  }
}

async function sendEncrypted(channel: RTCDataChannel, key: DocumentKey, payload: EncryptedPayload) {
  if (channel.readyState === "open") {
    channel.send(await encryptJson(key, payload));
  }
}

async function sendYUpdate(channel: RTCDataChannel, key: DocumentKey, update: Uint8Array) {
  if (update.byteLength <= Y_UPDATE_CHUNK_BYTES) {
    await sendEncrypted(channel, key, { type: "y-update", update: bytesToBase64Url(update) });
    return;
  }
  const updateId = randomSecret(12);
  for (const payload of splitYUpdate(update, updateId)) {
    while (channel.readyState === "open" && channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      await new Promise((resolve) => setTimeout(resolve, UPDATE_BATCH_DELAY_MS));
    }
    if (channel.readyState !== "open") throw new Error("The collaboration connection closed while sending the workspace.");
    await sendEncrypted(channel, key, payload);
  }
}

class YUpdateSender {
  private pending: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private sendUpdate: (update: Uint8Array) => Promise<void>) {}

  queue(update: Uint8Array) {
    this.pending.push(update);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), UPDATE_BATCH_DELAY_MS);
    }
  }

  clear() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.pending = [];
  }

  private async flush() {
    this.flushTimer = undefined;
    if (this.pending.length === 0) return;

    const updates = this.pending;
    this.pending = [];
    const merged = updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);

    try {
      await this.sendUpdate(merged);
    } catch (error) {
      console.error("Failed to send collaborative update:", error);
    }
  }
}

interface OwnerPeerState {
  pc: RTCPeerConnection;
  negotiationId: string;
  channel?: RTCDataChannel;
  updateSender?: YUpdateSender;
  pendingLocalCandidates: RTCIceCandidateInit[];
  pendingCandidates: RTCIceCandidateInit[];
  descriptionSent: boolean;
  offerInFlight: boolean;
  disconnectedTimer?: ReturnType<typeof setTimeout>;
  directConnectionTimer?: ReturnType<typeof setTimeout>;
  directAttempt: number;
  awarenessClientIds: Set<number>;
}

class OwnerRoom {
  private peers = new Map<string, OwnerPeerState>();
  private relayReadyPeers = new Set<string>();
  private ws?: WebSocket;
  private stopped = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private allowTurnRelay = false;
  private relayHandshakeRequired = false;
  private directAttempts = new Map<string, number>();
  private directRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private relayFallbackRequested = new Set<string>();
  private retiredNegotiations = new Map<string, Set<string>>();

  constructor(
    private doc: Y.Doc,
    private key: DocumentKey,
    private roomHash: string,
    private peerId: string,
    private permission: SessionPermission,
    private onPeerCountChange: () => void,
    private awareness: Awareness,
    private getControl: () => OwnerControlMessage,
    private getChatHistory: () => ChatMessage[],
    private onChat: (message: ChatMessage, room: OwnerRoom, peerId: string) => void,
    private onImageRequest: (path: string) => Promise<CollaborationImageAsset>,
    private onStatus: (state: SessionState) => void,
    private onRelayFallbackNeeded: (peerId: string) => void = () => undefined,
    initialTransport: CollaborationTransport = "direct",
  ) {
    this.allowTurnRelay = initialTransport === "relay";
  }

  connect() {
    this.stopped = false;
    this.connectSignal();
  }

  private connectSignal() {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    console.log("Owner connecting to signaling server:", signalUrl());
    this.ws = new WebSocket(signalUrl());

    this.ws.onopen = () => {
      console.log("Owner connected to signaling server");
      this.onStatus("waiting");
      this.ws?.send(JSON.stringify({ type: "join", roomHash: this.roomHash, peerId: this.peerId, peerRole: "owner" }));
    };

    this.ws.onclose = () => {
      if (this.stopped) return;
      console.log("Owner signaling server disconnected. Reconnecting in 3s...");
      this.onStatus("reconnecting");
      this.reconnectTimer = setTimeout(() => this.connectSignal(), RECONNECT_DELAY_MS);
    };

    this.ws.onerror = (err) => {
      if (!this.stopped) console.warn("Owner signaling error; reconnect will be attempted.", err);
    };

    this.ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data) as SignalMessage;
        // Match the original fast path: the owner is the sole offerer and
        // starts immediately when signaling discovers a guest.
        if (message.type === "peers") {
          for (const peerId of message.peers) await this.createOffer(peerId, randomSecret(12));
        }
        if (message.type === "peer-joined") {
          await this.createOffer(message.peerId, randomSecret(12));
        }
        if (message.type === "peer-left") {
          this.removePeer(message.peerId);
          this.relayReadyPeers.delete(message.peerId);
          this.clearDirectRetry(message.peerId);
          this.directAttempts.delete(message.peerId);
          this.relayFallbackRequested.delete(message.peerId);
          this.retiredNegotiations.delete(message.peerId);
        }
        if (message.type === "signal") {
          await this.handleSignal(message.fromPeerId, peerSignalSchema.parse(message.payload));
        }
      } catch (error) {
        console.warn("Owner could not process a collaboration signal.", error);
      }
    };
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.ws?.close();
    this.ws = undefined;
    for (const peerId of Array.from(this.peers.keys())) this.removePeer(peerId);
    this.relayReadyPeers.clear();
    for (const timer of this.directRetryTimers.values()) clearTimeout(timer);
    this.directRetryTimers.clear();
    this.directAttempts.clear();
    this.relayFallbackRequested.clear();
    this.retiredNegotiations.clear();
    this.onPeerCountChange();
  }

  peerCount() {
    return Array.from(this.peers.values()).filter((peer) => peer.channel?.readyState === "open").length;
  }

  async broadcastUpdate(update: Uint8Array, excludePeerId?: string) {
    for (const [peerId, peer] of this.peers.entries()) {
      if (peerId === excludePeerId || peer.channel?.readyState !== "open") continue;
      peer.updateSender?.queue(update);
    }
  }

  async broadcastAwareness(update: Uint8Array, excludePeerId?: string) {
    await this.broadcast({ type: "awareness", update: bytesToBase64Url(update) }, excludePeerId);
  }

  async broadcastChat(message: ChatMessage, excludePeerId?: string) {
    await this.broadcast({ type: "chat", message }, excludePeerId);
  }

  async broadcastControl(message: OwnerControlMessage) {
    await this.broadcast({ type: "control", message });
  }

  private async broadcast(payload: EncryptedPayload, excludePeerId?: string) {
    await Promise.all(
      Array.from(this.peers.entries()).map(async ([peerId, peer]) => {
        if (peerId !== excludePeerId && peer.channel?.readyState === "open") {
          await sendEncrypted(peer.channel, this.key, payload);
        }
      }),
    );
  }

  private setupPeer(peerId: string, negotiationId: string) {
    const existing = this.peers.get(peerId);
    if (existing?.negotiationId === negotiationId) return existing.pc;
    if (existing) this.removePeer(peerId, existing.pc);

    const pc = newPeerConnection(this.allowTurnRelay, "owner");
    const directAttempt = this.directAttempts.get(peerId) || 1;
    const peerState: OwnerPeerState = {
      pc,
      negotiationId,
      pendingLocalCandidates: [],
      pendingCandidates: [],
      descriptionSent: false,
      offerInFlight: false,
      directAttempt,
      awarenessClientIds: new Set(),
    };
    this.peers.set(peerId, peerState);
    pc.onicecandidate = (event) => {
      const current = this.peers.get(peerId);
      if (!event.candidate || !this.ws || current?.pc !== pc) return;
      const candidate = event.candidate.toJSON();
      if (current.descriptionSent) {
        sendSignal(this.ws, peerId, { kind: "candidate", negotiationId, candidate });
      } else {
        current.pendingLocalCandidates.push(candidate);
      }
    };
    pc.onconnectionstatechange = () => {
      const current = this.peers.get(peerId);
      if (!current || current.pc !== pc) return;
      if (pc.connectionState === "connected") {
        if (current.disconnectedTimer) clearTimeout(current.disconnectedTimer);
        current.disconnectedTimer = undefined;
        if (current.directConnectionTimer) clearTimeout(current.directConnectionTimer);
        current.directConnectionTimer = undefined;
        this.clearDirectRetry(peerId);
        this.directAttempts.delete(peerId);
        this.relayFallbackRequested.delete(peerId);
        return;
      }
      if (pc.connectionState === "failed" && !this.allowTurnRelay) {
        void this.handleDirectConnectionFailure(peerId, pc);
        return;
      }
      if (pc.connectionState === "failed" && this.allowTurnRelay) {
        this.removePeer(peerId, pc);
        return;
      }
      if (pc.connectionState === "disconnected") {
        if (current.disconnectedTimer) clearTimeout(current.disconnectedTimer);
        current.disconnectedTimer = setTimeout(() => {
          if (pc.connectionState !== "disconnected") return;
          if (this.allowTurnRelay) this.removePeer(peerId, pc);
          else void this.handleDirectConnectionFailure(peerId, pc);
        }, DISCONNECTED_GRACE_MS);
        return;
      }
      if (["closed", "failed"].includes(pc.connectionState)) {
        this.removePeer(peerId, pc);
      }
    };
    return pc;
  }

  private removePeer(peerId: string, expectedConnection?: RTCPeerConnection) {
    const peer = this.peers.get(peerId);
    if (!peer || (expectedConnection && peer.pc !== expectedConnection)) return;
    this.rememberRetiredNegotiation(peerId, peer.negotiationId);
    if (peer.disconnectedTimer) clearTimeout(peer.disconnectedTimer);
    if (peer.directConnectionTimer) clearTimeout(peer.directConnectionTimer);
    this.clearDirectRetry(peerId);
    peer.updateSender?.clear();
    this.peers.delete(peerId);
    peer.pc.close();
    const awarenessClientIds = Array.from(peer.awarenessClientIds).filter((clientId) => clientId !== this.awareness.clientID);
    if (awarenessClientIds.length > 0) {
      removeAwarenessStates(this.awareness, awarenessClientIds, { type: "owner-room-disconnect", room: this, peerId });
    }
    this.onPeerCountChange();
  }

  private rememberRetiredNegotiation(peerId: string, negotiationId?: string) {
    if (!negotiationId) return;
    const retired = this.retiredNegotiations.get(peerId) || new Set<string>();
    retired.add(negotiationId);
    while (retired.size > 6) retired.delete(retired.values().next().value as string);
    this.retiredNegotiations.set(peerId, retired);
  }

  private isRetiredNegotiation(peerId: string, negotiationId: string) {
    return this.retiredNegotiations.get(peerId)?.has(negotiationId) || false;
  }

  private clearDirectRetry(peerId: string) {
    const timer = this.directRetryTimers.get(peerId);
    if (timer) clearTimeout(timer);
    this.directRetryTimers.delete(peerId);
  }

  private scheduleDirectRetry(peerId: string) {
    if (this.allowTurnRelay || this.stopped || this.directRetryTimers.has(peerId)) return;
    const timer = setTimeout(() => {
      this.directRetryTimers.delete(peerId);
      if (this.allowTurnRelay || this.stopped || this.peers.has(peerId)) return;
      this.directAttempts.set(peerId, (this.directAttempts.get(peerId) || 1) + 1);
      this.onStatus("reconnecting");
      void this.createOffer(peerId, randomSecret(12));
    }, 250);
    this.directRetryTimers.set(peerId, timer);
  }

  private async handleDirectConnectionFailure(peerId: string, connection: RTCPeerConnection) {
    const peer = this.peers.get(peerId);
    if (!peer || peer.pc !== connection || this.allowTurnRelay || this.stopped) return;
    const attempt = peer.directAttempt;
    void logDirectPeerFailure("owner", connection, attempt);
    this.removePeer(peerId, connection);
    if (directConnectionFailureAction(attempt) === "retry") {
      this.scheduleDirectRetry(peerId);
      return;
    }
    if (this.relayFallbackRequested.has(peerId)) return;
    this.relayFallbackRequested.add(peerId);
    this.onRelayFallbackNeeded(peerId);
  }

  private async restartDirectConnection(peerId: string, negotiationId: string) {
    if (this.allowTurnRelay) return;
    if (this.isRetiredNegotiation(peerId, negotiationId) || this.peers.get(peerId)?.negotiationId === negotiationId) return;
    this.clearDirectRetry(peerId);
    this.directAttempts.set(peerId, Math.min(MAX_DIRECT_CONNECTION_ATTEMPTS, (this.directAttempts.get(peerId) || 1) + 1));
    await this.createOffer(peerId, negotiationId);
  }

  private async beginPeerConnection(peerId: string, negotiationId: string) {
    const existing = this.peers.get(peerId);
    if (existing && !["closed", "failed"].includes(existing.pc.connectionState)) return;
    if (this.allowTurnRelay && this.relayHandshakeRequired && !this.relayReadyPeers.has(peerId)) {
      if (this.ws) sendSignal(this.ws, peerId, { kind: "relay-approved" });
      return;
    }
    await this.createOffer(peerId, negotiationId);
  }

  enableTurnRelay(targetPeerId?: string) {
    if (this.allowTurnRelay) return;
    this.allowTurnRelay = true;
    this.relayHandshakeRequired = true;
    this.relayReadyPeers.clear();
    const peerIds = Array.from(new Set([...this.peers.keys(), ...(targetPeerId ? [targetPeerId] : [])]));
    for (const peerId of Array.from(this.peers.keys())) this.removePeer(peerId);
    this.onPeerCountChange();
    if (this.ws?.readyState === WebSocket.OPEN) {
      for (const peerId of peerIds) {
        sendSignal(this.ws, peerId, { kind: "relay-approved" });
      }
    }
  }

  notifyRelayDecision(allowed: boolean, targetPeerId?: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const peerIds = targetPeerId ? [targetPeerId] : Array.from(this.peers.keys());
    for (const peerId of peerIds) {
      sendSignal(this.ws, peerId, { kind: allowed ? "relay-approved" : "relay-denied" });
    }
  }

  setRelayFallbackHandler(handler: (peerId: string) => void) {
    this.onRelayFallbackNeeded = handler;
  }

  private setupChannel(peerId: string, channel: RTCDataChannel) {
    const canceledImageRequests = new Set<string>();
    const yUpdateAssembler = new YUpdateAssembler();
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.channel = channel;
      peer.updateSender = new YUpdateSender((update) => sendYUpdate(channel, this.key, update));
    }
    channel.onopen = async () => {
      const current = this.peers.get(peerId);
      if (current?.directConnectionTimer) clearTimeout(current.directConnectionTimer);
      if (current) current.directConnectionTimer = undefined;
      this.onStatus("connected");
      this.onPeerCountChange();
    };
    channel.onclose = () => {
      yUpdateAssembler.clear();
      peer?.updateSender?.clear();
      if (peer) {
        peer.channel = undefined;
        peer.updateSender = undefined;
      }
      this.onPeerCountChange();
    };
    channel.onmessage = async (event) => {
      try {
        const payload = await decryptJson<EncryptedPayload>(this.key, event.data);
      if (payload.type === "image-cancel" && typeof payload.requestId === "string") {
        canceledImageRequests.add(payload.requestId);
        return;
      }
      if (payload.type === "state-request") {
        let update: Uint8Array;
        try {
          update = payload.stateVector
            ? Y.encodeStateAsUpdate(this.doc, base64UrlToBytes(payload.stateVector))
            : Y.encodeStateAsUpdate(this.doc);
        } catch {
          update = Y.encodeStateAsUpdate(this.doc);
        }

        await sendYUpdate(channel, this.key, update);
        const awarenessUpdate = encodeAwarenessUpdate(this.awareness, Array.from(this.awareness.getStates().keys()));
        if (awarenessUpdate.byteLength > 0) {
          await sendEncrypted(channel, this.key, { type: "awareness", update: bytesToBase64Url(awarenessUpdate) });
        }
        await sendEncrypted(channel, this.key, { type: "control", message: this.getControl() });
        for (const message of this.getChatHistory().slice(-200)) {
          await sendEncrypted(channel, this.key, { type: "chat", message });
        }
      }
      if (payload.type === "y-update" && canEditSession(this.permission)) {
        const update = base64UrlToBytes(payload.update);
        applyCollaborationUpdate(this.doc, update, { type: "owner-room", room: this, peerId });
      }
      if ((payload.type === "y-update-metadata" || payload.type === "y-update-chunk" || payload.type === "y-update-complete") && canEditSession(this.permission)) {
        const update = yUpdateAssembler.accept(payload);
        if (update) applyCollaborationUpdate(this.doc, update, { type: "owner-room", room: this, peerId });
      }
      if (payload.type === "awareness") {
        const update = base64UrlToBytes(payload.update);
        for (const clientId of awarenessClientIdsFromUpdate(update)) {
          if (clientId !== this.awareness.clientID) peer?.awarenessClientIds.add(clientId);
        }
        applyAwarenessUpdate(this.awareness, update, { type: "owner-room", room: this, peerId });
      }
      if (payload.type === "chat" && validChatMessage(payload.message)) {
        this.onChat(payload.message, this, peerId);
      }
      if (payload.type === "image-request" && typeof payload.requestId === "string" && payload.requestId.length <= 100 && typeof payload.path === "string" && payload.path.length <= 1024) {
        try {
          const asset = await this.onImageRequest(payload.path);
          if (asset.bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds the 10 MB collaboration limit.");
          if (!IMAGE_MIME_ALLOWLIST.has(asset.mimeType)) throw new Error("Image MIME type is not allowed.");
          const chunks = Math.ceil(asset.bytes.byteLength / IMAGE_CHUNK_BYTES);
          if (canceledImageRequests.has(payload.requestId)) return;
          await sendEncrypted(channel, this.key, { type: "image-metadata", requestId: payload.requestId, path: asset.path, mimeType: asset.mimeType, sha: asset.sha, size: asset.bytes.byteLength, chunks });
          for (let index = 0; index < chunks; index += 1) {
            if (channel.readyState !== "open" || canceledImageRequests.has(payload.requestId)) return;
            while (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) await new Promise((resolve) => setTimeout(resolve, UPDATE_BATCH_DELAY_MS));
            const bytes = asset.bytes.slice(index * IMAGE_CHUNK_BYTES, (index + 1) * IMAGE_CHUNK_BYTES);
            await sendEncrypted(channel, this.key, { type: "image-chunk", requestId: payload.requestId, index, data: bytesToBase64Url(bytes) });
          }
          await sendEncrypted(channel, this.key, { type: "image-complete", requestId: payload.requestId });
        } catch (error) {
          if (!canceledImageRequests.has(payload.requestId)) await sendEncrypted(channel, this.key, { type: "image-error", requestId: payload.requestId, message: error instanceof Error ? error.message.slice(0, 500) : "Image unavailable." });
        } finally {
          canceledImageRequests.delete(payload.requestId);
        }
      }
      // Control messages are deliberately owner-to-peer only. A crafted peer
      // message is ignored, regardless of edit permission.
      } catch (error) {
        console.warn("Rejected invalid encrypted collaboration data.", error);
        yUpdateAssembler.clear();
        peer?.updateSender?.clear();
        channel.close();
        this.onStatus("offline");
      }
    };
  }

  private async createOffer(peerId: string, negotiationId: string) {
    this.clearDirectRetry(peerId);
    if (!this.allowTurnRelay) this.directAttempts.set(peerId, this.directAttempts.get(peerId) || 1);
    const existing = this.peers.get(peerId);
    if (existing?.negotiationId === negotiationId && (existing.offerInFlight || (existing.channel && existing.channel.readyState !== "closed"))) return;
    const pc = this.setupPeer(peerId, negotiationId);
    const peer = this.peers.get(peerId);
    if (!peer || peer.pc !== pc) return;
    if (pc.signalingState !== "stable") return;
    peer.offerInFlight = true;
    const channel = pc.createDataChannel("marktwin-private");
    this.setupChannel(peerId, channel);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      const current = this.peers.get(peerId);
      if (!this.ws || current?.pc !== pc || current.negotiationId !== negotiationId) return;
      sendSignal(this.ws, peerId, {
        kind: "offer",
        negotiationId,
        description: completeLocalDescription(pc, "offer"),
      });
      current.descriptionSent = true;
      for (const candidate of current.pendingLocalCandidates.splice(0)) {
        sendSignal(this.ws, peerId, { kind: "candidate", negotiationId, candidate });
      }
      if (!this.allowTurnRelay) {
        current.directConnectionTimer = scheduleDirectConnectionFallback(
          () => this.stopped || this.peers.get(peerId)?.pc !== pc || dataChannelIsOpen(this.peers.get(peerId)?.channel),
          () => {
            const active = this.peers.get(peerId);
            if (active?.pc === pc) {
              active.directConnectionTimer = undefined;
              void this.handleDirectConnectionFailure(peerId, pc);
            }
          },
        );
      }
    } finally {
      const current = this.peers.get(peerId);
      if (current?.pc === pc) current.offerInFlight = false;
    }
  }

  private async handleSignal(peerId: string, payload: PeerSignal) {
    if (payload.kind === "relay-request") {
      this.onRelayFallbackNeeded(peerId);
      return;
    }
    if (payload.kind === "relay-approved" || payload.kind === "relay-denied") return;
    if (payload.kind === "direct-retry") {
      await this.restartDirectConnection(peerId, payload.negotiationId);
      return;
    }
    if (payload.kind === "ready") {
      if (this.allowTurnRelay && this.relayHandshakeRequired) {
        this.relayReadyPeers.add(peerId);
      }
      await this.beginPeerConnection(peerId, payload.negotiationId);
      return;
    }
    const existing = this.peers.get(peerId);
    if (!existing || !signalMatchesNegotiation(existing.negotiationId, payload)) return;
    const pc = existing.pc;
    if (payload.kind === "answer") {
      await pc.setRemoteDescription(payload.description);
      const peer = this.peers.get(peerId);
      if (peer) {
        const pending = peer.pendingCandidates.splice(0);
        for (const candidate of pending) await pc.addIceCandidate(candidate);
      }
    }
    if (payload.kind === "candidate") {
      const peer = this.peers.get(peerId);
      logRemoteIceCandidate("owner", payload.candidate);
      if (pc.remoteDescription) await pc.addIceCandidate(payload.candidate);
      else peer?.pendingCandidates.push(payload.candidate);
    }
  }
}

type OwnerRoomOrigin = {
  type: "owner-room";
  room: OwnerRoom;
  peerId: string;
};

function isOwnerRoomOrigin(origin: unknown): origin is OwnerRoomOrigin {
  return (
    typeof origin === "object" &&
    origin !== null &&
    (origin as OwnerRoomOrigin).type === "owner-room"
  );
}

export class OwnerCollaboration {
  private rooms: OwnerRoom[] = [];
  private stopped = false;
  private relayEnabled = false;
  private relayPromptInFlight = false;
  private relayDecision?: boolean;
  private control: OwnerControlMessage;
  private chatHistory: ChatMessage[];
  private updateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin !== this) {
      void this.broadcastUpdate(update, isOwnerRoomOrigin(origin) ? origin : undefined);
    }
  };
  private awarenessHandler = ({ added, updated, removed }: any, origin: unknown) => {
    if (origin !== this) {
      const changedClients = added.concat(updated, removed);
      const update = encodeAwarenessUpdate(this.awareness, changedClients);
      void this.broadcastAwareness(update, isOwnerRoomOrigin(origin) ? origin : undefined);
    }
  };

  constructor(
    private doc: Y.Doc,
    public editLink: string,
    public viewLink: string,
    rooms: OwnerRoom[],
    private onPeerCountChange: () => void,
    private awareness: Awareness,
    control: OwnerControlMessage,
    chatHistory: ChatMessage[],
    private onChat: (message: ChatMessage) => void,
    private onStatus: (state: SessionState) => void,
    private onRelayFallbackNeeded?: () => Promise<boolean>,
    initialTransport: CollaborationTransport = "direct",
    private onTransportChange?: (transport: CollaborationTransport) => void,
  ) {
    this.rooms = rooms;
    this.relayEnabled = initialTransport === "relay";
    this.relayDecision = this.relayEnabled ? true : undefined;
    this.control = control;
    this.chatHistory = chatHistory.slice(-200);
    this.doc.on("update", this.updateHandler);
    this.awareness.on("update", this.awarenessHandler);
  }

  connect() {
    this.stopped = false;
    this.onStatus("starting");
    this.rooms.forEach((room) => room.connect());
  }

  requestRelayFallback(peerId?: string) {
    if (this.stopped) return;
    if (this.relayEnabled) {
      this.rooms.forEach((room) => room.notifyRelayDecision(true, peerId));
      return;
    }
    if (this.relayDecision === false) {
      this.rooms.forEach((room) => room.notifyRelayDecision(false, peerId));
      return;
    }
    if (this.relayPromptInFlight) return;
    this.relayPromptInFlight = true;
    void (async () => {
      try {
        const accepted = await this.onRelayFallbackNeeded?.() || false;
        this.relayDecision = accepted;
        if (!accepted || this.stopped) {
          this.rooms.forEach((room) => room.notifyRelayDecision(false));
          return;
        }
        const iceServers = await prepareIceServers(fetch, true);
        if (!hasTurnRelay(iceServers)) {
          this.onStatus("offline");
          this.rooms.forEach((room) => room.notifyRelayDecision(false));
          return;
        }
        this.relayEnabled = true;
        this.rooms.forEach((room) => room.enableTurnRelay(peerId));
        this.onTransportChange?.("relay");
      } catch (error) {
        console.warn("Could not enable the collaboration relay fallback.", error);
        this.onStatus("offline");
      } finally {
        this.relayPromptInFlight = false;
      }
    })();
  }

  stop(notify = true) {
    if (this.stopped) return;
    this.stopped = true;
    this.doc.off("update", this.updateHandler);
    this.awareness.off("update", this.awarenessHandler);
    this.rooms.forEach((room) => room.stop());
    if (notify) this.onStatus("stopped");
  }

  peerCount() {
    return this.rooms.reduce((count, room) => count + room.peerCount(), 0);
  }

  transportMode(): CollaborationTransport {
    return this.relayEnabled ? "relay" : "direct";
  }

  currentControl() {
    return this.control;
  }

  currentChatHistory() {
    return this.chatHistory;
  }

  updateControl(update: Omit<OwnerControlMessage, "type" | "revision">) {
    this.control = {
      type: "workspace-control",
      ...update,
      revision: this.control.revision + 1,
    };
    void Promise.all(this.rooms.map((room) => room.broadcastControl(this.control)));
  }

  sendChat(message: ChatMessage) {
    if (!validChatMessage(message)) return;
    if (!this.chatHistory.some((candidate) => candidate.id === message.id)) this.chatHistory = [...this.chatHistory, message].slice(-200);
    this.onChat(message);
    void Promise.all(this.rooms.map((room) => room.broadcastChat(message)));
  }

  receiveChat(message: ChatMessage, originRoom: OwnerRoom, peerId: string) {
    if (!validChatMessage(message)) return;
    if (!this.chatHistory.some((candidate) => candidate.id === message.id)) this.chatHistory = [...this.chatHistory, message].slice(-200);
    this.onChat(message);
    void Promise.all(this.rooms.map((room) => room.broadcastChat(message, room === originRoom ? peerId : undefined)));
  }

  private async broadcastUpdate(update: Uint8Array, origin?: OwnerRoomOrigin) {
    await Promise.all(this.rooms.map((room) => room.broadcastUpdate(update, origin?.room === room ? origin.peerId : undefined)));
  }

  private async broadcastAwareness(update: Uint8Array, origin?: OwnerRoomOrigin) {
    await Promise.all(this.rooms.map((room) => room.broadcastAwareness(update, origin?.room === room ? origin.peerId : undefined)));
  }
}

export interface OwnerCollaborationOptions {
  control: Omit<OwnerControlMessage, "type" | "revision">;
  transport?: CollaborationTransport;
  onChat?: (message: ChatMessage) => void;
  onStatus?: (state: SessionState) => void;
  onTransportChange?: (transport: CollaborationTransport) => void;
  initialChatMessages?: ChatMessage[];
  onImageRequest?: (path: string) => Promise<CollaborationImageAsset>;
  onRelayFallbackNeeded?: () => Promise<boolean>;
}

/** Create the replacement before invalidating the current private links. */
export async function replaceOwnerCollaboration(
  current: OwnerCollaboration | null,
  createReplacement: () => Promise<OwnerCollaboration>,
) {
  const replacement = await createReplacement();
  current?.stop(false);
  return replacement;
}

export async function startOwnerCollaboration(
  doc: Y.Doc,
  awareness: Awareness,
  onPeerCountChange: () => void,
  options: OwnerCollaborationOptions,
): Promise<OwnerCollaboration> {
  const transport = options.transport || "direct";
  const iceServers = await prepareIceServers(fetch, transport === "relay");
  if (transport === "relay" && !hasTurnRelay(iceServers)) {
    throw new Error("Encrypted relay is unavailable on this Marktwin deployment.");
  }
  const documentSecret = randomSecret();
  const editSecret = randomSecret();
  const viewSecret = randomSecret();
  const key = await deriveDocumentKey(documentSecret);
  const ownerPeerId = randomSecret(12);
  const initialControl: OwnerControlMessage = { type: "workspace-control", ...options.control, revision: 1 };
  let session: OwnerCollaboration;
  const getControl = () => session?.currentControl() || initialControl;
  const getChatHistory = () => session?.currentChatHistory() || options.initialChatMessages || [];
  const onRoomChat = (message: ChatMessage, room: OwnerRoom, peerId: string) => session?.receiveChat(message, room, peerId);
  const onStatus = options.onStatus || (() => undefined);
  const onImageRequest = options.onImageRequest || (async () => { throw new Error("Repository image previews are unavailable."); });
  const editRoom = new OwnerRoom(doc, key, await deriveRoomHash(editSecret), `${ownerPeerId}-e`, "edit", onPeerCountChange, awareness, getControl, getChatHistory, onRoomChat, onImageRequest, onStatus, () => undefined, transport);
  const viewRoom = new OwnerRoom(doc, key, await deriveRoomHash(viewSecret), `${ownerPeerId}-v`, "view", onPeerCountChange, awareness, getControl, getChatHistory, onRoomChat, onImageRequest, onStatus, () => undefined, transport);

  const invitePath = "/join#";
  const editLink = `${window.location.origin}${invitePath}${encodeInvite({
    v: 1,
    role: "edit",
    documentSecret,
    roomSecret: editSecret,
    ...(transport === "relay" ? { transport } : {}),
  } satisfies InvitePayload)}`;
  const viewLink = `${window.location.origin}${invitePath}${encodeInvite({
    v: 1,
    role: "view",
    documentSecret,
    roomSecret: viewSecret,
    ...(transport === "relay" ? { transport } : {}),
  } satisfies InvitePayload)}`;

  session = new OwnerCollaboration(
    doc,
    editLink,
    viewLink,
    [editRoom, viewRoom],
    onPeerCountChange,
    awareness,
    initialControl,
    options.initialChatMessages || [],
    options.onChat || (() => undefined),
    onStatus,
    options.onRelayFallbackNeeded,
    transport,
    options.onTransportChange,
  );
  editRoom.setRelayFallbackHandler((peerId) => session.requestRelayFallback(peerId));
  viewRoom.setRelayFallbackHandler((peerId) => session.requestRelayFallback(peerId));
  session.connect();
  return session;
}

export class JoinCollaboration {
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private updateSender?: YUpdateSender;
  private allowTurnRelay = false;
  private relayRequestSent = false;
  private relayEnableInFlight = false;
  private ws?: WebSocket;
  private stopped = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private offerRetryTimer?: ReturnType<typeof setTimeout>;
  private directConnectionTimer?: ReturnType<typeof setTimeout>;
  private directConnectionAttempt = 0;
  private directRetryInFlight = false;
  private ownerPeerId?: string;
  private negotiationId?: string;
  private localDescriptionSent = false;
  private disconnectedTimer?: ReturnType<typeof setTimeout>;
  private retiredNegotiationIds = new Set<string>();
  private pendingLocalCandidates: RTCIceCandidateInit[] = [];
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private imageRequests = new Map<string, {
    resolve: (asset: CollaborationImageAsset) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    metadata?: { path: string; mimeType: string; sha: string; size: number; chunks: number };
    chunks: Map<number, Uint8Array>;
  }>();
  private updateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin !== this && canEditSession(this.permission)) {
      this.updateSender?.queue(update);
    }
  };
  private awarenessHandler = ({ added, updated, removed }: any, origin: unknown) => {
    if (origin !== this) {
      const changedClients = added.concat(updated, removed);
      const update = encodeAwarenessUpdate(this.awareness, changedClients);
      void this.send({ type: "awareness", update: bytesToBase64Url(update) });
    }
  };

  constructor(
    private doc: Y.Doc,
    private key: DocumentKey,
    private roomHash: string,
    public permission: SessionPermission,
    private onStatus: (status: JoinStatusCode) => void,
    private awareness: Awareness,
    private onChat: (message: ChatMessage) => void,
    private onControl: (message: OwnerControlMessage) => void,
    initialTransport: CollaborationTransport = "direct",
  ) {
    this.allowTurnRelay = initialTransport === "relay";
    this.relayRequestSent = this.allowTurnRelay;
    this.doc.on("update", this.updateHandler);
    this.awareness.on("update", this.awarenessHandler);
  }

  connect() {
    this.stopped = false;
    this.connectSignal();
  }

  private requestOwnerRelayDecision() {
    if (this.allowTurnRelay || this.relayRequestSent || this.stopped || !this.ownerPeerId || this.ws?.readyState !== WebSocket.OPEN) return;
    this.relayRequestSent = true;
    this.onStatus("waiting_owner_relay");
    sendSignal(this.ws, this.ownerPeerId, { kind: "relay-request" });
  }

  private async enableTurnRelayFromOwner() {
    if (this.allowTurnRelay || this.relayEnableInFlight || this.stopped) return;
    this.relayEnableInFlight = true;
    this.clearOfferRetry();
    this.clearDirectConnectionTimer();
    try {
      const iceServers = await prepareIceServers(fetch, true);
      if (!hasTurnRelay(iceServers)) {
        this.onStatus("signaling_error");
        return;
      }
      this.allowTurnRelay = true;
      const ownerPeerId = this.ownerPeerId;
      this.resetPeerConnection();
      if (ownerPeerId && this.ws?.readyState === WebSocket.OPEN) {
        this.beginNegotiation(ownerPeerId, "ready", true);
      }
    } catch (error) {
      console.warn("Could not enable the owner-approved collaboration relay.", error);
      this.onStatus("signaling_error");
    } finally {
      this.relayEnableInFlight = false;
    }
  }

  private startDirectConnectionTimer() {
    if (this.allowTurnRelay || this.directConnectionTimer || this.stopped) return;
    this.directConnectionTimer = scheduleDirectConnectionFallback(
      () => this.stopped || this.channel?.readyState === "open",
      () => {
        this.directConnectionTimer = undefined;
        void this.handleDirectConnectionFailure();
      },
    );
  }

  private async handleDirectConnectionFailure() {
    if (this.allowTurnRelay || this.stopped || dataChannelIsOpen(this.channel)) return;
    const pc = this.pc;
    if (pc) await logDirectPeerFailure("joiner", pc, this.directConnectionAttempt);
    if (this.allowTurnRelay || this.stopped || dataChannelIsOpen(this.channel) || this.pc !== pc) return;
    if (directConnectionFailureAction(this.directConnectionAttempt) === "retry") {
      this.retryDirectConnection();
      return;
    }
    this.requestOwnerRelayDecision();
  }

  private retryDirectConnection() {
    if (this.directRetryInFlight || this.allowTurnRelay || this.stopped || !this.ownerPeerId) return;
    this.directRetryInFlight = true;
    const ownerPeerId = this.ownerPeerId;
    this.onStatus("connection_retrying");
    this.beginNegotiation(ownerPeerId, "direct-retry", true);
  }

  private clearDirectConnectionTimer() {
    if (this.directConnectionTimer) clearTimeout(this.directConnectionTimer);
    this.directConnectionTimer = undefined;
  }

  private beginNegotiation(ownerPeerId: string, kind: "ready" | "direct-retry", force = false) {
    if (this.stopped || dataChannelIsOpen(this.channel) || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!force && this.ownerPeerId === ownerPeerId && this.negotiationId) return;
    this.clearOfferRetry();
    this.rememberRetiredNegotiation(this.negotiationId);
    this.resetPeerConnection();
    this.ownerPeerId = ownerPeerId;
    this.negotiationId = randomSecret(12);
    this.localDescriptionSent = false;
    if (!this.allowTurnRelay) this.directConnectionAttempt += 1;
    const negotiationId = this.negotiationId;
    this.onStatus("owner_connecting");
    sendSignal(this.ws, ownerPeerId, { kind, negotiationId });
    this.scheduleOfferRetry(ownerPeerId, negotiationId);
  }

  private connectSignal() {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    console.log("Joiner connecting to signaling server:", signalUrl());
    const ws = new WebSocket(signalUrl());
    const peerId = randomSecret(12);
    this.ws = ws;
    ws.onopen = () => {
      console.log("Joiner connected to signaling server");
      this.onStatus("waiting_owner");
      ws.send(JSON.stringify({ type: "join", roomHash: this.roomHash, peerId, peerRole: "guest" }));
    };
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data) as SignalMessage;
        if (message.type === "peers") {
          if (message.peers.length === 0) this.onStatus("waiting_owner");
          else {
            message.peers.forEach((existingPeerId) => this.requestOffer(existingPeerId));
          }
        }
        if (message.type === "peer-joined") {
          this.requestOffer(message.peerId);
        }
        if (message.type === "peer-left" && message.peerId === this.ownerPeerId) {
          this.resetPeerConnection();
          this.ownerPeerId = undefined;
          this.negotiationId = undefined;
          this.directConnectionAttempt = 0;
          this.directRetryInFlight = false;
          this.onStatus("waiting_owner");
        }
        if (message.type === "signal") {
          await this.handleSignal(message.fromPeerId, peerSignalSchema.parse(message.payload));
        }
      } catch (error) {
        console.warn("Could not process an owner collaboration signal.", error);
        this.onStatus("owner_signal_retrying");
        if (this.ownerPeerId && this.negotiationId) this.scheduleOfferRetry(this.ownerPeerId, this.negotiationId);
      }
    };
    ws.onclose = () => {
      if (this.stopped) return;
      console.log("Joiner signaling server disconnected. Reconnecting in 3s...");
      if (!dataChannelIsOpen(this.channel)) {
        this.resetPeerConnection();
        this.ownerPeerId = undefined;
        this.negotiationId = undefined;
        this.directConnectionAttempt = 0;
        this.directRetryInFlight = false;
      }
      this.onStatus("signaling_reconnecting");
      this.reconnectTimer = setTimeout(() => this.connectSignal(), RECONNECT_DELAY_MS);
    };
    ws.onerror = (err) => {
      if (this.stopped) return;
      console.warn("Joiner signaling error; reconnect will be attempted.", err);
      this.onStatus("signaling_error");
    };
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.clearOfferRetry();
    if (this.disconnectedTimer) clearTimeout(this.disconnectedTimer);
    this.disconnectedTimer = undefined;
    this.doc.off("update", this.updateHandler);
    this.awareness.off("update", this.awarenessHandler);
    this.updateSender?.clear();
    this.ws?.close();
    this.ws = undefined;
    this.resetPeerConnection();
    for (const request of this.imageRequests.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("The owner session ended before the image arrived."));
    }
    this.imageRequests.clear();
    this.onStatus("stopped");
  }

  sendChat(message: ChatMessage) {
    if (validChatMessage(message)) void this.send({ type: "chat", message });
  }

  requestImage(path: string): Promise<CollaborationImageAsset> {
    if (this.channel?.readyState !== "open") return Promise.reject(new Error("The owner is not connected."));
    const requestId = randomSecret(12);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.imageRequests.delete(requestId);
        void this.send({ type: "image-cancel", requestId });
        reject(new Error("Image transfer timed out."));
      }, IMAGE_REQUEST_TIMEOUT_MS);
      this.imageRequests.set(requestId, { resolve, reject, timer, chunks: new Map() });
      void this.send({ type: "image-request", requestId, path }).catch((error) => {
        clearTimeout(timer);
        this.imageRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error("Image request failed."));
      });
    });
  }

  private async send(payload: EncryptedPayload) {
    if (this.channel?.readyState === "open") {
      await sendEncrypted(this.channel, this.key, payload);
    }
  }

  private setupChannel(channel: RTCDataChannel) {
    const yUpdateAssembler = new YUpdateAssembler();
    this.channel = channel;
    this.updateSender = new YUpdateSender((update) => sendYUpdate(channel, this.key, update));
    channel.onopen = async () => {
      this.clearOfferRetry();
      this.clearDirectConnectionTimer();
      this.directConnectionAttempt = 0;
      this.directRetryInFlight = false;
      this.onStatus(this.permission === "edit" ? "connected_edit" : "connected_view");
      // The local awareness state is commonly set before WebRTC opens. The
      // awareness listener cannot send it while the channel is closed, so send
      // it explicitly now instead of waiting for a later cursor/file change.
      const awarenessUpdate = encodeLocalAwarenessState(this.awareness);
      if (awarenessUpdate.byteLength > 0) {
        await this.send({ type: "awareness", update: bytesToBase64Url(awarenessUpdate) });
      }
      await this.send({ type: "state-request", stateVector: bytesToBase64Url(Y.encodeStateVector(this.doc)) });
    };
    channel.onclose = () => {
      yUpdateAssembler.clear();
      this.updateSender?.clear();
      this.updateSender = undefined;
      if (!this.stopped && this.channel === channel) {
        this.channel = undefined;
        this.onStatus("owner_connection_retrying");
        if (this.ownerPeerId) this.beginNegotiation(this.ownerPeerId, "ready", true);
      }
    };
    channel.onmessage = async (event) => {
      try {
        const payload = await decryptJson<EncryptedPayload>(this.key, event.data);
      if (payload.type === "y-update") {
        applyCollaborationUpdate(this.doc, base64UrlToBytes(payload.update), this);
      }
      if (payload.type === "y-update-metadata" || payload.type === "y-update-chunk" || payload.type === "y-update-complete") {
        const update = yUpdateAssembler.accept(payload);
        if (update) applyCollaborationUpdate(this.doc, update, this);
      }
      if (payload.type === "awareness") {
        applyAwarenessUpdate(this.awareness, base64UrlToBytes(payload.update), this);
      }
      if (payload.type === "chat" && validChatMessage(payload.message)) {
        this.onChat(payload.message);
      }
      if (payload.type === "control" && validOwnerControl(payload.message)) {
        this.onControl(payload.message);
      }
      if (payload.type === "image-metadata") {
        const request = this.imageRequests.get(payload.requestId);
        if (!request) return;
        if (!Number.isSafeInteger(payload.size) || payload.size < 0 || payload.size > MAX_IMAGE_BYTES || !Number.isSafeInteger(payload.chunks) || payload.chunks < 0 || payload.chunks > Math.ceil(MAX_IMAGE_BYTES / IMAGE_CHUNK_BYTES) || !IMAGE_MIME_ALLOWLIST.has(payload.mimeType)) {
          clearTimeout(request.timer);
          this.imageRequests.delete(payload.requestId);
          request.reject(new Error("The owner sent invalid image metadata."));
          return;
        }
        request.metadata = { path: payload.path, mimeType: payload.mimeType, sha: payload.sha, size: payload.size, chunks: payload.chunks };
      }
      if (payload.type === "image-chunk") {
        const request = this.imageRequests.get(payload.requestId);
        if (!request?.metadata || !Number.isSafeInteger(payload.index) || payload.index < 0 || payload.index >= request.metadata.chunks || request.chunks.has(payload.index)) return;
        const bytes = base64UrlToBytes(payload.data);
        if (bytes.byteLength > IMAGE_CHUNK_BYTES) return;
        request.chunks.set(payload.index, bytes);
      }
      if (payload.type === "image-complete") {
        const request = this.imageRequests.get(payload.requestId);
        if (!request?.metadata || request.chunks.size !== request.metadata.chunks) return;
        const bytes = new Uint8Array(request.metadata.size);
        let offset = 0;
        for (let index = 0; index < request.metadata.chunks; index += 1) {
          const chunk = request.chunks.get(index);
          if (!chunk || offset + chunk.byteLength > bytes.byteLength) return;
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        if (offset !== bytes.byteLength) return;
        clearTimeout(request.timer);
        this.imageRequests.delete(payload.requestId);
        request.resolve({ path: request.metadata.path, mimeType: request.metadata.mimeType, sha: request.metadata.sha, bytes });
      }
      if (payload.type === "image-error") {
        const request = this.imageRequests.get(payload.requestId);
        if (!request) return;
        clearTimeout(request.timer);
        this.imageRequests.delete(payload.requestId);
        request.reject(new Error(payload.message || "Image unavailable."));
      }
      } catch (error) {
        console.warn("Rejected invalid encrypted owner data.", error);
        yUpdateAssembler.clear();
        this.updateSender?.clear();
        this.updateSender = undefined;
        channel.close();
        this.onStatus("invalid_data_closed");
      }
    };
  }

  private setupPeerConnection(ownerPeerId: string, negotiationId: string) {
    if (this.pc) return this.pc;
    const pc = newPeerConnection(this.allowTurnRelay, "joiner");
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      if (this.stopped || this.pc !== pc || this.negotiationId !== negotiationId) return;
      if (pc.connectionState === "connected") {
        if (this.disconnectedTimer) clearTimeout(this.disconnectedTimer);
        this.disconnectedTimer = undefined;
        return;
      }
      if (pc.connectionState === "failed" && !this.allowTurnRelay) {
        this.clearDirectConnectionTimer();
        void this.handleDirectConnectionFailure();
        return;
      }
      if (pc.connectionState === "disconnected") {
        if (this.disconnectedTimer) clearTimeout(this.disconnectedTimer);
        this.disconnectedTimer = setTimeout(() => {
          if (this.pc !== pc || pc.connectionState !== "disconnected") return;
          if (this.allowTurnRelay) this.beginNegotiation(ownerPeerId, "ready", true);
          else void this.handleDirectConnectionFailure();
        }, DISCONNECTED_GRACE_MS);
        return;
      }
      if (["failed", "closed"].includes(pc.connectionState)) {
        this.onStatus("connection_retrying");
        this.beginNegotiation(ownerPeerId, this.allowTurnRelay ? "ready" : "direct-retry", true);
      }
    };
    pc.ondatachannel = (event) => this.setupChannel(event.channel);
    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.ws || this.pc !== pc || this.negotiationId !== negotiationId) return;
      const candidate = event.candidate.toJSON();
      if (this.localDescriptionSent) {
        sendSignal(this.ws, ownerPeerId, { kind: "candidate", negotiationId, candidate });
      } else {
        this.pendingLocalCandidates.push(candidate);
      }
    };
    return pc;
  }

  private async handleSignal(ownerPeerId: string, payload: PeerSignal) {
    if (!this.ws) return;
    if (payload.kind === "relay-approved") {
      if (this.allowTurnRelay) {
        this.beginNegotiation(ownerPeerId, "ready", true);
        return;
      }
      this.ownerPeerId = ownerPeerId;
      await this.enableTurnRelayFromOwner();
      return;
    }
    if (payload.kind === "relay-denied") {
      this.clearDirectConnectionTimer();
      this.onStatus("owner_declined_relay");
      return;
    }
    if (payload.kind === "relay-request") return;
    if (payload.kind === "ready" || payload.kind === "direct-retry") return;

    if (payload.kind === "offer") {
      if (isRetiredNegotiation(this.ownerPeerId, this.negotiationId, this.retiredNegotiationIds, ownerPeerId, payload.negotiationId)) return;
      if (this.ownerPeerId === ownerPeerId && this.negotiationId === payload.negotiationId && this.pc?.remoteDescription) return;
      if (this.ownerPeerId !== ownerPeerId || this.negotiationId !== payload.negotiationId) {
        this.rememberRetiredNegotiation(this.negotiationId);
        this.resetPeerConnection();
        this.ownerPeerId = ownerPeerId;
        this.negotiationId = payload.negotiationId;
        if (!this.allowTurnRelay) this.directConnectionAttempt += 1;
      }
      this.clearOfferRetry();
      this.directRetryInFlight = false;
      this.onStatus("owner_connecting");
      this.startDirectConnectionTimer();
      const pc = this.setupPeerConnection(ownerPeerId, payload.negotiationId);
      await pc.setRemoteDescription(payload.description);
      const pending = this.pendingCandidates.splice(0);
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (error) {
          console.warn("Ignored a stale ICE candidate during direct reconnection.", error);
        }
      }
      await pc.setLocalDescription(await pc.createAnswer());
      if (this.pc !== pc || this.negotiationId !== payload.negotiationId) return;
      sendSignal(this.ws, ownerPeerId, {
        kind: "answer",
        negotiationId: payload.negotiationId,
        description: completeLocalDescription(pc, "answer"),
      });
      this.localDescriptionSent = true;
      for (const candidate of this.pendingLocalCandidates.splice(0)) {
        sendSignal(this.ws, ownerPeerId, { kind: "candidate", negotiationId: payload.negotiationId, candidate });
      }
      return;
    }
    if (ownerPeerId !== this.ownerPeerId || !signalMatchesNegotiation(this.negotiationId, payload)) return;
    if (payload.kind === "candidate") {
      logRemoteIceCandidate("joiner", payload.candidate);
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(payload.candidate);
      else this.pendingCandidates.push(payload.candidate);
    }
  }

  private requestOffer(ownerPeerId: string) {
    this.beginNegotiation(ownerPeerId, "ready");
  }

  private scheduleOfferRetry(ownerPeerId: string, negotiationId: string) {
    this.clearOfferRetry();
    if (this.stopped) return;
    this.offerRetryTimer = setTimeout(() => {
      this.offerRetryTimer = undefined;
      if (this.ownerPeerId === ownerPeerId && this.negotiationId === negotiationId && !dataChannelIsOpen(this.channel)) {
        if (this.allowTurnRelay) this.beginNegotiation(ownerPeerId, "ready", true);
        else void this.handleDirectConnectionFailure();
      }
    }, OFFER_WAIT_TIMEOUT_MS);
  }

  private clearOfferRetry() {
    if (this.offerRetryTimer) clearTimeout(this.offerRetryTimer);
    this.offerRetryTimer = undefined;
  }

  private resetPeerConnection() {
    this.rememberRetiredNegotiation(this.negotiationId);
    this.clearDirectConnectionTimer();
    if (this.disconnectedTimer) clearTimeout(this.disconnectedTimer);
    this.disconnectedTimer = undefined;
    const pc = this.pc;
    this.pc = undefined;
    this.channel = undefined;
    this.localDescriptionSent = false;
    this.negotiationId = undefined;
    this.pendingLocalCandidates = [];
    this.pendingCandidates = [];
    this.updateSender?.clear();
    this.updateSender = undefined;
    pc?.close();
  }

  private rememberRetiredNegotiation(negotiationId?: string) {
    if (!negotiationId) return;
    this.retiredNegotiationIds.add(negotiationId);
    while (this.retiredNegotiationIds.size > 6) this.retiredNegotiationIds.delete(this.retiredNegotiationIds.values().next().value as string);
  }
}

export interface JoinCollaborationOptions {
  onChat?: (message: ChatMessage) => void;
  onControl?: (message: OwnerControlMessage) => void;
}

export async function joinCollaboration(
  doc: Y.Doc,
  awareness: Awareness,
  invite: InvitePayload,
  onStatus: (status: JoinStatusCode) => void,
  options: JoinCollaborationOptions = {},
) {
  const transport = invite.transport || "direct";
  const iceServers = await prepareIceServers(fetch, transport === "relay");
  if (transport === "relay" && !hasTurnRelay(iceServers)) {
    throw new Error("The owner selected encrypted relay, but this Marktwin deployment does not provide one.");
  }
  const session = new JoinCollaboration(
    doc,
    await deriveDocumentKey(invite.documentSecret),
    await deriveRoomHash(invite.roomSecret),
    invite.role,
    onStatus,
    awareness,
    options.onChat || (() => undefined),
    options.onControl || (() => undefined),
    transport,
  );
  session.connect();
  return session;
}
