import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { users } from "./identity";

export const chatbotThreads = pgTable(
  "chatbot_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    title: text("title").notNull().default("New chat"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    userUpdatedIdx: index("chatbot_threads_user_updated_idx").on(t.userId, t.updatedAt.desc()),
  }),
);
export type ChatbotThread = typeof chatbotThreads.$inferSelect;
export type InsertChatbotThread = typeof chatbotThreads.$inferInsert;

export const chatbotMessages = pgTable(
  "chatbot_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatbotThreads.id, { onDelete: "cascade" }),
    brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index("chatbot_messages_user_created_idx").on(t.userId, t.createdAt.desc()),
    threadCreatedIdx: index("chatbot_messages_thread_created_idx").on(t.threadId, t.createdAt),
  }),
);

export type ChatbotMessage = typeof chatbotMessages.$inferSelect;
export type InsertChatbotMessage = typeof chatbotMessages.$inferInsert;

export const chatbotTokenUsage = pgTable(
  "chatbot_token_usage",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.usageDate] }),
  }),
);
export type ChatbotTokenUsage = typeof chatbotTokenUsage.$inferSelect;
export type InsertChatbotTokenUsage = typeof chatbotTokenUsage.$inferInsert;
