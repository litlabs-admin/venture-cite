import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { BetaInviteCode, InsertBetaInviteCode, InsertUser, User } from "@shared/schema";
import type { IStorage } from "../storage";

export const identityStorage = {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return result[0];
  },

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.email, username));
    return result[0];
  },

  async createUser(insertUser: InsertUser): Promise<User> {
    // No trial granted here. Stripe owns the trial now: a new account starts
    // at "pending", the app is gated until they pick a plan, and the 14 days
    // live on the Stripe subscription. (This method also has no callers in
    // practice - real signups create the users row via the handle_new_user
    // trigger - but it must not disagree with the trigger if that changes.)
    const result = await db
      .insert(schema.users)
      .values({
        ...insertUser,
        accessTier: insertUser.accessTier ?? "pending",
        isAdmin: insertUser.isAdmin ?? 0,
        articlesUsedThisMonth: insertUser.articlesUsedThisMonth ?? 0,
        brandsUsed: insertUser.brandsUsed ?? 0,
        usageResetDate: insertUser.usageResetDate ?? new Date(),
      })
      .returning();
    return result[0];
  },

  async updateUserStripeInfo(
    userId: string,
    info: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      accessTier?: string;
      /** Mirrors the Stripe subscription's trial_end. Stripe owns the trial;
       *  this is only so the UI can render a countdown without a round trip. */
      trialEndsAt?: Date | null;
    },
  ): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set(info)
      .where(eq(schema.users.id, userId))
      .returning();
    return result[0];
  },

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));
    return result[0];
  },

  async createBetaInviteCode(insertCode: InsertBetaInviteCode): Promise<BetaInviteCode> {
    const result = await db
      .insert(schema.betaInviteCodes)
      .values({
        ...insertCode,
        maxUses: insertCode.maxUses ?? 1,
        usedCount: 0,
        accessTier: insertCode.accessTier ?? "beta",
      })
      .returning();
    return result[0];
  },

  async getBetaInviteCodeByCode(codeStr: string): Promise<BetaInviteCode | undefined> {
    const result = await db
      .select()
      .from(schema.betaInviteCodes)
      .where(eq(schema.betaInviteCodes.code, codeStr));
    return result[0];
  },

  async useBetaInviteCode(codeStr: string): Promise<BetaInviteCode | undefined> {
    // Atomic conditional update: only increments when the code still has
    // uses left AND hasn't expired. This collapses the previous
    // check-then-update TOCTOU race into a single statement so two
    // concurrent redemptions of a 1-use code can't both win.
    const rows = await db.execute(sql`
      update ${schema.betaInviteCodes}
      set used_count = used_count + 1
      where code = ${codeStr}
        and used_count < max_uses
        and (expires_at is null or expires_at > now())
      returning *
    `);
    const list = (rows as any).rows ?? (rows as any);
    if (!list || list.length === 0) return undefined;
    const row = list[0];
    return {
      id: row.id,
      code: row.code,
      maxUses: row.max_uses,
      usedCount: row.used_count,
      accessTier: row.access_tier,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      createdBy: row.created_by,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    };
  },

  async getAllBetaInviteCodes(): Promise<BetaInviteCode[]> {
    return await db.select().from(schema.betaInviteCodes);
  },

  async deleteBetaInviteCode(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.betaInviteCodes)
      .where(eq(schema.betaInviteCodes.id, id))
      .returning();
    return result.length > 0;
  },
} satisfies Partial<IStorage> & ThisType<IStorage>;
