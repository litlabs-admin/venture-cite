import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { brands } from "./brands";
import { users } from "./identity";

// Articles are the single source of truth for user-authored content.
// The old `content_drafts` table is now part of
// this one - see migration 0033. Lifecycle: draft → generating → ready
// (or failed). Drafts have no content yet; generating jobs are linked via
// `jobId`; ready articles have content + at least one row in
// `article_revisions`.
export const articles = pgTable(
  "articles",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    // title/content are nullable so a draft article can exist before either
    // is filled in. The worker writes both on transition to 'ready'.
    title: text("title"),
    content: text("content"),
    excerpt: text("excerpt"),
    metaDescription: text("meta_description"),
    keywords: text("keywords").array(),
    industry: text("industry"),
    contentType: text("content_type"),
    featuredImage: text("featured_image"),
    author: text("author").default("GEO Platform"),
    viewCount: integer("view_count").default(0).notNull(),
    citationCount: integer("citation_count").default(0).notNull(),
    // Optimistic-lock version. See brands.version.
    version: integer("version").default(0).notNull(),
    // Lifecycle and form-state fields moved from content_drafts.
    status: text("status").default("ready").notNull(), // 'draft'|'generating'|'ready'|'failed'
    jobId: varchar("job_id"), // soft FK → content_generation_jobs.id, set while generating
    targetCustomers: text("target_customers"),
    geography: text("geography"),
    contentStyle: text("content_style").default("b2c"),
    // Where this article actually lives on the user's own site (their CMS
    // or blog URL). Replaces the old slug-based fake URL.
    externalUrl: text("external_url"),
    // Legacy AI-detection score columns. Preserved through the rebuild so
    // existing data isn't lost; UI no longer reads them. Dropped in a later
    // cleanup migration.
    humanScore: integer("human_score"),
    passesAiDetection: integer("passes_ai_detection"),
    // True when the article body was produced by
    // the content-generation worker. Manually-created articles (POST
    // /api/articles) stay false. Powers the "AI-generated" disclosure pill.
    aiGenerated: boolean("ai_generated").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    seoData: jsonb("seo_data"),
  },
  (table) => [
    index("articles_brand_id_idx").on(table.brandId),
    index("articles_status_idx").on(table.status),
    index("articles_job_id_idx").on(table.jobId),
  ],
);

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  citationCount: true,
});
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articles.$inferSelect;

// Per-revision history for Auto-Improve and manual edits. Each row is an
// immutable snapshot of `articles.content` at the moment the revision was
// created. The diff viewer renders newest-vs-current; restore copies an old
// revision's content back onto the article and logs a `manual_edit` row to
// record the restore point.
export const articleRevisions = pgTable(
  "article_revisions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    articleId: varchar("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // 'generated' | 'manual_edit' | 'auto_improve' | 'distribute_back'
    source: text("source").notNull(),
    createdBy: varchar("created_by"), // userId, or 'system' for worker writes
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("article_revisions_article_idx").on(table.articleId, table.createdAt)],
);

export type ArticleRevision = typeof articleRevisions.$inferSelect;
export type InsertArticleRevision = typeof articleRevisions.$inferInsert;

export const distributions = pgTable(
  "distributions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    articleId: varchar("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    platformPostId: text("platform_post_id"),
    platformUrl: text("platform_url"),
    status: text("status").notNull().default("pending"),
    distributedAt: timestamp("distributed_at"),
    error: text("error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("distributions_article_id_idx").on(table.articleId)],
);

export const insertDistributionSchema = createInsertSchema(distributions).omit({
  id: true,
  createdAt: true,
});
export type InsertDistribution = z.infer<typeof insertDistributionSchema>;
export type Distribution = typeof distributions.$inferSelect;

export const keywordResearch = pgTable(
  "keyword_research",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    searchVolume: integer("search_volume"),
    difficulty: integer("difficulty"),
    opportunityScore: integer("opportunity_score").default(50).notNull(),
    aiCitationPotential: integer("ai_citation_potential").default(50).notNull(),
    intent: text("intent").default("informational"),
    category: text("category"),
    competitorGap: integer("competitor_gap").default(0).notNull(),
    suggestedContentType: text("suggested_content_type").default("article"),
    relatedKeywords: text("related_keywords").array(),
    status: text("status").default("discovered").notNull(),
    provenance: text("provenance").default("ai-estimate").notNull(),
    contentGenerated: integer("content_generated").default(0).notNull(),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("keyword_research_brand_id_idx").on(table.brandId),
    index("keyword_research_article_id_idx").on(table.articleId),
  ],
);

export const insertKeywordResearchSchema = createInsertSchema(keywordResearch).omit({
  id: true,
  discoveredAt: true,
  updatedAt: true,
});
export type KeywordResearch = typeof keywordResearch.$inferSelect;
export type InsertKeywordResearch = z.infer<typeof insertKeywordResearchSchema>;

// Background job queue for content generation so long-running GPT calls
// survive page navigation, logout, and browser refresh. Polled in-process
// by server/contentGenerationWorker.ts - no Redis/BullMQ dependency.
export const contentGenerationJobs = pgTable(
  "content_generation_jobs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    // 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    status: text("status").notNull().default("pending"),
    requestPayload: jsonb("request_payload").notNull(),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    errorMessage: text("error_message"),
    // Refund and legacy streaming support.
    // streamBuffer was the token accumulation column for the prior
    // Chat-Completions streaming worker. The slice worker
    // replaced that with the OpenAI Responses API in background mode,
    // which doesn't write here. The column is preserved so the slice
    // runner can detect "legacy in-flight" jobs (streamBuffer populated,
    // openaiResponseId NULL) and fail them cleanly so users retry.
    // errorKind classifies failures so refundArticleQuota knows whether
    // to refund (transient infra) or not (user error / budget).
    // refundedAt is set once the refund is applied (idempotent).
    streamBuffer: text("stream_buffer").default(""),
    errorKind: text("error_kind"), // 'budget'|'circuit'|'openai_5xx'|'openai_429'|'timeout'|'invalid_input'|'unknown'
    refundedAt: timestamp("refunded_at"),
    // The usage period that received this reservation. Refunds must match
    // this value so an old job cannot reduce a newer period's quota.
    quotaReservationPeriod: timestamp("quota_reservation_period"),
    // Vercel migration: per-call slice lock. /advance updates this when
    // it claims the job for an 8s slice; concurrent advance calls bail.
    lastAdvanceStartedAt: timestamp("last_advance_started_at"),
    advanceToken: text("advance_token"),
    advanceLeaseExpiresAt: timestamp("advance_lease_expires_at", { withTimezone: true }),
    // Vercel migration: ID of the OpenAI Responses run executing this
    // job. Set by the first /advance call; subsequent calls poll
    // openai.responses.retrieve(openaiResponseId). Null on legacy jobs
    // and on jobs not yet started.
    openaiResponseId: text("openai_response_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("content_gen_jobs_user_status_idx").on(table.userId, table.status),
    index("content_gen_jobs_status_idx").on(table.status),
    index("content_gen_jobs_brand_id_idx").on(table.brandId),
    index("content_gen_jobs_article_id_idx").on(table.articleId),
  ],
);

export const insertContentGenerationJobSchema = createInsertSchema(contentGenerationJobs).omit({
  id: true,
  createdAt: true,
});
export type ContentGenerationJob = typeof contentGenerationJobs.$inferSelect;
export type InsertContentGenerationJob = z.infer<typeof insertContentGenerationJobSchema>;
