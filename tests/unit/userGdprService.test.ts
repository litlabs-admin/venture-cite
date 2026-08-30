// Direct, no-HTTP tests for server/services/userGdpr.ts (B7 service
// extraction). HTTP-level behavior for POST /api/user/delete is already
// covered by tests/unit/userPasswordChange.test.ts (the "POST
// /api/user/delete" describe block); this file proves the extracted
// buildUserExport and scheduleAccountDeletion functions work when called
// directly.

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[],
  selectMock: vi.fn(),
  updateMock: vi.fn(),
  updateCalls: [] as unknown[],
}));

function makeSelectChain(result: unknown) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    catch: (fn: any) => Promise.resolve(result).catch(fn),
  };
  return chain;
}
dbState.selectMock.mockImplementation(() => makeSelectChain(dbState.selectQueue.shift() ?? []));
dbState.updateMock.mockImplementation((values: unknown) => {
  dbState.updateCalls.push(values);
  const chain: any = {
    set: (setValues: unknown) => {
      dbState.updateCalls.push(setValues);
      return chain;
    },
    where: () => Promise.resolve(undefined),
  };
  return chain;
});

function queueSelect(result: unknown) {
  dbState.selectQueue.push(result);
}

vi.mock("../../server/db", () => ({
  db: { select: dbState.selectMock, update: dbState.updateMock },
  pool: {},
}));

const stubs = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  captureAndFlush: vi.fn(),
}));

vi.mock("../../server/supabase", () => ({
  supabaseAdmin: { auth: { admin: { signOut: stubs.signOut } } },
}));

vi.mock("../../server/lib/supabaseAuth", () => ({
  supabaseAuth: { auth: { signInWithPassword: stubs.signInWithPassword } },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({
  captureAndFlush: stubs.captureAndFlush,
}));

const { buildUserExport, scheduleAccountDeletion, GRACE_PERIOD_DAYS } =
  await import("../../server/services/userGdpr");

beforeEach(() => {
  dbState.selectQueue.length = 0;
  dbState.selectMock.mockClear();
  dbState.updateMock.mockClear();
  dbState.updateCalls.length = 0;
  stubs.signInWithPassword.mockReset();
  stubs.signOut.mockReset();
  stubs.signOut.mockResolvedValue({ data: null, error: null });
  stubs.captureAndFlush.mockReset();
});

describe("buildUserExport", () => {
  it("throws when the user row is missing", async () => {
    queueSelect([]); // userRow
    await expect(buildUserExport("user-1")).rejects.toThrow("User row missing during export");
  });

  it("strips sensitive fields and aggregates brand-scoped tables", async () => {
    queueSelect([
      {
        id: "user-1",
        email: "a@b.com",
        passwordHash: "secret-hash",
        bufferAccessToken: "secret-token",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      },
    ]); // userRow
    queueSelect([{ id: "brand-1", userId: "user-1" }]); // userBrands
    queueSelect([{ id: "art-1", brandId: "brand-1" }]); // articles
    queueSelect([]); // competitors
    queueSelect([]); // citationRuns
    queueSelect([]); // brandHallucinations
    queueSelect([]); // brandMentions
    queueSelect([]); // brandPrompts
    queueSelect([{ id: "audit-1", userId: "user-1" }]); // auditLogs
    queueSelect([{ id: "rank-1", articleId: "art-1" }]); // geoRankings

    const data = await buildUserExport("user-1");

    expect(data.user).not.toHaveProperty("passwordHash");
    expect(data.user).not.toHaveProperty("bufferAccessToken");
    expect(data.user).not.toHaveProperty("stripeCustomerId");
    expect(data.user).not.toHaveProperty("stripeSubscriptionId");
    expect((data.user as Record<string, unknown>).email).toBe("a@b.com");
    expect(data.brands).toEqual([{ id: "brand-1", userId: "user-1" }]);
    expect(data.articles).toEqual([{ id: "art-1", brandId: "brand-1" }]);
    expect(data.geoRankings).toEqual([{ id: "rank-1", articleId: "art-1" }]);
    expect(data.auditLogs).toEqual([{ id: "audit-1", userId: "user-1" }]);
    expect(data.schemaVersion).toBe(1);
  });

  it("skips brand-scoped and geo-ranking queries when the user has no brands", async () => {
    queueSelect([{ id: "user-1", email: "a@b.com" }]); // userRow
    queueSelect([]); // userBrands - empty
    queueSelect([]); // auditLogs (the only unconditional query left in Promise.all)

    const data = await buildUserExport("user-1");

    expect(data.articles).toEqual([]);
    expect(data.competitors).toEqual([]);
    expect(data.geoRankings).toEqual([]);
  });
});

describe("scheduleAccountDeletion", () => {
  const baseParams = {
    userId: "user-1",
    email: "a@b.com",
    password: "correct-password",
    bearerToken: "test-jwt-token",
  };

  it("returns invalid_password without touching the database when re-auth fails", async () => {
    stubs.signInWithPassword.mockResolvedValue({ error: { message: "bad creds" } });

    const outcome = await scheduleAccountDeletion(baseParams);

    expect(outcome).toEqual({ kind: "invalid_password" });
    expect(dbState.updateMock).not.toHaveBeenCalled();
  });

  it("schedules deletion, revokes sessions globally, and reports the previous row", async () => {
    stubs.signInWithPassword.mockResolvedValue({ error: null });
    queueSelect([{ id: "user-1", deletedAt: null }]); // previous

    const outcome = await scheduleAccountDeletion(baseParams);

    expect(outcome.kind).toBe("scheduled");
    if (outcome.kind === "scheduled") {
      expect(outcome.previousRow).toEqual({ deletedAt: null });
      const expectedScheduledFor = new Date(
        outcome.deletedAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
      );
      expect(outcome.scheduledFor.getTime()).toBe(expectedScheduledFor.getTime());
    }
    expect(stubs.signOut).toHaveBeenCalledWith("test-jwt-token", "global");
  });

  it("reports previousRow as null when no row was found", async () => {
    stubs.signInWithPassword.mockResolvedValue({ error: null });
    queueSelect([]); // previous - none found

    const outcome = await scheduleAccountDeletion(baseParams);

    expect(outcome.kind).toBe("scheduled");
    if (outcome.kind === "scheduled") {
      expect(outcome.previousRow).toBeNull();
    }
  });

  it("still returns scheduled when session revocation fails, and reports it", async () => {
    stubs.signInWithPassword.mockResolvedValue({ error: null });
    queueSelect([{ id: "user-1", deletedAt: null }]);
    const revokeError = new Error("revoke boom");
    stubs.signOut.mockRejectedValue(revokeError);

    const outcome = await scheduleAccountDeletion(baseParams);

    expect(outcome.kind).toBe("scheduled");
    expect(stubs.captureAndFlush).toHaveBeenCalledWith(revokeError, {
      tags: { source: "user-delete-session-revocation" },
    });
  });
});
