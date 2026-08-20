import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  articleRevisions,
  articles,
  type ArticleRevision,
  type InsertArticleRevision,
} from "@shared/schema";
import type { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";
import { setRestrictedRequestContext } from "./restrictedRequestTransaction";
import {
  contentRequestArticleColumns,
  type ContentRequestArticle,
} from "./contentRequestArticleRepository";

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
  create(input: ContentRequestRevisionCreate): Promise<ContentRequestRevision>;
  restore(
    articleId: string,
    revisionId: string,
    expectedVersion?: number,
  ): Promise<ContentRequestRestoreResult>;
};

export type ContentRequestRevisionCreate = Pick<
  InsertArticleRevision,
  "articleId" | "content" | "source"
>;

export type ContentRequestRestoreResult =
  | { kind: "not_found" }
  | { kind: "conflict"; current: ContentRequestArticle }
  | { kind: "invalid_content" }
  | { kind: "restored"; article: ContentRequestArticle; revision: ContentRequestRevision };

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

    create(input: ContentRequestRevisionCreate): Promise<ContentRequestRevision> {
      return run(async (transaction) => {
        const id = randomUUID();
        await transaction.execute(sql`
          insert into public.article_revisions (id, article_id, content, source, created_by)
          values (${id}, ${input.articleId}, ${input.content}, ${input.source}, ${actor.userId})
        `);
        const [created] = await transaction
          .select(contentRequestRevisionColumns)
          .from(articleRevisions)
          .where(eq(articleRevisions.id, id));
        if (!created) throw new Error("Revision insert returned no row");
        return created;
      });
    },

    restore(
      articleId: string,
      revisionId: string,
      expectedVersion?: number,
    ): Promise<ContentRequestRestoreResult> {
      return run(async (transaction) => {
        const [article] = await transaction
          .select(contentRequestArticleColumns)
          .from(articles)
          .where(eq(articles.id, articleId))
          .limit(1);
        if (!article) return { kind: "not_found" };

        const [revision] = await transaction
          .select(contentRequestRevisionColumns)
          .from(articleRevisions)
          .where(
            and(eq(articleRevisions.id, revisionId), eq(articleRevisions.articleId, articleId)),
          )
          .limit(1);
        if (!revision) return { kind: "not_found" };
        if (revision.content.trim().length === 0) return { kind: "invalid_content" };

        if (expectedVersion !== undefined && article.version !== expectedVersion) {
          return { kind: "conflict", current: article };
        }

        const versionCondition =
          expectedVersion === undefined
            ? eq(articles.id, articleId)
            : and(eq(articles.id, articleId), eq(articles.version, expectedVersion));
        const [updated] = await transaction
          .update(articles)
          .set({
            content: revision.content,
            updatedAt: new Date(),
            version: sql`${articles.version} + 1`,
          })
          .where(versionCondition)
          .returning(contentRequestArticleColumns);
        if (!updated) {
          const [current] = await transaction
            .select(contentRequestArticleColumns)
            .from(articles)
            .where(eq(articles.id, articleId))
            .limit(1);
          return current ? { kind: "conflict", current } : { kind: "not_found" };
        }

        const restoreRevisionId = randomUUID();
        await transaction.execute(sql`
          insert into public.article_revisions (id, article_id, content, source, created_by)
          values (${restoreRevisionId}, ${articleId}, ${revision.content}, 'manual_edit', ${actor.userId})
        `);
        const [restoreRevision] = await transaction
          .select(contentRequestRevisionColumns)
          .from(articleRevisions)
          .where(eq(articleRevisions.id, restoreRevisionId));
        if (!restoreRevision) throw new Error("Restore revision insert returned no row");
        return { kind: "restored", article: updated, revision: restoreRevision };
      });
    },
  };
}
