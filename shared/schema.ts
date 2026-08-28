import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  bigint,
  timestamp,
  jsonb,
  numeric,
  index,
  uniqueIndex,
  unique,
  boolean,
  primaryKey,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { OutboxCommandPayload, OutboxStatus } from "./outbox";
import { brands } from "./schema/brands";
import { articles } from "./schema/content";
import { users } from "./schema/identity";

export * from "./schema/brands";
export * from "./schema/chatbot";
export * from "./schema/competitors";
export * from "./schema/content";
export * from "./schema/citations";
export * from "./schema/factAgent";
export * from "./schema/identity";
export * from "./schema/perception";
export * from "./schema/prompts";
export * from "./schema/siteHealth";
export * from "./schema/signals";

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

// llm_jobs (migration 0079, 2026-05-28).
//
// Generic substrate for any Vercel-Hobby-incompatible one-shot LLM
// call: keyword discovery, FAQ generation, hallucination detection,
// prompt generation, suggestion generation, etc. Pattern:
//   1. Route handler calls openai.responses.create({ background: true,
//      store: true }) - returns immediately with a response_id.
//   2. Row inserted here with status='running' + response_id.
//   3. Client polls GET /api/llm-jobs/:id; poll handler calls
//      openai.responses.retrieve(response_id) and on completion
//      dispatches by `kind` to the right finalize step (which parses
//      the output and persists the product-side rows: brand keywords,
//      faqs, etc.).
//   4. Cron drains stragglers so closed browsers don't orphan work.
//
// Distinct from content_generation_jobs (which has article-specific
// columns + per-row slice lock).
export const llmJobs = pgTable(
  "llm_jobs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending"),
    responseId: text("response_id"),
    providerRequest: jsonb("provider_request"),
    payload: jsonb("payload").notNull(),
    result: jsonb("result"),
    errorKind: text("error_kind"),
    errorMessage: text("error_message"),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`(NOW() + INTERVAL '24 hours')`),
  },
  (table) => [
    index("llm_jobs_active_idx").on(table.createdAt),
    index("llm_jobs_brand_idx").on(table.brandId, table.createdAt),
    index("llm_jobs_user_idx").on(table.userId, table.createdAt),
    index("llm_jobs_expires_idx").on(table.expiresAt),
  ],
);

export const insertLlmJobSchema = createInsertSchema(llmJobs).omit({
  id: true,
  createdAt: true,
});
export type LlmJob = typeof llmJobs.$inferSelect;
export type InsertLlmJob = z.infer<typeof insertLlmJobSchema>;

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

// Agent Tasks - Queue for automated GEO optimization tasks
export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(),
    taskTitle: text("task_title").notNull(),
    taskDescription: text("task_description"),
    priority: text("priority").notNull().default("medium"), // 'low', 'medium', 'high', 'urgent'
    status: text("status").notNull().default("queued"), // 'queued', 'in_progress', 'completed', 'failed', 'cancelled'
    assignedTo: text("assigned_to").default("agent"), // 'agent' for automated, or user ID for manual
    triggeredBy: text("triggered_by").notNull(), // 'manual', 'cron', 'chained'
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
    // Artifact link: set after the executor creates a downstream object so
    // the task row points to its result. Currently the only live writer is
    // the prompt_test handler, which sets artifactType = 'citation_run'.
    // CHECK constraint tightened to that single value in migration 0071.
    artifactType: text("artifact_type"),
    artifactId: varchar("artifact_id"),
    workflowRunId: varchar("workflow_run_id"),
    workflowStepKey: text("workflow_step_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("agent_tasks_brand_id_idx").on(table.brandId),
    index("agent_tasks_status_idx").on(table.status),
    index("agent_tasks_artifact_idx").on(table.artifactType, table.artifactId),
    index("agent_tasks_workflow_run_idx").on(table.workflowRunId),
  ],
);

export const insertAgentTaskSchema = createInsertSchema(agentTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type AgentTask = typeof agentTasks.$inferSelect;

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    workflowKey: text("workflow_key").notNull(),
    status: text("status").notNull().default("pending"),
    currentStepIndex: integer("current_step_index").default(0).notNull(),
    stepStates: jsonb("step_states")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    input: jsonb("input"),
    lastError: text("last_error"),
    triggeredBy: text("triggered_by").notNull().default("manual"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("workflow_runs_brand_status_idx").on(table.brandId, table.status),
    index("workflow_runs_user_idx").on(table.userId),
  ],
);

export const insertWorkflowRunSchema = createInsertSchema(workflowRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});
export type InsertWorkflowRun = z.infer<typeof insertWorkflowRunSchema>;
export type WorkflowRun = typeof workflowRuns.$inferSelect;

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

// ─── Email DLQ ───────────────────────────────────────────────────
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

// ─── API cost tracking ────────────────────────────────────────────
// Records every outbound LLM call so we can enforce per-user, per-tier
// daily/monthly token budgets. Migration in 0019_api_costs.sql.
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
    estCostCents: integer("est_cost_cents").default(0).notNull(),
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

// Transactional provider-command queue. Application transactions insert a
// command with their domain changes. A separate worker leases and executes it.
// The outbox remains private to internal worker access.
// Migration 0098 owns SQL-only RLS, grants, state checks, and private function.
export const outboxCommands = pgTable(
  "outbox_commands",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    kind: text("kind").$type<OutboxCommandPayload["kind"]>().notNull(),
    status: text("status").$type<OutboxStatus>().notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<OutboxCommandPayload>().notNull(),
    payloadFingerprint: text("payload_fingerprint").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    providerName: text("provider_name").notNull(),
    providerOperation: text("provider_operation").notNull(),
    providerResult: jsonb("provider_result"),
    providerReference: text("provider_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("outbox_commands_provider_idempotency_key_idx").on(
      table.providerName,
      table.idempotencyKey,
    ),
    index("outbox_commands_aggregate_idx").on(
      table.aggregateType,
      table.aggregateId,
      table.createdAt,
    ),
    index("outbox_commands_claimable_idx")
      .on(table.availableAt, table.createdAt)
      .where(sql`status = 'pending'`),
    index("outbox_commands_expired_lease_idx")
      .on(table.leaseExpiresAt, table.createdAt)
      .where(sql`status = 'processing'`),
    index("outbox_commands_kind_claimable_idx")
      .on(table.kind, table.availableAt, table.createdAt)
      .where(sql`status = 'pending'`),
    index("outbox_commands_kind_expired_lease_idx")
      .on(table.kind, table.leaseExpiresAt, table.createdAt)
      .where(sql`status = 'processing'`),
    index("outbox_commands_user_idx")
      .on(table.userId, table.createdAt)
      .where(sql`user_id is not null`),
    index("outbox_commands_brand_idx")
      .on(table.brandId, table.createdAt)
      .where(sql`brand_id is not null`),
  ],
);

export type OutboxCommand = typeof outboxCommands.$inferSelect;
export type InsertOutboxCommand = typeof outboxCommands.$inferInsert;

// ─── Audit log ────────────────────────────────────────────────────
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

// ─── Notification preferences ─────────────────────────────────────
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

// ─── Schema audits ────────────────────────────────────────────────
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

// ─── Mentions rebuild (0050) ──────────────────────────────────────
// scan_jobs: tracks each manual or cron-triggered mention scan per brand.
// source_health: tracks per-(brand,source) consecutive failures + backoff.
// sentiment_cache: content-hash-keyed cache for gpt-4o-mini sentiment calls.
// See docs/superpowers/specs/2026-05-05-mentions-rebuild-design.md §3.2.

export const scanJobs = pgTable("scan_jobs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  brandId: varchar("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(), // 'manual' | 'cron'
  status: text("status").notNull().default("queued"), // 'queued' | 'running' | 'complete' | 'failed'
  perSource: jsonb("per_source").notNull().default({}),
  totals: jsonb("totals").notNull().default({}),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ScanJob = typeof scanJobs.$inferSelect;
export type InsertScanJob = typeof scanJobs.$inferInsert;

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

// Pooler-safe mutual-exclusion leases. A transaction pooler can move a client
// between database backends, so session advisory locks do not have a reliable
// owner. Each lease operation is one atomic statement and stays pooler-safe.
export const jobLeases = pgTable(
  "job_leases",
  {
    leaseKey: text("lease_key").primaryKey(),
    holderToken: uuid("holder_token").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("job_leases_expires_at_idx").on(table.expiresAt)],
);
export type JobLease = typeof jobLeases.$inferSelect;

// ── Postgres token bucket for LLM concurrency ──────────────────────────
export const llmConcurrencySlots = pgTable(
  "llm_concurrency_slots",
  {
    slotId: text("slot_id").primaryKey(),
    provider: text("provider").notNull(),
    acquiredAt: timestamp("acquired_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    runId: varchar("run_id"),
  },
  (table) => [
    index("llm_concurrency_slots_provider_expires_idx").on(table.provider, table.expiresAt),
  ],
);
export type LlmConcurrencySlot = typeof llmConcurrencySlots.$inferSelect;

// ── Generic JSON config store ──────────────────────────────────────────
export const systemState = pgTable("system_state", {
  key: text("key").primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SystemState = typeof systemState.$inferSelect;
