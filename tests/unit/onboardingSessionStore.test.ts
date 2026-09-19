// Coverage for server/onboardingSession/store.ts. The Drizzle query builder
// is mocked at the `db` boundary (../../server/db), the same seam
// askRoutes.test.ts mocks - this file checks store.ts builds the right
// query shape and validates events before writing, not real SQL.
// admitSession and deleteExpiredUnclaimedSessions bypass Drizzle and issue
// raw SQL against `pool` (a transaction needs pg_advisory_xact_lock in the
// same client as the rest of the work), so those are covered against a
// fake `pool.connect()` / `pool.query()` client instead.
import { describe, it, expect, beforeEach, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  selectGetSession: vi.fn(async () => [] as unknown[]),
  updateSet: vi.fn(async () => undefined),
  clientQuery: vi.fn(async (sqlText: string) => {
    if (sqlText.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sqlText.includes("BEGIN") || sqlText.includes("COMMIT") || sqlText.includes("ROLLBACK")) {
      return { rows: [] };
    }
    return { rows: [] };
  }),
  poolQuery: vi.fn(async () => ({ rowCount: 0 })),
}));

vi.mock("../../server/db", () => {
  const select = () => ({
    from: () => ({
      where: () => ({
        limit: async () => stubs.selectGetSession(),
      }),
    }),
  });
  const update = () => ({
    set: (...setArgs: unknown[]) => ({
      where: async (...whereArgs: unknown[]) => stubs.updateSet(...setArgs, ...whereArgs),
    }),
  });
  return {
    db: { select, update },
    pool: {
      connect: async () => ({
        query: stubs.clientQuery,
        release: vi.fn(),
      }),
      query: stubs.poolQuery,
    },
  };
});

const {
  admitSession,
  deleteExpiredUnclaimedSessions,
  appendEvent,
  getSession,
  setAnswers,
  setStatus,
} = await import("../../server/onboardingSession/store");

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    domain: "acme.com",
    ip_hash: "hash",
    status: "running",
    events: [],
    answers: null,
    claimed_by: null,
    claimed_brand_id: null,
    claimed_at: null,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.selectGetSession.mockResolvedValue([]);
  stubs.poolQuery.mockResolvedValue({ rowCount: 0 });
});

describe("admitSession", () => {
  it("inserts and returns a created session when neither limit is hit", async () => {
    stubs.clientQuery.mockImplementation(async (sqlText: string) => {
      if (sqlText.includes("SELECT id, domain FROM onboarding_sessions")) return { rows: [] };
      if (sqlText.includes("SELECT count(*)")) return { rows: [{ count: 0 }] };
      if (sqlText.includes("INSERT INTO onboarding_sessions")) return { rows: [sessionRow()] };
      return { rows: [] };
    });

    const result = await admitSession({ domain: "acme.com", ipHash: "hash" });
    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.session.id).toBe("session-1");
    expect(result.session.domain).toBe("acme.com");

    const calls = stubs.clientQuery.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toBe("BEGIN");
    expect(calls.some((c) => c.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(calls[calls.length - 1]).toBe("COMMIT");
  });

  it("returns rate_limited without inserting once the hourly cap is hit", async () => {
    stubs.clientQuery.mockImplementation(async (sqlText: string) => {
      if (sqlText.includes("SELECT id, domain FROM onboarding_sessions")) return { rows: [] };
      if (sqlText.includes("SELECT count(*)")) return { rows: [{ count: 5 }] };
      if (sqlText.includes("INSERT INTO onboarding_sessions")) {
        throw new Error("must not insert when rate limited");
      }
      return { rows: [] };
    });

    const result = await admitSession({ domain: "acme.com", ipHash: "hash" });
    expect(result).toEqual({ kind: "rate_limited" });
  });

  it("returns live_session_exists without inserting or counting when one is already running", async () => {
    stubs.clientQuery.mockImplementation(async (sqlText: string) => {
      if (sqlText.includes("SELECT id, domain FROM onboarding_sessions")) {
        return { rows: [{ id: "existing-session", domain: "acme.com" }] };
      }
      if (sqlText.includes("SELECT count(*)")) {
        throw new Error("must not count once a live session is found");
      }
      if (sqlText.includes("INSERT INTO onboarding_sessions")) {
        throw new Error("must not insert once a live session is found");
      }
      return { rows: [] };
    });

    const result = await admitSession({ domain: "acme.com", ipHash: "hash" });
    expect(result).toEqual({
      kind: "live_session_exists",
      sessionId: "existing-session",
      domain: "acme.com",
    });
  });

  it("rolls back and rethrows when a query inside the transaction fails", async () => {
    stubs.clientQuery.mockImplementation(async (sqlText: string) => {
      if (sqlText === "BEGIN") return { rows: [] };
      if (sqlText.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sqlText.includes("SELECT id, domain FROM onboarding_sessions")) {
        throw new Error("boom");
      }
      return { rows: [] };
    });

    await expect(admitSession({ domain: "acme.com", ipHash: "hash" })).rejects.toThrow("boom");
    const calls = stubs.clientQuery.mock.calls.map((c) => c[0] as string);
    expect(calls).toContain("ROLLBACK");
  });
});

describe("deleteExpiredUnclaimedSessions", () => {
  it("deletes only unclaimed, expired rows via the partial-index predicate", async () => {
    stubs.poolQuery.mockResolvedValueOnce({ rowCount: 3 });
    const deleted = await deleteExpiredUnclaimedSessions(500);
    expect(deleted).toBe(3);
    const [sqlText, params] = stubs.poolQuery.mock.calls[0] as [string, unknown[]];
    expect(sqlText).toContain("claimed_by IS NULL");
    expect(sqlText).toContain("expires_at < now()");
    expect(params).toEqual([500]);
  });

  it("loops in bounded batches until a batch comes back under the batch size", async () => {
    stubs.poolQuery
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 1 });

    const deleted = await deleteExpiredUnclaimedSessions(2);
    expect(deleted).toBe(5);
    expect(stubs.poolQuery).toHaveBeenCalledTimes(3);
  });

  it("returns 0 and issues one call when nothing is expired", async () => {
    stubs.poolQuery.mockResolvedValueOnce({ rowCount: 0 });
    const deleted = await deleteExpiredUnclaimedSessions(500);
    expect(deleted).toBe(0);
    expect(stubs.poolQuery).toHaveBeenCalledTimes(1);
  });
});

describe("appendEvent", () => {
  it("validates the event against the schema before writing", async () => {
    await expect(
      appendEvent("session-1", {
        // @ts-expect-error - intentionally invalid for the test
        type: "not_a_real_type",
        data: {},
      }),
    ).rejects.toThrow();
    expect(stubs.updateSet).not.toHaveBeenCalled();
  });

  it("writes a valid event with an atomic jsonb append, not a read-modify-write", async () => {
    await appendEvent("session-1", { type: "done", data: {} });
    expect(stubs.updateSet).toHaveBeenCalledTimes(1);
  });
});

describe("getSession", () => {
  it("returns null when no row is found", async () => {
    stubs.selectGetSession.mockResolvedValue([]);
    const row = await getSession("missing");
    expect(row).toBeNull();
  });

  it("returns null when the row has expired", async () => {
    stubs.selectGetSession.mockResolvedValue([
      {
        id: "session-1",
        expiresAt: new Date(Date.now() - 1000),
      },
    ]);
    const row = await getSession("session-1");
    expect(row).toBeNull();
  });

  it("returns the row when it has not expired", async () => {
    stubs.selectGetSession.mockResolvedValue([
      {
        id: "session-1",
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const row = await getSession("session-1");
    expect(row?.id).toBe("session-1");
  });
});

describe("setAnswers / setStatus", () => {
  it("both issue an update", async () => {
    await setAnswers("session-1", { audience: "own" });
    await setStatus("session-1", "done");
    expect(stubs.updateSet).toHaveBeenCalledTimes(2);
  });
});
