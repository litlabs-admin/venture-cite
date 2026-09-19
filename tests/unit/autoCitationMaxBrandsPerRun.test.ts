// AUTO_CITATION_MAX_BRANDS_PER_RUN caps how many due brands one tick of the
// auto-citation job processes. Every paying brand is "due" after an outage
// (or, as here, after the ANY(${PAYING_TIERS}) query bug is fixed and every
// brand that piled up over five weeks becomes due at once) - without a cap
// the first tick would run every one of them, bursting LLM spend and run
// time. Brands past the cap stay due (isBrandDueForCitation still says yes)
// and are picked up on the next hourly tick, so nothing is lost - just
// spread out. Oldest-run-first, with never-run (NULL) brands first, so the
// longest-overdue brands go first.
//
// The env parsing itself (default 5, invalid falls back to 5) is covered by
// tests/unit/envNumber.test.ts against the shared positiveIntEnv helper,
// without needing to import this module's (large) dependency graph.

import { describe, it, expect, beforeEach, vi } from "vitest";
// These tests exercise the job body, so the owner's off switch (server/lib/paidJobSwitch.ts) is turned on.
process.env.AUTO_CITATION_ENABLED = "true";

process.env.OPENAI_API_KEY ||= "test-key";
process.env.OPENROUTER_API_KEY ||= "test-key";
process.env.RESEND_API_KEY ||= "test-key";
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
process.env.AUTO_CITATION_MAX_BRANDS_PER_RUN = "5";

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
    execute: async () => ({ rows: stubs.brands }),
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

/** Days ago as a Date, for building lastAutoCitationAt fixtures. */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function brand(id: string, lastAutoCitationAt: Date | null) {
  return { id, name: id, lastAutoCitationAt, deletedAt: null };
}

beforeEach(() => {
  stubs.updateSet.mockClear();
  stubs.generateSuggestedPrompts.mockClear();
  stubs.runBrandPrompts.mockReset();
  stubs.runBrandPrompts.mockResolvedValue({
    totalChecks: 1,
    totalCited: 0,
    rankings: [],
    runId: "r1",
    done: true,
  });
  stubs.brands = [];
});

describe("AUTO_CITATION_MAX_BRANDS_PER_RUN", () => {
  it("processes only the cap, oldest-due (NULL first) order, and defers the rest", async () => {
    // 12 due brands (cap is 5, set above): 2 never run (NULL), 10 with
    // staggered lastAutoCitationAt, all older than the 6-day due threshold,
    // deliberately out of order.
    const dueBrands = [
      brand("old-30", daysAgo(30)),
      brand("null-b", null),
      brand("old-20", daysAgo(20)),
      brand("old-10", daysAgo(10)),
      brand("null-a", null),
      brand("old-9", daysAgo(9)),
      brand("old-8", daysAgo(8)),
      brand("old-7", daysAgo(7)),
      brand("old-25", daysAgo(25)),
      brand("old-15", daysAgo(15)),
      brand("old-12", daysAgo(12)),
      brand("old-6.5", new Date(Date.now() - 6.5 * 24 * 60 * 60 * 1000)),
    ];
    expect(dueBrands.length).toBe(12);
    stubs.brands = dueBrands;

    await runAutoCitationJob(undefined);

    // Expected order: NULLs first (insertion order preserved by a stable
    // sort), then ascending lastAutoCitationAt (oldest/most-overdue first).
    const expectedOrder = ["null-b", "null-a", "old-30", "old-25", "old-20"];
    const processedIds = stubs.runBrandPrompts.mock.calls.map((call) => call[0]);
    expect(processedIds).toEqual(expectedOrder);
    expect(stubs.runBrandPrompts).toHaveBeenCalledTimes(5);
    expect(stubs.updateSet).toHaveBeenCalledTimes(5);
  });
});
