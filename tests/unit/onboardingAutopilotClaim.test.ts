// The onboarding autopilot must make a brand FINDABLE before it does any work.
//
// The bug: runOnboardingAutopilot performed two awaits and an early
// deadline-return before its first status write. A kickoff that arrived with
// an exhausted budget - or whose serverless function was killed after the HTTP
// response was already sent, since it is launched detached via waitUntil -
// returned having written nothing, leaving the brand at its creation-default
// 'idle'. The recovery sweep selected only the four in-flight statuses, so
// 'idle' brands were invisible to it forever: never resumed, never retried,
// dashboard permanently empty. 24 of 39 production brands were in that state.
//
// These tests pin the claim, not the implementation: after autopilot has been
// invoked at all, the row must be in a status the sweep can see, and the
// attempt must have been recorded so the retry cap can bound it.

import { describe, it, expect, vi, beforeEach } from "vitest";

const storageStubs = vi.hoisted(() => ({
  getBrandById: vi.fn(),
  updateBrand: vi.fn(),
  markAutopilotAttempt: vi.fn(),
  getLastCompletedScrapeRunAt: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));
vi.mock("../../server/db", () => ({ db: { execute: vi.fn() }, pool: { query: vi.fn() } }));

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
// reached in these tests, and asserting that is part of the point.
const phaseStubs = vi.hoisted(() => ({
  runFullScrapeForBrand: vi.fn(),
  generateBrandPrompts: vi.fn(),
  discoverCompetitors: vi.fn(),
  runBrandPrompts: vi.fn(),
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
}));
vi.mock("../../server/lib/brandActivation", () => ({
  populateBrandDashboard: phaseStubs.populateBrandDashboard,
}));
vi.mock("../../server/lib/factAgent/v2/vercelBudget", () => ({
  cronStepBudget: () => 30_000,
  LLM_CALL_TIMEOUT_MS: 30_000,
}));

const { runOnboardingAutopilot, AUTOPILOT_MAX_ATTEMPTS, AUTOPILOT_RETRY_BACKOFF_MINUTES } =
  await import("../../server/lib/onboardingAutopilot");

/** Statuses the recovery sweep can actually see and resume. */
const SWEEPABLE = ["pending", "scraping_facts", "generating_prompts", "running_citations"];

function statusesWritten(): string[] {
  return storageStubs.updateBrand.mock.calls
    .map((c) => (c[1] as any)?.autopilotStatus)
    .filter((s): s is string => typeof s === "string");
}

describe("onboarding autopilot claims the run before doing work", () => {
  beforeEach(() => {
    Object.values(storageStubs).forEach((m) => m.mockReset());
    Object.values(phaseStubs).forEach((m) => m.mockReset());
    storageStubs.getBrandById.mockResolvedValue({
      id: "brand-1",
      name: "Acme",
      website: "https://acme.example.com",
      autopilotStatus: "idle",
    });
    storageStubs.updateBrand.mockResolvedValue({});
    storageStubs.markAutopilotAttempt.mockResolvedValue(undefined);
    storageStubs.getLastCompletedScrapeRunAt.mockResolvedValue(null);
  });

  it("leaves a sweepable status even when the deadline is already exhausted", async () => {
    // THE REGRESSION: this path used to return having written nothing, so the
    // brand stayed 'idle' and no sweep would ever pick it up again.
    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: Date.now() - 1 });

    const written = statusesWritten();
    expect(written.length).toBeGreaterThan(0);
    expect(SWEEPABLE).toContain(written[0]);
    // And it must not have burned budget on real work.
    expect(phaseStubs.runFullScrapeForBrand).not.toHaveBeenCalled();
  });

  it("records the attempt so the retry cap can bound it", async () => {
    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: Date.now() - 1 });
    expect(storageStubs.markAutopilotAttempt).toHaveBeenCalledWith("brand-1");
  });

  it("does NOT rewrite a failed run to pending", async () => {
    // A 'failed' run is already visible to the recovery sweep, so it does not
    // need claiming - and rewriting it to 'pending' destroyed the only record
    // of how far it got. In production that sent a brand whose citation run
    // had already succeeded back to the prompt phase, where generation found
    // the prompts already existed, saved none, threw "produced no prompts",
    // and failed again - burning the entire retry budget in a loop.
    storageStubs.getBrandById.mockResolvedValue({
      id: "brand-1",
      name: "Acme",
      website: "https://acme.example.com",
      autopilotStatus: "failed",
      autopilotStep: 2,
    });
    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: Date.now() - 1 });
    expect(statusesWritten()).not.toContain("pending");
  });

  it("does not re-claim a brand that is already mid-pipeline", async () => {
    // 'running_citations' is already sweepable; rewriting it to 'pending'
    // would lose the resume point and redo paid work.
    storageStubs.getBrandById.mockResolvedValue({
      id: "brand-1",
      name: "Acme",
      website: "https://acme.example.com",
      autopilotStatus: "running_citations",
    });
    await runOnboardingAutopilot("brand-1", "user-1", { deadlineMs: Date.now() - 1 });
    expect(statusesWritten()).not.toContain("pending");
  });

  it("writes nothing at all when the brand does not exist", async () => {
    storageStubs.getBrandById.mockResolvedValue(undefined);
    await runOnboardingAutopilot("missing", "user-1", { deadlineMs: Date.now() + 60_000 });
    expect(storageStubs.updateBrand).not.toHaveBeenCalled();
    expect(storageStubs.markAutopilotAttempt).not.toHaveBeenCalled();
  });

  it("bounds retries and backs off long enough for a provider quota to reset", () => {
    // Guard rails, not preferences: onboarding costs real provider spend, and
    // the observed failures were 429 quota errors. Retrying immediately would
    // burn the whole budget against the same wall.
    expect(AUTOPILOT_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(AUTOPILOT_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
    expect(AUTOPILOT_RETRY_BACKOFF_MINUTES).toBeGreaterThanOrEqual(15);
  });
});
