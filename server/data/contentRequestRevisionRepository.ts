import { desc, eq } from "drizzle-orm";
import { articleRevisions, type ArticleRevision } from "@shared/schema";
import type { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";
import { setRestrictedRequestContext } from "./restrictedRequestTransaction";

const contentRequestRevisionColumns = {
  id: articleRevisions.id,
  articleId: articleRevisions.articleId,
  content: articleRevisions.content,
  source: articleRevisions.source,
  createdBy: articleRevisions.createdBy,
  createdAt: articleRevisions.createdAt,
};

export type ContentRequestRevision = Pick<
  ArticleRevision,
  keyof typeof contentRequestRevisionColumns
>;

export type ContentRequestRevisionRepository = {
  list(articleId: string, limit?: number): Promise<ContentRequestRevision[]>;
  get(id: string): Promise<ContentRequestRevision | undefined>;
};

export function createContentRequestRevisionRepository({
  actor,
  database,
}: {
  actor: RequestActor;
  database: typeof db;
}): ContentRequestRevisionRepository {
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
    list(articleId: string, limit = 50): Promise<ContentRequestRevision[]> {
      return run((transaction) =>
        transaction
          .select(contentRequestRevisionColumns)
          .from(articleRevisions)
          .where(eq(articleRevisions.articleId, articleId))
          .orderBy(desc(articleRevisions.createdAt))
          .limit(limit),
      );
    },

    get(id: string): Promise<ContentRequestRevision | undefined> {
      return run(async (transaction) => {
        const [revision] = await transaction
          .select(contentRequestRevisionColumns)
          .from(articleRevisions)
          .where(eq(articleRevisions.id, id))
          .limit(1);
        return revision;
      });
    },
  };
}
