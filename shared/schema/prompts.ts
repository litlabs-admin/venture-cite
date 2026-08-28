import { sql } from "drizzle-orm";
import {
  boolean,
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
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { brands } from "./brands";

// Tracks each batch of prompts generated for a brand. Enables prompt
// versioning so users can see which prompts were used in historical runs.
export const promptGenerations = pgTable(
  "prompt_generations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    generationNumber: integer("generation_number").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("prompt_generations_brand_id_idx").on(table.brandId)],
);

export const insertPromptGenerationSchema = createInsertSchema(promptGenerations).omit({
  id: true,
  createdAt: true,
});
export type PromptGeneration = typeof promptGenerations.$inferSelect;
export type InsertPromptGeneration = z.infer<typeof insertPromptGenerationSchema>;

export const brandPrompts = pgTable(
  "brand_prompts",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    generationId: varchar("generation_id").references(() => promptGenerations.id, {
      onDelete: "set null",
    }),
    prompt: text("prompt").notNull(),
    rationale: text("rationale"),
    orderIndex: integer("order_index").default(0).notNull(),
    isActive: integer("is_active").default(1).notNull(), // legacy - use `status` instead
    status: text("status").default("tracked").notNull(), // "tracked" | "suggested" | "archived"
    // Richer classification promoted from the deprecated prompt_portfolio
    // table so every tracked prompt carries funnel + category dimensions.
    category: text("category"),
    funnelStage: text("funnel_stage"), // "TOFU" | "MOFU" | "BOFU"
    region: text("region").default("global").notNull(),
    // ON/OFF toggle (migration 0096). Orthogonal to `status` - a paused prompt
    // is still "tracked" (still counts against TRACKED_PROMPTS_CAP, still
    // shows in the tracked list) but is skipped by citationChecker.ts's next
    // run. Not a new status value: archiving still means "out of the tracked
    // set entirely", pausing means "tracked but temporarily not being asked".
    paused: boolean("paused").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("brand_prompts_brand_id_idx").on(table.brandId),
    index("brand_prompts_generation_id_idx").on(table.generationId),
  ],
);

export const insertBrandPromptSchema = createInsertSchema(brandPrompts).omit({
  id: true,
  createdAt: true,
});
export type BrandPrompt = typeof brandPrompts.$inferSelect;
export type InsertBrandPrompt = z.infer<typeof insertBrandPromptSchema>;

// ── Prompt tags (migration 0096) ────────────────────────────────────────
// Real entity + join, not a text[] column on brand_prompts - the Tags tab
// renames/recolors/deletes a tag across every prompt that uses it, which a
// bare array column can't do without rewriting every row.
export const promptTags = pgTable(
  "prompt_tags",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Null renders a neutral vc-muted chip rather than a fabricated color.
    color: text("color"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("prompt_tags_brand_id_idx").on(table.brandId),
    uniqueIndex("prompt_tags_brand_name_uq").on(table.brandId, sql`lower(${table.name})`),
  ],
);
export type PromptTag = typeof promptTags.$inferSelect;
export type InsertPromptTag = typeof promptTags.$inferInsert;

export const brandPromptTags = pgTable(
  "brand_prompt_tags",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandPromptId: varchar("brand_prompt_id")
      .notNull()
      .references(() => brandPrompts.id, { onDelete: "cascade" }),
    tagId: varchar("tag_id")
      .notNull()
      .references(() => promptTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("brand_prompt_tags_prompt_id_idx").on(table.brandPromptId),
    index("brand_prompt_tags_tag_id_idx").on(table.tagId),
    uniqueIndex("brand_prompt_tags_prompt_tag_uq").on(table.brandPromptId, table.tagId),
  ],
);
export type BrandPromptTag = typeof brandPromptTags.$inferSelect;
export type InsertBrandPromptTag = typeof brandPromptTags.$inferInsert;

// ── Prompt audiences (migration 0097) ───────────────────────────────────
// Real entity + join, same shape as prompt_tags/brand_prompt_tags above -
// an audience groups prompts the same way a tag does, but carries a funnel
// stage and (when AI-generated) a rationale for why each prompt belongs.
// funnelStage reuses brand_prompts.funnel_stage's existing TOFU/MOFU/BOFU
// vocabulary rather than inventing a second enum - the client maps those to
// Awareness/Consideration/Decision as display labels only.
export const promptAudiences = pgTable(
  "prompt_audiences",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    funnelStage: text("funnel_stage"), // "TOFU" | "MOFU" | "BOFU"
    generatedBy: text("generated_by").default("manual").notNull(), // "ai" | "manual"
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("prompt_audiences_brand_id_idx").on(table.brandId),
    uniqueIndex("prompt_audiences_brand_name_uq").on(table.brandId, sql`lower(${table.name})`),
  ],
);
export type PromptAudience = typeof promptAudiences.$inferSelect;
export type InsertPromptAudience = typeof promptAudiences.$inferInsert;

export const brandPromptAudiences = pgTable(
  "brand_prompt_audiences",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandPromptId: varchar("brand_prompt_id")
      .notNull()
      .references(() => brandPrompts.id, { onDelete: "cascade" }),
    audienceId: varchar("audience_id")
      .notNull()
      .references(() => promptAudiences.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("brand_prompt_audiences_prompt_id_idx").on(table.brandPromptId),
    index("brand_prompt_audiences_audience_id_idx").on(table.audienceId),
    uniqueIndex("brand_prompt_audiences_prompt_audience_uq").on(
      table.brandPromptId,
      table.audienceId,
    ),
  ],
);
export type BrandPromptAudience = typeof brandPromptAudiences.$inferSelect;
export type InsertBrandPromptAudience = typeof brandPromptAudiences.$inferInsert;

// ── Prompt set health audit (migration 0098) ────────────────────────────
// One row per audit run. score/verdict are nullable and null together when
// there isn't enough evidence to judge - same "zero-evidence returns null,
// never a fabricated number" rule as brand_perception_runs.
export const promptSetHealthRuns = pgTable(
  "prompt_set_health_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    score: integer("score"),
    verdict: text("verdict"),
    // { title, description, duplicatePromptIds } - duplicatePromptIds come
    // from the deterministic Jaccard pre-pass, never LLM-invented ids.
    topFix: jsonb("top_fix"),
    issues: jsonb("issues")
      .notNull()
      .default(sql`'[]'::jsonb`),
    workingWell: text("working_well")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("prompt_set_health_runs_brand_created_idx").on(table.brandId, table.createdAt.desc()),
  ],
);
export type PromptSetHealthRun = typeof promptSetHealthRuns.$inferSelect;
export type InsertPromptSetHealthRun = typeof promptSetHealthRuns.$inferInsert;

// ── Prompt phrasing tests (migration 0099) ──────────────────────────────
// Deliberately NOT written into geo_rankings - phrasing variants are
// exploratory, not the tracked prompt's real history; mixing them in would
// corrupt the Score/Δ/sparkline columns, which read from geo_rankings only.
export const promptPhrasingTests = pgTable(
  "prompt_phrasing_tests",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    brandPromptId: varchar("brand_prompt_id")
      .notNull()
      .references(() => brandPrompts.id, { onDelete: "cascade" }),
    phrasing: text("phrasing").notNull(),
    rationale: text("rationale"),
    // Per-platform {platform, isCited, rank, relevance}[] - null until
    // "Analyze" has run for this phrasing, mirroring
    // runPlatformCitationCheck's own return shape.
    results: jsonb("results"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("prompt_phrasing_tests_prompt_id_idx").on(table.brandPromptId)],
);
export type PromptPhrasingTest = typeof promptPhrasingTests.$inferSelect;
export type InsertPromptPhrasingTest = typeof promptPhrasingTests.$inferInsert;
