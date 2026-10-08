import { invitePayloadSchema, type InvitePayload } from "@shared/collaboration";
import { decodeInvite } from "./private-crypto";

const MAX_INVITE_FRAGMENT_LENGTH = 2048;

export function decodeWorkspaceInviteHash(hash: string): InvitePayload {
  if (!hash.startsWith("#") || hash.length <= 1 || hash.length > MAX_INVITE_FRAGMENT_LENGTH) {
    throw new Error("Invalid private invite fragment.");
  }
  return invitePayloadSchema.parse(decodeInvite<unknown>(hash));
}
