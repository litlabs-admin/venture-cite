import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { SessionAnswers, SessionEvent } from "../onboarding/session";
import { brands } from "./brands";
import { users } from "./identity";

/** Anonymous onboarding sessions (migration 0130). */
export const onboardingSessions = pgTable(
  "onboarding_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: text("domain").notNull(),
    ipHash: text("ip_hash").notNull(),
    status: text("status").$type<"running" | "done" | "failed">().notNull().default("running"),
    events: jsonb("events")
      .$type<SessionEvent[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    answers: jsonb("answers").$type<SessionAnswers | null>(),
    claimedBy: varchar("claimed_by").references(() => users.id, { onDelete: "set null" }),
    claimedBrandId: varchar("claimed_brand_id").references(() => brands.id, {
      onDelete: "set null",
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
  },
  (table) => [index("onboarding_sessions_ip_recent_idx").on(table.ipHash, table.createdAt)],
);

export type OnboardingSession = typeof onboardingSessions.$inferSelect;
