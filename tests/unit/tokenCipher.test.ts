import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";

// We import the module fresh per-test so the module-level key cache
// reflects whatever env we set in the beforeEach. Vitest's import cache
// makes `vi.resetModules()` the right tool here.
async function loadCipher() {
  vi.resetModules();
  return await import("../../server/lib/tokenCipher");
}

const VALID_KEY_B64 = randomBytes(32).toString("base64");

describe("tokenCipher", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("encryptToken", () => {
    it("produces a string with the enc:v1: prefix", async () => {
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", VALID_KEY_B64);
      const { encryptToken } = await loadCipher();
      const out = encryptToken("hello world");
      expect(out.startsWith("enc:v1:")).toBe(true);
    });

    it("produces different ciphertext on each call (random IV)", async () => {
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", VALID_KEY_B64);
      const { encryptToken } = await loadCipher();
      const a = encryptToken("same plaintext");
      const b = encryptToken("same plaintext");
      expect(a).not.toBe(b);
    });

    it("throws on empty plaintext", async () => {
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", VALID_KEY_B64);
      const { encryptToken } = await loadCipher();
      expect(() => encryptToken("")).toThrow();
    });

    it("throws when BUFFER_ENCRYPTION_KEY is unset", async () => {
      const { encryptToken } = await loadCipher();
      expect(() => encryptToken("anything")).toThrow(/BUFFER_ENCRYPTION_KEY/);
    });

    it("throws when BUFFER_ENCRYPTION_KEY is the wrong length", async () => {
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", Buffer.from("too-short").toString("base64"));
      const { encryptToken } = await loadCipher();
      expect(() => encryptToken("anything")).toThrow(/32 bytes/);
    });
  });

  describe("decryptToken", () => {
    it("round-trips back to the original plaintext", async () => {
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", VALID_KEY_B64);
      const { encryptToken, decryptToken } = await loadCipher();
      const original = "1/super.secret.buffer-token-blob";
      const encrypted = encryptToken(original);
      expect(decryptToken(encrypted)).toBe(original);
    });

    it("returns legacy plaintext unchanged (no enc:v1: prefix)", async () => {
      // Important during the rollout window: existing rows are still
      // plaintext; the migration script encrypts them in place. Until then
      // the read path must not blow up.
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", VALID_KEY_B64);
      const { decryptToken } = await loadCipher();
      expect(decryptToken("legacy-plain-token")).toBe("legacy-plain-token");
    });

    it("throws on tampered ciphertext (auth tag check)", async () => {
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", VALID_KEY_B64);
      const { encryptToken, decryptToken } = await loadCipher();
      const encrypted = encryptToken("alpha bravo");
      // Flip a byte in the middle of the ciphertext.
      const blob = Buffer.from(encrypted.slice("enc:v1:".length), "base64");
      blob[blob.length - 1] ^= 0xff;
      const tampered = "enc:v1:" + blob.toString("base64");
      expect(() => decryptToken(tampered)).toThrow();
    });

    it("throws when decrypting with the wrong key", async () => {
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", VALID_KEY_B64);
      const { encryptToken } = await loadCipher();
      const encrypted = encryptToken("hello");

      // Re-import with a different key in the env.
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
      const { decryptToken } = await loadCipher();
      expect(() => decryptToken(encrypted)).toThrow();
    });

    it("throws on truncated ciphertext", async () => {
      vi.stubEnv("BUFFER_ENCRYPTION_KEY", VALID_KEY_B64);
      const { decryptToken } = await loadCipher();
      expect(() => decryptToken("enc:v1:dGlueQ==")).toThrow(/too short/);
    });
  });

  describe("isEncrypted", () => {
    it("recognizes the enc:v1: prefix", async () => {
      const { isEncrypted } = await loadCipher();
      expect(isEncrypted("enc:v1:abcdef")).toBe(true);
      expect(isEncrypted("legacy-token")).toBe(false);
      expect(isEncrypted("")).toBe(false);
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
    });
  });
});
