// Regression tests for two onboarding-autopilot defects seen in production:
// one brand ran 114 full citation sweeps in 34 hours because completing an
// in-flight run fell through and started a brand-new one, and separately
// because in-flight statuses resumed with no bound at all.
//
// Mock pattern mirrors tests/unit/autopilotRetry.test.ts and
// tests/unit/onboardingAutopilotClaim.test.ts: vi.hoisted stubs, vi.mock for
// storage / logger / sentryReport, db.execute mocked via ../../server/db.

import { describe, it, expect, vi, beforeEach } from "vitest";

const storageStubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  updateBrand: vi.fn(),
  markAutopilotAttempt: vi.fn(),
  getLastCompletedScrapeRunAt: vi.fn(),
  getActiveCitationRuns: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
}));

const dbStubs = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));
vi.mock("../../server/db", () => ({ db: { execute: dbStubs.execute }, pool: { query: vi.fn() } }));

// The per-brand lock is exercised by its own integration path; here it must
// simply not swallow the body, or every assertion below tests nothing.
vi.mock("../../server/lib/advisoryLock", () => ({
  dynamicLockNamespaces: { onboardingAutopilotSlice: 920003 },
  withDynamicAdvisoryLock: async (
    _ns: number,
    _id: string,
    _label: string,
    fn: () => Promise<unknown>,
  ) => ({ ran: true, result: await fn() }),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

// The phase workers all do real network / LLM / DB work. None should be
// reached by the Defect 1 tests below (the brand is already past them, at
// 'running_citations'), and asserting that is part of the point.
const phaseStubs = vi.hoisted(() => ({
  runFullScrapeForBrand: vi.fn(),
  generateBrandPrompts: vi.fn(),
  discoverCompetitors: vi.fn(),
  runBrandPrompts: vi.fn(),
  advanceCitationRun: vi.fn(),
  populateBrandDashboard: vi.fn(),
}));
vi.mock("../../server/lib/factAgent/v2/runFullScrape", () => ({
  runFullScrapeForBrand: phaseStubs.runFullScrapeForBrand,
}));
vi.mock("../../server/lib/promptGenerator", () => ({
  generateBrandPrompts: phaseStubs.generateBrandPrompts,
}));
vi.mock("../../server/lib/competitorDiscovery", () => ({
  discoverCompetitors: phaseStubs.discoverCompetitors,
}));
vi.mock("../../server/citationChecker", () => ({
  runBrandPrompts: phaseStubs.runBrandPrompts,
  advanceCitationRun: phaseStubs.advanceCitationRun,
}));
vi.mock("../../server/lib/brandActivation", () => ({
  populateBrandDashboard: phaseStubs.populateBrandDashboard,
}));
vi.mock("../../server/lib/factAgent/v2/vercelBudget", () => ({
  cronStepBudget: () => 30_000,
  LLM_CALL_TIMEOUT_MS: 30_000,
}));

const { runOnboardingAutopilot, resumeInFlightAutopilots, AUTOPILOT_STALL_HOURS } =
  await import("../../server/lib/onboardingAutopilot");

function statusesWritten(): string[] {
  return storageStubs.updateBrand.mock.calls
    .map((c) => (c[1] as any)?.autopilotStatus)
    .filter((s): s is string => typeof s === "string");
}

/**
 * Duck-typed flattener for a drizzle-orm `sql` tagged-template value: walks
 * `queryChunks` (SQL), joins `value` arrays (StringChunk), and stringifies
 * anything else (a plain interpolated value, e.g. an error-message string).
 * Good enough to assert on meaningful fragments of the query text without
 * pinning exact whitespace or going through a real Postgres dialect.
 */
function flattenSql(node: unknown): string {
  if (node && typeof node === "object") {
    const obj = node as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(obj.queryChunks)) {
      return obj.queryChunks.map(flattenSql).join("");
    }
    if (Array.isArray(obj.value)) {
      return obj.value.join("");
    }
  }
  return String(node);
}

describe("Defect 1: finishing an in-flight citation run must not start a new one", () => {
  beforeEach(() => {
    Object.values(storageStubs).forEach((m) => m.mockReset());
    Object.values(phaseStubs).forEach((m) => m.mockReset());
    dbStubs.execute.mockReset();
    storageStubs.getBrandById.mockResolvedValue({
      id: "brand-1",
      name: "Acme",
      website: "https://acme.example.com",
      // Already past Phase 0 (fact scrape) and Step 1 (prompt generation) -
      // both are skipped for 'running_citations', landing directly on the
      // step 2 citation-run logic under test.
      autopilotStatus: "running_citations",
    });
    storageStubs.updateBrand.mockResolvedValue({});
    storageStubs.markAutopilotAttempt.mockResolvedValue(undefined);
    phaseStubs.populateBrandDashboard.mockResolvedValue(undefined);
  });

  const futureDeadline = () => Date.now() + 60_000;

  it("does NOT call runBrandPrompts and advances to step 3 when the active run finishes", async () => {
    storageStubs.getActiveCitationRuns.mockResolvedValue([
      { id: "run-1", startedAt: new Date(), progressPct: 100, status: "running" },
    ]);
    phaseStubs.advanceCitationRun.mockResolvedValue({ done: true });

    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: futureDeadline() });

    expect(phaseStubs.advanceCitationRun).toHaveBeenCalledWith("run-1", expect.any(Number));
    expect(phaseStubs.runBrandPrompts).not.toHaveBeenCalled();

    const written = statusesWritten();
    expect(written).toContain("completed");
    const completedCall = storageStubs.updateBrand.mock.calls.find(
      (c) => (c[1] as any)?.autopilotStatus === "completed",
    );
    expect(completedCall?.[1]).toMatchObject({ autopilotStatus: "completed", autopilotStep: 3 });
  });

  it("returns early and does NOT call runBrandPrompts when the active run is not yet done", async () => {
    storageStubs.getActiveCitationRuns.mockResolvedValue([
      { id: "run-1", startedAt: new Date(), progressPct: 40, status: "running" },
    ]);
    phaseStubs.advanceCitationRun.mockResolvedValue({ done: false });

    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: futureDeadline() });

    expect(phaseStubs.runBrandPrompts).not.toHaveBeenCalled();
    expect(phaseStubs.populateBrandDashboard).not.toHaveBeenCalled();
    expect(statusesWritten()).not.toContain("completed");
  });

  it("calls runBrandPrompts exactly once when there is no active run", async () => {
    storageStubs.getActiveCitationRuns.mockResolvedValue([]);
    phaseStubs.runBrandPrompts.mockResolvedValue({ done: false });

    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: futureDeadline() });

    expect(phaseStubs.advanceCitationRun).not.toHaveBeenCalled();
    expect(phaseStubs.runBrandPrompts).toHaveBeenCalledTimes(1);
    expect(phaseStubs.runBrandPrompts.mock.calls[0][0]).toBe("brand-1");
  });
});

describe("Defect 2: resumeInFlightAutopilots bounds in-flight retries with a stall demotion", () => {
  beforeEach(async () => {
    Object.values(storageStubs).forEach((m) => m.mockReset());
    Object.values(phaseStubs).forEach((m) => m.mockReset());
    dbStubs.execute.mockReset();
    const { logger } = await import("../../server/lib/logger");
    (logger.warn as ReturnType<typeof vi.fn>).mockReset();
  });

  it("issues the demotion UPDATE before the resume scan, targeting only the four in-flight statuses older than the stall threshold, and logs it", async () => {
    dbStubs.execute.mockImplementation(async (query: unknown) => {
      const text = flattenSql(query);
      if (text.includes("UPDATE brands")) {
        return { rows: [{ id: "brand-stalled" }] };
      }
      // The resume scan itself: return no rows so the test stays scoped to
      // the demotion behaviour and doesn't also drive runOnboardingAutopilot.
      return { rows: [] };
    });

    await resumeInFlightAutopilots(Date.now() + 60_000);

    expect(dbStubs.execute).toHaveBeenCalledTimes(2);

    const firstCallText = flattenSql(dbStubs.execute.mock.calls[0][0]);
    const secondCallText = flattenSql(dbStubs.execute.mock.calls[1][0]);

    // Order: the demotion UPDATE runs before the resume SELECT.
    expect(firstCallText).toContain("UPDATE brands");
    expect(firstCallText).toContain("SET autopilot_status = 'failed'");
    expect(secondCallText).toContain("SELECT id, user_id FROM brands");

    // Targets exactly the four in-flight statuses - not 'idle' or 'failed',
    // which have their own bounded (attempt-capped) retry path.
    expect(firstCallText).toContain(
      "autopilot_status IN ('pending', 'scraping_facts', 'generating_prompts', 'running_citations')",
    );
    expect(firstCallText).not.toContain("'idle'");

    // Only rows older than AUTOPILOT_STALL_HOURS (6h) qualify.
    expect(firstCallText).toContain("autopilot_started_at IS NOT NULL");
    expect(firstCallText).toContain(
      `autopilot_started_at < now() - interval '${AUTOPILOT_STALL_HOURS} hours'`,
    );

    // The demotion is logged so it's visible in production, not silent.
    const { logger } = await import("../../server/lib/logger");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1, brandIds: ["brand-stalled"] }),
      expect.stringContaining("demoted stalled in-flight brands"),
    );
  });

  it("does not demote or log when every in-flight brand is still inside the stall window", async () => {
    dbStubs.execute.mockImplementation(async (query: unknown) => {
      const text = flattenSql(query);
      if (text.includes("UPDATE brands")) {
        // No row matched `autopilot_started_at < now() - interval '6 hours'`
        // - the brand is inside the window, so Postgres returns nothing.
        return { rows: [] };
      }
      return { rows: [] };
    });

    await resumeInFlightAutopilots(Date.now() + 60_000);

    const { logger } = await import("../../server/lib/logger");
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("demoted stalled in-flight brands"),
    );
    // The scan still runs even when nothing was demoted.
    expect(dbStubs.execute).toHaveBeenCalledTimes(2);
  });
});
