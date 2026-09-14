import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./identity";

// Pending seat invitations for the /v2/settings/team screen. This app has no
// multi-user membership table yet - a brand's only real member is its owner
// (`brands.user_id`). An invitation records intent to add a seat; nothing
// here grants access on its own. Migration in 0184_v2_team_invitations.sql,
// following the request-role RLS pattern from 0131/0132/0139/0140.
export const v2TeamInvitationRoles = ["editor", "analyst", "viewer"] as const;
export type V2TeamInvitationRole = (typeof v2TeamInvitationRoles)[number];

export const v2TeamInvitationStatuses = ["pending", "revoked", "accepted"] as const;
export type V2TeamInvitationStatus = (typeof v2TeamInvitationStatuses)[number];

export const v2TeamInvitations = pgTable(
  "v2_team_invitations",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerUserId: varchar("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("viewer"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("v2_team_invitations_owner_idx").on(table.ownerUserId, table.createdAt)],
);

export const insertV2TeamInvitationSchema = createInsertSchema(v2TeamInvitations).omit({
  id: true,
  createdAt: true,
  status: true,
});
export type V2TeamInvitation = typeof v2TeamInvitations.$inferSelect;
export type InsertV2TeamInvitation = z.infer<typeof insertV2TeamInvitationSchema>;
