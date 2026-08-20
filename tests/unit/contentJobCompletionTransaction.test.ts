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

const { DatabaseStorage } = await import("../../server/databaseStorage");

beforeEach(() => vi.clearAllMocks());

describe("content job completion transaction", () => {
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

    const complete = await new DatabaseStorage().completeContentJobSlice("job-1", "token-1", {
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

    const complete = await new DatabaseStorage().completeContentJobSlice("job-1", "old-token", {
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
      new DatabaseStorage().failContentJobSlice("job-1", "token-1", {
        errorKind: "timeout",
        errorMessage: "Provider timeout",
      }),
    ).resolves.toBe(true);

    expect(stubs.transaction).toHaveBeenCalledTimes(1);
    expect(stubs.update).toHaveBeenCalledTimes(2);
  });

  it("resets only the article that still points at the cancelled job", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ id: "article-1" }] });

    await expect(
      new DatabaseStorage().resetArticleForCancelledContentJob("job-cancelled"),
    ).resolves.toBe(true);

    const statement = sqlText(stubs.execute.mock.calls[0]?.[0]);
    expect(statement).toContain("WHERE job_id = $1");
    expect(statement).toContain("status = 'cancelled'");
  });

  it("renews the active token before a provider call", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ id: "job-1" }] });

    await expect(new DatabaseStorage().renewContentJobSliceLease("job-1", "token-1")).resolves.toBe(
      true,
    );

    const statement = sqlText(stubs.execute.mock.calls[0]?.[0]);
    expect(statement).toContain("advance_lease_expires_at = now()");
    expect(statement).toContain("advance_token = $");
  });

  it("releases only the lease that still has the active token", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ id: "job-1" }] });

    await expect(
      new DatabaseStorage().releaseContentJobSliceLease("job-1", "token-1"),
    ).resolves.toBe(true);

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
