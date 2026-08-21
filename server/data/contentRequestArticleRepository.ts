import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { articles, type Article, type InsertArticle } from "@shared/schema";
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

const articleInsertColumns = [
  ["brand_id", "brandId"],
  ["title", "title"],
  ["content", "content"],
  ["excerpt", "excerpt"],
  ["meta_description", "metaDescription"],
  ["keywords", "keywords"],
  ["industry", "industry"],
  ["content_type", "contentType"],
  ["featured_image", "featuredImage"],
  ["author", "author"],
  ["target_customers", "targetCustomers"],
  ["geography", "geography"],
  ["content_style", "contentStyle"],
  ["external_url", "externalUrl"],
  ["seo_data", "seoData"],
] as const satisfies ReadonlyArray<readonly [string, keyof ContentRequestArticleFields]>;

const articleInsertDefaults: Partial<Record<keyof ContentRequestArticleFields, unknown>> = {
  title: "",
  content: "",
  author: "GEO Platform",
  contentStyle: "b2c",
};

async function insertArticle(
  transaction: RequestRepositoryTransaction,
  input: ContentRequestArticleFields,
  status: "draft" | "ready",
): Promise<ContentRequestArticle> {
  const values: Array<{ column: string; value: unknown }> = articleInsertColumns
    .map(([column, property]) => ({
      column,
      value: input[property] === undefined ? articleInsertDefaults[property] : input[property],
    }))
    .filter((entry) => entry.value !== undefined);
  values.push({ column: "status", value: status });
  const inserted = await transaction.execute<{ id: string }>(sql`
    insert into ${sql.identifier("public")}.${sql.identifier("articles")}
    (${sql.join(
      values.map((entry) => sql.identifier(entry.column)),
      sql`, `,
    )})
    values (${sql.join(
      // Bind every value as a parameter. Direct interpolation expands arrays
      // into SQL tuples instead of PostgreSQL array parameters.
      values.map((entry) => sql.param(entry.value)),
      sql`, `,
    )})
    returning ${articles.id}
  `);
  const createdId = inserted.rows[0]?.id;
  if (!createdId) throw new Error("Article insert returned no ID");
  const [created] = await transaction
    .select(contentRequestArticleColumns)
    .from(articles)
    .where(eq(articles.id, createdId))
    .limit(1);
  if (!created) throw new Error("Article insert returned no row");
  return created;
}

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
      return run((transaction) => insertArticle(transaction, input, "ready"));
    },

    createDraft(input: ContentRequestArticleCreateDraft): Promise<ContentRequestArticle> {
      return run((transaction) => insertArticle(transaction, input, "draft"));
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
