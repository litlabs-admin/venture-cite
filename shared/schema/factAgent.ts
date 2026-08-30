import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { brands } from "./brands";

// ============================================================================
// Spec 2: Brand Fact Sheet redesign - scrape runs + pages + cost caps
// ============================================================================

// One row per scrape run. Slice-resumable via `status='slice_pending'`.
// Read by the SSE stream + the new diff view. See spec 2 §5.2.
export const brandFactScrapeRuns = pgTable(
  "brand_fact_scrape_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    triggeredBy: text("triggered_by").notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    lastAdvanceAt: timestamp("last_advance_at").notNull().defaultNow(),
    deadlineMs: bigint("deadline_ms", { mode: "number" }),
    pagesPlanned: integer("pages_planned").notNull().default(0),
    pagesFetched: integer("pages_fetched").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    factsExtracted: integer("facts_extracted").notNull().default(0),
    factsValidated: integer("facts_validated").notNull().default(0),
    factsRedacted: integer("facts_redacted").notNull().default(0),
    llmCostCents: integer("llm_cost_cents").notNull().default(0),
    llmCalls: integer("llm_calls").notNull().default(0),
    llmInputTokens: bigint("llm_input_tokens", { mode: "number" }).notNull().default(0),
    llmOutputTokens: bigint("llm_output_tokens", { mode: "number" }).notNull().default(0),
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),
    plan: jsonb("plan"),
    progress: jsonb("progress"),
    diagnostics: jsonb("diagnostics"),
    retryCount: integer("retry_count").notNull().default(0),
  },
  (table) => [
    index("brand_fact_scrape_runs_brand_started_idx").on(table.brandId, table.startedAt.desc()),
    index("brand_fact_scrape_runs_slice_pending_idx").on(table.lastAdvanceAt),
    // Spec 2 §4.9: at most one active run per brand. Partial unique index
    // mirrors migrations/0061_brand_fact_scrape_runs_uniq_active.sql.
    uniqueIndex("brand_fact_scrape_runs_one_active_per_brand_idx")
      .on(table.brandId)
      .where(sql`status IN ('pending','planning','fetching','extracting','slice_pending')`),
  ],
);

export const insertBrandFactScrapeRunSchema = createInsertSchema(brandFactScrapeRuns).omit({
  id: true,
  startedAt: true,
  lastAdvanceAt: true,
});
export type BrandFactScrapeRun = typeof brandFactScrapeRuns.$inferSelect;
export type InsertBrandFactScrapeRun = z.infer<typeof insertBrandFactScrapeRunSchema>;

// One row per page the agent attempted in a run. Drives the per-page UI panel.
export const brandFactScrapePages = pgTable(
  "brand_fact_scrape_pages",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: varchar("run_id")
      .notNull()
      .references(() => brandFactScrapeRuns.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    status: text("status").notNull().default("pending"),
    fetchedAt: timestamp("fetched_at"),
    bytes: integer("bytes"),
    statusCode: integer("status_code"),
    contentType: text("content_type"),
    lang: text("lang"),
    factCount: integer("fact_count").notNull().default(0),
    llmCostCents: integer("llm_cost_cents").notNull().default(0),
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),
    excerpt: text("excerpt"),
  },
  (table) => [index("brand_fact_scrape_pages_run_idx").on(table.runId)],
);

export const insertBrandFactScrapePageSchema = createInsertSchema(brandFactScrapePages).omit({
  id: true,
});
export type BrandFactScrapePage = typeof brandFactScrapePages.$inferSelect;
export type InsertBrandFactScrapePage = z.infer<typeof insertBrandFactScrapePageSchema>;

// Per-brand monthly LLM cost cap. Row created lazily on first scrape of month.
export const brandMonthlyCostCaps = pgTable(
  "brand_monthly_cost_caps",
  {
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    monthKey: text("month_key").notNull(),
    factScrapeCents: integer("fact_scrape_cents").notNull().default(0),
    monthlyCapCents: integer("monthly_cap_cents").notNull().default(500),
  },
  (table) => [
    primaryKey({ columns: [table.brandId, table.monthKey] }),
    index("brand_monthly_cost_caps_month_idx").on(table.monthKey),
  ],
);

export const insertBrandMonthlyCostCapSchema = createInsertSchema(brandMonthlyCostCaps);
export type BrandMonthlyCostCap = typeof brandMonthlyCostCaps.$inferSelect;
export type InsertBrandMonthlyCostCap = z.infer<typeof insertBrandMonthlyCostCapSchema>;

// Per-step telemetry for fact-sheet scrapes (migration 0076). One row
// per significant event during a run - sitemap probes, page fetches,
// LLM calls, fact drops, terminal status. The /admin/scrape/:runId
// inspector reads from this table to render the timeline.
//
// Intentionally lightweight: no FK to brandFactScrapeRuns so events
// survive run hard-deletes (we want post-mortem capability), and
// metadata is wide-open JSONB so new step types don't require
// migrations.
export const factScrapeEvents = pgTable(
  "fact_scrape_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: varchar("run_id").notNull(),
    brandId: varchar("brand_id").notNull(),
    stepName: text("step_name").notNull(),
    outcome: text("outcome").notNull().default("ok"),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("fact_scrape_events_run_created_idx").on(table.runId, table.createdAt),
    index("fact_scrape_events_brand_step_idx").on(table.brandId, table.stepName, table.createdAt),
    index("fact_scrape_events_created_idx").on(table.createdAt),
  ],
);
export const insertFactScrapeEventSchema = createInsertSchema(factScrapeEvents).omit({
  id: true,
  createdAt: true,
});
export type FactScrapeEvent = typeof factScrapeEvents.$inferSelect;
export type InsertFactScrapeEvent = z.infer<typeof insertFactScrapeEventSchema>;

// Brand Fact Sheet - Source of truth for hallucination checking
export const brandFactSheet = pgTable(
  "brand_fact_sheet",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    // Spec 2 §4.3: 8 universal domains
    domain: text("domain").notNull().default("identity"),
    // Spec 2 §4.3: free-form LLM-picked subcategory (was `factCategory`)
    subcategory: text("subcategory").notNull(),
    factKey: text("fact_key").notNull(),
    factValue: text("fact_value").notNull(),
    // Spec 2 §4.4: valueType discriminated union
    valueType: text("value_type").notNull().default("string"),
    valuePayload: jsonb("value_payload"),
    // Spec 2 §4.8: quality signal from agent extraction
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    // Spec 2 §4.6: 200-char snippet showing where the fact came from
    sourceExcerpt: text("source_excerpt"),
    sourceUrl: text("source_url"),
    source: text("source").notNull().default("manual"),
    // Spec 2 §4.6: diff resolution state
    dismissedAt: timestamp("dismissed_at"),
    acceptedAt: timestamp("accepted_at"),
    // Spec 2 §4.1: FK to the run that produced this row (null for source='user'/'manual')
    runId: varchar("run_id").references(() => brandFactScrapeRuns.id, { onDelete: "set null" }),
    lastVerified: timestamp("last_verified").notNull().defaultNow(),
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    metadata: jsonb("metadata"),
    disagreementCount: integer("disagreement_count").notNull().default(0),
    schemaVersion: integer("schema_version").notNull().default(1),
    // 2026-05-28 Phase 4 truth-table columns:
    //   - userOverridden: when true, no scrape may overwrite factValue.
    //     persistFacts.ts respects this flag.
    //   - verificationAttempts / lastVerificationAt / verificationStatus:
    //     used by the per-fact re-verification cron.
    userOverridden: boolean("user_overridden").notNull().default(false),
    verificationAttempts: integer("verification_attempts").notNull().default(0),
    lastVerificationAt: timestamp("last_verification_at", { withTimezone: true }),
    verificationStatus: text("verification_status").notNull().default("never"),
  },
  (table) => [
    index("brand_fact_sheet_brand_id_idx").on(table.brandId),
    index("brand_fact_sheet_run_id_idx").on(table.runId),
  ],
);

export const insertBrandFactSheetSchema = createInsertSchema(brandFactSheet).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastVerified: true,
  acceptedAt: true,
  dismissedAt: true,
});
export type InsertBrandFactSheet = z.infer<typeof insertBrandFactSheetSchema>;
export type BrandFactSheet = typeof brandFactSheet.$inferSelect;

// Cache for search-grounded LLM calls
export const factScrapeCache = pgTable(
  "fact_scrape_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    source: text("source").notNull(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    valueJson: jsonb("value_json").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    index("fact_scrape_cache_brand_id_idx").on(table.brandId),
    index("fact_scrape_cache_expires_at_idx").on(table.expiresAt),
  ],
);
export type FactScrapeCache = typeof factScrapeCache.$inferSelect;
export type InsertFactScrapeCache = typeof factScrapeCache.$inferInsert;

// Observability log per run and source
export const factScrapeLogs = pgTable(
  "fact_scrape_logs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: varchar("run_id")
      .notNull()
      .references(() => brandFactScrapeRuns.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    status: text("status").notNull(),
    factCount: integer("fact_count").notNull().default(0),
    latencyMs: integer("latency_ms"),
    providerLatencyMs: integer("provider_latency_ms"),
    errorKind: text("error_kind"),
    diagnostics: jsonb("diagnostics"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("fact_scrape_logs_run_id_idx").on(table.runId),
    index("fact_scrape_logs_created_at_idx").on(table.createdAt),
  ],
);
export type FactScrapeLog = typeof factScrapeLogs.$inferSelect;
export type InsertFactScrapeLog = typeof factScrapeLogs.$inferInsert;
