// Direct, no-HTTP tests for server/services/onboardingClaim.ts.
//
// Priority: idempotency and ownership (never create a second brand, never
// leak someone else's session) > quota enforcement > the data mapping from
// session events into brand/competitors/prompts/citation rows.

import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  waitUntil: vi.fn(),
  runOnboardingAutopilot: vi.fn(),
  withBrandQuota: vi.fn(),
  isUsageLimitError: vi.fn(),
  createCompetitor: vi.fn(),
  createPromptGeneration: vi.fn(),
  createBrandPrompt: vi.fn(),
  createCitationRun: vi.fn(),
  createGeoRanking: vi.fn(),
  captureAndFlush: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
}));

// A minimal Drizzle-chain fake: every intermediate call (.from/.where/.limit/
// .set/.values/.returning) returns another chain that resolves to `value`
// when awaited, regardless of which method was last called or what
// arguments it received - the tests only care about the resolved rows.
function chain(value: unknown): any {
  const obj: any = {
    from: () => chain(value),
    where: () => chain(value),
    limit: () => chain(value),
    set: () => chain(value),
    values: () => chain(value),
    returning: () => chain(value),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject),
  };
  return obj;
}

vi.mock("@vercel/functions", () => ({
  waitUntil: (p: Promise<unknown>) => {
    stubs.waitUntil(p);
    if (p && typeof (p as Promise<unknown>).then === "function") {
      (p as Promise<unknown>).catch(() => {});
    }
  },
}));

vi.mock("../../server/lib/onboardingAutopilot", () => ({
  runOnboardingAutopilot: stubs.runOnboardingAutopilot,
}));

vi.mock("../../server/lib/usageLimit", () => ({
  withBrandQuota: stubs.withBrandQuota,
  isUsageLimitError: stubs.isUsageLimitError,
}));

vi.mock("../../server/storage", () => ({
  storage: {
    createCompetitor: stubs.createCompetitor,
    createPromptGeneration: stubs.createPromptGeneration,
    createBrandPrompt: stubs.createBrandPrompt,
    createCitationRun: stubs.createCitationRun,
    createGeoRanking: stubs.createGeoRanking,
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: stubs.captureAndFlush,
}));

vi.mock("../../server/db", () => ({
  db: {
    select: (...args: unknown[]) => stubs.dbSelect(...args),
    update: (...args: unknown[]) => stubs.dbUpdate(...args),
  },
}));

// Cold-import cost mitigation, same rationale as
// onboardingActivationService.test.ts: pull @shared/schema in at module load
// so its first (slow) transform doesn't land inside a 5s `it` timeout.
await import("@shared/schema");

const { claimOnboardingSession } = await import("../../server/services/onboardingClaim");

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    domain: "acme.com",
    ipHash: "hash",
    status: "running",
    events: [
      {
        type: "profile",
        data: {
          name: "Acme",
          industry: "SaaS",
          descriptor: "SaaS for widgets",
          description: "We make widgets.",
          audience: "businesses",
        },
      },
      {
        type: "competitors",
        data: { shown: [{ name: "Rival Co", domain: "rival.com", faviconUrl: "" }], totalFound: 1 },
      },
      {
        type: "topics",
        data: { topics: [{ topic: "pricing", prompts: ["best widget tool", "widget pricing"] }] },
      },
      {
        type: "probe",
        data: {
          results: [
            {
              prompt: "best widget tool",
              engine: "ChatGPT",
              brandCited: true,
              brandRank: 1,
              mentioned: [{ name: "Acme", domain: null, rank: 1 }],
              snippet: "Acme is a great widget tool.",
            },
          ],
          promptsTested: 1,
          brandAppearances: 1,
          competitorAppearances: 0,
        },
      },
    ],
    answers: null,
    claimedBy: null,
    claimedBrandId: null,
    claimedAt: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    accessTier: "free",
    onboardingState: { pendingOnboardingSessionId: SESSION_ID },
    ...overrides,
  };
}

/** Wires db.select() to return `session` first, `user` second - the order
 *  claimOnboardingSession queries them in when the session is unclaimed. */
function stubUnclaimedLookups(session: unknown, user: unknown) {
  stubs.dbSelect
    .mockImplementationOnce(() => chain([session]))
    .mockImplementationOnce(() => chain([user]));
}

/** Wires withBrandQuota to run the work callback against a tx fake that
 *  succeeds the atomic claim guard and returns `brandRow` from the insert. */
function stubSuccessfulQuota(brandRow: Record<string, unknown>) {
  stubs.withBrandQuota.mockImplementation(async (_userId: string, _tier: unknown, fn: any) => {
    const tx = {
      execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
      select: () => chain([]),
      insert: () => chain([brandRow]),
      update: () => chain(undefined),
    };
    return fn(tx);
  });
}

beforeEach(() => {
  for (const s of Object.values(stubs)) s.mockReset();
  stubs.isUsageLimitError.mockReturnValue(false);
  stubs.runOnboardingAutopilot.mockResolvedValue(undefined);
  stubs.createCompetitor.mockResolvedValue(undefined);
  stubs.createPromptGeneration.mockResolvedValue({ id: "gen-1" });
  stubs.createBrandPrompt.mockResolvedValue(undefined);
  stubs.createCitationRun.mockResolvedValue({ id: "run-1" });
  stubs.createGeoRanking.mockResolvedValue(undefined);
  // Default: db.update (outer, post-claim "clear pending key") resolves.
  stubs.dbUpdate.mockImplementation(() => chain(undefined));
});

describe("claimOnboardingSession", () => {
  it("creates the brand once and is idempotent on a second call", async () => {
    stubUnclaimedLookups(makeSession(), makeUser());
    stubSuccessfulQuota({ id: "brand-1", industry: "SaaS" });

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);

    expect(result).toEqual({ kind: "claimed", brandId: "brand-1" });
    expect(stubs.withBrandQuota).toHaveBeenCalledTimes(1);
    expect(stubs.waitUntil).toHaveBeenCalledTimes(1);

    // Second call: session now looks already-claimed by this user.
    stubs.dbSelect.mockReset();
    stubs.dbSelect.mockImplementationOnce(() =>
      chain([makeSession({ claimedBy: USER_ID, claimedBrandId: "brand-1" })]),
    );

    const second = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(second).toEqual({ kind: "claimed", brandId: "brand-1" });
    // No second quota transaction, no second brand.
    expect(stubs.withBrandQuota).toHaveBeenCalledTimes(1);
  });

  it("does not create a second brand when two claims race on the atomic guard", async () => {
    stubUnclaimedLookups(makeSession(), makeUser());
    stubs.withBrandQuota.mockImplementation(async (_userId: string, _tier: unknown, fn: any) => {
      const tx = {
        // Guard update affected 0 rows - someone else's transaction (or an
        // earlier call from this same user) already won the claim.
        execute: vi.fn().mockResolvedValue({ rowCount: 0 }),
        select: () => chain([{ claimedBy: USER_ID, claimedBrandId: "brand-1" }]),
        insert: () => chain([{ id: "should-not-be-used" }]),
        update: () => chain(undefined),
      };
      return fn(tx);
    });

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ kind: "claimed", brandId: "brand-1" });
    expect(stubs.createCompetitor).not.toHaveBeenCalled();
  });

  it("returns not_found for a session claimed by someone else", async () => {
    stubs.dbSelect.mockImplementationOnce(() =>
      chain([makeSession({ claimedBy: "someone-else", claimedBrandId: "brand-9" })]),
    );

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ kind: "not_found" });
    expect(stubs.withBrandQuota).not.toHaveBeenCalled();
  });

  it("returns not_found for an expired session", async () => {
    stubs.dbSelect.mockImplementationOnce(() =>
      chain([makeSession({ expiresAt: new Date(Date.now() - 1000) })]),
    );

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ kind: "not_found" });
    expect(stubs.withBrandQuota).not.toHaveBeenCalled();
  });

  it("returns not_found for an unknown session", async () => {
    stubs.dbSelect.mockImplementationOnce(() => chain([]));

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ kind: "not_found" });
  });

  it("returns not_found when the session does not belong to this user's pending state", async () => {
    stubUnclaimedLookups(makeSession(), makeUser({ onboardingState: {} }));

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ kind: "not_found" });
    expect(stubs.withBrandQuota).not.toHaveBeenCalled();
  });

  it("sets agency fields on the user when audience is client", async () => {
    const session = makeSession({
      answers: { audience: "client", agencyName: "Acme Agency" },
    });
    stubUnclaimedLookups(session, makeUser());

    const userUpdate = vi.fn().mockImplementation(() => chain(undefined));
    stubs.withBrandQuota.mockImplementation(async (_userId: string, _tier: unknown, fn: any) => {
      const tx = {
        execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
        select: () => chain([]),
        insert: () => chain([{ id: "brand-2", industry: "SaaS" }]),
        update: userUpdate,
      };
      return fn(tx);
    });

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ kind: "claimed", brandId: "brand-2" });
    // update() is called for both the claimed_brand_id stamp and the agency
    // fields - at least one of those calls must be the agency write.
    expect(userUpdate).toHaveBeenCalled();
  });

  it("returns quota_exceeded and creates nothing when the brand quota is full", async () => {
    stubUnclaimedLookups(makeSession(), makeUser());
    stubs.withBrandQuota.mockImplementation(async () => {
      throw new Error("Brand limit reached");
    });
    stubs.isUsageLimitError.mockReturnValue(true);

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ kind: "quota_exceeded", message: "Brand limit reached" });
    expect(stubs.createCompetitor).not.toHaveBeenCalled();
    expect(stubs.createCitationRun).not.toHaveBeenCalled();
    expect(stubs.runOnboardingAutopilot).not.toHaveBeenCalled();
  });

  it("creates no citation rows when the session has no probe event", async () => {
    const session = makeSession();
    session.events = session.events.filter((e: any) => e.type !== "probe") as any;
    stubUnclaimedLookups(session, makeUser());
    stubSuccessfulQuota({ id: "brand-3", industry: "SaaS" });

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ kind: "claimed", brandId: "brand-3" });
    expect(stubs.createCitationRun).not.toHaveBeenCalled();
    expect(stubs.createGeoRanking).not.toHaveBeenCalled();
  });

  it("creates a citation run and one geo ranking per probe result when a probe event exists", async () => {
    stubUnclaimedLookups(makeSession(), makeUser());
    stubSuccessfulQuota({ id: "brand-4", industry: "SaaS" });

    await claimOnboardingSession(USER_ID, SESSION_ID);

    expect(stubs.createCitationRun).toHaveBeenCalledTimes(1);
    expect(stubs.createGeoRanking).toHaveBeenCalledTimes(1);
    expect(stubs.createGeoRanking).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-4",
        aiPlatform: "ChatGPT",
        isCited: 1,
        rank: 1,
      }),
    );
  });

  it("persists tracked prompts from topics up to the cap", async () => {
    stubUnclaimedLookups(makeSession(), makeUser());
    stubSuccessfulQuota({ id: "brand-5", industry: "SaaS" });

    await claimOnboardingSession(USER_ID, SESSION_ID);

    expect(stubs.createPromptGeneration).toHaveBeenCalledWith("brand-5");
    expect(stubs.createBrandPrompt).toHaveBeenCalledTimes(2); // 2 prompts in the fixture topic
  });

  it("returns not_found when the session never produced a profile event", async () => {
    const session = makeSession();
    session.events = session.events.filter((e: any) => e.type !== "profile") as any;
    stubUnclaimedLookups(session, makeUser());

    const result = await claimOnboardingSession(USER_ID, SESSION_ID);
    expect(result).toEqual({ kind: "not_found" });
    expect(stubs.withBrandQuota).not.toHaveBeenCalled();
  });
});
