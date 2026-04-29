// Wave 8: matcher is the authority for `isCited`. The citation judge can
// still run for enrichment (rank / relevance), but cannot flip the verdict.
// These tests cover the legacy `checkForCitation` path — the main Wave A
// path inside `runBrandPrompts` is integration-tested separately because it
// touches real DB + storage layers.

import { describe, it, expect, vi, beforeEach } from "vitest";

// citationChecker imports `storage` (and transitively db.ts which needs
// DATABASE_URL at module load), plus the OpenAI client. Mock both so the
// import succeeds without a real DB or API key.
vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/databaseStorage", () => ({ DatabaseStorage: class {} }));
vi.mock("../../server/citationJudge", () => ({
  judgeCitation: vi.fn(),
}));
vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));
vi.mock("../../server/lib/aiLogger", () => ({
  attachAiLogger: vi.fn(),
}));

// Stub the budget helper too — it's invoked by runBrandPrompts (not by
// checkForCitation directly) but the import chain pulls it in.
vi.mock("../../server/lib/llmBudget", () => ({
  assertWithinBudget: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
}));

import { checkForCitation } from "../../server/citationChecker";
import { judgeCitation } from "../../server/citationJudge";

const judgeMock = vi.mocked(judgeCitation);

beforeEach(() => {
  judgeMock.mockReset();
});

describe("checkForCitation — matcher authority", () => {
  it("matcher says no → judge never called → isCited=false", async () => {
    // Brand "Notion" requires a signal-word for the ambiguity gate, so a
    // bare "Notion" reference WITHOUT context shouldn't match. Using a
    // clearly-unambiguous brand here for the negative case.
    const result = await checkForCitation(
      "ChatGPT and Claude are popular AI tools",
      "Acme Widgets",
      [],
    );
    expect(result.isCited).toBe(false);
    expect(result.rank).toBeNull();
    expect(judgeMock).not.toHaveBeenCalled();
  });

  it("matcher says yes, judge says yes → isCited=true with judge's enrichment", async () => {
    judgeMock.mockResolvedValueOnce({
      cited: true,
      rank: 3,
      relevance: 80,
      reasoning: "named in numbered list",
    });
    const result = await checkForCitation(
      "I recommend Acme Widgets for your team. Other options include FooBar.",
      "Acme Widgets",
      [],
    );
    expect(result.isCited).toBe(true);
    expect(result.rank).toBe(3);
    expect(result.relevance).toBe(80);
    expect(judgeMock).toHaveBeenCalledOnce();
  });

  it("matcher says yes, judge says no → matcher wins, isCited=true, rank/relevance null", async () => {
    judgeMock.mockResolvedValueOnce({
      cited: false,
      rank: null,
      relevance: 20,
      reasoning: "merely mentioned in passing",
    });
    const result = await checkForCitation(
      "Acme Widgets is sometimes mentioned alongside FooBar.",
      "Acme Widgets",
      [],
    );
    // Matcher hit → isCited stays true regardless of judge's pessimism.
    expect(result.isCited).toBe(true);
    // Judge said cited=false → don't fabricate enrichment.
    expect(result.rank).toBeNull();
    expect(result.relevance).toBeNull();
  });

  it("matcher says yes, judge throws → isCited=true with null enrichment", async () => {
    judgeMock.mockRejectedValueOnce(new Error("Judge unreachable"));
    const result = await checkForCitation("Acme Widgets is the leader.", "Acme Widgets", []);
    expect(result.isCited).toBe(true);
    expect(result.rank).toBeNull();
    expect(result.relevance).toBeNull();
    expect(result.reasoning).toMatch(/unreachable/i);
  });

  it("matcher uses extra variations passed in", async () => {
    judgeMock.mockResolvedValueOnce({
      cited: true,
      rank: 1,
      relevance: 90,
      reasoning: "ok",
    });
    const result = await checkForCitation(
      "Notion Labs Inc. dominates the productivity space.",
      "Notion Labs", // primary name
      ["Notion Labs Inc."], // learned variation
    );
    expect(result.isCited).toBe(true);
  });

  it("ambiguity gate blocks bare 'Notion' without signal word", async () => {
    judgeMock.mockResolvedValueOnce({
      cited: true,
      rank: 1,
      relevance: 90,
      reasoning: "named",
    });
    const result = await checkForCitation("I have a notion that this won't work.", "Notion", []);
    // Ambiguity gate triggers — "notion" without a signal word like
    // "platform"/"app"/"company" nearby doesn't match. Judge isn't called.
    expect(result.isCited).toBe(false);
    expect(judgeMock).not.toHaveBeenCalled();
  });
});
