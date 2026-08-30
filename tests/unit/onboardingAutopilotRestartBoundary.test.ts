// Regression tests for the restart window between finishing a citation run
// and recording that it finished.
//
// The defect: advanceCitationRun() marks the citation_runs row terminal, then
// runOnboardingAutopilot ran populateBrandDashboard - given its OWN 120s
// budget - and only afterwards wrote autopilot_status = 'completed'. A
// restart, redeploy, or platform timeout inside that window left the brand in
// 'running_citations' with no active run, because getActiveCitationRuns
// selects only 'pending'/'running'. The next resume therefore took the `else`
// branch, called runBrandPrompts, and started a SECOND full paid citation run.
// The partial unique index citation_runs_one_active_per_brand did not stop it:
// the earlier run was no longer active. In-flight statuses carry no attempt
// cap, so only the 6h stall demotion bounded the repeat.
//
// The fix commits completion BEFORE the supplementary phase, and guards that
// phase so it cannot un-complete the brand.
//
// Mock pattern mirrors tests/unit/onboardingAutopilotResumeLoop.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

const storageStubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  updateBrand: vi.fn(),
  markAutopilotAttempt: vi.fn(),
  getLastCompletedScrapeRunAt: vi.fn(),
  getActiveCitationRuns: vi.fn(),
  getBrandPromptsByBrandId: vi.fn(),
}));

const dbStubs = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));
vi.mock("../../server/db", () => ({ db: { execute: dbStubs.execute }, pool: { query: vi.fn() } }));
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

const { runOnboardingAutopilot, resumeInFlightAutopilots } =
  await import("../../server/lib/onboardingAutopilot");

function completedWriteCall() {
  return storageStubs.updateBrand.mock.calls.find(
    (c) => (c[1] as { autopilotStatus?: string })?.autopilotStatus === "completed",
  );
}

function statusesWritten(): string[] {
  return storageStubs.updateBrand.mock.calls
    .map((c) => (c[1] as { autopilotStatus?: string })?.autopilotStatus)
    .filter((s): s is string => typeof s === "string");
}

/** See tests/unit/onboardingAutopilotResumeLoop.test.ts - same flattener. */
function flattenSql(node: unknown): string {
  if (node && typeof node === "object") {
    const obj = node as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(obj.queryChunks)) return obj.queryChunks.map(flattenSql).join("");
    if (Array.isArray(obj.value)) return obj.value.join("");
  }
  return String(node);
}

describe("onboarding autopilot: the citation-completion restart window", () => {
  beforeEach(() => {
    Object.values(storageStubs).forEach((m) => m.mockReset());
    Object.values(phaseStubs).forEach((m) => m.mockReset());
    dbStubs.execute.mockReset();
    storageStubs.getBrandById.mockResolvedValue({
      id: "brand-1",
      name: "Acme",
      website: "https://acme.example.com",
      autopilotStatus: "running_citations",
    });
    storageStubs.updateBrand.mockResolvedValue({});
    storageStubs.markAutopilotAttempt.mockResolvedValue(undefined);
    storageStubs.getActiveCitationRuns.mockResolvedValue([
      { id: "run-1", startedAt: new Date(), progressPct: 100, status: "running" },
    ]);
    phaseStubs.advanceCitationRun.mockResolvedValue({ done: true });
    phaseStubs.populateBrandDashboard.mockResolvedValue(undefined);
  });

  const futureDeadline = () => Date.now() + 60_000;

  // This is the assertion that actually closes the window. If completion is
  // written after the supplementary phase, every restart inside that phase
  // costs another full citation run.
  it("commits 'completed' BEFORE the supplementary dashboard phase starts", async () => {
    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: futureDeadline() });

    const completed = completedWriteCall();
    expect(completed).toBeDefined();
    expect(phaseStubs.populateBrandDashboard).toHaveBeenCalledTimes(1);

    const completedAt = storageStubs.updateBrand.mock.invocationCallOrder[
      storageStubs.updateBrand.mock.calls.indexOf(completed!)
    ] as number;
    const dashboardAt = phaseStubs.populateBrandDashboard.mock.invocationCallOrder[0] as number;

    expect(completedAt).toBeLessThan(dashboardAt);
  });

  // A crash during the supplementary phase is the whole point: the brand must
  // already be terminal, so the resume sweep never sees it again.
  it("leaves the brand 'completed', not 'failed', when the supplementary phase throws", async () => {
    phaseStubs.populateBrandDashboard.mockRejectedValue(new Error("getBrandById: connection lost"));

    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: futureDeadline() });

    expect(statusesWritten()).toContain("completed");
    expect(statusesWritten()).not.toContain("failed");
    expect(phaseStubs.runBrandPrompts).not.toHaveBeenCalled();
  });

  // The completion write is only worth anything if a failure to persist it is
  // not silently swallowed. setAutopilot() logs and continues, which is right
  // for progress breadcrumbs and wrong here - a dropped completion is what
  // re-opens the window.
  it("does not silently continue when the completion write fails", async () => {
    storageStubs.updateBrand.mockImplementation(async (_id: string, patch: unknown) => {
      if ((patch as { autopilotStatus?: string })?.autopilotStatus === "completed") {
        throw new Error("write failed");
      }
      return {};
    });

    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: futureDeadline() });

    // It must land on the bounded, attempt-capped 'failed' path rather than
    // staying in the unbounded in-flight one, and must not have run the
    // supplementary phase as though everything succeeded.
    expect(statusesWritten()).toContain("failed");
    expect(phaseStubs.populateBrandDashboard).not.toHaveBeenCalled();
  });

  // Belt and braces: the state the fix writes is one the resume sweep's own
  // predicate excludes, so a completed brand cannot be re-entered at all.
  it("writes a status the resume sweep does not select", async () => {
    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: futureDeadline() });
    expect(completedWriteCall()).toBeDefined();

    dbStubs.execute.mockReset();
    dbStubs.execute.mockResolvedValue({ rows: [] });
    await resumeInFlightAutopilots(Date.now() + 60_000);

    const sweepSql = dbStubs.execute.mock.calls.map((c) => flattenSql(c[0])).join("\n");
    expect(sweepSql).toContain("running_citations");
    expect(sweepSql).not.toContain("'completed'");
  });
});
