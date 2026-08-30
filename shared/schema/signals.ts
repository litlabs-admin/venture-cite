import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { brands } from "./brands";
import { articles } from "./content";

// Listicle tracking - monitor "best of" articles for brand inclusion
export const listicles = pgTable(
  "listicles",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    sourcePublication: text("source_publication"),
    listPosition: integer("list_position"),
    totalListItems: integer("total_list_items"),
    isIncluded: integer("is_included").default(0).notNull(),
    competitorsMentioned: text("competitors_mentioned").array(),
    keyword: text("keyword"),
    searchVolume: integer("search_volume"),
    domainAuthority: integer("domain_authority"),
    lastChecked: timestamp("last_checked").defaultNow().notNull(),
    // Outreach lifecycle. Values: 'new' | 'contacted' | 'won' | 'dropped'.
    outreachStatus: text("outreach_status").default("new").notNull(),
    outreachNotes: text("outreach_notes"),
    // Refresh on subsequent scans so isIncluded and listPosition can
    // be re-validated rather than frozen at first-discovery time.
    lastVerifiedAt: timestamp("last_verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("listicles_brand_id_idx").on(table.brandId)],
);

export const insertListicleSchema = createInsertSchema(listicles).omit({
  id: true,
  createdAt: true,
  lastChecked: true,
});
export type InsertListicle = z.infer<typeof insertListicleSchema>;
export type Listicle = typeof listicles.$inferSelect;

// Wikipedia presence monitoring
export const wikipediaMentions = pgTable(
  "wikipedia_mentions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    pageTitle: text("page_title").notNull(),
    pageUrl: text("page_url").notNull(),
    mentionContext: text("mention_context"),
    mentionType: text("mention_type"), // 'direct', 'reference', 'citation', 'related'
    sectionName: text("section_name"),
    isActive: integer("is_active").default(1).notNull(),
    lastVerified: timestamp("last_verified").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("wikipedia_mentions_brand_id_idx").on(table.brandId)],
);

export const insertWikipediaMentionSchema = createInsertSchema(wikipediaMentions).omit({
  id: true,
  createdAt: true,
  lastVerified: true,
});
export type InsertWikipediaMention = z.infer<typeof insertWikipediaMentionSchema>;
export type WikipediaMention = typeof wikipediaMentions.$inferSelect;

// BOFU content templates and generated content
export const bofuContent = pgTable(
  "bofu_content",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    primaryKeyword: text("primary_keyword"),
    comparedWith: text("compared_with").array(),
    targetIntent: text("target_intent"),
    status: text("status").default("draft"),
    aiScore: integer("ai_score"),
    // Content lifecycle. publishedUrl is the canonical URL.
    // where this BOFU piece lives; once set, the citation checker tracks
    // self-citations against it and updates lastCitedAt.
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at"),
    lastCitedAt: timestamp("last_cited_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("bofu_content_brand_id_idx").on(table.brandId)],
);

export const insertBofuContentSchema = createInsertSchema(bofuContent).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBofuContent = z.infer<typeof insertBofuContentSchema>;
export type BofuContent = typeof bofuContent.$inferSelect;

// FAQ optimization tracking
export const faqItems = pgTable(
  "faq_items",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: text("category"),
    searchVolume: integer("search_volume"),
    aiSurfaceScore: integer("ai_surface_score"),
    isOptimized: integer("is_optimized").default(0).notNull(),
    optimizationTips: text("optimization_tips").array(),
    // Lifecycle parallel to bofu_content.
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at"),
    lastCitedAt: timestamp("last_cited_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("faq_items_brand_id_idx").on(table.brandId),
    index("faq_items_article_id_idx").on(table.articleId),
  ],
);

export const insertFaqItemSchema = createInsertSchema(faqItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFaqItem = z.infer<typeof insertFaqItemSchema>;
export type FaqItem = typeof faqItems.$inferSelect;

// Brand mention tracking across platforms
export const brandMentions = pgTable(
  "brand_mentions",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title"),
    mentionContext: text("mention_context"),
    sentiment: text("sentiment").default("neutral"),
    sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }).default("0"),
    engagementScore: integer("engagement_score"),
    authorUsername: text("author_username"),
    isVerified: integer("is_verified").default(0).notNull(),
    // Explicit lifecycle. Values:
    //   'new' | 'acknowledged' | 'replied' | 'false_positive' | 'ignored'.
    status: text("status").default("new").notNull(),
    mentionedAt: timestamp("mentioned_at"),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
    // Mentions rebuild (0050): new columns for precise brand-mention monitor.
    mentionLocation: text("mention_location").default("post"),
    linkStatus: text("link_status").default("unknown"),
    lastVerifiedAt: timestamp("last_verified_at"),
    matchedVariation: text("matched_variation"),
    matchedField: text("matched_field"),
    source: text("source").default("scanner"),
    scannerVersion: integer("scanner_version").default(2),
    sentimentSource: text("sentiment_source").default("llm"),
    engagementNormalized: integer("engagement_normalized"),
  },
  (table) => [index("brand_mentions_brand_id_idx").on(table.brandId)],
);

export const insertBrandMentionSchema = createInsertSchema(brandMentions).omit({
  id: true,
  discoveredAt: true,
});
export type InsertBrandMention = z.infer<typeof insertBrandMentionSchema>;
export type BrandMention = typeof brandMentions.$inferSelect;

// Registry of brand-owned published URLs from
// bofu_content + faq_items via a polymorphic source_type/source_id pair)
// that the citation checker matches against. When the LLM in a citation
// run cites one of these URLs, the corresponding bofu_content / faq_items
// row gets last_cited_at = now() and citation_runs.self_citation_count
// increments.
export const trackedContentUrls = pgTable(
  "tracked_content_urls",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(), // 'bofu' | 'faq'
    sourceId: varchar("source_id").notNull(),
    url: text("url").notNull(),
    // Lower-cased host + path with www./trailing-slash/query/fragment
    // stripped. The matcher works against this normalized form so URL
    // variations match consistently.
    normalizedUrl: text("normalized_url").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tracked_content_urls_brand_id_idx").on(table.brandId),
    index("tracked_content_urls_brand_id_normalized_url_idx").on(
      table.brandId,
      table.normalizedUrl,
    ),
  ],
);

export const insertTrackedContentUrlSchema = createInsertSchema(trackedContentUrls).omit({
  id: true,
  createdAt: true,
});
export type InsertTrackedContentUrl = z.infer<typeof insertTrackedContentUrlSchema>;
export type TrackedContentUrl = typeof trackedContentUrls.$inferSelect;

// Hallucination Detection - Track inaccurate AI claims
export const brandHallucinations = pgTable(
  "brand_hallucinations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    prompt: text("prompt").notNull(),
    claimedStatement: text("claimed_statement").notNull(),
    actualFact: text("actual_fact"),
    hallucinationType: text("hallucination_type").notNull(),
    severity: text("severity").notNull().default("medium"), // 'low' | 'medium' | 'high' | 'critical' (CHECK in 0026)
    category: text("category"),
    isResolved: integer("is_resolved").default(0).notNull(),
    remediationSteps: text("remediation_steps").array(),
    remediationStatus: text("remediation_status").default("pending"), // 'pending' | 'in_progress' | 'resolved' | 'dismissed' | 'verified'
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    verifiedBy: text("verified_by"),
    // Source traceback: copied from the originating geo_ranking at detect time.
    rankingId: varchar("ranking_id"),
    citingOutletUrl: text("citing_outlet_url"),
    citationContext: text("citation_context"),
    articleTitle: text("article_title"),
    // Bumped on ON CONFLICT dedup so we can show "seen 12 times".
    lastSeenAt: timestamp("last_seen_at"),
    seenCount: integer("seen_count").default(1).notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("brand_hallucinations_brand_id_idx").on(table.brandId),
    index("brand_hallucinations_ranking_id_idx").on(table.rankingId),
  ],
);

export const insertBrandHallucinationSchema = createInsertSchema(brandHallucinations).omit({
  id: true,
  detectedAt: true,
});
export type InsertBrandHallucination = z.infer<typeof insertBrandHallucinationSchema>;
export type BrandHallucination = typeof brandHallucinations.$inferSelect;

// Source health - tracks consecutive scan failures per (brand, source) so
// the mention scanner can back off a source that keeps failing. Moved from
// platform: exclusively used by the signals mention-scanning pipeline
// (mentionScanner.ts, sourceHealth.ts). See
// .audit/B7/B7-05-platform-split-design.md §2a.
export const sourceHealth = pgTable(
  "source_health",
  {
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 'reddit' | 'hackernews' | 'quora'
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastFailureAt: timestamp("last_failure_at"),
    lastFailureReason: text("last_failure_reason"),
    pausedUntil: timestamp("paused_until"),
    lastSuccessfulScanAt: timestamp("last_successful_scan_at"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.brandId, t.source] }),
  }),
);
export type SourceHealth = typeof sourceHealth.$inferSelect;
export type InsertSourceHealth = typeof sourceHealth.$inferInsert;

// Sentiment cache - keyed by content hash so repeated mentions with
// identical text skip a re-classification call. Moved from platform:
// exclusively used by sentimentBatcher.ts (called from mentionScanner.ts
// and routes/mentions.ts). See
// .audit/B7/B7-05-platform-split-design.md §2a.
export const sentimentCache = pgTable("sentiment_cache", {
  contentHash: text("content_hash").primaryKey(),
  sentiment: text("sentiment").notNull(), // 'positive' | 'neutral' | 'negative'
  sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }).notNull(),
  cachedAt: timestamp("cached_at").notNull().defaultNow(),
});
export type SentimentCache = typeof sentimentCache.$inferSelect;
export type InsertSentimentCache = typeof sentimentCache.$inferInsert;
