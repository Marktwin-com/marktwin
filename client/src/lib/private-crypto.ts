const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeInvite(payload: unknown): string {
  return bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
}

export function decodeInvite<T>(fragment: string): T {
  const cleaned = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return JSON.parse(decoder.decode(base64UrlToBytes(cleaned))) as T;
}

export function randomSecret(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

export async function deriveRoomHash(roomSecret: string): Promise<string> {
  return bytesToBase64Url(await sha256Bytes(`marktwin-room:${roomSecret}`));
}

export async function deriveDocumentKey(documentSecret: string): Promise<CryptoKey> {
  const material = await sha256Bytes(`marktwin-document:${documentSecret}`);
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptJson(key: CryptoKey, payload: unknown): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(payload))),
  );
  return encodeInvite({ iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(ciphertext) });
}

export async function decryptJson<T>(key: CryptoKey, packet: string): Promise<T> {
  const parsed = decodeInvite<{ iv: string; ciphertext: string }>(packet);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(parsed.iv) },
    key,
    base64UrlToBytes(parsed.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}
