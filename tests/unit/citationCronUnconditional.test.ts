// Foundations Plan 1 Task 11: citation scans must run weekly for
// every active brand, regardless of the legacy autoCitationSchedule /
// autoCitationActive flags. This test asserts that
// `selectBrandsForCitationScan` builds a query that filters ONLY on
// `deletedAt IS NULL` (no cadence gate in the WHERE clause).

import { describe, it, expect, vi, beforeEach } from "vitest";

// scheduler.ts transitively imports citationChecker → openai client,
// which throws at module load if OPENAI_API_KEY is unset. Stub it.
process.env.OPENAI_API_KEY ||= "test-key";
process.env.OPENROUTER_API_KEY ||= "test-key";
process.env.RESEND_API_KEY ||= "test-key";
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

// Capture every Drizzle builder call so we can introspect the WHERE.
const whereSpy = vi.fn();
const fromSpy = vi.fn().mockReturnValue({ where: whereSpy });
const selectSpy = vi.fn().mockReturnValue({ from: fromSpy });

vi.mock("../../server/db", () => ({
  db: { select: selectSpy },
  pool: {},
}));

// Replace drizzle-orm operators with tagged sentinels so we can
// introspect exactly which ones the scheduler used to build its
// WHERE clause — without dragging in drizzle's circular SQL graph.
const isNullCalls: unknown[] = [];
const andCalls: unknown[][] = [];
const neCalls: unknown[][] = [];
vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    isNull: (col: unknown) => {
      isNullCalls.push(col);
      return { __op: "isNull", col };
    },
    and: (...args: unknown[]) => {
      andCalls.push(args);
      return { __op: "and", args };
    },
    ne: (...args: unknown[]) => {
      neCalls.push(args);
      return { __op: "ne", args };
    },
  };
});

describe("citation scan scheduler — Foundations Plan 1 Task 11", () => {
  beforeEach(() => {
    whereSpy.mockReset();
    fromSpy.mockClear();
    selectSpy.mockClear();
    whereSpy.mockResolvedValue([]);
  });

  it("selectBrandsForCitationScan filters only on deletedAt IS NULL — no cadence gate", async () => {
    const { selectBrandsForCitationScan } = await import("../../server/scheduler");
    await selectBrandsForCitationScan();

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(fromSpy).toHaveBeenCalledTimes(1);
    expect(whereSpy).toHaveBeenCalledTimes(1);

    // The argument to .where() should be a single isNull(deletedAt)
    // SQL token — NOT an `and(...)` composite that includes any
    // autoCitationSchedule / autoCitationActive predicate. Drizzle's
    // `isNull` produces an SQL object with a single `column` field;
    // `and` produces a chunked SQL object with multiple `queryChunks`.
    // We assert the operator surface is the simple isNull shape and
    // that no autoCitation* column is the predicate's target.
    // The predicate must be a single isNull(deletedAt) — NOT wrapped
    // in `and(...)` and NOT involving `ne(autoCitationSchedule, ...)`.
    const whereArg = whereSpy.mock.calls[0][0] as { __op?: string; col?: { name?: string } };
    expect(whereArg.__op).toBe("isNull");
    expect(whereArg.col?.name).toBe("deleted_at");
    // No autoCitation cadence gating anywhere in the call graph.
    expect(neCalls).toHaveLength(0);
    expect(andCalls).toHaveLength(0);
    // isNull was called exactly once, and only for deleted_at.
    expect(isNullCalls).toHaveLength(1);
  });
});
