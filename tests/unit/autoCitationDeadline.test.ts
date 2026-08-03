// auto-citation must not record a truncated run as this week's run.
//
// runBrandPrompts is slice-aware: handed a deadline it stops scheduling new
// prompt/platform pairs and returns done:false, leaving the citation_runs row
// resumable. The cron's job is to notice that and NOT stamp
// lastAutoCitationAt - because isBrandDueForCitation gates on that timestamp
// for six days, so stamping a half-finished pass strands the brand with
// partial data until the following week.
//
// This is the same trap the mention scan fell into (see mentionScanDeadline
// .test.ts); the deadline was added to this call for the same reason - without
// it one brand's run was unbounded and starved every orchestrator step behind
// it.

import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test-key";
process.env.OPENROUTER_API_KEY ||= "test-key";
process.env.RESEND_API_KEY ||= "test-key";
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

const stubs = vi.hoisted(() => ({
  runBrandPrompts: vi.fn(),
  generateSuggestedPrompts: vi.fn(async () => ({ error: null })),
  getBrandPromptsByBrandId: vi.fn(async () => [{ id: "p1" }]),
  updateSet: vi.fn(),
  brands: [] as unknown[],
}));

vi.mock("../../server/citationChecker", () => ({
  runBrandPrompts: stubs.runBrandPrompts,
  advanceCitationRun: vi.fn(),
}));
vi.mock("../../server/lib/suggestionGenerator", () => ({
  generateSuggestedPrompts: stubs.generateSuggestedPrompts,
}));
vi.mock("../../server/storage", () => ({
  storage: { getBrandPromptsByBrandId: stubs.getBrandPromptsByBrandId },
}));
// The debounce and advisory lock both need a live database; run the body.
vi.mock("../../server/lib/jobDebounce", () => ({
  withJobDebounce: (_k: string, _w: number, fn: () => Promise<unknown>) => fn(),
  shouldRunJob: vi.fn(async () => ({ shouldRun: true })),
  markJobRan: vi.fn(async () => undefined),
  DEBOUNCE_WINDOWS: { "auto-citation": 1, "mention-scan": 1 },
}));
vi.mock("../../server/lib/advisoryLock", () => ({
  withAdvisoryLock: async (_k: unknown, _n: string, fn: () => Promise<unknown>) => ({
    ran: true,
    result: await fn(),
  }),
  lockKeys: {},
  schedulerLockKeys: {},
}));
vi.mock("../../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => stubs.brands }) }),
    update: () => ({
      set: (v: unknown) => ({
        where: async () => {
          stubs.updateSet(v);
        },
      }),
    }),
  },
  pool: {},
}));

const { runAutoCitationJob } = await import("../../server/scheduler");

const BRAND = { id: "b1", name: "Acme", lastAutoCitationAt: null, deletedAt: null };

beforeEach(() => {
  stubs.updateSet.mockClear();
  stubs.generateSuggestedPrompts.mockClear();
  stubs.runBrandPrompts.mockReset();
  stubs.brands = [BRAND];
});

describe("auto-citation deadline handling", () => {
  it("stamps lastAutoCitationAt when the run completes", async () => {
    stubs.runBrandPrompts.mockResolvedValue({
      totalChecks: 10,
      totalCited: 4,
      rankings: [],
      runId: "r1",
      done: true,
    });

    await runAutoCitationJob(Date.now() + 60_000);

    expect(stubs.updateSet).toHaveBeenCalledTimes(1);
    const patch = stubs.updateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.lastAutoCitationAt).toBeInstanceOf(Date);
    expect(patch.lastAutoCitationStatus).toBe("succeeded");
  });

  it("does NOT stamp lastAutoCitationAt when the deadline truncated the run", async () => {
    stubs.runBrandPrompts.mockResolvedValue({
      totalChecks: 3,
      totalCited: 1,
      rankings: [],
      runId: "r1",
      done: false,
    });

    await runAutoCitationJob(Date.now() + 60_000);

    // The brand must stay due, or a partial pass gates it for six days.
    expect(stubs.updateSet).not.toHaveBeenCalled();
    // Suggestions are regenerated from the run's results - half a run is the
    // wrong input, so that step is skipped too.
    expect(stubs.generateSuggestedPrompts).not.toHaveBeenCalled();
  });

  it("passes the deadline through to runBrandPrompts", async () => {
    stubs.runBrandPrompts.mockResolvedValue({
      totalChecks: 1,
      totalCited: 0,
      rankings: [],
      runId: "r1",
      done: true,
    });
    const deadline = Date.now() + 60_000;

    await runAutoCitationJob(deadline);

    // Without this the per-brand call is unbounded and one brand can outlive
    // the entire orchestrator budget.
    expect(stubs.runBrandPrompts).toHaveBeenCalledWith(
      "b1",
      undefined,
      expect.objectContaining({ triggeredBy: "cron", deadlineMs: deadline }),
    );
  });
});
