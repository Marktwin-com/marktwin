import { describe, expect, it } from "vitest";

import { invitePayloadSchema, peerSignalSchema } from "@shared/collaboration";
import { canDeleteConflictBackupBranch, isMarktwinConflictBackupBranch } from "@shared/conflict-backup";
import { encodeInvite } from "./private-crypto";
import { decodeWorkspaceInviteHash } from "./workspace-invite";

const invite = {
  v: 1 as const,
  role: "edit" as const,
  documentSecret: "d".repeat(43),
  roomSecret: "r".repeat(43),
};

describe("private collaboration contracts", () => {
  it("accepts only exact, bounded invite payloads transported in a fragment", () => {
    expect(invitePayloadSchema.parse(invite)).toEqual(invite);
    expect(invitePayloadSchema.parse({ ...invite, transport: "relay" })).toEqual({ ...invite, transport: "relay" });
    expect(decodeWorkspaceInviteHash(`#${encodeInvite(invite)}`)).toEqual(invite);
    expect(() => decodeWorkspaceInviteHash(encodeInvite(invite))).toThrow(/fragment/);
    expect(() => decodeWorkspaceInviteHash("#")).toThrow();
    expect(() => invitePayloadSchema.parse({ ...invite, extra: "secret" })).toThrow();
    expect(() => invitePayloadSchema.parse({ ...invite, role: "owner" })).toThrow();
    expect(() => invitePayloadSchema.parse({ ...invite, documentSecret: "short" })).toThrow();
    expect(() => invitePayloadSchema.parse({ ...invite, transport: "server-readable" })).toThrow();
  });

  it("rejects arbitrary, oversized, and mismatched signaling payloads", () => {
    const negotiationId = "negotiation_123";
    expect(peerSignalSchema.parse({ kind: "ready", negotiationId })).toEqual({ kind: "ready", negotiationId });
    expect(peerSignalSchema.parse({ kind: "direct-retry", negotiationId })).toEqual({ kind: "direct-retry", negotiationId });
    expect(peerSignalSchema.parse({ kind: "relay-request" })).toEqual({ kind: "relay-request" });
    expect(peerSignalSchema.parse({ kind: "relay-approved" })).toEqual({ kind: "relay-approved" });
    expect(peerSignalSchema.parse({ kind: "relay-denied" })).toEqual({ kind: "relay-denied" });
    expect(peerSignalSchema.parse({ kind: "offer", negotiationId, description: { type: "offer", sdp: "v=0" } })).toBeDefined();
    expect(peerSignalSchema.parse({ kind: "candidate", negotiationId, candidate: { candidate: "candidate:1", sdpMid: null } })).toBeDefined();
    expect(() => peerSignalSchema.parse({ kind: "offer", negotiationId, description: { type: "answer", sdp: "v=0" } })).toThrow();
    expect(() => peerSignalSchema.parse({ kind: "ready", negotiationId, unexpected: true })).toThrow();
    expect(() => peerSignalSchema.parse({ kind: "ready" })).toThrow();
    expect(() => peerSignalSchema.parse({ kind: "candidate", negotiationId, candidate: { candidate: "x".repeat(4097) } })).toThrow();
    expect(() => peerSignalSchema.parse({ kind: "script", source: "alert(1)" })).toThrow();
  });

  it("recognizes only generated backup branches and protects active/default branches", () => {
    const branch = "main-marktwin-backup-user-20260817-120001";
    expect(isMarktwinConflictBackupBranch(branch)).toBe(true);
    expect(isMarktwinConflictBackupBranch("release")).toBe(false);
    expect(isMarktwinConflictBackupBranch("main-marktwin-backup-legacy")).toBe(false);
    expect(canDeleteConflictBackupBranch(branch, "main", "main")).toBe(true);
    expect(canDeleteConflictBackupBranch(branch, branch, "main")).toBe(false);
    expect(canDeleteConflictBackupBranch(branch, "draft", branch)).toBe(false);
  });
});
