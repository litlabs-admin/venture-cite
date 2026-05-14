import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the slot library — we test failover logic, not the bucket.
vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: vi.fn(
    async (_provider: string, _runId: string | undefined, fn: () => Promise<unknown>) => fn(),
  ),
  PROVIDER_LIMITS: { openai: 20, anthropic: 20, perplexity: 10, gemini: 30 },
}));

import { callWithFailover, type ProviderClient } from "../../server/lib/factAgent/v2/llmFailover";

describe("callWithFailover", () => {
  let openaiClient: ProviderClient;
  let anthropicClient: ProviderClient;

  beforeEach(() => {
    openaiClient = { name: "openai", call: vi.fn() } as never;
    anthropicClient = { name: "anthropic", call: vi.fn() } as never;
  });

  it("uses primary provider on success", async () => {
    (openaiClient.call as ReturnType<typeof vi.fn>).mockResolvedValue("ok-openai");
    const out = await callWithFailover([openaiClient, anthropicClient], "prompt", "run-1");
    expect(out).toBe("ok-openai");
    expect(anthropicClient.call).not.toHaveBeenCalled();
  });

  it("falls over to secondary on primary timeout/5xx", async () => {
    (openaiClient.call as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("upstream timeout"), { status: 504 }),
    );
    (anthropicClient.call as ReturnType<typeof vi.fn>).mockResolvedValue("ok-anthropic");
    const out = await callWithFailover([openaiClient, anthropicClient], "prompt", "run-1");
    expect(out).toBe("ok-anthropic");
  });

  it("falls over on 429 rate-limit", async () => {
    (openaiClient.call as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("rate limit"), { status: 429 }),
    );
    (anthropicClient.call as ReturnType<typeof vi.fn>).mockResolvedValue("ok-anthropic");
    const out = await callWithFailover([openaiClient, anthropicClient], "prompt", "run-1");
    expect(out).toBe("ok-anthropic");
  });

  it("rethrows when both providers fail", async () => {
    (openaiClient.call as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("openai down"));
    (anthropicClient.call as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("anthropic down"),
    );
    await expect(
      callWithFailover([openaiClient, anthropicClient], "prompt", "run-1"),
    ).rejects.toThrow(/anthropic down/);
  });

  it("does not fail over on a 400 (caller error)", async () => {
    (openaiClient.call as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("bad request"), { status: 400 }),
    );
    await expect(
      callWithFailover([openaiClient, anthropicClient], "prompt", "run-1"),
    ).rejects.toThrow(/bad request/);
    expect(anthropicClient.call).not.toHaveBeenCalled();
  });
});
