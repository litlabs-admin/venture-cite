import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  accessTier: text("access_tier").default("free").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  betaInviteCode: text("beta_invite_code"),
  isAdmin: integer("is_admin").default(0).notNull(),
  articlesUsedThisMonth: integer("articles_used_this_month").default(0).notNull(),
  brandsUsed: integer("brands_used").default(0).notNull(),
  usageResetDate: timestamp("usage_reset_date").defaultNow(),
  emailVerified: integer("email_verified").default(0).notNull(),
  weeklyReportEnabled: integer("weekly_report_enabled").default(1).notNull(),
  lastWeeklyReportSentAt: timestamp("last_weekly_report_sent_at"),
  bufferAccessToken: text("buffer_access_token"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usageLimits = {
  free: { articlesPerMonth: 5, maxBrands: 1 },
  beta: { articlesPerMonth: 20, maxBrands: 3 },
  pro: { articlesPerMonth: 40, maxBrands: 5 },
  enterprise: { articlesPerMonth: 200, maxBrands: -1 },
  admin: { articlesPerMonth: -1, maxBrands: -1 },
};

export type UpsertUser = typeof users.$inferInsert;

export const betaInviteCodes = pgTable("beta_invite_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses").default(1).notNull(),
  usedCount: integer("used_count").default(0).notNull(),
  accessTier: text("access_tier").default("beta").notNull(),
  expiresAt: timestamp("expires_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type BetaInviteCode = typeof betaInviteCodes.$inferSelect;
export type InsertBetaInviteCode = typeof betaInviteCodes.$inferInsert;

export const waitlist = pgTable("waitlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  source: text("source").default("landing"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWaitlistSchema = createInsertSchema(waitlist).omit({ id: true, createdAt: true });
export type Waitlist = typeof waitlist.$inferSelect;
export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;

export const citations = pgTable(
  "citations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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

export const analytics = pgTable("analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  totalCitations: integer("total_citations").default(0).notNull(),
  weeklyGrowth: numeric("weekly_growth", { precision: 5, scale: 2 }).default("0").notNull(),
  avgPosition: numeric("avg_position", { precision: 5, scale: 2 }).default("0").notNull(),
  monthlyTraffic: integer("monthly_traffic").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const brands = pgTable(
  "brands",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    companyName: text("company_name").notNull(),
    industry: text("industry").notNull(),
    description: text("description"),
    website: text("website"),
    tone: text("tone").default("professional"),
    targetAudience: text("target_audience"),
    products: text("products").array(),
    keyValues: text("key_values").array(),
    uniqueSellingPoints: text("unique_selling_points").array(),
    brandVoice: text("brand_voice"),
    sampleContent: text("sample_content"),
    nameVariations: text("name_variations").array(),
    autoCitationSchedule: text("auto_citation_schedule").default("off").notNull(), // off | weekly | biweekly | monthly
    autoCitationDay: integer("auto_citation_day").default(0).notNull(), // 0=Sun, 1=Mon, ... 6=Sat
    lastAutoCitationAt: timestamp("last_auto_citation_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("brands_user_id_idx").on(table.userId)],
);

export const articles = pgTable(
  "articles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    content: text("content").notNull(),
    excerpt: text("excerpt"),
    metaDescription: text("meta_description"),
    keywords: text("keywords").array(),
    industry: text("industry"),
    contentType: text("content_type"),
    featuredImage: text("featured_image"),
    author: text("author").default("GEO Platform"),
    viewCount: integer("view_count").default(0).notNull(),
    citationCount: integer("citation_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    seoData: jsonb("seo_data"),
  },
  (table) => [
    index("articles_brand_id_idx").on(table.brandId),
    uniqueIndex("articles_brand_slug_idx").on(table.brandId, table.slug),
  ],
);

export const distributions = pgTable(
  "distributions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    articleId: varchar("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
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

export const keywordResearch = pgTable(
  "keyword_research",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
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
    contentGenerated: integer("content_generated").default(0).notNull(),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("keyword_research_brand_id_idx").on(table.brandId)],
);

export const insertKeywordResearchSchema = createInsertSchema(keywordResearch).omit({ id: true, discoveredAt: true, updatedAt: true });
export type KeywordResearch = typeof keywordResearch.$inferSelect;
export type InsertKeywordResearch = z.infer<typeof insertKeywordResearchSchema>;

// Background job queue for content generation so long-running GPT calls
// survive page navigation, logout, and browser refresh. Polled in-process
// by server/contentGenerationWorker.ts — no Redis/BullMQ dependency.
export const contentGenerationJobs = pgTable(
  "content_generation_jobs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"),
    requestPayload: jsonb("request_payload").notNull(),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("content_gen_jobs_user_status_idx").on(table.userId, table.status),
    index("content_gen_jobs_status_idx").on(table.status),
  ],
);

export const insertContentGenerationJobSchema = createInsertSchema(contentGenerationJobs).omit({
  id: true,
  createdAt: true,
});
export type ContentGenerationJob = typeof contentGenerationJobs.$inferSelect;
export type InsertContentGenerationJob = z.infer<typeof insertContentGenerationJobSchema>;

// Multi-draft persistence for the content generation page. Each draft stores
// the full form state and is auto-saved on field change. Linked to a
// background job (jobId) while generating, then updated with the finished
// article when the job completes.
export const contentDrafts = pgTable(
  "content_drafts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    title: text("title"),
    keywords: text("keywords").notNull().default(""),
    industry: text("industry").notNull().default(""),
    type: text("type").notNull().default("article"),
    brandId: varchar("brand_id"),
    targetCustomers: text("target_customers"),
    geography: text("geography"),
    contentStyle: text("content_style").default("b2c"),
    generatedContent: text("generated_content"),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    jobId: varchar("job_id"), // references content_generation_jobs(id) — nullable FK (no cascade needed)
    humanScore: integer("human_score"),
    passesAiDetection: integer("passes_ai_detection"), // NULL=unchecked, 0=fails, 1=passes
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("content_drafts_user_id_idx").on(table.userId),
    index("content_drafts_job_id_idx").on(table.jobId),
  ],
);

export type ContentDraft = typeof contentDrafts.$inferSelect;
export type InsertContentDraft = typeof contentDrafts.$inferInsert;

// Tracks each batch of 10 prompts generated for a brand. Enables prompt
// versioning so users can see which prompts were used in historical runs.
export const promptGenerations = pgTable(
  "prompt_generations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    generationNumber: integer("generation_number").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("prompt_generations_brand_id_idx").on(table.brandId)],
);

export const insertPromptGenerationSchema = createInsertSchema(promptGenerations).omit({ id: true, createdAt: true });
export type PromptGeneration = typeof promptGenerations.$inferSelect;
export type InsertPromptGeneration = z.infer<typeof insertPromptGenerationSchema>;

export const brandPrompts = pgTable(
  "brand_prompts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    generationId: varchar("generation_id").references(() => promptGenerations.id, { onDelete: "set null" }),
    prompt: text("prompt").notNull(),
    rationale: text("rationale"),
    orderIndex: integer("order_index").default(0).notNull(),
    isActive: integer("is_active").default(1).notNull(), // 1 = current, 0 = archived
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("brand_prompts_brand_id_idx").on(table.brandId),
    index("brand_prompts_generation_id_idx").on(table.generationId),
  ],
);

export const insertBrandPromptSchema = createInsertSchema(brandPrompts).omit({ id: true, createdAt: true });
export type BrandPrompt = typeof brandPrompts.$inferSelect;
export type InsertBrandPrompt = z.infer<typeof insertBrandPromptSchema>;

// Per-brand AI Visibility Checklist progress. One row per completed step so
// toggling is a simple insert/delete instead of a JSON read-modify-write.
export const visibilityProgress = pgTable(
  "visibility_progress",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    engineId: text("engine_id").notNull(),
    stepId: text("step_id").notNull(),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [
    index("visibility_progress_brand_id_idx").on(table.brandId),
    uniqueIndex("visibility_progress_brand_engine_step_idx").on(table.brandId, table.engineId, table.stepId),
  ],
);

export const insertVisibilityProgressSchema = createInsertSchema(visibilityProgress).omit({ id: true, completedAt: true });
export type VisibilityProgress = typeof visibilityProgress.$inferSelect;
export type InsertVisibilityProgress = z.infer<typeof insertVisibilityProgressSchema>;

// One row per "Run Citation Check" click or weekly cron run. Stores the
// aggregate totals so the trend chart can render without re-aggregating
// every geo_rankings row.
export const citationRuns = pgTable(
  "citation_runs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    totalChecks: integer("total_checks").default(0).notNull(),
    totalCited: integer("total_cited").default(0).notNull(),
    citationRate: integer("citation_rate").default(0).notNull(),
    triggeredBy: text("triggered_by").notNull().default("manual"), // manual | cron
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    // Per-platform breakdown snapshot so the history endpoint doesn't
    // need to re-join geo_rankings for every run.
    platformBreakdown: jsonb("platform_breakdown"),
  },
  (table) => [
    index("citation_runs_brand_id_idx").on(table.brandId),
    index("citation_runs_started_at_idx").on(table.startedAt),
  ],
);

export const insertCitationRunSchema = createInsertSchema(citationRuns).omit({ id: true, startedAt: true });
export type CitationRun = typeof citationRuns.$inferSelect;
export type InsertCitationRun = z.infer<typeof insertCitationRunSchema>;

export const geoRankings = pgTable(
  "geo_rankings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }),
    brandPromptId: varchar("brand_prompt_id").references(() => brandPrompts.id, { onDelete: "set null" }),
    runId: varchar("run_id").references(() => citationRuns.id, { onDelete: "set null" }),
    aiPlatform: text("ai_platform").notNull(),
    prompt: text("prompt").notNull(),
    rank: integer("rank"),
    isCited: integer("is_cited").default(0).notNull(),
    citationContext: text("citation_context"),
    citingOutletUrl: text("citing_outlet_url"),
    citingOutletName: text("citing_outlet_name"),
    sentiment: text("sentiment").default("neutral"),
    sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }).default("0"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("geo_rankings_article_id_idx").on(table.articleId),
    index("geo_rankings_brand_prompt_id_idx").on(table.brandPromptId),
    index("geo_rankings_run_id_idx").on(table.runId),
    index("geo_rankings_ai_platform_idx").on(table.aiPlatform),
  ],
);

export const brandVisibilitySnapshots = pgTable(
  "brand_visibility_snapshots",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
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

export const aiCommerceSessions = pgTable(
  "ai_commerce_sessions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    sessionId: text("session_id"),
    userQuery: text("user_query"),
    productMentioned: text("product_mentioned"),
    clickedThrough: integer("clicked_through").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("ai_commerce_sessions_brand_id_idx").on(table.brandId)],
);

export const purchaseEvents = pgTable(
  "purchase_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    commerceSessionId: varchar("commerce_session_id").references(() => aiCommerceSessions.id, { onDelete: "set null" }),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    ecommercePlatform: text("ecommerce_platform").notNull(),
    orderId: text("order_id"),
    revenue: numeric("revenue", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").default("USD").notNull(),
    productName: text("product_name"),
    quantity: integer("quantity").default(1).notNull(),
    customerEmail: text("customer_email"),
    purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
    webhookData: jsonb("webhook_data"),
    metadata: jsonb("metadata"),
  },
  (table) => [index("purchase_events_brand_id_idx").on(table.brandId)],
);

export const publicationReferences = pgTable("publication_references", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  outletName: text("outlet_name").notNull(),
  outletDomain: text("outlet_domain").notNull(),
  outletUrl: text("outlet_url"),
  industry: text("industry"),
  aiPlatform: text("ai_platform").notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  citationCount: integer("citation_count").default(1).notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
});

export const publicationMetrics = pgTable("publication_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  outletName: text("outlet_name").notNull(),
  outletDomain: text("outlet_domain").notNull(),
  industry: text("industry").notNull(),
  totalCitations: integer("total_citations").default(0).notNull(),
  aiPlatformBreakdown: jsonb("ai_platform_breakdown"),
  authorityScore: numeric("authority_score", { precision: 5, scale: 2 }).default("0").notNull(),
  trendDirection: text("trend_direction").default("stable"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCitationSchema = createInsertSchema(citations).omit({
  id: true,
  timestamp: true,
});

export const insertAnalyticsSchema = createInsertSchema(analytics).omit({
  id: true,
  updatedAt: true,
});

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  citationCount: true,
});

export const insertDistributionSchema = createInsertSchema(distributions).omit({
  id: true,
  createdAt: true,
});

export const insertGeoRankingSchema = createInsertSchema(geoRankings).omit({
  id: true,
});

export const insertBrandSchema = createInsertSchema(brands).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommerceSessionSchema = createInsertSchema(aiCommerceSessions).omit({
  id: true,
  createdAt: true,
});

export const insertPurchaseEventSchema = createInsertSchema(purchaseEvents).omit({
  id: true,
  purchasedAt: true,
});

export const insertPublicationReferenceSchema = createInsertSchema(publicationReferences).omit({
  id: true,
  lastSeenAt: true,
});

export const insertPublicationMetricSchema = createInsertSchema(publicationMetrics).omit({
  id: true,
  lastUpdated: true,
});

export const competitors = pgTable(
  "competitors",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    industry: text("industry"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("competitors_brand_id_idx").on(table.brandId)],
);

export const competitorCitationSnapshots = pgTable(
  "competitor_citation_snapshots",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    competitorId: varchar("competitor_id").notNull().references(() => competitors.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    citationCount: integer("citation_count").default(0).notNull(),
    snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("competitor_citation_snapshots_competitor_id_idx").on(table.competitorId)],
);

export const insertCompetitorSchema = createInsertSchema(competitors).omit({
  id: true,
  createdAt: true,
});

export const insertCompetitorCitationSnapshotSchema = createInsertSchema(competitorCitationSnapshots).omit({
  id: true,
  snapshotDate: true,
});

export const insertBrandVisibilitySnapshotSchema = createInsertSchema(brandVisibilitySnapshots).omit({
  id: true,
  snapshotDate: true,
});

// Listicle tracking - monitor "best of" articles for brand inclusion
export const listicles = pgTable(
  "listicles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("listicles_brand_id_idx").on(table.brandId)],
);

// Wikipedia presence monitoring
export const wikipediaMentions = pgTable(
  "wikipedia_mentions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
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

// BOFU content templates and generated content
export const bofuContent = pgTable(
  "bofu_content",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    primaryKeyword: text("primary_keyword"),
    comparedWith: text("compared_with").array(),
    targetIntent: text("target_intent"),
    status: text("status").default("draft"),
    aiScore: integer("ai_score"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("bofu_content_brand_id_idx").on(table.brandId)],
);

// FAQ optimization tracking
export const faqItems = pgTable(
  "faq_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: text("category"),
    searchVolume: integer("search_volume"),
    aiSurfaceScore: integer("ai_surface_score"),
    isOptimized: integer("is_optimized").default(0).notNull(),
    optimizationTips: text("optimization_tips").array(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("faq_items_brand_id_idx").on(table.brandId)],
);

// Brand mention tracking across platforms
export const brandMentions = pgTable(
  "brand_mentions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title"),
    mentionContext: text("mention_context"),
    sentiment: text("sentiment").default("neutral"),
    sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }).default("0"),
    engagementScore: integer("engagement_score"),
    authorUsername: text("author_username"),
    isVerified: integer("is_verified").default(0).notNull(),
    mentionedAt: timestamp("mentioned_at"),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("brand_mentions_brand_id_idx").on(table.brandId)],
);

export const insertListicleSchema = createInsertSchema(listicles).omit({
  id: true,
  createdAt: true,
  lastChecked: true,
});

export const insertWikipediaMentionSchema = createInsertSchema(wikipediaMentions).omit({
  id: true,
  createdAt: true,
  lastVerified: true,
});

export const insertBofuContentSchema = createInsertSchema(bofuContent).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFaqItemSchema = createInsertSchema(faqItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBrandMentionSchema = createInsertSchema(brandMentions).omit({
  id: true,
  discoveredAt: true,
});

// Prompt Portfolio - Track prompts by category/intent with share-of-answer
export const promptPortfolio = pgTable(
  "prompt_portfolio",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    category: text("category").notNull(),
    funnelStage: text("funnel_stage").notNull(),
    competitorSet: text("competitor_set").array(),
    region: text("region").default("global"),
    aiPlatform: text("ai_platform").notNull(),
    isBrandCited: integer("is_brand_cited").default(0).notNull(),
    citationPosition: integer("citation_position"),
    shareOfAnswer: numeric("share_of_answer", { precision: 5, scale: 2 }).default("0"),
    sentiment: text("sentiment").default("neutral"),
    answerVolatility: integer("answer_volatility").default(0),
    consensusScore: integer("consensus_score").default(0),
    lastChecked: timestamp("last_checked").defaultNow().notNull(),
    checkedHistory: jsonb("checked_history"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("prompt_portfolio_brand_id_idx").on(table.brandId)],
);

// Citation Quality Scoring
export const citationQuality = pgTable(
  "citation_quality",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
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

// Hallucination Detection - Track inaccurate AI claims
export const brandHallucinations = pgTable(
  "brand_hallucinations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    prompt: text("prompt").notNull(),
    claimedStatement: text("claimed_statement").notNull(),
    actualFact: text("actual_fact"),
    hallucinationType: text("hallucination_type").notNull(),
    severity: text("severity").notNull().default("medium"),
    category: text("category"),
    isResolved: integer("is_resolved").default(0).notNull(),
    remediationSteps: text("remediation_steps").array(),
    remediationStatus: text("remediation_status").default("pending"),
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    verifiedBy: text("verified_by"),
    metadata: jsonb("metadata"),
  },
  (table) => [index("brand_hallucinations_brand_id_idx").on(table.brandId)],
);

// Brand Fact Sheet - Source of truth for hallucination checking
export const brandFactSheet = pgTable(
  "brand_fact_sheet",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    factCategory: text("fact_category").notNull(),
    factKey: text("fact_key").notNull(),
    factValue: text("fact_value").notNull(),
    sourceUrl: text("source_url"),
    lastVerified: timestamp("last_verified").defaultNow().notNull(),
    isActive: integer("is_active").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("brand_fact_sheet_brand_id_idx").on(table.brandId)],
);

// Metrics History - Track metrics snapshots over time for trend analysis
export const metricsHistory = pgTable(
  "metrics_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    metricType: text("metric_type").notNull(),
    metricValue: numeric("metric_value", { precision: 10, scale: 2 }).notNull(),
    metricDetails: jsonb("metric_details"),
    snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
  },
  (table) => [index("metrics_history_brand_id_idx").on(table.brandId)],
);

// Alert Settings - Configure notifications for metric changes
export const alertSettings = pgTable(
  "alert_settings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    alertType: text("alert_type").notNull(),
    isEnabled: integer("is_enabled").default(1).notNull(),
    threshold: numeric("threshold", { precision: 10, scale: 2 }),
    emailEnabled: integer("email_enabled").default(0).notNull(),
    emailAddress: text("email_address"),
    slackEnabled: integer("slack_enabled").default(0).notNull(),
    slackWebhookUrl: text("slack_webhook_url"),
    lastTriggered: timestamp("last_triggered"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("alert_settings_brand_id_idx").on(table.brandId)],
);

// Alert History - Track sent alerts
export const alertHistory = pgTable(
  "alert_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    alertSettingId: varchar("alert_setting_id").references(() => alertSettings.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    alertType: text("alert_type").notNull(),
    message: text("message").notNull(),
    details: jsonb("details"),
    sentVia: text("sent_via").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [index("alert_history_brand_id_idx").on(table.brandId)],
);

// AI Sources - Track where AI platforms source their answers from
export const aiSources = pgTable(
  "ai_sources",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceDomain: text("source_domain").notNull(),
    sourceName: text("source_name"),
    sourceType: text("source_type").notNull(),
    prompt: text("prompt"),
    citationContext: text("citation_context"),
    authorityScore: integer("authority_score").default(0).notNull(),
    isBrandMentioned: integer("is_brand_mentioned").default(0).notNull(),
    sentiment: text("sentiment").default("neutral"),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    occurrenceCount: integer("occurrence_count").default(1).notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("ai_sources_brand_id_idx").on(table.brandId)],
);

// AI Traffic Sessions - Track referral traffic from AI engines
export const aiTrafficSessions = pgTable(
  "ai_traffic_sessions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
    aiPlatform: text("ai_platform").notNull(),
    referrerUrl: text("referrer_url"),
    landingPage: text("landing_page").notNull(),
    userAgent: text("user_agent"),
    sessionDuration: integer("session_duration"),
    pageViews: integer("page_views").default(1).notNull(),
    bounced: integer("bounced").default(0).notNull(),
    converted: integer("converted").default(0).notNull(),
    conversionType: text("conversion_type"),
    conversionValue: numeric("conversion_value", { precision: 10, scale: 2 }),
    country: text("country"),
    device: text("device"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("ai_traffic_sessions_brand_id_idx").on(table.brandId)],
);

// Prompt Test Runs - Scheduled testing of prompts across AI platforms
export const promptTestRuns = pgTable(
  "prompt_test_runs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    promptPortfolioId: varchar("prompt_portfolio_id").references(() => promptPortfolio.id, { onDelete: "set null" }),
    prompt: text("prompt").notNull(),
    aiPlatform: text("ai_platform").notNull(),
    response: text("response"),
    isBrandCited: integer("is_brand_cited").default(0).notNull(),
    citationPosition: integer("citation_position"),
    competitorsFound: text("competitors_found").array(),
    sentiment: text("sentiment").default("neutral"),
    shareOfAnswer: numeric("share_of_answer", { precision: 5, scale: 2 }),
    hallucinationDetected: integer("hallucination_detected").default(0).notNull(),
    hallucinationDetails: text("hallucination_details"),
    sourcesCited: jsonb("sources_cited"),
    runStatus: text("run_status").notNull().default("pending"),
    scheduledAt: timestamp("scheduled_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    error: text("error"),
    metadata: jsonb("metadata"),
  },
  (table) => [index("prompt_test_runs_brand_id_idx").on(table.brandId)],
);

// Agent Tasks - Queue for automated GEO optimization tasks
export const agentTasks = pgTable("agent_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  taskType: text("task_type").notNull(),
  taskTitle: text("task_title").notNull(),
  taskDescription: text("task_description"),
  priority: text("priority").notNull().default("medium"), // 'low', 'medium', 'high', 'urgent'
  status: text("status").notNull().default("queued"), // 'queued', 'in_progress', 'completed', 'failed', 'cancelled'
  assignedTo: text("assigned_to").default("agent"), // 'agent' for automated, or user ID for manual
  triggeredBy: text("triggered_by").notNull(), // 'automation_rule', 'manual', 'schedule', 'alert'
  automationRuleId: varchar("automation_rule_id"),
  inputData: jsonb("input_data"), // Task-specific input parameters
  outputData: jsonb("output_data"), // Task results/outputs
  aiModelUsed: text("ai_model_used"),
  tokensUsed: integer("tokens_used").default(0).notNull(),
  estimatedCredits: numeric("estimated_credits", { precision: 10, scale: 4 }),
  actualCredits: numeric("actual_credits", { precision: 10, scale: 4 }),
  scheduledFor: timestamp("scheduled_for"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
}, (table) => [
  index("agent_tasks_brand_id_idx").on(table.brandId),
  index("agent_tasks_status_idx").on(table.status),
]);

// Outreach Campaigns - Track publication outreach and guest posts
export const outreachCampaigns = pgTable(
  "outreach_campaigns",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    campaignName: text("campaign_name").notNull(),
    campaignType: text("campaign_type").notNull(),
    targetPublicationId: varchar("target_publication_id"),
    targetDomain: text("target_domain").notNull(),
    targetContactEmail: text("target_contact_email"),
    targetContactName: text("target_contact_name"),
    status: text("status").notNull().default("draft"),
    emailSubject: text("email_subject"),
    emailBody: text("email_body"),
    pitchAngle: text("pitch_angle"),
    proposedTopic: text("proposed_topic"),
    linkedArticleId: varchar("linked_article_id").references(() => articles.id, { onDelete: "set null" }),
    authorityScore: integer("authority_score").default(0).notNull(),
    expectedImpact: text("expected_impact"),
    aiGeneratedDraft: integer("ai_generated_draft").default(0).notNull(),
    sentAt: timestamp("sent_at"),
    lastFollowUpAt: timestamp("last_follow_up_at"),
    followUpCount: integer("follow_up_count").default(0).notNull(),
    responseReceivedAt: timestamp("response_received_at"),
    responseNotes: text("response_notes"),
    resultUrl: text("result_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("outreach_campaigns_brand_id_idx").on(table.brandId)],
);

// Publication Targets - Discovered publications and blogs for outreach
export const publicationTargets = pgTable(
  "publication_targets",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    publicationName: text("publication_name").notNull(),
    domain: text("domain").notNull(),
    category: text("category").notNull(),
    industry: text("industry"),
    domainAuthority: integer("domain_authority").default(0).notNull(),
    monthlyTraffic: text("monthly_traffic"),
    acceptsGuestPosts: integer("accepts_guest_posts").default(0).notNull(),
    acceptsPRPitches: integer("accepts_pr_pitches").default(0).notNull(),
    relevanceScore: integer("relevance_score").default(0).notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactRole: text("contact_role"),
    contactLinkedIn: text("contact_linkedin"),
    contactTwitter: text("contact_twitter"),
    submissionUrl: text("submission_url"),
    editorialGuidelines: text("editorial_guidelines"),
    pitchNotes: text("pitch_notes"),
    previousOutreach: integer("previous_outreach").default(0).notNull(),
    lastContactedAt: timestamp("last_contacted_at"),
    status: text("status").default("discovered").notNull(),
    discoveredBy: text("discovered_by").default("ai").notNull(),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("publication_targets_brand_id_idx").on(table.brandId)],
);

// Outreach Emails - Track individual email sends and responses
export const outreachEmails = pgTable(
  "outreach_emails",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    campaignId: varchar("campaign_id").references(() => outreachCampaigns.id, { onDelete: "cascade" }),
    publicationTargetId: varchar("publication_target_id").references(() => publicationTargets.id, { onDelete: "set null" }),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email").notNull(),
    recipientName: text("recipient_name"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    emailType: text("email_type").notNull(),
    status: text("status").default("draft").notNull(),
    scheduledFor: timestamp("scheduled_for"),
    sentAt: timestamp("sent_at"),
    openedAt: timestamp("opened_at"),
    clickedAt: timestamp("clicked_at"),
    repliedAt: timestamp("replied_at"),
    openCount: integer("open_count").default(0).notNull(),
    clickCount: integer("click_count").default(0).notNull(),
    replyContent: text("reply_content"),
    error: text("error"),
    trackingId: text("tracking_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("outreach_emails_brand_id_idx").on(table.brandId)],
);

// Automation Rules - Define triggers and actions for autonomous workflows
export const automationRules = pgTable(
  "automation_rules",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    ruleName: text("rule_name").notNull(),
    ruleDescription: text("rule_description"),
    triggerType: text("trigger_type").notNull(),
    triggerConditions: jsonb("trigger_conditions").notNull(),
    actionType: text("action_type").notNull(),
    actionConfig: jsonb("action_config").notNull(),
    isEnabled: integer("is_enabled").default(1).notNull(),
    priority: integer("priority").default(50).notNull(),
    cooldownMinutes: integer("cooldown_minutes").default(60).notNull(),
    maxExecutionsPerDay: integer("max_executions_per_day").default(10).notNull(),
    executionCount: integer("execution_count").default(0).notNull(),
    lastTriggeredAt: timestamp("last_triggered_at"),
    lastExecutedAt: timestamp("last_executed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [index("automation_rules_brand_id_idx").on(table.brandId)],
);

// Automation Execution Log - Track automation runs
export const automationExecutions = pgTable(
  "automation_executions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    automationRuleId: varchar("automation_rule_id").references(() => automationRules.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    agentTaskId: varchar("agent_task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    triggerData: jsonb("trigger_data"),
    executionStatus: text("execution_status").notNull().default("running"),
    resultSummary: text("result_summary"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("automation_executions_rule_id_idx").on(table.automationRuleId),
    index("automation_executions_brand_id_idx").on(table.brandId),
  ],
);

export const insertAlertSettingsSchema = createInsertSchema(alertSettings).omit({
  id: true,
  createdAt: true,
  lastTriggered: true,
});

export const insertAlertHistorySchema = createInsertSchema(alertHistory).omit({
  id: true,
  sentAt: true,
});

export const insertAiSourceSchema = createInsertSchema(aiSources).omit({
  id: true,
  discoveredAt: true,
  lastSeenAt: true,
});

export const insertAiTrafficSessionSchema = createInsertSchema(aiTrafficSessions).omit({
  id: true,
  createdAt: true,
});

export const insertPromptTestRunSchema = createInsertSchema(promptTestRuns).omit({
  id: true,
  createdAt: true,
});

export const insertAgentTaskSchema = createInsertSchema(agentTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOutreachCampaignSchema = createInsertSchema(outreachCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPublicationTargetSchema = createInsertSchema(publicationTargets).omit({
  id: true,
  discoveredAt: true,
  updatedAt: true,
});

export const insertOutreachEmailSchema = createInsertSchema(outreachEmails).omit({
  id: true,
  createdAt: true,
});

export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAutomationExecutionSchema = createInsertSchema(automationExecutions).omit({
  id: true,
  startedAt: true,
});

export const insertMetricsHistorySchema = createInsertSchema(metricsHistory).omit({
  id: true,
  snapshotDate: true,
});

export const insertPromptPortfolioSchema = createInsertSchema(promptPortfolio).omit({
  id: true,
  createdAt: true,
  lastChecked: true,
});

export const insertCitationQualitySchema = createInsertSchema(citationQuality).omit({
  id: true,
  scoredAt: true,
});

export const insertBrandHallucinationSchema = createInsertSchema(brandHallucinations).omit({
  id: true,
  detectedAt: true,
});

export const insertBrandFactSheetSchema = createInsertSchema(brandFactSheet).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastVerified: true,
});

export type InsertCitation = z.infer<typeof insertCitationSchema>;
export type Citation = typeof citations.$inferSelect;
export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;
export type Analytics = typeof analytics.$inferSelect;
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articles.$inferSelect;
export type InsertDistribution = z.infer<typeof insertDistributionSchema>;
export type Distribution = typeof distributions.$inferSelect;
export type InsertGeoRanking = z.infer<typeof insertGeoRankingSchema>;
export type GeoRanking = typeof geoRankings.$inferSelect;
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Brand = typeof brands.$inferSelect;
export type InsertCommerceSession = z.infer<typeof insertCommerceSessionSchema>;
export type CommerceSession = typeof aiCommerceSessions.$inferSelect;
export type InsertPurchaseEvent = z.infer<typeof insertPurchaseEventSchema>;
export type PurchaseEvent = typeof purchaseEvents.$inferSelect;
export type InsertPublicationReference = z.infer<typeof insertPublicationReferenceSchema>;
export type PublicationReference = typeof publicationReferences.$inferSelect;
export type InsertPublicationMetric = z.infer<typeof insertPublicationMetricSchema>;
export type PublicationMetric = typeof publicationMetrics.$inferSelect;
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = typeof competitors.$inferSelect;
export type InsertCompetitorCitationSnapshot = z.infer<typeof insertCompetitorCitationSnapshotSchema>;
export type CompetitorCitationSnapshot = typeof competitorCitationSnapshots.$inferSelect;
export type InsertBrandVisibilitySnapshot = z.infer<typeof insertBrandVisibilitySnapshotSchema>;
export type BrandVisibilitySnapshot = typeof brandVisibilitySnapshots.$inferSelect;
export type InsertListicle = z.infer<typeof insertListicleSchema>;
export type Listicle = typeof listicles.$inferSelect;
export type InsertWikipediaMention = z.infer<typeof insertWikipediaMentionSchema>;
export type WikipediaMention = typeof wikipediaMentions.$inferSelect;
export type InsertBofuContent = z.infer<typeof insertBofuContentSchema>;
export type BofuContent = typeof bofuContent.$inferSelect;
export type InsertFaqItem = z.infer<typeof insertFaqItemSchema>;
export type FaqItem = typeof faqItems.$inferSelect;
export type InsertBrandMention = z.infer<typeof insertBrandMentionSchema>;
export type BrandMention = typeof brandMentions.$inferSelect;
export type InsertPromptPortfolio = z.infer<typeof insertPromptPortfolioSchema>;
export type PromptPortfolio = typeof promptPortfolio.$inferSelect;
export type InsertCitationQuality = z.infer<typeof insertCitationQualitySchema>;
export type CitationQuality = typeof citationQuality.$inferSelect;
export type InsertBrandHallucination = z.infer<typeof insertBrandHallucinationSchema>;
export type BrandHallucination = typeof brandHallucinations.$inferSelect;
export type InsertBrandFactSheet = z.infer<typeof insertBrandFactSheetSchema>;
export type BrandFactSheet = typeof brandFactSheet.$inferSelect;
export type InsertMetricsHistory = z.infer<typeof insertMetricsHistorySchema>;
export type MetricsHistory = typeof metricsHistory.$inferSelect;
export type InsertAlertSettings = z.infer<typeof insertAlertSettingsSchema>;
export type AlertSettings = typeof alertSettings.$inferSelect;
export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type AlertHistory = typeof alertHistory.$inferSelect;
export type InsertAiSource = z.infer<typeof insertAiSourceSchema>;
export type AiSource = typeof aiSources.$inferSelect;
export type InsertAiTrafficSession = z.infer<typeof insertAiTrafficSessionSchema>;
export type AiTrafficSession = typeof aiTrafficSessions.$inferSelect;
export type InsertPromptTestRun = z.infer<typeof insertPromptTestRunSchema>;
export type PromptTestRun = typeof promptTestRuns.$inferSelect;
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type AgentTask = typeof agentTasks.$inferSelect;
export type InsertOutreachCampaign = z.infer<typeof insertOutreachCampaignSchema>;
export type OutreachCampaign = typeof outreachCampaigns.$inferSelect;
export type InsertPublicationTarget = z.infer<typeof insertPublicationTargetSchema>;
export type PublicationTarget = typeof publicationTargets.$inferSelect;
export type InsertOutreachEmail = z.infer<typeof insertOutreachEmailSchema>;
export type OutreachEmail = typeof outreachEmails.$inferSelect;
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationExecution = z.infer<typeof insertAutomationExecutionSchema>;
export type AutomationExecution = typeof automationExecutions.$inferSelect;

// Community Engagement - Reddit, Quora, forums
export const communityPosts = pgTable(
  "community_posts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    groupName: text("group_name").notNull(),
    groupUrl: text("group_url"),
    title: text("title"),
    content: text("content").notNull(),
    postUrl: text("post_url"),
    status: text("status").default("draft").notNull(),
    postType: text("post_type").default("answer"),
    keywords: text("keywords").array(),
    generatedByAi: integer("generated_by_ai").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    postedAt: timestamp("posted_at"),
  },
  (table) => [index("community_posts_brand_id_idx").on(table.brandId)],
);

export const insertCommunityPostSchema = createInsertSchema(communityPosts).omit({
  id: true,
  createdAt: true,
});

export type CommunityPost = typeof communityPosts.$inferSelect;
export type InsertCommunityPost = z.infer<typeof insertCommunityPostSchema>;
