import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("../../server/db", () => ({ db: {} }));

import { createContentRequestData } from "../../server/data/contentRequestData";
import { createRequestActor } from "../../server/lib/requestActor";

const USER_A_ID = "11111111-1111-4111-8111-111111111111";

type Rows = Record<string, unknown>[];

function createDatabase(rows: Rows) {
  const select = vi.fn();
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockResolvedValue(rows);
  Object.assign(chain, {
    then(resolve: (value: Rows) => unknown) {
      return Promise.resolve(rows).then(resolve);
    },
  });
  select.mockReturnValue(chain);
  const transaction = { select, execute };
  const database = {
    transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  };
  return { database, calls: { select, execute, chain } };
}

describe("content request actor facade", () => {
  it("opens a new restricted transaction for every durable facade method", async () => {
    const { database, calls } = createDatabase([]);
    const content = createContentRequestData(database as never).forActor(
      createRequestActor(USER_A_ID),
    );

    expect(content).not.toHaveProperty("execute");
    expect(content).not.toHaveProperty("transaction");
    expect(content).not.toHaveProperty("actor");
    await content.articles.get("article-a");
    await content.jobs.get("job-a");

    expect(database.transaction).toHaveBeenCalledTimes(2);
    const setupQueries = calls.execute.mock.calls.map(([statement]) =>
      new PgDialect().sqlToQuery(statement as SQL),
    );
    expect(setupQueries.filter((query) => query.sql.includes("set local role"))).toHaveLength(2);
    expect(setupQueries.flatMap((query) => query.params)).toContain(USER_A_ID);
  });

  it("uses route-ready read methods without provider or lease fields", async () => {
    const { database, calls } = createDatabase([]);
    const content = createContentRequestData(database as never).forActor(
      createRequestActor(USER_A_ID),
    );

    await content.articles.list({
      brandId: "brand-a",
      status: ["draft", "failed"],
      limit: 50,
      offset: 10,
    });
    await content.revisions.list("article-a", 25);
    await content.distributions.list("article-a");
    await content.distributions.get("distribution-a");
    await content.keywords.list("brand-a", { status: "discovered", category: "buy" });
    await content.keywords.listTopOpportunities("brand-a", 10);
    await content.keywords.get("keyword-a");
    await content.jobs.getActive();
    await content.jobs.getRecentCompleted(new Date("2026-08-19T00:00:00.000Z"));
    await content.jobs.get("job-a");

    const projections = calls.select.mock.calls.map(
      ([projection]) => projection as Record<string, unknown>,
    );
    const articleProjection = projections[0] ?? {};
    expect(articleProjection).toEqual(
      expect.objectContaining({
        status: expect.anything(),
        jobId: expect.anything(),
        aiGenerated: expect.anything(),
        viewCount: expect.anything(),
        citationCount: expect.anything(),
        humanScore: expect.anything(),
        passesAiDetection: expect.anything(),
      }),
    );
    const distributionProjection = projections[2] ?? {};
    expect(distributionProjection).toEqual(
      expect.objectContaining({
        status: expect.anything(),
        distributedAt: expect.anything(),
        platformPostId: expect.anything(),
        platformUrl: expect.anything(),
        error: expect.anything(),
      }),
    );
    const jobProjection = projections.at(-1) ?? {};
    expect(jobProjection).toEqual(
      expect.objectContaining({ errorKind: expect.anything(), requestPayload: expect.anything() }),
    );
    for (const projection of projections) {
      expect(projection).not.toHaveProperty("openaiResponseId");
      expect(projection).not.toHaveProperty("advanceToken");
      expect(projection).not.toHaveProperty("advanceLeaseExpiresAt");
      expect(projection).not.toHaveProperty("streamBuffer");
    }
    expect(calls.chain.orderBy).toHaveBeenCalled();
    expect(calls.chain.limit).toHaveBeenCalled();
  });
});
