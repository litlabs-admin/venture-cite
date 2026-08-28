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
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { OutboxCommandPayload, OutboxStatus } from "../outbox";
import { brands } from "./brands";
import { users } from "./identity";

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
