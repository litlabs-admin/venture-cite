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
