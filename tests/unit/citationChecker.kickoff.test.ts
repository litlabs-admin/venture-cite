// Wave 9: tests for the async kickoff path.
//
// `kickoffBrandPromptsRun` exists so the HTTP handler can return ~100ms with
// a runId while the actual run continues in the background. Verifies:
//   1. Returns runId synchronously (no await on the run itself).
//   2. Duplicate concurrent kickoff for the same brand returns
//      { ok: false, reason: "already_running", runId: existing.id }.
//   3. A failure inside the detached run writes errorMessage + status=failed
//      onto the citation_runs row.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock factories run before any top-level let/const, so we hoist the
// shared storageMock. Tests reach into it via the same hoisted handle.
const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    createCitationRun: vi.fn(),
    getActiveCitationRuns: vi.fn(),
    updateCitationRun: vi.fn(),
    getBrandById: vi.fn(),
    getCitationRunById: vi.fn(),
    getBrandPromptsByBrandId: vi.fn().mockResolvedValue([]),
    getCompetitors: vi.fn().mockResolvedValue([]),
    getGeoRankingsByBrandPromptIds: vi.fn().mockResolvedValue([]),
    getUser: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/databaseStorage", () => ({ DatabaseStorage: class {} }));
vi.mock("../../server/citationJudge", () => ({ judgeCitation: vi.fn() }));
vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));
vi.mock("../../server/lib/llmBudget", () => ({
  assertWithinBudget: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/storage", () => ({ storage: storageMock }));

import { kickoffBrandPromptsRun } from "../../server/citationChecker";

beforeEach(() => {
  Object.values(storageMock).forEach((fn) => {
    if (typeof fn === "function" && "mockReset" in fn) (fn as any).mockReset();
  });
  storageMock.getBrandPromptsByBrandId.mockResolvedValue([]);
  storageMock.getCompetitors.mockResolvedValue([]);
  storageMock.getGeoRankingsByBrandPromptIds.mockResolvedValue([]);
  // runBrandPrompts calls getBrandById; if undefined → throws "Brand not
  // found", which the kickoff catches and writes to errorMessage.
  storageMock.getBrandById.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("kickoffBrandPromptsRun", () => {
  it("returns runId synchronously without awaiting the run", async () => {
    storageMock.createCitationRun.mockResolvedValue({ id: "run-1" });

    const start = Date.now();
    const result = await kickoffBrandPromptsRun("brand-1", ["ChatGPT"]);
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runId).toBe("run-1");
    // Should not await the heavy run — well under any reasonable AI call time.
    expect(elapsed).toBeLessThan(200);
    expect(storageMock.createCitationRun).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: "brand-1", status: "running", progressPct: 0 }),
    );
  });

  it("returns 409-shape result when dedup index trips (23505)", async () => {
    const dupErr = Object.assign(new Error("duplicate"), { code: "23505" });
    storageMock.createCitationRun.mockRejectedValueOnce(dupErr);
    storageMock.getActiveCitationRuns.mockResolvedValueOnce([
      { id: "run-existing", startedAt: new Date(), progressPct: 12, status: "running" },
    ]);

    const result = await kickoffBrandPromptsRun("brand-1", ["ChatGPT"]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("already_running");
      expect(result.runId).toBe("run-existing");
    }
  });

  it("writes errorMessage + status=failed when the detached run throws", async () => {
    storageMock.createCitationRun.mockResolvedValue({ id: "run-2" });
    // getCitationRunById is invoked by runBrandPrompts via options.runId.
    // Returning undefined makes runBrandPrompts throw, which the kickoff
    // catch should capture into citation_runs.error_message.
    storageMock.getCitationRunById.mockResolvedValue(undefined);
    storageMock.getBrandById.mockResolvedValue({
      id: "brand-1",
      name: "Acme",
      companyName: null,
      nameVariations: [],
      website: null,
      userId: null,
    });
    storageMock.getBrandPromptsByBrandId.mockResolvedValue([
      { id: "p1", brandId: "brand-1", prompt: "test" },
    ]);

    const result = await kickoffBrandPromptsRun("brand-1", ["ChatGPT"]);
    expect(result.ok).toBe(true);

    // Wait a microtask cycle for the setImmediate-scheduled run to settle.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(storageMock.updateCitationRun).toHaveBeenCalledWith(
      "run-2",
      expect.objectContaining({
        status: "failed",
        progressPct: 100,
        errorMessage: expect.stringContaining("not found"),
      }),
    );
  });
});
