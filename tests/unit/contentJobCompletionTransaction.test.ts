import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const stubs = vi.hoisted(() => ({
  transaction: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: stubs,
  pool: {},
}));

const { storage } = await import("../../server/storage");

beforeEach(() => vi.clearAllMocks());

describe("content job completion transaction", () => {
  it("enqueues one content-cost command in the completion transaction", async () => {
    const jobReturning = vi.fn(async () => [
      { articleId: "article-1", userId: "user-1", brandId: "brand-1" },
    ]);
    const articleReturning = vi.fn(async () => [{ id: "article-1" }]);
    const articleWhere = vi.fn(() => ({ returning: articleReturning }));
    const articleSet = vi.fn(() => ({ where: articleWhere }));
    const tx = {
      execute: stubs.execute.mockImplementation(async (statement: unknown) => {
        const query = sqlQuery(statement);
        if (query.sql.includes("select id from private.enqueue_outbox_command")) {
          return { rows: [{ id: "command-1" }] };
        }
        if (query.sql.includes("select private.get_outbox_command")) {
          return {
            rows: [
              {
                command: {
                  id: "command-1",
                  status: "pending",
                  idempotency_key: "content-cost:job-1:response-1",
                  aggregate_type: "content_generation_job",
                  aggregate_id: "job-1",
                  user_id: "user-1",
                  brand_id: "brand-1",
                  payload: {
                    kind: "content_cost.record",
                    contentJobId: "job-1",
                    providerResponseId: "response-1",
                    service: "openai",
                    model: "gpt-test",
                    tokensIn: 10,
                    tokensOut: 20,
                  },
                  attempt_count: 0,
                  max_attempts: 25,
                  available_at: new Date("2026-08-20T00:00:00Z"),
                  lease_token: null,
                  lease_expires_at: null,
                  provider_name: "internal",
                  provider_operation: "record_content_cost",
                  created_at: new Date("2026-08-20T00:00:00Z"),
                },
              },
            ],
          };
        }
        return { rows: [] };
      }),
      update: stubs.update
        .mockReturnValueOnce({ set: () => ({ where: () => ({ returning: jobReturning }) }) })
        .mockReturnValueOnce({ set: articleSet }),
      insert: stubs.insert.mockReturnValue({ values: vi.fn(async () => undefined) }),
    };
    stubs.transaction.mockImplementation(async (work: (inner: typeof tx) => Promise<boolean>) =>
      work(tx),
    );

    await expect(
      storage.completeContentJobSlice(
        "job-1",
        "token-1",
        { content: "# Article", title: "Article" },
        {
          providerResponseId: "response-1",
          service: "openai",
          model: "gpt-test",
          tokensIn: 10,
          tokensOut: 20,
        },
      ),
    ).resolves.toBe(true);

    const enqueueStatements = stubs.execute.mock.calls
      .map((call) => sqlQuery(call[0]))
      .filter((query) => query.sql.includes("select id from private.enqueue_outbox_command"));
    expect(enqueueStatements).toHaveLength(1);
    expect(enqueueStatements[0]?.params).toContain("content-cost:job-1:response-1");
    expect(enqueueStatements[0]?.params[6]).toEqual({
      kind: "content_cost.record",
      contentJobId: "job-1",
      providerResponseId: "response-1",
      service: "openai",
      model: "gpt-test",
      tokensIn: 10,
      tokensOut: 20,
    });
    expect(enqueueStatements[0]?.params[8]).toBe(25);
  });

  it("commits the job, article, and revision through one transaction", async () => {
    const jobReturning = vi.fn(async () => [{ articleId: "article-1" }]);
    const articleReturning = vi.fn(async () => [{ id: "article-1" }]);
    const articleWhere = vi.fn(() => ({ returning: articleReturning }));
    const articleSet = vi.fn(() => ({ where: articleWhere }));
    const tx = {
      update: stubs.update
        .mockReturnValueOnce({ set: () => ({ where: () => ({ returning: jobReturning }) }) })
        .mockReturnValueOnce({ set: articleSet }),
      insert: stubs.insert.mockReturnValue({ values: vi.fn(async () => undefined) }),
    };
    stubs.transaction.mockImplementation(async (work: (inner: typeof tx) => Promise<boolean>) =>
      work(tx),
    );

    const complete = await storage.completeContentJobSliceLegacy("job-1", "token-1", {
      content: "# Article",
      title: "Article",
    });

    expect(complete).toBe(true);
    expect(stubs.transaction).toHaveBeenCalledTimes(1);
    expect(stubs.update).toHaveBeenCalledTimes(2);
    expect(stubs.insert).toHaveBeenCalledTimes(1);
    expect(articleSet).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: null, version: expect.anything() }),
    );
    const articleQuery = sqlQuery(articleWhere.mock.calls[0]?.[0]);
    expect(articleQuery.sql).toContain('"articles"."job_id" = $2');
    expect(articleQuery.params).toEqual(["article-1", "job-1"]);
  });

  it("does not write an article or revision when the token no longer owns the job", async () => {
    const jobReturning = vi.fn(async () => []);
    const tx = {
      update: stubs.update.mockReturnValue({
        set: () => ({ where: () => ({ returning: jobReturning }) }),
      }),
      insert: stubs.insert,
    };
    stubs.transaction.mockImplementation(async (work: (inner: typeof tx) => Promise<boolean>) =>
      work(tx),
    );

    const complete = await storage.completeContentJobSliceLegacy("job-1", "old-token", {
      content: "# Article",
      title: "Article",
    });

    expect(complete).toBe(false);
    expect(stubs.update).toHaveBeenCalledTimes(1);
    expect(stubs.insert).not.toHaveBeenCalled();
  });

  it("marks the job and its current article failed in one transaction", async () => {
    const jobReturning = vi.fn(async () => [{ articleId: "article-1" }]);
    const articleReturning = vi.fn(async () => [{ id: "article-1" }]);
    const tx = {
      update: stubs.update
        .mockReturnValueOnce({ set: () => ({ where: () => ({ returning: jobReturning }) }) })
        .mockReturnValueOnce({ set: () => ({ where: () => ({ returning: articleReturning }) }) }),
    };
    stubs.transaction.mockImplementation(async (work: (inner: typeof tx) => Promise<boolean>) =>
      work(tx),
    );

    await expect(
      storage.failContentJobSlice("job-1", "token-1", {
        errorKind: "timeout",
        errorMessage: "Provider timeout",
      }),
    ).resolves.toBe(true);

    expect(stubs.transaction).toHaveBeenCalledTimes(1);
    expect(stubs.update).toHaveBeenCalledTimes(2);
  });

  it("resets only the article that still points at the cancelled job", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ id: "article-1" }] });

    await expect(storage.resetArticleForCancelledContentJob("job-cancelled")).resolves.toBe(true);

    const statement = sqlText(stubs.execute.mock.calls[0]?.[0]);
    expect(statement).toContain("WHERE job_id = $1");
    expect(statement).toContain("status = 'cancelled'");
  });

  it("renews the active token before a provider call", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ id: "job-1" }] });

    await expect(storage.renewContentJobSliceLease("job-1", "token-1")).resolves.toBe(true);

    const statement = sqlText(stubs.execute.mock.calls[0]?.[0]);
    expect(statement).toContain("advance_lease_expires_at = now()");
    expect(statement).toContain("advance_token = $");
  });

  it("releases only the lease that still has the active token", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ id: "job-1" }] });

    await expect(storage.releaseContentJobSliceLease("job-1", "token-1")).resolves.toBe(true);

    const statement = sqlText(stubs.execute.mock.calls[0]?.[0]);
    expect(statement).toContain("advance_token = NULL");
    expect(statement).toContain("advance_lease_expires_at = NULL");
    expect(statement).toContain("advance_token = $");
    expect(statement).toContain("status = 'running'");
  });
});

function sqlText(statement: unknown): string {
  return sqlQuery(statement).sql;
}

function sqlQuery(statement: unknown): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(statement as SQL);
  return { sql: query.sql.replace(/\s+/g, " ").trim(), params: query.params };
}
