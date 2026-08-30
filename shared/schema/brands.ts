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
import { users } from "./identity";

export const brands = pgTable(
  "brands",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    companyName: text("company_name").notNull(),
    industry: text("industry").notNull(),
    factScrapeEnabled: boolean("fact_scrape_enabled").notNull().default(true),
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
    logoUrl: text("logo_url"),
    autopilotStatus: text("autopilot_status").default("idle"),
    autopilotStep: integer("autopilot_step").default(0),
    autopilotStartedAt: timestamp("autopilot_started_at"),
    autopilotCompletedAt: timestamp("autopilot_completed_at"),
    autopilotError: text("autopilot_error"),
    autopilotProgress: jsonb("autopilot_progress"),
    // Bounded retry state for the recovery sweep. 'idle' (autopilot never
    // wrote a status) and 'failed' (transient provider 429 / deadline abort)
    // are retryable, but only a fixed number of times - onboarding a brand
    // costs real provider spend, so a genuinely broken brand must stop, not
    // retry forever. See migration 0121.
    autopilotAttempts: integer("autopilot_attempts").default(0).notNull(),
    autopilotLastAttemptAt: timestamp("autopilot_last_attempt_at", { withTimezone: true }),
    autoCitationSchedule: text("auto_citation_schedule").default("off").notNull(), // off | weekly | biweekly | monthly
    autoCitationDay: integer("auto_citation_day").default(0).notNull(), // 0=Sun, 1=Mon, ... 6=Sat
    // UTC hour for the scheduled run and its active toggle.
    // (pause without losing the day/hour) + status of the most recent
    // scheduled run. See migration 0037_citation_schedule_v2.sql.
    autoCitationHour: integer("auto_citation_hour").default(9).notNull(),
    autoCitationActive: boolean("auto_citation_active").default(true).notNull(),
    lastAutoCitationAt: timestamp("last_auto_citation_at"),
    lastAutoCitationStatus: text("last_auto_citation_status"),
    // Optimistic-lock version. It increments on every write. The client
    // sends `expectedVersion` and the UPDATE matches `WHERE version = $`,
    // returning 409 on mismatch.
    version: integer("version").default(0).notNull(),
    // Soft-delete window. The DELETE handler sets these. The cron job
    // hard-deletes after deletion_scheduled_for elapses. Filters
    // (`deleted_at IS NULL`) keep deleted brands out of GET responses.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletionScheduledFor: timestamp("deletion_scheduled_for", { withTimezone: true }),
    // Mentions rebuild (0050): per-brand opt-in for daily auto-scan.
    // Default ON: the weekly mention-scan cron reads this flag, and every
    // other dashboard measurement fires on its own schedule. See
    // migrations/0090_monitor_mentions_default_on.sql.
    monitorMentions: boolean("monitor_mentions").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("brands_user_id_idx").on(table.userId)],
);

export const insertBrandSchema = createInsertSchema(brands).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Brand = typeof brands.$inferSelect;
