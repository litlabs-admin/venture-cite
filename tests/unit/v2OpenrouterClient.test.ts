import { describe, it, expect, vi, beforeEach } from "vitest";

describe("getOpenrouterClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null when OPENROUTER_API_KEY is not set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const { getOpenrouterClient } = await import("../../server/lib/factAgent/v2/openrouterClient");
    expect(getOpenrouterClient()).toBeNull();
    vi.unstubAllEnvs();
  });

  it("returns a singleton OpenAI-shaped client when the key is set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key-abc");
    const { getOpenrouterClient } = await import("../../server/lib/factAgent/v2/openrouterClient");
    const a = getOpenrouterClient();
    const b = getOpenrouterClient();
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(typeof (a as { chat: unknown })?.chat).toBe("object");
    vi.unstubAllEnvs();
  });
});
