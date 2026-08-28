import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
// ── Brand perception scoring (migration 0088) ──────────────────────────
// Mirrors migrations/0088_brand_perception_runs.sql exactly. Every axis
// column is nullable - a judge that can't assess an axis from the
// available evidence records NULL, never a middling default.
export const brandPerceptionRuns = pgTable(
  "brand_perception_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    // numeric(4,1): the reference reports one decimal of precision
    // (e.g. 66.6); INTEGER silently rounded that away. Drizzle returns
    // numeric columns as strings - callers MUST convert to number before
    // serialising (see serializePerceptionRun in server/routes/dashboard.ts).
    trust: numeric("trust", { precision: 4, scale: 1 }),
    quality: numeric("quality", { precision: 4, scale: 1 }),
    value: numeric("value", { precision: 4, scale: 1 }),
    market: numeric("market", { precision: 4, scale: 1 }),
    innovation: numeric("innovation", { precision: 4, scale: 1 }),
    overall: numeric("overall", { precision: 4, scale: 1 }),
    praised: text("praised")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    questioned: text("questioned")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    evidenceCount: integer("evidence_count").notNull().default(0),
    // Migration 0115. The snippets that produced the score, so the number is
    // auditable instead of asserted - [{text, platform}], capped application
    // side. Null on rows written before the column existed; the UI shows the
    // score without the evidence panel for those rather than inventing quotes.
    evidence: jsonb("evidence"),
    // Which platforms contributed evidence, so the UI can say how broadly the
    // score is backed rather than implying all six agreed.
    evidencePlatforms: text("evidence_platforms").array(),
    // Why an axis came back null, keyed by axis name. An unjudged axis is a
    // real result ("no answer discussed pricing"), not a rendering gap.
    axisNotes: jsonb("axis_notes"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brand_perception_runs_brand_created_idx").on(table.brandId, table.createdAt.desc()),
  ],
);
export type BrandPerceptionRun = typeof brandPerceptionRuns.$inferSelect;
export type InsertBrandPerceptionRun = typeof brandPerceptionRuns.$inferInsert;

// ── Perception probes (migration 0116) ─────────────────────────────────
// Mirrors migrations/0116_perception_probes.sql exactly.
//
// brandPerceptionRuns above INFERS perception from the answers to citation
// prompts - text that is not about the brand, which is why `value` was null on
// nearly every run (a "best agencies for X" answer rarely discusses pricing).
// These two tables back the opposite approach: ASK each engine five
// purpose-written questions, one per axis, and score each engine's own answers
// separately. Shares no inputs with the derived score; both are kept because
// they answer different questions.
export const brandPerceptionProbeRuns = pgTable(
  "brand_perception_probe_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    // pending | running | succeeded | partial | failed. 'partial' is a real
    // outcome, not a failure mode: one engine timing out must not throw away
    // the five that answered.
    status: text("status").notNull().default("pending"),
    probesTotal: integer("probes_total").notNull().default(0),
    probesDone: integer("probes_done").notNull().default(0),
    triggeredBy: text("triggered_by").notNull().default("manual"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("brand_perception_probe_runs_brand_id_idx").on(table.brandId),
    index("brand_perception_probe_runs_started_at_idx").on(table.startedAt.desc()),
  ],
);

export type BrandPerceptionProbeRun = typeof brandPerceptionProbeRuns.$inferSelect;

export const brandPerceptionProbes = pgTable(
  "brand_perception_probes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => brandPerceptionProbeRuns.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    axis: text("axis").notNull(),
    // The exact question asked, stored per row rather than rebuilt from a
    // template at read time - if the wording is tuned later, an old row must
    // still show what was actually asked to produce its score.
    question: text("question").notNull(),
    // pending | asked | scored | failed
    status: text("status").notNull().default("pending"),
    answer: text("answer"),
    sources: jsonb("sources"),
    score: numeric("score", { precision: 4, scale: 1 }),
    // The engine said it had no information about this brand. Distinct from a
    // failed call and from a low score - "nobody has heard of you" and "people
    // think poorly of you" are opposite findings, and a DB CHECK makes the
    // "confident score from an admitted non-answer" state unstorable.
    noInformation: boolean("no_information").notNull().default(false),
    note: text("note"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("brand_perception_probes_run_id_idx").on(table.runId),
    index("brand_perception_probes_run_status_idx").on(table.runId, table.status),
    index("brand_perception_probes_brand_id_idx").on(table.brandId),
    unique("brand_perception_probes_unique_cell").on(table.runId, table.platform, table.axis),
  ],
);
export type BrandPerceptionProbe = typeof brandPerceptionProbes.$inferSelect;
