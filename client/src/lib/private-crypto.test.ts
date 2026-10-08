import { afterEach, describe, expect, it, vi } from "vitest";

import { base64UrlToBytes, bytesToBase64Url, decodeInvite, decryptJson, deriveDocumentKey, deriveRoomHash, encodeInvite, encryptJson, randomSecret } from "./private-crypto";

describe("private collaboration crypto", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips authenticated AES-GCM packets and rejects tampering", async () => {
    const key = await deriveDocumentKey("document-secret".repeat(3));
    const packet = await encryptJson(key, { message: "private" });
    await expect(decryptJson(key, packet)).resolves.toEqual({ message: "private" });

    const chars = packet.split("");
    chars[chars.length - 2] = chars[chars.length - 2] === "A" ? "B" : "A";
    await expect(decryptJson(key, chars.join(""))).rejects.toThrow();
  });

  it("fails closed when WebCrypto is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => randomSecret()).toThrow(/HTTPS or localhost/);
    await expect(deriveRoomHash("room")).rejects.toThrow(/HTTPS or localhost/);
    await expect(deriveDocumentKey("document")).rejects.toThrow(/HTTPS or localhost/);
  });

  it("automatically enables authenticated compatibility encryption on plain HTTP", async () => {
    const sessionValues = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { protocol: "http:", hostname: "193.70.74.163", search: "" },
      sessionStorage: {
        getItem: (key: string) => sessionValues.get(key) ?? null,
        setItem: (key: string, value: string) => { sessionValues.set(key, value); },
      },
    });
    vi.stubGlobal("crypto", {
      getRandomValues: <T extends ArrayBufferView>(value: T) => {
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength).fill(7);
        return value;
      },
    });

    const key = await deriveDocumentKey("http-test-document");
    const packet = await encryptJson(key, { message: "synthetic test data" });
    await expect(decryptJson(key, packet)).resolves.toEqual({ message: "synthetic test data" });

    const parsed = decodeInvite<{ v: number; mode: string; iv: string; ciphertext: string; tag: string }>(packet);
    const ciphertext = parsed.ciphertext.split("");
    ciphertext[0] = ciphertext[0] === "A" ? "B" : "A";
    await expect(decryptJson(key, encodeInvite({ ...parsed, ciphertext: ciphertext.join("") }))).rejects.toThrow(/authentication/i);
  });

  it("round-trips URL-safe base64 bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 255]);
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });
});
