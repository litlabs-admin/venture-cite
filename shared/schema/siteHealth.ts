import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { brandFactScrapeRuns } from "./factAgent";
import { users } from "./identity";

// ── Site health scan history (migration 0094) ──────────────────────────
// Mirrors migrations/0094_site_health_scan_history.sql exactly. One row per
// COMPLETED fact-scrape run (see server/lib/siteHealthHistory.ts), never
// one per dashboard page load - a cache hit must never fabricate a point.
export const siteHealthScanHistory = pgTable(
  "site_health_scan_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    // brand_fact_scrape_runs.id is varchar (see its own definition above),
    // not a native uuid column - matched here, not "uuid", or the FK fails.
    runId: varchar("run_id").references(() => brandFactScrapeRuns.id, { onDelete: "set null" }),
    score: integer("score"),
    pagesCrawled: integer("pages_crawled"),
    pagesFailed: integer("pages_failed"),
    issuesCritical: integer("issues_critical").notNull().default(0),
    issuesHigh: integer("issues_high").notNull().default(0),
    issuesMedium: integer("issues_medium").notNull().default(0),
    issuesLow: integer("issues_low").notNull().default(0),
    discovery: jsonb("discovery"),
    crawlers: jsonb("crawlers"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("site_health_scan_history_brand_created_idx").on(table.brandId, table.createdAt.desc()),
  ],
);
export type SiteHealthScanHistoryRow = typeof siteHealthScanHistory.$inferSelect;
export type InsertSiteHealthScanHistoryRow = typeof siteHealthScanHistory.$inferInsert;

// ── Site health finding status (migration 0095) ────────────────────────
// One row per (brand, finding id) the user has touched via "Mark in
// progress" / "Ignore" / "Mark fixed" - untouched findings have no row,
// never a fabricated default. finding_id is the stable check-type id
// (e.g. "missing-robots-txt"), so status survives a rescan.
export const siteHealthFindingStatus = pgTable(
  "site_health_finding_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    findingId: text("finding_id").notNull(),
    status: text("status").notNull().default("in_progress"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("site_health_finding_status_brand_idx").on(table.brandId),
    uniqueIndex("site_health_finding_status_brand_finding_uq").on(table.brandId, table.findingId),
  ],
);
export type SiteHealthFindingStatusRow = typeof siteHealthFindingStatus.$inferSelect;
export type InsertSiteHealthFindingStatusRow = typeof siteHealthFindingStatus.$inferInsert;
