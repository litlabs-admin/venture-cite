import { sql, type SQLWrapper } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { TASK_TYPES } from "../work";
import { brands } from "./brands";
import { users } from "./identity";

const TASK_STATES = [
  "suggested",
  "accepted",
  "in_progress",
  "submitted",
  "verified",
  "waiting_for_observation",
  "dismissed",
  "not_applicable",
  "reopened",
] as const;

const EVIDENCE_KINDS = [
  "source",
  "artifact",
  "measurement",
  "fault_repair",
  "content_change",
  "authored_work",
  "confirmation",
  "decision",
  "experiment",
] as const;

const EVIDENCE_ROLES = ["trigger", "submission", "verification", "result"] as const;

const EVIDENCE_STATUSES = ["submitted", "verified", "rejected", "unavailable", "failed"] as const;

const AWARD_STATUSES = ["awarded", "reversed", "adjustment"] as const;

const CAPABILITY_MILESTONES = [
  "goal_selected_and_queue_reviewed",
  "baseline_ready",
  "evidenced_changes_complete",
  "decision_recorded",
  "multi_period_maintenance",
] as const;

const CAPABILITY_EVENT_KINDS = ["achieved", "reversed"] as const;

const OUTCOME_DECISIONS = ["improvement", "decline", "no_material_change", "unavailable"] as const;

const BUSINESS_RESULT_KINDS = [
  "referral_visit",
  "inquiry",
  "qualified_lead",
  "retained_customer",
] as const;

const BUSINESS_RESULT_CONFIRMATION_STATES = ["unconfirmed", "confirmed", "rejected"] as const;

const taskTypeValues = sql.join(
  TASK_TYPES.map((value) => sql`${value}`),
  sql`, `,
);
const taskStateValues = sql.join(
  TASK_STATES.map((value) => sql`${value}`),
  sql`, `,
);
const taskTypeCheck = (column: SQLWrapper) => sql`${column} in (${taskTypeValues})`;
const taskStateCheck = (column: SQLWrapper) => sql`${column} in (${taskStateValues})`;

export const brandGoals = pgTable(
  "brand_goals",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalKey: text("goal_key").notNull(),
    goalKind: text("goal_kind").notNull().default("visibility_improvement"),
    title: text("title").notNull(),
    statement: text("statement").notNull(),
    desiredOutcome: text("desired_outcome").notNull(),
    ownerId: varchar("owner_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("brand_goals_brand_key_uq").on(table.brandId, table.goalKey),
    unique("brand_goals_id_brand_user_uq").on(table.id, table.brandId, table.userId),
    index("brand_goals_brand_id_idx").on(table.brandId),
    index("brand_goals_brand_status_idx").on(table.brandId, table.status),
    index("brand_goals_user_id_idx").on(table.userId),
    check("brand_goals_status_check", sql`status in ('active', 'completed', 'archived')`),
    check("brand_goals_revision_check", sql`revision >= 0`),
  ],
);
export type BrandGoal = typeof brandGoals.$inferSelect;
export type InsertBrandGoal = typeof brandGoals.$inferInsert;

export const workTasks = pgTable(
  "work_tasks",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: varchar("goal_id"),
    taskKey: text("task_key").notNull(),
    taskVersion: integer("task_version").notNull().default(1),
    taskType: text("task_type").notNull(),
    state: text("state").notNull().default("suggested"),
    ruleVersion: integer("rule_version").notNull().default(1),
    revision: integer("revision").notNull().default(0),
    title: text("title").notNull(),
    desiredResult: text("desired_result").notNull(),
    buyerNeed: text("buyer_need"),
    recommendedChange: text("recommended_change").notNull(),
    reason: text("reason"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    effort: integer("effort"),
    points: integer("points").notNull().default(0),
    ownerId: varchar("owner_id").references(() => users.id, { onDelete: "set null" }),
    completionRule: jsonb("completion_rule")
      .notNull()
      .default(sql`'{}'::jsonb`),
    verificationMethod: jsonb("verification_method"),
    measurementScope: jsonb("measurement_scope"),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    sourceRecommendationId: varchar("source_recommendation_id"),
    blockedReason: text("blocked_reason"),
    dismissalReason: text("dismissal_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("work_tasks_brand_key_version_uq").on(table.brandId, table.taskKey, table.taskVersion),
    unique("work_tasks_id_brand_user_version_uq").on(
      table.id,
      table.brandId,
      table.userId,
      table.taskVersion,
    ),
    foreignKey({
      columns: [table.goalId, table.brandId, table.userId],
      foreignColumns: [brandGoals.id, brandGoals.brandId, brandGoals.userId],
      name: "work_tasks_goal_brand_fk",
    }).onDelete("no action"),
    index("work_tasks_brand_id_idx").on(table.brandId),
    index("work_tasks_brand_state_updated_idx").on(table.brandId, table.state, table.updatedAt),
    index("work_tasks_user_id_idx").on(table.userId),
    index("work_tasks_owner_state_idx").on(table.ownerId, table.state),
    index("work_tasks_next_check_idx").on(table.brandId, table.nextCheckAt),
    check("work_tasks_task_type_check", taskTypeCheck(table.taskType)),
    check("work_tasks_state_check", taskStateCheck(table.state)),
    check("work_tasks_version_check", sql`task_version > 0`),
    check("work_tasks_rule_version_check", sql`rule_version > 0`),
    check("work_tasks_revision_check", sql`revision >= 0`),
    check("work_tasks_confidence_check", sql`confidence is null or confidence between 0 and 1`),
    check("work_tasks_effort_check", sql`effort is null or effort >= 0`),
    check("work_tasks_points_check", sql`points >= 0`),
  ],
);
export type WorkTask = typeof workTasks.$inferSelect;
export type InsertWorkTask = typeof workTasks.$inferInsert;

export const workTaskEvidence = pgTable(
  "work_task_evidence",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    taskId: varchar("task_id").notNull(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskVersion: integer("task_version").notNull(),
    evidenceVersion: integer("evidence_version").notNull().default(1),
    role: text("role").notNull(),
    kind: text("kind").notNull(),
    sourceTable: text("source_table"),
    sourceId: varchar("source_id"),
    sourceUrl: text("source_url"),
    finalUrl: text("final_url"),
    canonicalUrl: text("canonical_url"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    contentVersion: text("content_version"),
    provider: text("provider"),
    promptId: varchar("prompt_id"),
    promptVersion: text("prompt_version"),
    promptScope: jsonb("prompt_scope"),
    excerpt: text("excerpt"),
    structuredFinding: jsonb("structured_finding"),
    status: text("status").notNull().default("submitted"),
    extractorVersion: text("extractor_version"),
    submittedBy: varchar("submitted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.taskId, table.brandId, table.userId, table.taskVersion],
      foreignColumns: [workTasks.id, workTasks.brandId, workTasks.userId, workTasks.taskVersion],
      name: "work_task_evidence_task_scope_fk",
    }).onDelete("cascade"),
    index("work_task_evidence_brand_id_idx").on(table.brandId),
    index("work_task_evidence_brand_task_role_idx").on(table.brandId, table.taskId, table.role),
    index("work_task_evidence_task_version_idx").on(table.taskId, table.taskVersion),
    index("work_task_evidence_brand_created_idx").on(table.brandId, table.createdAt.desc()),
    index("work_task_evidence_user_id_idx").on(table.userId),
    check(
      "work_task_evidence_role_check",
      sql`role in (${sql.join(
        EVIDENCE_ROLES.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      "work_task_evidence_kind_check",
      sql`kind in (${sql.join(
        EVIDENCE_KINDS.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      "work_task_evidence_status_check",
      sql`status in (${sql.join(
        EVIDENCE_STATUSES.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check("work_task_evidence_version_check", sql`task_version > 0 and evidence_version > 0`),
  ],
);
export type WorkTaskEvidence = typeof workTaskEvidence.$inferSelect;
export type InsertWorkTaskEvidence = typeof workTaskEvidence.$inferInsert;

export const workTaskEvents = pgTable(
  "work_task_events",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    taskId: varchar("task_id").notNull(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskVersion: integer("task_version").notNull(),
    revision: integer("revision").notNull(),
    priorState: text("prior_state"),
    nextState: text("next_state").notNull(),
    actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: text("actor_kind").notNull().default("user"),
    reason: text("reason"),
    verificationMethod: jsonb("verification_method"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.taskId, table.brandId, table.userId, table.taskVersion],
      foreignColumns: [workTasks.id, workTasks.brandId, workTasks.userId, workTasks.taskVersion],
      name: "work_task_events_task_scope_fk",
    }).onDelete("cascade"),
    index("work_task_events_brand_id_idx").on(table.brandId),
    index("work_task_events_task_created_idx").on(table.taskId, table.createdAt.desc()),
    index("work_task_events_brand_created_idx").on(table.brandId, table.createdAt.desc()),
    index("work_task_events_actor_created_idx").on(table.actorId, table.createdAt.desc()),
    check(
      "work_task_events_prior_state_check",
      sql`prior_state is null or ${taskStateCheck(sql`prior_state`)}`,
    ),
    check("work_task_events_next_state_check", taskStateCheck(sql`next_state`)),
    check("work_task_events_actor_kind_check", sql`actor_kind in ('user', 'system')`),
    check("work_task_events_version_check", sql`task_version > 0 and revision >= 0`),
  ],
);
export type WorkTaskEvent = typeof workTaskEvents.$inferSelect;
export type InsertWorkTaskEvent = typeof workTaskEvents.$inferInsert;

export const workAwardEvents = pgTable(
  "work_award_events",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    taskId: varchar("task_id").notNull(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskVersion: integer("task_version").notNull(),
    cycleKey: text("cycle_key").notNull(),
    awardKey: text("award_key").notNull(),
    points: integer("points").notNull(),
    ruleVersion: integer("rule_version").notNull(),
    evidenceVersion: integer("evidence_version").notNull(),
    actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
    verificationMethod: jsonb("verification_method").notNull(),
    reason: text("reason").notNull(),
    awardStatus: text("award_status").notNull().default("awarded"),
    reversalReference: varchar("reversal_reference"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.taskId, table.brandId, table.userId, table.taskVersion],
      foreignColumns: [workTasks.id, workTasks.brandId, workTasks.userId, workTasks.taskVersion],
      name: "work_award_events_task_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.reversalReference,
        table.brandId,
        table.userId,
        table.taskId,
        table.taskVersion,
      ],
      foreignColumns: [table.id, table.brandId, table.userId, table.taskId, table.taskVersion],
      name: "work_award_events_reversal_reference_fk",
    }),
    unique("work_award_events_id_brand_user_task_version_uq").on(
      table.id,
      table.brandId,
      table.userId,
      table.taskId,
      table.taskVersion,
    ),
    uniqueIndex("work_award_events_reversal_reference_uq")
      .on(table.reversalReference)
      .where(sql`reversal_reference is not null`),
    unique("work_award_events_award_key_uq").on(table.awardKey),
    index("work_award_events_brand_id_idx").on(table.brandId),
    index("work_award_events_brand_occurred_idx").on(table.brandId, table.occurredAt.desc()),
    index("work_award_events_user_created_idx").on(table.userId, table.createdAt.desc()),
    index("work_award_events_actor_created_idx").on(table.actorId, table.createdAt.desc()),
    check(
      "work_award_events_status_check",
      sql`award_status in (${sql.join(
        AWARD_STATUSES.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      "work_award_events_points_check",
      sql`(
        (award_status = 'awarded' and points > 0 and reversal_reference is null)
        or (award_status = 'reversed' and points < 0 and reversal_reference is not null)
        or (award_status = 'adjustment' and points <> 0 and reversal_reference is null)
      )`,
    ),
    check(
      "work_award_events_reversal_reference_check",
      sql`reversal_reference is null or reversal_reference <> id`,
    ),
    check(
      "work_award_events_version_check",
      sql`task_version > 0 and rule_version > 0 and evidence_version > 0`,
    ),
  ],
);
export type WorkAwardEvent = typeof workAwardEvents.$inferSelect;
export type InsertWorkAwardEvent = typeof workAwardEvents.$inferInsert;

export const brandCapabilityEvents = pgTable(
  "brand_capability_events",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    milestone: text("milestone").notNull(),
    eventKey: text("event_key").notNull(),
    eventKind: text("event_kind").notNull().default("achieved"),
    taskId: varchar("task_id"),
    taskVersion: integer("task_version"),
    evidenceVersion: integer("evidence_version"),
    actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.taskId, table.brandId, table.userId, table.taskVersion],
      foreignColumns: [workTasks.id, workTasks.brandId, workTasks.userId, workTasks.taskVersion],
      name: "brand_capability_events_task_scope_fk",
    }).onDelete("cascade"),
    unique("brand_capability_events_brand_event_key_uq").on(table.brandId, table.eventKey),
    index("brand_capability_events_brand_id_idx").on(table.brandId),
    index("brand_capability_events_brand_created_idx").on(table.brandId, table.occurredAt.desc()),
    index("brand_capability_events_user_created_idx").on(table.userId, table.occurredAt.desc()),
    check(
      "brand_capability_events_milestone_check",
      sql`milestone in (${sql.join(
        CAPABILITY_MILESTONES.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      "brand_capability_events_kind_check",
      sql`event_kind in (${sql.join(
        CAPABILITY_EVENT_KINDS.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check("brand_capability_events_version_check", sql`task_version is null or task_version > 0`),
    check(
      "brand_capability_events_evidence_version_check",
      sql`evidence_version is null or evidence_version > 0`,
    ),
    check(
      "brand_capability_events_task_version_required_check",
      sql`(task_id is null and task_version is null) or (task_id is not null and task_version is not null)`,
    ),
  ],
);
export type BrandCapabilityEvent = typeof brandCapabilityEvents.$inferSelect;
export type InsertBrandCapabilityEvent = typeof brandCapabilityEvents.$inferInsert;

export const businessResultEvents = pgTable(
  "business_result_events",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    eventKind: text("event_kind").notNull(),
    value: numeric("value", { precision: 18, scale: 6 }),
    valueUnit: text("value_unit"),
    source: text("source").notNull(),
    attributionMethod: text("attribution_method").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    confirmationState: text("confirmation_state").notNull().default("unconfirmed"),
    confirmedBy: varchar("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("business_result_events_brand_event_key_uq").on(table.brandId, table.eventKey),
    unique("business_result_events_id_brand_user_uq").on(table.id, table.brandId, table.userId),
    index("business_result_events_brand_id_idx").on(table.brandId),
    index("business_result_events_brand_occurred_idx").on(table.brandId, table.occurredAt.desc()),
    index("business_result_events_user_created_idx").on(table.userId, table.createdAt.desc()),
    check(
      "business_result_events_kind_check",
      sql`event_kind in (${sql.join(
        BUSINESS_RESULT_KINDS.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      "business_result_events_confidence_check",
      sql`confidence is null or confidence between 0 and 1`,
    ),
    check(
      "business_result_events_confirmation_check",
      sql`confirmation_state in (${sql.join(
        BUSINESS_RESULT_CONFIRMATION_STATES.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
  ],
);
export type BusinessResultEvent = typeof businessResultEvents.$inferSelect;
export type InsertBusinessResultEvent = typeof businessResultEvents.$inferInsert;

export const workOutcomeReviews = pgTable(
  "work_outcome_reviews",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    taskId: varchar("task_id").notNull(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskVersion: integer("task_version").notNull(),
    cycleKey: text("cycle_key").notNull(),
    measurementScope: jsonb("measurement_scope").notNull(),
    decision: text("decision").notNull(),
    notes: text("notes"),
    visibilityEvidenceVersion: integer("visibility_evidence_version"),
    businessResultEventId: varchar("business_result_event_id"),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.taskId, table.brandId, table.userId, table.taskVersion],
      foreignColumns: [workTasks.id, workTasks.brandId, workTasks.userId, workTasks.taskVersion],
      name: "work_outcome_reviews_task_scope_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.businessResultEventId, table.brandId, table.userId],
      foreignColumns: [
        businessResultEvents.id,
        businessResultEvents.brandId,
        businessResultEvents.userId,
      ],
      name: "work_outcome_reviews_business_result_scope_fk",
    }).onDelete("no action"),
    index("work_outcome_reviews_brand_id_idx").on(table.brandId),
    index("work_outcome_reviews_task_cycle_idx").on(table.taskId, table.cycleKey),
    uniqueIndex("work_outcome_reviews_task_cycle_key").on(
      table.taskId,
      table.taskVersion,
      table.cycleKey,
    ),
    index("work_outcome_reviews_brand_created_idx").on(table.brandId, table.createdAt.desc()),
    index("work_outcome_reviews_user_created_idx").on(table.userId, table.createdAt.desc()),
    check(
      "work_outcome_reviews_decision_check",
      sql`decision in (${sql.join(
        OUTCOME_DECISIONS.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      "work_outcome_reviews_version_check",
      sql`task_version > 0 and (visibility_evidence_version is null or visibility_evidence_version > 0)`,
    ),
  ],
);
export type WorkOutcomeReview = typeof workOutcomeReviews.$inferSelect;
export type InsertWorkOutcomeReview = typeof workOutcomeReviews.$inferInsert;
