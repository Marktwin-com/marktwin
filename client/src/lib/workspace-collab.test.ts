import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate } from "y-protocols/awareness";

import { awarenessClientIdsFromUpdate, completeLocalDescription, directConnectionFailureAction, encodeLocalAwarenessState, isRetiredNegotiation, replaceOwnerCollaboration, scheduleDirectConnectionFallback, sessionStateForJoinStatus, signalMatchesNegotiation, waitForIceGatheringComplete, type OwnerCollaboration } from "./workspace-collab";

describe("collaboration link rotation", () => {
  it("keeps the current links alive when replacement creation fails", async () => {
    const stop = vi.fn();
    const current = { stop } as unknown as OwnerCollaboration;

    await expect(replaceOwnerCollaboration(current, async () => {
      throw new Error("replacement failed");
    })).rejects.toThrow("replacement failed");
    expect(stop).not.toHaveBeenCalled();
  });

  it("silently stops the previous session after replacement is ready", async () => {
    const stop = vi.fn();
    const current = { stop } as unknown as OwnerCollaboration;
    const replacement = {} as OwnerCollaboration;

    await expect(replaceOwnerCollaboration(current, async () => replacement)).resolves.toBe(replacement);
    expect(stop).toHaveBeenCalledWith(false);
  });
});

describe("join collaboration status contract", () => {
  it("derives session state from semantic codes instead of display copy", () => {
    expect(sessionStateForJoinStatus("connected_edit")).toBe("connected");
    expect(sessionStateForJoinStatus("waiting_owner")).toBe("waiting");
    expect(sessionStateForJoinStatus("signaling_reconnecting")).toBe("reconnecting");
    expect(sessionStateForJoinStatus("signaling_error")).toBe("offline");
    expect(sessionStateForJoinStatus("waiting_owner_relay")).toBe("waiting");
    expect(sessionStateForJoinStatus("owner_declined_relay")).toBe("offline");
    expect(sessionStateForJoinStatus("invalid_data_closed")).toBe("stopped");
  });

  it("offers the relay fallback when a direct connection remains stuck", () => {
    vi.useFakeTimers();
    try {
      let connected = false;
      const fallback = vi.fn();
      scheduleDirectConnectionFallback(() => connected, fallback, 10_000);
      vi.advanceTimersByTime(9_999);
      expect(fallback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(fallback).toHaveBeenCalledOnce();

      connected = true;
      scheduleDirectConnectionFallback(() => connected, fallback, 10_000);
      vi.advanceTimersByTime(10_000);
      expect(fallback).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries direct ICE before allowing the relay path", () => {
    expect(directConnectionFailureAction(1)).toBe("retry");
    expect(directConnectionFailureAction(2)).toBe("relay");
  });

  it("accepts signaling only from the active negotiation generation", () => {
    const active = "negotiation_active";
    expect(signalMatchesNegotiation(active, { kind: "offer", negotiationId: active, description: { type: "offer", sdp: "v=0" } })).toBe(true);
    expect(signalMatchesNegotiation(active, { kind: "candidate", negotiationId: "negotiation_stale", candidate: { candidate: "candidate:1" } })).toBe(false);
    expect(signalMatchesNegotiation(active, { kind: "relay-approved" })).toBe(true);
  });

  it("rejects delayed messages from a retired negotiation generation", () => {
    expect(isRetiredNegotiation("owner-1", "active", new Set(["retired"]), "owner-1", "retired")).toBe(true);
    expect(isRetiredNegotiation("owner-1", "active", new Set(["other"]), "owner-1", "retired")).toBe(false);
    expect(isRetiredNegotiation("owner-1", "active", new Set(["retired"]), "owner-2", "retired")).toBe(false);
    expect(isRetiredNegotiation("owner-1", "active", new Set(["retired"]), "owner-1", "active")).toBe(false);
  });

  it("waits for complete ICE before reading the SDP and falls back to a bounded timeout", async () => {
    vi.useFakeTimers();
    try {
      const connection = new EventTarget() as EventTarget & { iceGatheringState: RTCIceGatheringState; localDescription: RTCSessionDescriptionInit };
      connection.iceGatheringState = "gathering";
      connection.localDescription = { type: "offer", sdp: "v=0\na=candidate:complete" };
      const completed = waitForIceGatheringComplete(connection as unknown as RTCPeerConnection, 1_000);
      connection.iceGatheringState = "complete";
      connection.dispatchEvent(new Event("icegatheringstatechange"));
      await expect(completed).resolves.toBeUndefined();
      expect(completeLocalDescription(connection as unknown as RTCPeerConnection, "offer")).toEqual(connection.localDescription);

      connection.iceGatheringState = "gathering";
      const timedOut = waitForIceGatheringComplete(connection as unknown as RTCPeerConnection, 1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(timedOut).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("collaboration presence", () => {
  it("encodes the guest's current local presence when the data channel opens", () => {
    const guestDoc = new Y.Doc();
    const ownerDoc = new Y.Doc();
    const guestAwareness = new Awareness(guestDoc);
    const ownerAwareness = new Awareness(ownerDoc);
    guestAwareness.setLocalStateField("user", { name: "Guest", color: "#a21caf", role: "edit" });

    applyAwarenessUpdate(ownerAwareness, encodeLocalAwarenessState(guestAwareness), "test");

    expect(awarenessClientIdsFromUpdate(encodeLocalAwarenessState(guestAwareness))).toEqual([guestAwareness.clientID]);

    expect(ownerAwareness.getStates().get(guestAwareness.clientID)?.user).toEqual({
      name: "Guest",
      color: "#a21caf",
      role: "edit",
    });
    guestAwareness.destroy();
    ownerAwareness.destroy();
    guestDoc.destroy();
    ownerDoc.destroy();
  });
});
