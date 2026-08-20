import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { contentGenerationJobs, type ContentGenerationJob } from "@shared/schema";
import type { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";
import { setRestrictedRequestContext } from "./restrictedRequestTransaction";

const contentRequestJobColumns = {
  id: contentGenerationJobs.id,
  brandId: contentGenerationJobs.brandId,
  status: contentGenerationJobs.status,
  requestPayload: contentGenerationJobs.requestPayload,
  articleId: contentGenerationJobs.articleId,
  errorMessage: contentGenerationJobs.errorMessage,
  errorKind: contentGenerationJobs.errorKind,
  createdAt: contentGenerationJobs.createdAt,
  startedAt: contentGenerationJobs.startedAt,
  completedAt: contentGenerationJobs.completedAt,
};

export type ContentRequestJob = Pick<ContentGenerationJob, keyof typeof contentRequestJobColumns>;

export type ContentRequestJobRepository = {
  get(id: string): Promise<ContentRequestJob | undefined>;
  getActive(): Promise<ContentRequestJob | undefined>;
  getRecentCompleted(since: Date): Promise<ContentRequestJob | undefined>;
};

export function createContentRequestJobRepository({
  actor,
  database,
}: {
  actor: RequestActor;
  database: typeof db;
}): ContentRequestJobRepository {
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
    get(id: string): Promise<ContentRequestJob | undefined> {
      return run(async (transaction) => {
        const [job] = await transaction
          .select(contentRequestJobColumns)
          .from(contentGenerationJobs)
          .where(eq(contentGenerationJobs.id, id))
          .limit(1);
        return job;
      });
    },

    getActive(): Promise<ContentRequestJob | undefined> {
      return run(async (transaction) => {
        const [job] = await transaction
          .select(contentRequestJobColumns)
          .from(contentGenerationJobs)
          .where(inArray(contentGenerationJobs.status, ["pending", "running"]))
          .orderBy(desc(contentGenerationJobs.createdAt))
          .limit(1);
        return job;
      });
    },

    getRecentCompleted(since: Date): Promise<ContentRequestJob | undefined> {
      return run(async (transaction) => {
        const [job] = await transaction
          .select(contentRequestJobColumns)
          .from(contentGenerationJobs)
          .where(
            and(
              eq(contentGenerationJobs.status, "succeeded"),
              gte(contentGenerationJobs.completedAt, since),
            ),
          )
          .orderBy(desc(contentGenerationJobs.completedAt))
          .limit(1);
        return job;
      });
    },
  };
}
