import aesjs from "aes-js";
import { sha256 } from "js-sha256";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const PRIVATE_COLLABORATION_SECURE_CONTEXT_ERROR = "Private collaboration requires HTTPS or localhost.";
export const insecureCollaborationTestModeStorageKey = "marktwin:insecure-collaboration-test-mode";

interface InsecureDocumentKey {
  kind: "insecure-test";
  material: Uint8Array;
}

export type DocumentKey = CryptoKey | InsecureDocumentKey;

export function isInsecureCollaborationTestMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Plain HTTP cannot expose WebCrypto/AES-GCM consistently. Use the
    // authenticated compatibility cipher automatically so direct WebRTC can
    // still operate; the UI keeps this transport clearly labelled as unsafe.
    if (window.location.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
      window.sessionStorage.setItem(insecureCollaborationTestModeStorageKey, "1");
      return true;
    }
  } catch {
    // An HTTP browser may restrict session storage; protocol detection is enough.
  }
  // HTTPS must always use WebCrypto, even if an older HTTP test link left a
  // session flag behind in this tab.
  return false;
}

export function enableInsecureCollaborationTestMode() {
  try {
    window.sessionStorage.setItem(insecureCollaborationTestModeStorageKey, "1");
  } catch {
    // The query flag remains available as a fallback for restricted storage.
  }
}

function webCryptoWithSubtle() {
  const webCrypto = globalThis.crypto;
  return webCrypto?.subtle && typeof webCrypto.subtle.digest === "function" ? webCrypto : null;
}

function requireWebCrypto() {
  const webCrypto = webCryptoWithSubtle();
  if (!webCrypto) {
    throw new Error(PRIVATE_COLLABORATION_SECURE_CONTEXT_ERROR);
  }
  return webCrypto;
}

function randomBytes(length: number): Uint8Array {
  const value = new Uint8Array(length);
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.getRandomValues) throw new Error(PRIVATE_COLLABORATION_SECURE_CONTEXT_ERROR);
  webCrypto.getRandomValues(value);
  return value;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
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
  return bytesToBase64Url(randomBytes(bytes));
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const webCrypto = webCryptoWithSubtle();
  if (webCrypto) return new Uint8Array(await webCrypto.subtle.digest("SHA-256", encoder.encode(input)));
  if (isInsecureCollaborationTestMode()) return new Uint8Array(sha256.arrayBuffer(input));
  throw new Error(PRIVATE_COLLABORATION_SECURE_CONTEXT_ERROR);
}

export async function deriveRoomHash(roomSecret: string): Promise<string> {
  return bytesToBase64Url(await sha256Bytes(`marktwin-room:${roomSecret}`));
}

export async function deriveDocumentKey(documentSecret: string): Promise<DocumentKey> {
  const material = await sha256Bytes(`marktwin-document:${documentSecret}`);
  const webCrypto = webCryptoWithSubtle();
  if (webCrypto) return webCrypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  if (isInsecureCollaborationTestMode()) return { kind: "insecure-test", material };
  throw new Error(PRIVATE_COLLABORATION_SECURE_CONTEXT_ERROR);
}

function fallbackSubkey(material: Uint8Array, label: string): Uint8Array {
  return new Uint8Array(sha256.hmac.arrayBuffer(material, encoder.encode(label)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function isInsecureDocumentKey(key: DocumentKey): key is InsecureDocumentKey {
  return typeof key === "object" && key !== null && "kind" in key && key.kind === "insecure-test";
}

function encryptInsecureTest(key: InsecureDocumentKey, plaintext: Uint8Array): string {
  const iv = randomBytes(16);
  const encryptionKey = fallbackSubkey(key.material, "marktwin-http-test-encryption");
  const macKey = fallbackSubkey(key.material, "marktwin-http-test-authentication");
  const ciphertext = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(iv)).encrypt(plaintext);
  const ivEncoded = bytesToBase64Url(iv);
  const ciphertextEncoded = bytesToBase64Url(ciphertext);
  const authenticatedBytes = encoder.encode(`marktwin-http-test-v1:${ivEncoded}:${ciphertextEncoded}`);
  const tag = new Uint8Array(sha256.hmac.arrayBuffer(macKey, authenticatedBytes));
  return encodeInvite({ v: 1, mode: "http-test", iv: ivEncoded, ciphertext: ciphertextEncoded, tag: bytesToBase64Url(tag) });
}

function decryptInsecureTest<T>(key: InsecureDocumentKey, parsed: unknown): T {
  if (!parsed || typeof parsed !== "object") throw new Error("Encrypted collaboration packet was invalid.");
  const packet = parsed as { v?: unknown; mode?: unknown; iv?: unknown; ciphertext?: unknown; tag?: unknown };
  if (packet.v !== 1 || packet.mode !== "http-test" || typeof packet.iv !== "string" || typeof packet.ciphertext !== "string" || typeof packet.tag !== "string") {
    throw new Error("Encrypted collaboration packet was invalid.");
  }
  const authenticatedBytes = encoder.encode(`marktwin-http-test-v1:${packet.iv}:${packet.ciphertext}`);
  const macKey = fallbackSubkey(key.material, "marktwin-http-test-authentication");
  const expectedTag = new Uint8Array(sha256.hmac.arrayBuffer(macKey, authenticatedBytes));
  if (!constantTimeEqual(expectedTag, base64UrlToBytes(packet.tag))) throw new Error("Encrypted collaboration packet failed authentication.");
  const encryptionKey = fallbackSubkey(key.material, "marktwin-http-test-encryption");
  const decrypted = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(base64UrlToBytes(packet.iv))).decrypt(base64UrlToBytes(packet.ciphertext));
  return JSON.parse(decoder.decode(decrypted)) as T;
}

export async function encryptJson(key: DocumentKey, payload: unknown): Promise<string> {
  const plaintext = encoder.encode(JSON.stringify(payload));

  if (isInsecureDocumentKey(key)) return encryptInsecureTest(key, plaintext);

  const iv = new Uint8Array(12);
  const webCrypto = requireWebCrypto();
  webCrypto.getRandomValues(iv);
  const encrypted = await webCrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return encodeInvite({ iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(encrypted)) });
}

export async function decryptJson<T>(key: DocumentKey, packet: string): Promise<T> {
  const parsed = decodeInvite<{ iv: string; ciphertext: string }>(packet);

  if (isInsecureDocumentKey(key)) return decryptInsecureTest<T>(key, parsed);

  const decrypted = await requireWebCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(parsed.iv) },
    key,
    base64UrlToBytes(parsed.ciphertext),
  );
  return JSON.parse(decoder.decode(decrypted)) as T;
}
