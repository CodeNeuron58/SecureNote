// Client-side end-to-end encryption primitives.
// This module never runs on the server: plaintext and content keys
// exist only inside the user's browser tab.

export type EncBlob = { iv: string; ct: string };
export type WrappedKey = { epk: JsonWebKey; iv: string; ct: string };

const te = new TextEncoder();
const td = new TextDecoder();

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export function fromB64(s: string): ArrayBuffer {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b.buffer as ArrayBuffer;
}

export function randomB64(bytes = 16): string {
  return toB64(crypto.getRandomValues(new Uint8Array(bytes)));
}

/* ---------- password -> KEK (protects the account's private key) ---------- */

export async function deriveKek(
  password: string,
  saltB64: string
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    te.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromB64(saltB64),
      iterations: 310000,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptWithKek(
  privJwk: JsonWebKey,
  kek: CryptoKey
): Promise<EncBlob> {
  return encryptJson(kek, privJwk);
}

export async function decryptWithKek(
  blob: EncBlob,
  kek: CryptoKey
): Promise<JsonWebKey> {
  return decryptJson<JsonWebKey>(kek, blob);
}

/* ---------- account keypair (ECDH P-256) ---------- */

export async function generateKeyPair(): Promise<{
  pubJwk: JsonWebKey;
  privJwk: JsonWebKey;
}> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;
  const pubJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { pubJwk, privJwk };
}

/* ---------- symmetric helpers ---------- */

export async function generateContentKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptString(
  key: CryptoKey,
  plaintext: string
): Promise<EncBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    te.encode(plaintext)
  );
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptString(
  key: CryptoKey,
  blob: EncBlob
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(blob.iv) },
    key,
    fromB64(blob.ct)
  );
  return td.decode(pt);
}

/* ---------- binary helpers (encrypted file uploads) ----------
   Ciphertext format: [12-byte IV || AES-GCM ciphertext]. */

export async function encryptBytes(
  key: CryptoKey,
  data: ArrayBuffer
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data)
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out.buffer;
}

export async function decryptBytes(
  key: CryptoKey,
  blob: ArrayBuffer
): Promise<ArrayBuffer> {
  const b = new Uint8Array(blob);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b.slice(0, 12) },
    key,
    b.slice(12)
  );
}

async function encryptJson(key: CryptoKey, value: unknown): Promise<EncBlob> {
  return encryptString(key, JSON.stringify(value));
}

async function decryptJson<T>(key: CryptoKey, blob: EncBlob): Promise<T> {
  return JSON.parse(await decryptString(key, blob)) as T;
}

/* ---------- key wrapping: ECDH (ephemeral-static) + HKDF ---------- */

async function deriveWrapKey(
  priv: CryptoKey,
  pubJwk: JsonWebKey
): Promise<CryptoKey> {
  const pub = await crypto.subtle.importKey(
    "jwk",
    pubJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: pub },
    priv,
    256
  );
  const base = await crypto.subtle.importKey("raw", bits, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: te.encode("SecureNote-wrap-v1"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapKeyFor(
  contentKey: CryptoKey,
  recipientPubJwk: JsonWebKey
): Promise<WrappedKey> {
  const eph = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;
  const wrapKey = await deriveWrapKey(eph.privateKey, recipientPubJwk);
  const raw = await crypto.subtle.exportKey("raw", contentKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, raw);
  return {
    epk: await crypto.subtle.exportKey("jwk", eph.publicKey),
    iv: toB64(iv),
    ct: toB64(ct),
  };
}

export async function unwrapKey(
  w: WrappedKey,
  privJwk: JsonWebKey
): Promise<CryptoKey> {
  const priv = await crypto.subtle.importKey(
    "jwk",
    privJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );
  const wrapKey = await deriveWrapKey(priv, w.epk);
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(w.iv) },
    wrapKey,
    fromB64(w.ct)
  );
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/* ---------- key persistence across refreshes within one tab ----------
   The private key is re-wrapped with a random AES key that lives in
   sessionStorage. Close the tab and the key is gone: a new tab must
   sign in again to unwrap the account private key with the password. */

export async function lockWithSessionKey(privJwk: JsonWebKey): Promise<void> {
  const k = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const blob = await encryptJson(k, privJwk);
  sessionStorage.setItem("sn_k", JSON.stringify(await crypto.subtle.exportKey("jwk", k)));
  localStorage.setItem("sn_privwrap", JSON.stringify(blob));
}

export async function restoreFromSession(): Promise<JsonWebKey | null> {
  try {
    const kJwk = sessionStorage.getItem("sn_k");
    const blobRaw = localStorage.getItem("sn_privwrap");
    if (!kJwk || !blobRaw) return null;
    const k = await crypto.subtle.importKey(
      "jwk",
      JSON.parse(kJwk),
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
    return await decryptJson<JsonWebKey>(k, JSON.parse(blobRaw));
  } catch {
    return null;
  }
}

export function clearSessionKeys(): void {
  sessionStorage.removeItem("sn_k");
  localStorage.removeItem("sn_privwrap");
}
