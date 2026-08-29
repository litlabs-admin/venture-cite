import { sql } from "drizzle-orm";
import {
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
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { brands } from "./brands";
import { users } from "./identity";

export const analytics = pgTable("analytics", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  totalCitations: integer("total_citations").default(0).notNull(),
  weeklyGrowth: numeric("weekly_growth", { precision: 5, scale: 2 }).default("0").notNull(),
  avgPosition: numeric("avg_position", { precision: 5, scale: 2 }).default("0").notNull(),
  monthlyTraffic: integer("monthly_traffic").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAnalyticsSchema = createInsertSchema(analytics).omit({
  id: true,
  updatedAt: true,
});
export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;
export type Analytics = typeof analytics.$inferSelect;

// The legacy content_drafts table moved into `articles` with
// status='draft'). See migration 0033_content_unification.sql.

// Metrics History - Track metrics snapshots over time for trend analysis
export const metricsHistory = pgTable(
  "metrics_history",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    metricType: text("metric_type").notNull(),
    metricValue: numeric("metric_value", { precision: 10, scale: 2 }).notNull(),
    metricDetails: jsonb("metric_details"),
    snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
  },
  (table) => [index("metrics_history_brand_id_idx").on(table.brandId)],
);

export const insertMetricsHistorySchema = createInsertSchema(metricsHistory).omit({
  id: true,
  snapshotDate: true,
});
export type InsertMetricsHistory = z.infer<typeof insertMetricsHistorySchema>;
export type MetricsHistory = typeof metricsHistory.$inferSelect;

// Alert Settings - Configure notifications for metric changes
export const alertSettings = pgTable(
  "alert_settings",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
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

export const insertAlertSettingsSchema = createInsertSchema(alertSettings).omit({
  id: true,
  createdAt: true,
  lastTriggered: true,
});
export type InsertAlertSettings = z.infer<typeof insertAlertSettingsSchema>;
export type AlertSettings = typeof alertSettings.$inferSelect;

// Alert History - Track sent alerts
export const alertHistory = pgTable(
  "alert_history",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    alertSettingId: varchar("alert_setting_id").references(() => alertSettings.id, {
      onDelete: "cascade",
    }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    alertType: text("alert_type").notNull(),
    message: text("message").notNull(),
    details: jsonb("details"),
    sentVia: text("sent_via").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [index("alert_history_brand_id_idx").on(table.brandId)],
);

export const insertAlertHistorySchema = createInsertSchema(alertHistory).omit({
  id: true,
  sentAt: true,
});
export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type AlertHistory = typeof alertHistory.$inferSelect;

// Community Engagement - Reddit, Quora, forums
export const communityPosts = pgTable(
  "community_posts",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
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

// Email DLQ
// After the retry helper exhausts its attempts, the failed send lands
// here so we can inspect / requeue / surface in admin UI. Migration in
// 0020_email_status_and_failures.sql.
export const emailFailures = pgTable(
  "email_failures",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id"),
    template: text("template").notNull(),
    toAddress: text("to_address").notNull(),
    payloadJsonb: jsonb("payload_jsonb"),
    lastError: text("last_error"),
    retryCount: integer("retry_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("email_failures_created_idx").on(table.createdAt)],
);

export type EmailFailure = typeof emailFailures.$inferSelect;
export type InsertEmailFailure = typeof emailFailures.$inferInsert;

// API cost tracking
// Records every outbound LLM call so we can enforce per-user, per-tier
// daily/monthly token budgets. Migration in 0019_api_costs.sql.
//
// est_cost_cents is numeric, not integer (0122_api_costs_cost_precision.sql).
// A single call can cost a fraction of a cent; rounding that to the nearest
// whole cent before storage made every cheap, high-frequency call record
// exactly 0. The unit is still cents - a numeric row of 0.45 means
// 0.45 cents, not 0.45 dollars. Existing integer rows are unchanged in
// meaning (5 reads back as 5).
export const apiCosts = pgTable(
  "api_costs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    service: text("service").notNull(),
    model: text("model"),
    tokensIn: integer("tokens_in").default(0).notNull(),
    tokensOut: integer("tokens_out").default(0).notNull(),
    estCostCents: numeric("est_cost_cents", { precision: 12, scale: 6, mode: "number" })
      .default(0)
      .notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("api_costs_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("api_costs_idempotency_key_idx").on(table.idempotencyKey),
  ],
);

export type ApiCost = typeof apiCosts.$inferSelect;
export type InsertApiCost = typeof apiCosts.$inferInsert;

// Audit log
// Sensitive operations (delete, subscription change, admin action) write
// a row here via server/lib/audit.ts. Migration in 0017_audit_logs.sql.
// user_id is ON DELETE SET NULL - log rows survive account deletion.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeJsonb: jsonb("before_jsonb"),
    afterJsonb: jsonb("after_jsonb"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_user_idx").on(table.userId, table.createdAt),
    index("audit_logs_action_idx").on(table.action, table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// Notification preferences
// One row per (user, notification type). Missing row == enabled
// (the default). Non-dismissable categories (billing, security) are
// never persisted here; they're hardcoded at send sites. Migration
// in 0025_notification_preferences.sql.
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: varchar("user_id").notNull(),
    type: text("type").notNull(),
    emailEnabled: boolean("email_enabled").default(true).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.type] }),
    index("notification_preferences_user_idx").on(table.userId),
  ],
);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;

// Schema audits
// Cache of structured-data (JSON-LD / schema.org) audits for a given
// URL. Keyed by `urlHash` = sha256(url).slice(0,32) so we can dedupe
// + look up without indexing full URLs. Migration in
// 0030_schema_audits_and_article_version.sql.
export const schemaAudits = pgTable(
  "schema_audits",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    urlHash: text("url_hash").notNull(),
    url: text("url").notNull(),
    // Full audit result payload (detected schemas, raw JSON-LD, etc).
    // The `additionalTypes` array lives inside this jsonb as
    // `payload.additionalTypes`; the old top-level `additional_types`
    // sidecar column was dropped in migration 0080 - it duplicated
    // data already inside `schemas`.
    schemas: jsonb("schemas").notNull(),
    // Per-type completeness scores, e.g. { Article: 0.75, FAQPage: 0.4 }.
    completenessByType: jsonb("completeness_by_type"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("schema_audits_url_hash_idx").on(table.urlHash)],
);

export const insertSchemaAuditSchema = createInsertSchema(schemaAudits).omit({
  id: true,
  fetchedAt: true,
});
export type SchemaAudit = typeof schemaAudits.$inferSelect;
export type InsertSchemaAudit = z.infer<typeof insertSchemaAuditSchema>;

export const competitorFavicons = pgTable(
  "competitor_favicons",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    domain: text("domain").notNull(),
    iconUrl: text("icon_url"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("competitor_favicons_domain_idx").on(table.domain)],
);

export const insertCompetitorFaviconSchema = createInsertSchema(competitorFavicons).omit({
  id: true,
  fetchedAt: true,
});
export type CompetitorFavicon = typeof competitorFavicons.$inferSelect;
export type InsertCompetitorFavicon = z.infer<typeof insertCompetitorFaviconSchema>;

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

export const sentimentCache = pgTable("sentiment_cache", {
  contentHash: text("content_hash").primaryKey(),
  sentiment: text("sentiment").notNull(), // 'positive' | 'neutral' | 'negative'
  sentimentScore: numeric("sentiment_score", { precision: 3, scale: 2 }).notNull(),
  cachedAt: timestamp("cached_at").notNull().defaultNow(),
});
export type SentimentCache = typeof sentimentCache.$inferSelect;
export type InsertSentimentCache = typeof sentimentCache.$inferInsert;

export const tourEvents = pgTable("tour_events", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
  tourId: text("tour_id").notNull(),
  tourVersion: integer("tour_version").notNull(),
  stepId: text("step_id"),
  stepIndex: integer("step_index"),
  eventType: text("event_type").notNull(),
  triggerType: text("trigger_type"),
  dwellMs: integer("dwell_ms"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTourEventSchema = createInsertSchema(tourEvents).omit({
  serverReceivedAt: true,
});

export type TourEvent = typeof tourEvents.$inferSelect;
export type InsertTourEvent = z.infer<typeof insertTourEventSchema>;

// Generic JSON config store
export const systemState = pgTable("system_state", {
  key: text("key").primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SystemState = typeof systemState.$inferSelect;
