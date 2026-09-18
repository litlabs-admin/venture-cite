// Ask's own tables. Independence decision (docs/ask-feature/07 §0): Ask
// never reuses chatbot_threads / chatbot_messages / chatbot_token_usage, and
// no migration in this feature touches those tables. See migrations/0126_
// ask_core.sql.
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { users } from "./identity";

export const askThreads = pgTable(
  "ask_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    title: text("title").notNull().default("New thread"),
    // "Just for one conversation" (business-context.md Your preferences tab):
    // a per-thread instruction override, set only at thread creation from
    // the preferences page's disclosure. Never promoted into ask_memories -
    // it "stays out of lasting memory" by staying on this row alone, and it
    // is PERSONAL context (server/ask/context.ts's assemblePersonal), never
    // read by anything that builds a shared export.
    temporaryInstructions: text("temporary_instructions"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    userUpdatedIdx: index("ask_threads_user_updated_idx").on(t.userId, t.updatedAt.desc()),
  }),
);
export type AskThread = typeof askThreads.$inferSelect;
export type InsertAskThread = typeof askThreads.$inferInsert;

export const askMessages = pgTable(
  "ask_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => askThreads.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    role: text("role").notNull(), // 'user' | 'assistant'
    content: text("content").notNull().default(""),
    // Rich payloads. See shared/ask/blocks.ts, shared/ask/actions.ts for the
    // typed shapes stored here - jsonb at rest, validated on the way in and
    // out (never rendered without a Zod parse).
    blocks: jsonb("blocks"),
    evidence: jsonb("evidence"),
    suggestions: jsonb("suggestions"),
    durationMs: integer("duration_ms"),
    pagesRead: integer("pages_read").notNull().default(0),
    runStatus: text("run_status"), // 'ok' | 'degraded' | 'stopped' | 'error'
    degradedReasons: jsonb("degraded_reasons"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    threadCreatedIdx: index("ask_messages_thread_created_idx").on(t.threadId, t.createdAt),
  }),
);
export type AskMessage = typeof askMessages.$inferSelect;
export type InsertAskMessage = typeof askMessages.$inferInsert;

export const askSteps = pgTable(
  "ask_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => askMessages.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    toolName: text("tool_name").notNull(),
    label: text("label").notNull(),
    category: text("category"),
    summary: text("summary"),
    durationMs: integer("duration_ms"),
    status: text("status").notNull().default("ok"), // 'ok' | 'failed'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    messageOrdinalIdx: index("ask_steps_message_ordinal_idx").on(t.messageId, t.ordinal),
  }),
);
export type AskStep = typeof askSteps.$inferSelect;
export type InsertAskStep = typeof askSteps.$inferInsert;

// Ask's own budget accounting (07 §1). Deliberately shaped like, but never
// shared with, chatbot_token_usage - run_count, not message_count, because
// one Ask run is several model calls and a message-count cap is the wrong
// instrument for it (03-gap-analysis.md B10).
export const askUsage = pgTable(
  "ask_usage",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    runCount: integer("run_count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.usageDate] }),
  }),
);
export type AskUsage = typeof askUsage.$inferSelect;
export type InsertAskUsage = typeof askUsage.$inferInsert;

// ─── Business context (docs/ask-feature's Business Context / Memory work) ──
//
// Migration 0128_ask_business_context.sql. Three new tables, brand- or
// user-scoped exactly like the rest of Ask (07 §0's independence rule
// extends here too: nothing below is shared with chatbot_*).

// One row per brand. Two fields are staged copies of what will become the
// SOURCE OF TRUTH on `brands` once accepted: draftProductsServices and
// draftMarketsAudiences hold the website-derived (or hand-edited) draft
// text, kept OFF `brands.description`/`brands.targetAudience` until a save
// actually writes them there (server/ask/briefStorage.ts's saveBrief) - the
// "stays separate until you choose Save brief" rule from
// 01-trakkr-teardown.md §2.6. After a save, GET reads products/markets back
// from `brands` live (the source of truth), not from these two columns -
// they exist so an in-progress, not-yet-saved draft has somewhere to live
// that isn't the canonical brand record.
//
// goals / currentPriorities / peopleCapacity / constraints have no existing
// home on `brands` (02-platform-analysis.md §6 confirmed this), so they live
// here permanently, not just as a staging area.
export const askBusinessBriefs = pgTable("ask_business_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: varchar("brand_id")
    .notNull()
    .unique()
    .references(() => brands.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("draft"), // 'draft' | 'accepted' | 'dismissed'
  draftProductsServices: text("draft_products_services"),
  draftMarketsAudiences: text("draft_markets_audiences"),
  goals: text("goals"),
  currentPriorities: text("current_priorities"),
  peopleCapacity: text("people_capacity"),
  constraints: text("constraints"),
  // BriefSource[] (shared/ask/brief.ts): { field, url, title, quote }[] - one
  // entry per website-sourced field, kept only when the quote was verified
  // as a literal substring of the fetched page (server/ask/briefWebsiteDraft.ts).
  sources: jsonb("sources"),
  scrapeStatus: text("scrape_status").notNull().default("none"), // none|running|ready|failed
  acceptedBy: varchar("accepted_by").references(() => users.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AskBusinessBriefRow = typeof askBusinessBriefs.$inferSelect;
export type InsertAskBusinessBriefRow = typeof askBusinessBriefs.$inferInsert;

// Shared brand memory (business-context.md's Memory tab; drawer's "What I
// know"). `origin` distinguishes a hand-added fact from one a conversation
// proposed and the user approved through an action card
// (server/ask/actions/kinds.ts's remember_fact). `forgottenAt` is a soft
// delete - "ask it to forget" reads as an instruction, not a hard row
// delete, matching 01-trakkr-teardown.md §2.7.
export const askMemories = pgTable(
  "ask_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: varchar("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // AskMemoryType, shared/ask/memory.ts
    content: text("content").notNull(),
    origin: text("origin").notNull().default("manual"), // 'manual' | 'learned'
    sourceThreadId: uuid("source_thread_id").references(() => askThreads.id, {
      onDelete: "set null",
    }),
    sourceMessageId: uuid("source_message_id").references(() => askMessages.id, {
      onDelete: "set null",
    }),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    forgottenAt: timestamp("forgotten_at", { withTimezone: true }),
  },
  (t) => ({
    brandActiveIdx: index("ask_memories_brand_active_idx").on(t.brandId, t.createdAt.desc()),
  }),
);
export type AskMemoryRow = typeof askMemories.$inferSelect;
export type InsertAskMemoryRow = typeof askMemories.$inferInsert;

// Private per-user answer preferences ("Your preferences" tab - "Only you").
// Never read by anything that assembles a SHARED export (server/ask/
// context.ts's assembleShared vs assemblePersonal split) - these govern
// form, not facts, per 01-trakkr-teardown.md §5 rule 3.
export const askUserPreferences = pgTable("ask_user_preferences", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tone: text("tone"), // AskPreferenceTone, shared/ask/preferences.ts
  language: text("language"),
  answerLength: text("answer_length"), // AskAnswerLength
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AskUserPreferencesRow = typeof askUserPreferences.$inferSelect;
export type InsertAskUserPreferencesRow = typeof askUserPreferences.$inferInsert;
