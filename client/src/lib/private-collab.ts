import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
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
import { createPeerConnection } from "./webrtc-config";
import type { ChatMessage, OwnerControlMessage, SessionState } from "@shared/schema";

export type SessionPermission = "edit" | "view";

export function canEditSession(permission: SessionPermission) {
  return permission === "edit";
}

export interface InvitePayload {
  v: 1;
  role: SessionPermission;
  documentSecret: string;
  roomSecret: string;
}

type SignalMessage =
  | { type: "peers"; peers: string[] }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; fromPeerId: string; payload: PeerSignal };

type PeerSignal =
  | { kind: "offer"; description: RTCSessionDescriptionInit }
  | { kind: "answer"; description: RTCSessionDescriptionInit }
  | { kind: "candidate"; candidate: RTCIceCandidateInit };

type EncryptedPayload =
  | { type: "state-request"; stateVector?: string }
  | { type: "y-update"; update: string }
  | { type: "awareness"; update: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "control"; message: OwnerControlMessage };

const UPDATE_BATCH_DELAY_MS = 16;
const MAX_BUFFERED_AMOUNT = 1_000_000;
const RECONNECT_DELAY_MS = 3000;

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
    typeof control.syncing === "boolean" &&
    typeof control.workspaceName === "string" && control.workspaceName.length <= 255 &&
    Number.isSafeInteger(control.revision) && control.revision > 0
  );
}

function signalUrl() {
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/signal`;
}

function newPeerConnection() {
  return createPeerConnection();
}

function sendSignal(ws: WebSocket, targetPeerId: string, payload: PeerSignal) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "signal", targetPeerId, payload }));
  }
}

async function sendEncrypted(channel: RTCDataChannel, key: CryptoKey, payload: EncryptedPayload) {
  if (channel.readyState === "open") {
    channel.send(await encryptJson(key, payload));
  }
}

class YUpdateSender {
  private pending: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private sendPayload: (payload: EncryptedPayload) => Promise<void>) {}

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
      await this.sendPayload({ type: "y-update", update: bytesToBase64Url(merged) });
    } catch (error) {
      console.error("Failed to send collaborative update:", error);
    }
  }
}

class OwnerRoom {
  private peers = new Map<string, { pc: RTCPeerConnection; channel?: RTCDataChannel; updateSender?: YUpdateSender }>();
  private ws?: WebSocket;
  private stopped = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private doc: Y.Doc,
    private key: CryptoKey,
    private roomHash: string,
    private peerId: string,
    private permission: SessionPermission,
    private onPeerCountChange: () => void,
    private awareness: Awareness,
    private getControl: () => OwnerControlMessage,
    private getChatHistory: () => ChatMessage[],
    private onChat: (message: ChatMessage, room: OwnerRoom, peerId: string) => void,
    private onStatus: (state: SessionState) => void,
  ) {}

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
      this.ws?.send(JSON.stringify({ type: "join", roomHash: this.roomHash, peerId: this.peerId }));
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
      const message = JSON.parse(event.data) as SignalMessage;
      if (message.type === "peers") {
        for (const peerId of message.peers) await this.createOffer(peerId);
      }
      if (message.type === "peer-joined") {
        await this.createOffer(message.peerId);
      }
      if (message.type === "peer-left") {
        this.peers.get(message.peerId)?.pc.close();
        this.peers.delete(message.peerId);
        this.onPeerCountChange();
      }
      if (message.type === "signal") {
        await this.handleSignal(message.fromPeerId, message.payload);
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
    for (const peer of this.peers.values()) {
      peer.updateSender?.clear();
      peer.pc.close();
    }
    this.peers.clear();
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

  private setupPeer(peerId: string) {
    const existing = this.peers.get(peerId);
    if (existing) return existing.pc;

    const pc = newPeerConnection();
    this.peers.set(peerId, { pc });
    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws) {
        sendSignal(this.ws, peerId, { kind: "candidate", candidate: event.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(pc.connectionState)) {
        const peer = this.peers.get(peerId);
        peer?.updateSender?.clear();
        this.peers.delete(peerId);
        this.onPeerCountChange();
      }
    };
    return pc;
  }

  private setupChannel(peerId: string, channel: RTCDataChannel) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.channel = channel;
      peer.updateSender = new YUpdateSender(async (payload) => {
        if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await new Promise((resolve) => setTimeout(resolve, UPDATE_BATCH_DELAY_MS));
        }
        await sendEncrypted(channel, this.key, payload);
      });
    }
    channel.onopen = async () => {
      this.onStatus("connected");
      this.onPeerCountChange();
    };
    channel.onclose = () => {
      peer?.updateSender?.clear();
      if (peer) {
        peer.channel = undefined;
        peer.updateSender = undefined;
      }
      this.onPeerCountChange();
    };
    channel.onmessage = async (event) => {
      const payload = await decryptJson<EncryptedPayload>(this.key, event.data);
      if (payload.type === "state-request") {
        let update: Uint8Array;
        try {
          update = payload.stateVector
            ? Y.encodeStateAsUpdate(this.doc, base64UrlToBytes(payload.stateVector))
            : Y.encodeStateAsUpdate(this.doc);
        } catch {
          update = Y.encodeStateAsUpdate(this.doc);
        }

        await sendEncrypted(channel, this.key, { type: "y-update", update: bytesToBase64Url(update) });
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
        Y.applyUpdate(this.doc, update, { type: "owner-room", room: this, peerId });
      }
      if (payload.type === "awareness") {
        const update = base64UrlToBytes(payload.update);
        applyAwarenessUpdate(this.awareness, update, { type: "owner-room", room: this, peerId });
      }
      if (payload.type === "chat" && validChatMessage(payload.message)) {
        this.onChat(payload.message, this, peerId);
      }
      // Control messages are deliberately owner-to-peer only. A crafted peer
      // message is ignored, regardless of edit permission.
    };
  }

  private async createOffer(peerId: string) {
    const pc = this.setupPeer(peerId);
    const channel = pc.createDataChannel("marktwin-private");
    this.setupChannel(peerId, channel);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (this.ws) sendSignal(this.ws, peerId, { kind: "offer", description: offer });
  }

  private async handleSignal(peerId: string, payload: PeerSignal) {
    const pc = this.setupPeer(peerId);
    if (payload.kind === "answer") {
      await pc.setRemoteDescription(payload.description);
    }
    if (payload.kind === "candidate") {
      await pc.addIceCandidate(payload.candidate);
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
  ) {
    this.rooms = rooms;
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

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.doc.off("update", this.updateHandler);
    this.awareness.off("update", this.awarenessHandler);
    this.rooms.forEach((room) => room.stop());
    this.onStatus("stopped");
  }

  peerCount() {
    return this.rooms.reduce((count, room) => count + room.peerCount(), 0);
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
  onChat?: (message: ChatMessage) => void;
  onStatus?: (state: SessionState) => void;
  initialChatMessages?: ChatMessage[];
}

export async function startOwnerCollaboration(
  doc: Y.Doc,
  awareness: Awareness,
  onPeerCountChange: () => void,
  options: OwnerCollaborationOptions,
): Promise<OwnerCollaboration> {
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
  const editRoom = new OwnerRoom(doc, key, await deriveRoomHash(editSecret), `${ownerPeerId}-e`, "edit", onPeerCountChange, awareness, getControl, getChatHistory, onRoomChat, onStatus);
  const viewRoom = new OwnerRoom(doc, key, await deriveRoomHash(viewSecret), `${ownerPeerId}-v`, "view", onPeerCountChange, awareness, getControl, getChatHistory, onRoomChat, onStatus);

  const editLink = `${window.location.origin}/join#${encodeInvite({
    v: 1,
    role: "edit",
    documentSecret,
    roomSecret: editSecret,
  } satisfies InvitePayload)}`;
  const viewLink = `${window.location.origin}/join#${encodeInvite({
    v: 1,
    role: "view",
    documentSecret,
    roomSecret: viewSecret,
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
  );
  session.connect();
  return session;
}

export class JoinCollaboration {
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private updateSender?: YUpdateSender;
  private ws?: WebSocket;
  private stopped = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
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
    private key: CryptoKey,
    private roomHash: string,
    public permission: SessionPermission,
    private onStatus: (status: string) => void,
    private awareness: Awareness,
    private onChat: (message: ChatMessage) => void,
    private onControl: (message: OwnerControlMessage) => void,
  ) {
    this.doc.on("update", this.updateHandler);
    this.awareness.on("update", this.awarenessHandler);
  }

  connect() {
    this.stopped = false;
    this.connectSignal();
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
      this.onStatus("Waiting for owner");
      ws.send(JSON.stringify({ type: "join", roomHash: this.roomHash, peerId }));
    };
    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data) as SignalMessage;
      if (message.type === "signal") {
        await this.handleSignal(message.fromPeerId, message.payload);
      }
    };
    ws.onclose = () => {
      if (this.stopped) return;
      console.log("Joiner signaling server disconnected. Reconnecting in 3s...");
      this.onStatus("Disconnected - reconnecting...");
      this.reconnectTimer = setTimeout(() => this.connectSignal(), RECONNECT_DELAY_MS);
    };
    ws.onerror = (err) => {
      if (this.stopped) return;
      console.warn("Joiner signaling error; reconnect will be attempted.", err);
      this.onStatus("Signaling Error");
    };
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.doc.off("update", this.updateHandler);
    this.awareness.off("update", this.awarenessHandler);
    this.updateSender?.clear();
    this.ws?.close();
    this.ws = undefined;
    this.pc?.close();
    this.pc = undefined;
    this.channel = undefined;
    this.onStatus("Session stopped");
  }

  sendChat(message: ChatMessage) {
    if (validChatMessage(message)) void this.send({ type: "chat", message });
  }

  private async send(payload: EncryptedPayload) {
    if (this.channel?.readyState === "open") {
      await sendEncrypted(this.channel, this.key, payload);
    }
  }

  private setupChannel(channel: RTCDataChannel) {
    this.channel = channel;
    this.updateSender = new YUpdateSender(async (payload) => {
      if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await new Promise((resolve) => setTimeout(resolve, UPDATE_BATCH_DELAY_MS));
      }
      await sendEncrypted(channel, this.key, payload);
    });
    channel.onopen = async () => {
      this.onStatus(this.permission === "edit" ? "Connected with edit access" : "Connected view-only");
      await this.send({ type: "state-request", stateVector: bytesToBase64Url(Y.encodeStateVector(this.doc)) });
    };
    channel.onclose = () => {
      this.updateSender?.clear();
      this.updateSender = undefined;
      if (!this.stopped) this.onStatus("Owner session ended");
    };
    channel.onmessage = async (event) => {
      const payload = await decryptJson<EncryptedPayload>(this.key, event.data);
      if (payload.type === "y-update") {
        Y.applyUpdate(this.doc, base64UrlToBytes(payload.update), this);
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
    };
  }

  private async handleSignal(ownerPeerId: string, payload: PeerSignal) {
    if (!this.ws) return;
    if (!this.pc) {
      this.pc = newPeerConnection();
      this.pc.onconnectionstatechange = () => {
        if (!this.stopped && this.pc && ["failed", "disconnected", "closed"].includes(this.pc.connectionState)) {
          this.onStatus("Connection lost");
        }
      };
      this.pc.ondatachannel = (event) => this.setupChannel(event.channel);
      this.pc.onicecandidate = (event) => {
        if (event.candidate && this.ws) {
          sendSignal(this.ws, ownerPeerId, { kind: "candidate", candidate: event.candidate.toJSON() });
        }
      };
    }

    if (payload.kind === "offer") {
      await this.pc.setRemoteDescription(payload.description);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      sendSignal(this.ws, ownerPeerId, { kind: "answer", description: answer });
    }
    if (payload.kind === "candidate") {
      await this.pc.addIceCandidate(payload.candidate);
    }
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
  onStatus: (status: string) => void,
  options: JoinCollaborationOptions = {},
) {
  const session = new JoinCollaboration(
    doc,
    await deriveDocumentKey(invite.documentSecret),
    await deriveRoomHash(invite.roomSecret),
    invite.role,
    onStatus,
    awareness,
    options.onChat || (() => undefined),
    options.onControl || (() => undefined),
  );
  session.connect();
  return session;
}
