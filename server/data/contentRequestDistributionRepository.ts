import { eq } from "drizzle-orm";
import { distributions, type Distribution } from "@shared/schema";
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
  metadata: distributions.metadata,
  createdAt: distributions.createdAt,
};

export type ContentRequestDistribution = Pick<
  Distribution,
  keyof typeof contentRequestDistributionColumns
>;

export type ContentRequestDistributionRepository = {
  list(articleId: string): Promise<ContentRequestDistribution[]>;
  get(id: string): Promise<ContentRequestDistribution | undefined>;
};

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
  };
}
