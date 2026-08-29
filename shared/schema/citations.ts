import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { brands } from "./brands";
import { articles } from "./content";
import { users } from "./identity";
import { brandPrompts } from "./prompts";

export const citations = pgTable(
  "citations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
    source: text("source"),
    url: text("url"),
    platform: text("platform"),
    keywords: text("keywords").array(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("citations_user_id_idx").on(table.userId)],
);

export const insertCitationSchema = createInsertSchema(citations).omit({
  id: true,
  timestamp: true,
});

export type InsertCitation = z.infer<typeof insertCitationSchema>;
export type Citation = typeof citations.$inferSelect;

// Per-brand AI Visibility Checklist progress. One row per completed step so
// toggling is a simple insert/delete instead of a JSON read-modify-write.
export const visibilityProgress = pgTable(
  "visibility_progress",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    engineId: text("engine_id").notNull(),
    stepId: text("step_id").notNull(),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [
    index("visibility_progress_brand_id_idx").on(table.brandId),
    uniqueIndex("visibility_progress_brand_engine_step_idx").on(
      table.brandId,
      table.engineId,
      table.stepId,
    ),
  ],
);

export const insertVisibilityProgressSchema = createInsertSchema(visibilityProgress).omit({
  id: true,
  completedAt: true,
});
export type VisibilityProgress = typeof visibilityProgress.$inferSelect;
export type InsertVisibilityProgress = z.infer<typeof insertVisibilityProgressSchema>;

// One row per "Analyze GEO Signals" run. Powers `lastSignalsScanAt`
// input on the recommendations engine so rule #8 stops firing on
// brands that have actually scanned.
export const geoSignalRuns = pgTable(
  "geo_signal_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: varchar("article_id").references(() => articles.id, {
      onDelete: "set null",
    }),
    ranAt: timestamp("ran_at").defaultNow().notNull(),
    overallScore: integer("overall_score"),
    // 2026-05-28: payload jsonb column dropped (migration 0080) - it
    // was write-only, up to 32 KB per row, never read by any consumer.
    // overallScore + ranAt cover everything the Pulse engine and
    // Inspector actually need.
  },
  (table) => [index("geo_signal_runs_brand_id_ran_at_idx").on(table.brandId, table.ranAt.desc())],
);

export const insertGeoSignalRunSchema = createInsertSchema(geoSignalRuns).omit({
  id: true,
  ranAt: true,
});
export type GeoSignalRun = typeof geoSignalRuns.$inferSelect;
export type InsertGeoSignalRun = z.infer<typeof insertGeoSignalRunSchema>;

// One row per "Run Citation Check" click or weekly cron run. Stores the
// aggregate totals so the trend chart can render without re-aggregating
// every geo_rankings row.
export const citationRuns = pgTable(
  "citation_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    totalChecks: integer("total_checks").default(0).notNull(),
    totalCited: integer("total_cited").default(0).notNull(),
    citationRate: integer("citation_rate").default(0).notNull(),
    triggeredBy: text("triggered_by").notNull().default("manual"), // manual | cron
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    // Stamped at row creation and again every time a slice actually
    // advances the run (server/storage/citationsStorage.ts,
    // bumpCitationRunProgress) - not only at slice start/end. Staleness
    // reaping (server/lib/citationReconciliation.ts,
    // server/citationChecker.ts) compares against this, not startedAt:
    // startedAt measures total run age, and a slice-based run legitimately
    // stays 'running' far longer than any reasonable "definitely dead"
    // window. NULL on a row created before migration 0123 - both reap
    // sites fall back to startedAt in that case. See
    // .audit/B6/B6a-12-citation-run-staleness.md.
    lastAdvanceStartedAt: timestamp("last_advance_started_at"),
    // Per-platform breakdown snapshot so the history endpoint doesn't
    // need to re-join geo_rankings for every run.
    platformBreakdown: jsonb("platform_breakdown"),
    // Explicit lifecycle. It drives the "is any run active for this
    // brand" status gate that the live-update hooks read on every page.
    // 'pending'|'running'|'succeeded'|'failed'|'partial'|'cancelled'.
    status: text("status").default("succeeded").notNull(),
    progressPct: integer("progress_pct").default(100).notNull(),
    errorMessage: text("error_message"),
    // Number of matcher and analyzer disagreements during the run.
    // Surfaced on HistoryTab as a tooltip so users can spot brands whose
    // nameVariations list needs tuning.
    disagreementCount: integer("disagreement_count").default(0).notNull(),
    // Number of times an LLM response in this run cited a URL
    // registered in tracked_content_urls (i.e. the brand's own published
    // BOFU/FAQ pages). Surfaces "did the content I generated work?".
    selfCitationCount: integer("self_citation_count").default(0).notNull(),
  },
  (table) => [
    index("citation_runs_brand_id_idx").on(table.brandId),
    index("citation_runs_started_at_idx").on(table.startedAt),
  ],
);

export const insertCitationRunSchema = createInsertSchema(citationRuns).omit({
  id: true,
  startedAt: true,
});
export type CitationRun = typeof citationRuns.$inferSelect;
export type InsertCitationRun = z.infer<typeof insertCitationRunSchema>;

export const geoRankings = pgTable(
  "geo_rankings",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }),
    brandPromptId: varchar("brand_prompt_id").references(() => brandPrompts.id, {
      onDelete: "set null",
    }),
    // Denormalized brand link (migration 0072). geo_rankings previously
    // had no brand_id - every consumer joined via brand_prompts/articles,
    // which was an easy "forgot the join → wrong brand's data" footgun.
    // New rows set this directly; old rows were backfilled from those
    // join paths. Nullable: the brand_prompt FK is ON DELETE SET NULL, so
    // a row can outlive both join sources.
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    runId: varchar("run_id").references(() => citationRuns.id, { onDelete: "set null" }),
    aiPlatform: text("ai_platform").notNull(),
    prompt: text("prompt").notNull(),
    rank: integer("rank"),
    isCited: integer("is_cited").default(0).notNull(),
    citationContext: text("citation_context"),
    citingOutletUrl: text("citing_outlet_url"),
    citingOutletName: text("citing_outlet_name"),
    // Phase 3: list of all URLs the LLM cited in its response
    // (vs. citingOutletUrl which is the single matcher-derived URL).
    // Set by citationChecker via extractCitedUrls(responseText). Capped
    // at 20 entries application-side. Existing rows stay null.
    citedUrls: text("cited_urls").array(),
    sentiment: text("sentiment").default("neutral"),
    sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }).default("0"),
    // Richer quality signals promoted from deprecated citation_quality table.
    // source_type: community/reference/video/web based on citingOutletUrl domain.
    // authority_score: 0-100, derived at write time from domain occurrence history.
    // relevance_score: 0-100, returned by the citation judge LLM call (null if judge not invoked).
    sourceType: text("source_type"),
    authorityScore: integer("authority_score"),
    relevanceScore: integer("relevance_score"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
    // Set by the "Re-check stored" flow when updated name variations
    // newly reveal a citation that the original run missed. Rank stays
    // null on these rows since the LLM rank pass didn't see them as cited.
    reDetectedAt: timestamp("re_detected_at"),
    metadata: jsonb("metadata"),
    // Every brand the citation-check analyzer (responseAnalyzer.ts) found
    // in THIS specific response - not just the tracked brand/competitors.
    // [{name, cited, rank}], ordered as the analyzer returned them.
    // Migration 0100. Null on rows written before this column existed -
    // the prompt-detail page's "Top Answers" renders nothing for those
    // rather than a fabricated backfill.
    mentionedBrands: jsonb("mentioned_brands"),
  },
  (table) => [
    index("geo_rankings_article_id_idx").on(table.articleId),
    index("geo_rankings_brand_prompt_id_idx").on(table.brandPromptId),
    index("geo_rankings_brand_id_idx").on(table.brandId),
    index("geo_rankings_run_id_idx").on(table.runId),
    index("geo_rankings_ai_platform_idx").on(table.aiPlatform),
    index("geo_rankings_brand_prompt_id_checked_at_idx").on(
      table.brandPromptId,
      table.checkedAt.desc(),
    ),
    index("geo_rankings_article_id_checked_at_idx").on(table.articleId, table.checkedAt.desc()),
    index("geo_rankings_bp_cited_checked_at_idx")
      .on(table.brandPromptId, table.checkedAt.desc())
      .where(sql`is_cited = 1`),
  ],
);

export const insertGeoRankingSchema = createInsertSchema(geoRankings).omit({
  id: true,
});
export type InsertGeoRanking = z.infer<typeof insertGeoRankingSchema>;
export type GeoRanking = typeof geoRankings.$inferSelect;

export const brandVisibilitySnapshots = pgTable(
  "brand_visibility_snapshots",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    mentionCount: integer("mention_count").default(0).notNull(),
    citationCount: integer("citation_count").default(0).notNull(),
    shareOfVoice: numeric("share_of_voice", { precision: 5, scale: 2 }).default("0"),
    visibilityScore: integer("visibility_score").default(0).notNull(),
    sentimentPositive: integer("sentiment_positive").default(0).notNull(),
    sentimentNeutral: integer("sentiment_neutral").default(0).notNull(),
    sentimentNegative: integer("sentiment_negative").default(0).notNull(),
    avgSentimentScore: numeric("avg_sentiment_score", { precision: 3, scale: 2 }).default("0"),
    snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("brand_visibility_snapshots_brand_id_idx").on(table.brandId)],
);

export const insertBrandVisibilitySnapshotSchema = createInsertSchema(
  brandVisibilitySnapshots,
).omit({
  id: true,
  snapshotDate: true,
});
export type InsertBrandVisibilitySnapshot = z.infer<typeof insertBrandVisibilitySnapshotSchema>;
export type BrandVisibilitySnapshot = typeof brandVisibilitySnapshots.$inferSelect;

// Citation Quality Scoring
export const citationQuality = pgTable(
  "citation_quality",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    aiPlatform: text("ai_platform").notNull(),
    prompt: text("prompt"),
    citationUrl: text("citation_url"),
    authorityScore: integer("authority_score").default(0).notNull(),
    relevanceScore: integer("relevance_score").default(0).notNull(),
    recencyScore: integer("recency_score").default(0).notNull(),
    positionScore: integer("position_score").default(0).notNull(),
    isPrimaryCitation: integer("is_primary_citation").default(0).notNull(),
    totalQualityScore: integer("total_quality_score").default(0).notNull(),
    sourceType: text("source_type"),
    competingCitations: text("competing_citations").array(),
    scoredAt: timestamp("scored_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("citation_quality_brand_id_idx").on(table.brandId)],
);

export const insertCitationQualitySchema = createInsertSchema(citationQuality).omit({
  id: true,
  scoredAt: true,
});
export type InsertCitationQuality = z.infer<typeof insertCitationQualitySchema>;
export type CitationQuality = typeof citationQuality.$inferSelect;
