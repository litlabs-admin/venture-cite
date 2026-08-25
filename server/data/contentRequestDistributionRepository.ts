import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { distributions, type Distribution, type InsertDistribution } from "@shared/schema";
import type { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";
import { setRestrictedRequestContext } from "./restrictedRequestTransaction";

const contentRequestDistributionColumns = {
  id: distributions.id,
  articleId: distributions.articleId,
  platform: distributions.platform,
  status: distributions.status,
  distributedAt: distributions.distributedAt,
  platformPostId: distributions.platformPostId,
  platformUrl: distributions.platformUrl,
  metadata: distributions.metadata,
  error: distributions.error,
  createdAt: distributions.createdAt,
};

export type ContentRequestDistribution = Pick<
  Distribution,
  keyof typeof contentRequestDistributionColumns
>;

export type ContentRequestDistributionRepository = {
  list(articleId: string): Promise<ContentRequestDistribution[]>;
  get(id: string): Promise<ContentRequestDistribution | undefined>;
  create(input: ContentRequestDistributionCreate): Promise<ContentRequestDistribution>;
  createMany(input: ContentRequestDistributionCreate[]): Promise<ContentRequestDistribution[]>;
  update(
    id: string,
    patch: ContentRequestDistributionPatch,
  ): Promise<ContentRequestDistribution | undefined>;
};

export type ContentRequestDistributionCreate = Pick<
  InsertDistribution,
  "articleId" | "platform" | "status" | "metadata"
>;

export type ContentRequestDistributionPatch = Partial<
  Pick<InsertDistribution, "status" | "distributedAt" | "platformPostId" | "metadata" | "error">
>;

export function createContentRequestDistributionRepository({
  actor,
  database,
}: {
  actor: RequestActor;
  database: typeof db;
}): ContentRequestDistributionRepository {
  const run = <T>(
    operation: (transaction: RequestRepositoryTransaction) => Promise<T>,
  ): Promise<T> =>
    database.transaction(async (transaction) => {
      await setRestrictedRequestContext({
        actor,
        role: "venturecite_content_request",
        transaction,
      });
      return operation(transaction);
    });

  return {
    list(articleId: string): Promise<ContentRequestDistribution[]> {
      return run((transaction) =>
        transaction
          .select(contentRequestDistributionColumns)
          .from(distributions)
          .where(eq(distributions.articleId, articleId)),
      );
    },

    get(id: string): Promise<ContentRequestDistribution | undefined> {
      return run(async (transaction) => {
        const [distribution] = await transaction
          .select(contentRequestDistributionColumns)
          .from(distributions)
          .where(eq(distributions.id, id))
          .limit(1);
        return distribution;
      });
    },

    create(input: ContentRequestDistributionCreate): Promise<ContentRequestDistribution> {
      return run(async (transaction) => {
        const id = randomUUID();
        await transaction.execute(sql`
          INSERT INTO public.distributions (id, article_id, platform, status, metadata)
          VALUES (${id}, ${input.articleId}, ${input.platform}, ${input.status}, ${input.metadata ?? null})
        `);
        const [created] = await transaction
          .select(contentRequestDistributionColumns)
          .from(distributions)
          .where(eq(distributions.id, id))
          .limit(1);
        if (!created) throw new Error("Distribution insert returned no row");
        return created;
      });
    },

    createMany(input: ContentRequestDistributionCreate[]): Promise<ContentRequestDistribution[]> {
      if (input.length === 0) return Promise.resolve([]);
      return run(async (transaction) => {
        const rows = input.map((distribution) => ({ id: randomUUID(), ...distribution }));
        await transaction.execute(sql`
          INSERT INTO public.distributions (id, article_id, platform, status, metadata)
          VALUES ${sql.join(
            rows.map(
              (row) =>
                sql`(${row.id}, ${row.articleId}, ${row.platform}, ${row.status}, ${row.metadata ?? null})`,
            ),
            sql`, `,
          )}
        `);
        const created = await transaction
          .select(contentRequestDistributionColumns)
          .from(distributions)
          .where(
            inArray(
              distributions.id,
              rows.map(({ id }) => id),
            ),
          );
        if (created.length !== rows.length) {
          throw new Error("Distribution insert returned incomplete rows");
        }
        return created;
      });
    },

    update(
      id: string,
      patch: ContentRequestDistributionPatch,
    ): Promise<ContentRequestDistribution | undefined> {
      return run(async (transaction) => {
        const [updated] = await transaction
          .update(distributions)
          .set(patch)
          .where(eq(distributions.id, id))
          .returning(contentRequestDistributionColumns);
        return updated;
      });
    },
  };
}
