import { base64UrlToBytes, bytesToBase64Url } from "./private-crypto";

export const Y_UPDATE_CHUNK_BYTES = 16 * 1024;
export const MAX_Y_UPDATE_BYTES = 50 * 1024 * 1024;

const MAX_PENDING_UPDATES = 4;
const UPDATE_EXPIRY_MS = 60_000;

export type YUpdateChunkPayload =
  | { type: "y-update-metadata"; updateId: string; size: number; chunks: number }
  | { type: "y-update-chunk"; updateId: string; index: number; data: string }
  | { type: "y-update-complete"; updateId: string };

interface PendingUpdate {
  size: number;
  chunks: number;
  received: Map<number, Uint8Array>;
  createdAt: number;
}

export function splitYUpdate(update: Uint8Array, updateId: string): YUpdateChunkPayload[] {
  if (update.byteLength > MAX_Y_UPDATE_BYTES) throw new Error("Collaborative update exceeds the 50 MB limit.");
  const chunks = Math.max(1, Math.ceil(update.byteLength / Y_UPDATE_CHUNK_BYTES));
  const payloads: YUpdateChunkPayload[] = [{ type: "y-update-metadata", updateId, size: update.byteLength, chunks }];
  for (let index = 0; index < chunks; index += 1) {
    payloads.push({
      type: "y-update-chunk",
      updateId,
      index,
      data: bytesToBase64Url(update.slice(index * Y_UPDATE_CHUNK_BYTES, (index + 1) * Y_UPDATE_CHUNK_BYTES)),
    });
  }
  payloads.push({ type: "y-update-complete", updateId });
  return payloads;
}

export class YUpdateAssembler {
  private pending = new Map<string, PendingUpdate>();

  accept(payload: YUpdateChunkPayload, now = Date.now()): Uint8Array | null {
    this.evictExpired(now);
    if (!validUpdateId(payload.updateId)) return null;

    if (payload.type === "y-update-metadata") {
      if (!validMetadata(payload.size, payload.chunks)) return null;
      if (!this.pending.has(payload.updateId) && this.pending.size >= MAX_PENDING_UPDATES) {
        const oldest = this.pending.keys().next().value;
        if (oldest) this.pending.delete(oldest);
      }
      this.pending.set(payload.updateId, {
        size: payload.size,
        chunks: payload.chunks,
        received: new Map(),
        createdAt: now,
      });
      return null;
    }

    const pending = this.pending.get(payload.updateId);
    if (!pending) return null;

    if (payload.type === "y-update-chunk") {
      if (!Number.isSafeInteger(payload.index) || payload.index < 0 || payload.index >= pending.chunks || pending.received.has(payload.index)) return null;
      let bytes: Uint8Array;
      try {
        bytes = base64UrlToBytes(payload.data);
      } catch {
        this.pending.delete(payload.updateId);
        return null;
      }
      const expected = payload.index === pending.chunks - 1
        ? pending.size - payload.index * Y_UPDATE_CHUNK_BYTES
        : Y_UPDATE_CHUNK_BYTES;
      if (bytes.byteLength !== expected) {
        this.pending.delete(payload.updateId);
        return null;
      }
      pending.received.set(payload.index, bytes);
      return null;
    }

    if (pending.received.size !== pending.chunks) {
      this.pending.delete(payload.updateId);
      return null;
    }
    const update = new Uint8Array(pending.size);
    let offset = 0;
    for (let index = 0; index < pending.chunks; index += 1) {
      const chunk = pending.received.get(index);
      if (!chunk || offset + chunk.byteLength > update.byteLength) {
        this.pending.delete(payload.updateId);
        return null;
      }
      update.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.pending.delete(payload.updateId);
    return offset === update.byteLength ? update : null;
  }

  clear() {
    this.pending.clear();
  }

  private evictExpired(now: number) {
    for (const [updateId, pending] of this.pending) {
      if (now - pending.createdAt > UPDATE_EXPIRY_MS) this.pending.delete(updateId);
    }
  }
}

function validUpdateId(value: string) {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

function validMetadata(size: number, chunks: number) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_Y_UPDATE_BYTES) return false;
  if (!Number.isSafeInteger(chunks) || chunks < 1) return false;
  return chunks === Math.max(1, Math.ceil(size / Y_UPDATE_CHUNK_BYTES));
}
