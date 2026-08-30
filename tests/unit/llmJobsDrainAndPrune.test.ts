// drainPendingLlmJobs and pruneExpiredLlmJobs (server/lib/llmJobs.ts) had no
// test exercising the real implementation anywhere in the suite
// (.audit/B6/B6b-02-mutation-concurrency.md, Target 4). The only hits for
// either name in tests/ were `vi.mock("../../server/lib/llmJobs", ...)`
// replacements in tests/unit/cronOrchestrator.test.ts, which that file's own
// header says explicitly does not exercise the underlying job bodies.
//
// That left three real bounds completely unverified:
//   - drainPendingLlmJobs' `batchSize` cap on how many rows one cron tick
//     reads (an unbounded read here would eventually pull the entire
//     running-jobs table into memory on a busy day).
//   - its per-tick `Date.now() >= deadlineMs - 500` bail-out (without it,
//     one slow OpenAI retrieve() call can push the whole orchestrator step
//     past its function-timeout budget).
//   - pruneExpiredLlmJobs' unconditional `expires_at < now()` delete (the
//     24h TTL the B6a-06 audit relied on to call this file safe from
//     unbounded growth).
//
// This file calls both functions for real, mocking only the true I/O
// boundary (server/db and the OpenAI SDK), the same boundary
// tests/unit/llmJobsOutbox.test.ts already uses for enqueueLlmJob.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const stubs = vi.hoisted(() => ({
  retrieve: vi.fn(),
  limit: vi.fn(),
  deleteWhere: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    responses = { retrieve: stubs.retrieve };
  },
}));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("../../server/outbox/contentCostOutboxDrain", () => ({
  runContentCostOutboxDrain: vi.fn(async () => ({ stopReason: "idle" })),
}));
vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: stubs.limit }),
        }),
      }),
    }),
    delete: () => ({ where: stubs.deleteWhere }),
    update: () => ({ set: () => ({ where: stubs.updateWhere }) }),
  },
}));

const { drainPendingLlmJobs, pruneExpiredLlmJobs } = await import("../../server/lib/llmJobs");

function runningJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "job-1",
    kind: "keyword_discovery",
    status: "running",
    responseId: "resp-1",
    payload: {},
    result: null,
    errorKind: null,
    errorMessage: null,
    userId: "user-1",
    brandId: "brand-1",
    createdAt: new Date("2026-08-20T00:00:00Z"),
    startedAt: new Date("2026-08-20T00:00:00Z"),
    completedAt: null,
    expiresAt: new Date("2026-08-21T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.updateWhere.mockResolvedValue(undefined);
});

describe("drainPendingLlmJobs against the real implementation", () => {
  it("passes batchSize through to the query's limit", async () => {
    stubs.limit.mockResolvedValue([]);

    await drainPendingLlmJobs(Date.now() + 60_000, 7);

    expect(stubs.limit).toHaveBeenCalledWith(7);
  });

  it("defaults batchSize to 20 when the caller does not pass one", async () => {
    stubs.limit.mockResolvedValue([]);

    await drainPendingLlmJobs(Date.now() + 60_000);

    expect(stubs.limit).toHaveBeenCalledWith(20);
  });

  it("attempts nothing when the deadline has already passed", async () => {
    // The per-tick check is `Date.now() >= deadlineMs - 500`, so a deadline
    // even slightly in the past must stop before the very first row.
    stubs.limit.mockResolvedValue([runningJob(), runningJob({ id: "job-2" })]);

    const counters = await drainPendingLlmJobs(Date.now() - 1, 20);

    expect(counters).toEqual({ attempted: 0, finalized: 0, stillRunning: 0, failed: 0 });
    expect(stubs.retrieve).not.toHaveBeenCalled();
  });

  it("classifies each row by its retrieved OpenAI status and counts a retrieve failure as still running", async () => {
    stubs.limit.mockResolvedValue([
      runningJob({ id: "no-response", responseId: null }),
      runningJob({ id: "still-queued", responseId: "resp-queued" }),
      runningJob({ id: "retrieve-throws", responseId: "resp-throws" }),
      runningJob({ id: "now-failed", responseId: "resp-failed" }),
    ]);
    stubs.retrieve.mockImplementation(async (responseId: string) => {
      if (responseId === "resp-queued") return { status: "queued" };
      if (responseId === "resp-throws") throw new Error("transient network error");
      if (responseId === "resp-failed") return { status: "failed", error: { message: "boom" } };
      throw new Error(`unexpected responseId ${responseId}`);
    });

    const counters = await drainPendingLlmJobs(Date.now() + 60_000, 20);

    // A row with no response_id yet is attempted but not (yet) classifiable.
    expect(counters).toEqual({ attempted: 4, finalized: 0, stillRunning: 2, failed: 1 });
    expect(stubs.retrieve).toHaveBeenCalledTimes(3);
  });
});

describe("pruneExpiredLlmJobs against the real implementation", () => {
  it("deletes rows whose expires_at has passed and returns the row count", async () => {
    stubs.deleteWhere.mockResolvedValue({ rowCount: 5 });

    await expect(pruneExpiredLlmJobs()).resolves.toBe(5);

    expect(stubs.deleteWhere).toHaveBeenCalledOnce();
    const condition = stubs.deleteWhere.mock.calls[0]?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(condition);
    // The unconditional bound the B6a-06 audit relied on: every prune
    // compares expires_at against the current time (not a fixed constant)
    // with a strict "<".
    expect(query.sql).toMatch(/expires_at/i);
    expect(query.sql).toContain("<");
    const comparedAt = new Date(query.params[0] as string);
    expect(Number.isNaN(comparedAt.getTime())).toBe(false);
    expect(Math.abs(comparedAt.getTime() - Date.now())).toBeLessThan(5_000);
  });

  it("returns 0 when the driver reports no rowCount", async () => {
    stubs.deleteWhere.mockResolvedValue({});

    await expect(pruneExpiredLlmJobs()).resolves.toBe(0);
  });
});
