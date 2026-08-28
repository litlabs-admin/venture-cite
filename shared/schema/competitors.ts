import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { brands } from "./brands";

export const competitors = pgTable(
  "competitors",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    industry: text("industry"),
    description: text("description"),
    // Shares semantics with brands.nameVariations: extra surface forms
    // the detection matcher should treat as equivalent. LLM-extracted
    // surface forms get auto-appended; users can edit in the UI.
    nameVariations: text("name_variations")
      .array()
      .default(sql`ARRAY[]::text[]`),
    discoveredBy: text("discovered_by").default("manual").notNull(), // "manual" | "ai" | "citation_mining" | "scheduler"
    // Phase 6: curated "core" set (manual adds + AI-inferred direct
    // competitors) vs a broader "discovered" pool (citation-mined / scheduler).
    // relevanceScore (0-100, null for manual) ranks the discovered pool.
    tier: text("tier").default("discovered").notNull(), // "core" | "discovered"
    relevanceScore: integer("relevance_score"),
    // Soft delete + ignore tombstone. `deletedAt` hides from lists;
    // `isIgnored=1` additionally blocks re-discovery in cron.
    deletedAt: timestamp("deleted_at"),
    isIgnored: integer("is_ignored").default(0).notNull(),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("competitors_brand_id_idx").on(table.brandId),
    // Unique index is maintained via migration 0026 using lower(name) +
    // lower(coalesce(domain,'')); Drizzle cannot express the expression here.
  ],
);

export const insertCompetitorSchema = createInsertSchema(competitors).omit({
  id: true,
  createdAt: true,
});
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = typeof competitors.$inferSelect;

// Per-run, per-prompt competitor citation detail. Mirrors geo_rankings so
// competitors are tracked with the same fidelity as the brand - one row
// per (competitor × run × prompt × platform), containing whether the
// competitor was cited, its rank, relevance, and a snippet of the
// mentioning response. Powers the competitor leaderboard, drill-downs
// ("which prompts cited HubSpot on Claude?"), and share-of-voice.
export const competitorGeoRankings = pgTable(
  "competitor_geo_rankings",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    competitorId: varchar("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    runId: varchar("run_id").notNull(),
    brandPromptId: varchar("brand_prompt_id").notNull(),
    aiPlatform: text("ai_platform").notNull(),
    isCited: integer("is_cited").default(0).notNull(),
    rank: integer("rank"),
    relevanceScore: integer("relevance_score"),
    citationContext: text("citation_context"),
    citingOutletUrl: text("citing_outlet_url"),
    sentiment: text("sentiment"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (table) => [
    index("cgr_competitor_idx").on(table.competitorId),
    index("cgr_run_idx").on(table.runId),
    index("cgr_brand_prompt_idx").on(table.brandPromptId),
    index("cgr_competitor_id_checked_at_idx").on(table.competitorId, table.checkedAt.desc()),
    index("cgr_competitor_cited_checked_at_idx")
      .on(table.competitorId, table.checkedAt.desc())
      .where(sql`is_cited = 1`),
  ],
);

export const insertCompetitorGeoRankingSchema = createInsertSchema(competitorGeoRankings).omit({
  id: true,
  checkedAt: true,
});
export type InsertCompetitorGeoRanking = z.infer<typeof insertCompetitorGeoRankingSchema>;
export type CompetitorGeoRanking = typeof competitorGeoRankings.$inferSelect;

export const competitorCitationSnapshots = pgTable(
  "competitor_citation_snapshots",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    competitorId: varchar("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    aiPlatform: text("ai_platform").notNull(),
    citationCount: integer("citation_count").default(0).notNull(),
    snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
    // Correlates a snapshot row to the citation run that produced it.
    // Null for legacy rows. Unique (competitor_id, ai_platform, run_id)
    // enforced via migration 0026 (partial index where run_id IS NOT NULL).
    runId: varchar("run_id"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("competitor_citation_snapshots_competitor_id_idx").on(table.competitorId),
    index("cc_snapshots_run_id_idx").on(table.runId),
  ],
);

export const insertCompetitorCitationSnapshotSchema = createInsertSchema(
  competitorCitationSnapshots,
).omit({
  id: true,
  snapshotDate: true,
});
export type InsertCompetitorCitationSnapshot = z.infer<
  typeof insertCompetitorCitationSnapshotSchema
>;
export type CompetitorCitationSnapshot = typeof competitorCitationSnapshots.$inferSelect;
