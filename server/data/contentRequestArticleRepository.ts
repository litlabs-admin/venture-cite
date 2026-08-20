import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  articles,
  type Article,
  type InsertArticle,
  type InsertArticleRevision,
} from "@shared/schema";
import type { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";
import { setRestrictedRequestContext } from "./restrictedRequestTransaction";

export const contentRequestArticleColumns = {
  id: articles.id,
  brandId: articles.brandId,
  title: articles.title,
  content: articles.content,
  excerpt: articles.excerpt,
  metaDescription: articles.metaDescription,
  keywords: articles.keywords,
  industry: articles.industry,
  contentType: articles.contentType,
  featuredImage: articles.featuredImage,
  author: articles.author,
  viewCount: articles.viewCount,
  version: articles.version,
  status: articles.status,
  jobId: articles.jobId,
  targetCustomers: articles.targetCustomers,
  geography: articles.geography,
  contentStyle: articles.contentStyle,
  externalUrl: articles.externalUrl,
  aiGenerated: articles.aiGenerated,
  createdAt: articles.createdAt,
  updatedAt: articles.updatedAt,
  seoData: articles.seoData,
  citationCount: articles.citationCount,
  humanScore: articles.humanScore,
  passesAiDetection: articles.passesAiDetection,
};

export type ContentRequestArticle = Pick<Article, keyof typeof contentRequestArticleColumns>;

export type ContentRequestArticleRepository = {
  list(options?: {
    status?: string | string[];
    brandId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ContentRequestArticle[]>;
  get(id: string): Promise<ContentRequestArticle | undefined>;
  createReady(input: ContentRequestArticleCreateReady): Promise<ContentRequestArticle>;
  createDraft(input: ContentRequestArticleCreateDraft): Promise<ContentRequestArticle>;
  update(id: string, patch: ContentRequestArticlePatch): Promise<ContentRequestArticle | undefined>;
  updateIfVersion(
    id: string,
    expectedVersion: number,
    patch: ContentRequestArticlePatch,
  ): Promise<ContentRequestArticle | undefined>;
  delete(id: string): Promise<boolean>;
};

export type ContentRequestArticleFields = Pick<
  InsertArticle,
  | "brandId"
  | "title"
  | "content"
  | "excerpt"
  | "metaDescription"
  | "keywords"
  | "industry"
  | "contentType"
  | "featuredImage"
  | "author"
  | "targetCustomers"
  | "geography"
  | "contentStyle"
  | "externalUrl"
  | "seoData"
>;

export type ContentRequestArticleCreateReady = ContentRequestArticleFields &
  Required<Pick<ContentRequestArticleFields, "brandId" | "title" | "content">>;
export type ContentRequestArticleCreateDraft = ContentRequestArticleFields &
  Required<Pick<ContentRequestArticleFields, "brandId">>;
export type ContentRequestArticlePatch = Partial<ContentRequestArticleFields>;

const articleInsertValues = (input: ContentRequestArticleFields, status: "draft" | "ready") => ({
  ...input,
  status,
});

export function createContentRequestArticleRepository({
  actor,
  database,
}: {
  actor: RequestActor;
  database: typeof db;
}): ContentRequestArticleRepository {
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
    list(options = {}): Promise<ContentRequestArticle[]> {
      return run((transaction) => {
        const conditions = [];
        if (options.brandId) conditions.push(eq(articles.brandId, options.brandId));
        if (typeof options.status === "string") {
          conditions.push(eq(articles.status, options.status));
        } else if (options.status && options.status.length > 0) {
          conditions.push(inArray(articles.status, options.status));
        }
        return transaction
          .select(contentRequestArticleColumns)
          .from(articles)
          .where(and(...conditions))
          .orderBy(desc(articles.createdAt))
          .limit(options.limit ?? 100)
          .offset(options.offset ?? 0);
      });
    },

    get(id: string): Promise<ContentRequestArticle | undefined> {
      return run(async (transaction) => {
        const [article] = await transaction
          .select(contentRequestArticleColumns)
          .from(articles)
          .where(eq(articles.id, id))
          .limit(1);
        return article;
      });
    },

    createReady(input: ContentRequestArticleCreateReady): Promise<ContentRequestArticle> {
      return run(async (transaction) => {
        const [created] = await transaction
          .insert(articles)
          .values(articleInsertValues(input, "ready"))
          .returning(contentRequestArticleColumns);
        if (!created) throw new Error("Article insert returned no row");
        return created;
      });
    },

    createDraft(input: ContentRequestArticleCreateDraft): Promise<ContentRequestArticle> {
      return run(async (transaction) => {
        const [created] = await transaction
          .insert(articles)
          .values(articleInsertValues(input, "draft"))
          .returning(contentRequestArticleColumns);
        if (!created) throw new Error("Draft insert returned no row");
        return created;
      });
    },

    update(
      id: string,
      patch: ContentRequestArticlePatch,
    ): Promise<ContentRequestArticle | undefined> {
      return run(async (transaction) => {
        const [updated] = await transaction
          .update(articles)
          .set({
            ...patch,
            updatedAt: new Date(),
            version: sql`${articles.version} + 1`,
          })
          .where(eq(articles.id, id))
          .returning(contentRequestArticleColumns);
        return updated;
      });
    },

    updateIfVersion(
      id: string,
      expectedVersion: number,
      patch: ContentRequestArticlePatch,
    ): Promise<ContentRequestArticle | undefined> {
      return run(async (transaction) => {
        const [updated] = await transaction
          .update(articles)
          .set({
            ...patch,
            updatedAt: new Date(),
            version: sql`${articles.version} + 1`,
          })
          .where(and(eq(articles.id, id), eq(articles.version, expectedVersion)))
          .returning(contentRequestArticleColumns);
        return updated;
      });
    },

    delete(id: string): Promise<boolean> {
      return run(async (transaction) => {
        const deleted = await transaction
          .delete(articles)
          .where(eq(articles.id, id))
          .returning({ id: articles.id });
        return deleted.length > 0;
      });
    },
  };
}
