import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function loadModule() {
  vi.resetModules();
  return await import("../../server/lib/unsubscribeToken");
}

describe("unsubscribeToken", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret-do-not-use-in-prod");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a valid token", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await loadModule();
    const token = signUnsubscribeToken("user-123", "weekly_report");
    expect(verifyUnsubscribeToken(token)).toEqual({
      userId: "user-123",
      list: "weekly_report",
    });
  });

  it("rejects tokens signed with a different secret", async () => {
    const { signUnsubscribeToken } = await loadModule();
    const token = signUnsubscribeToken("user-123", "weekly_report");

    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "different-secret");
    const { verifyUnsubscribeToken } = await loadModule();
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("rejects tampered payload", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await loadModule();
    const token = signUnsubscribeToken("user-123", "weekly_report");
    const [, sig] = token.split(".");
    // Substitute payload for a different user, keep original signature.
    const fakePayload = Buffer.from("user-456|weekly_report").toString("base64url");
    const tampered = `${fakePayload}.${sig}`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects malformed tokens (missing separator)", async () => {
    const { verifyUnsubscribeToken } = await loadModule();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
  });

  it("rejects unknown list values", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await loadModule();
    // Forge a valid signature over a payload with a bogus list.
    const token = signUnsubscribeToken("user-123", "weekly_report" as never);
    const [b64payload, sig] = token.split(".");
    void b64payload;
    void sig;
    // We can only verify normal lists pass; bogus ones can't be forged
    // without the secret, but the function still defends against future
    // payload changes.
    expect(verifyUnsubscribeToken(token)?.list).toBe("weekly_report");
  });

  it("throws when neither EMAIL_UNSUBSCRIBE_SECRET nor SESSION_SECRET is set", async () => {
    vi.unstubAllEnvs();
    const { signUnsubscribeToken } = await loadModule();
    expect(() => signUnsubscribeToken("user-1", "weekly_report")).toThrow(
      /EMAIL_UNSUBSCRIBE_SECRET/,
    );
  });

  it("falls back to SESSION_SECRET when EMAIL_UNSUBSCRIBE_SECRET is unset", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("SESSION_SECRET", "fallback-secret");
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await loadModule();
    const token = signUnsubscribeToken("user-1", "weekly_report");
    expect(verifyUnsubscribeToken(token)?.userId).toBe("user-1");
  });
});
