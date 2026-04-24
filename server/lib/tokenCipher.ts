import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM encryption for at-rest secrets stored in the database
// (currently: third-party access tokens like Buffer's OAuth token).
//
// Stored format:
//   enc:v1:<base64(iv || authTag || ciphertext)>
//
//   - "enc:v1:" prefix lets us detect already-encrypted values, so we
//     never double-encrypt and can still read pre-encryption legacy
//     plaintext during the rollout window.
//   - 12-byte random IV per encryption (GCM standard).
//   - 16-byte auth tag prevents undetected tampering with the ciphertext.
//
// Key handling: BUFFER_ENCRYPTION_KEY env var, base64-encoded 32 bytes.
// Generate one with: `openssl rand -base64 32`. Loaded lazily so
// non-Buffer code paths don't require the var to be set.

const VERSION_PREFIX = "enc:v1:";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.BUFFER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "BUFFER_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` " +
        "and add it to your environment before storing or reading encrypted tokens.",
    );
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new Error("BUFFER_ENCRYPTION_KEY is not valid base64.");
  }
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `BUFFER_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${buf.length}).`,
    );
  }
  cachedKey = buf;
  return buf;
}

// Encrypt a plaintext token. Always returns a string starting with the
// version prefix, safe to round-trip through the database.
export function encryptToken(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptToken: plaintext must be a non-empty string");
  }
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  return `${VERSION_PREFIX}${blob}`;
}

// Decrypt a stored token. Throws on tampering or wrong key. If the value
// doesn't start with the version prefix it's treated as legacy plaintext
// and returned as-is (so existing rows keep working until the one-time
// migration script encrypts them in place).
export function decryptToken(stored: string): string {
  if (typeof stored !== "string" || stored.length === 0) {
    throw new Error("decryptToken: stored value must be a non-empty string");
  }
  if (!stored.startsWith(VERSION_PREFIX)) {
    return stored;
  }
  const key = getKey();
  const blob = Buffer.from(stored.slice(VERSION_PREFIX.length), "base64");
  if (blob.length < IV_BYTES + AUTH_TAG_BYTES + 1) {
    throw new Error("decryptToken: ciphertext too short to be valid");
  }
  const iv = blob.subarray(0, IV_BYTES);
  const authTag = blob.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// True if this looks like an enc:v1 ciphertext. Used by migration code
// to skip rows that are already encrypted.
export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(VERSION_PREFIX);
}
