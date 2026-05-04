import { describe, it, expect, vi, beforeEach } from "vitest";

// Importing from server/citationChecker pulls in server/db (DATABASE_URL),
// server/storage, server/citationJudge (OpenAI client), and the OpenAI SDK
// itself. Mock all of these so the helper import works in an isolated env.
// Same pattern as tests/unit/citationChecker.matcherAuthority.test.ts.
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
vi.mock("../../server/lib/llmBudget", () => ({
  assertWithinBudget: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
}));

import { addCompetitorDetection } from "../../server/citationChecker";

describe("competitorDetections cap", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts entries below the 5000-competitor cap", () => {
    const map = new Map<string, Map<string, number>>();
    for (let i = 0; i < 100; i++) {
      addCompetitorDetection(map, `comp-${i}`, "ChatGPT", 1);
    }
    expect(map.size).toBe(100);
  });

  it("stops adding NEW competitors once cap is reached, fires onCapHit per dropped attempt", () => {
    // The helper itself fires onCapHit on EVERY rejected insert. The caller
    // (runBrandPrompts) is responsible for deduplicating to one log line per
    // run via its own `competitorDetectionsCapWarned` boolean — keeps the
    // helper a pure function with no internal state.
    const map = new Map<string, Map<string, number>>();
    const onCapHit = vi.fn();

    // Fill to cap.
    for (let i = 0; i < 5000; i++) {
      addCompetitorDetection(map, `comp-${i}`, "ChatGPT", 1, onCapHit);
    }
    expect(map.size).toBe(5000);
    expect(onCapHit).not.toHaveBeenCalled();

    // 100 more new competitors — all rejected, onCapHit fires per attempt.
    for (let i = 5000; i < 5100; i++) {
      addCompetitorDetection(map, `comp-${i}`, "ChatGPT", 1, onCapHit);
    }
    expect(map.size).toBe(5000);
    expect(onCapHit).toHaveBeenCalledTimes(100);
  });

  it("caller can deduplicate onCapHit to one warn per run via local boolean", () => {
    // This documents the pattern used in runBrandPrompts.
    const map = new Map<string, Map<string, number>>();
    let warnedOnce = false;
    const warnSpy = vi.fn();

    for (let i = 0; i < 5100; i++) {
      addCompetitorDetection(map, `comp-${i}`, "ChatGPT", 1, () => {
        if (!warnedOnce) {
          warnedOnce = true;
          warnSpy();
        }
      });
    }
    expect(map.size).toBe(5000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("still allows updates to EXISTING competitors after cap is reached", () => {
    const map = new Map<string, Map<string, number>>();
    for (let i = 0; i < 5000; i++) {
      addCompetitorDetection(map, `comp-${i}`, "ChatGPT", 1);
    }

    // Updating an existing competitor with a new platform must work.
    addCompetitorDetection(map, "comp-0", "Claude", 1);
    expect(map.get("comp-0")?.get("Claude")).toBe(1);

    // Incrementing should also work.
    addCompetitorDetection(map, "comp-0", "Claude", 1);
    expect(map.get("comp-0")?.get("Claude")).toBe(2);
  });
});
