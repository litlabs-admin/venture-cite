import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  timezone: text("timezone"),
  profileImageUrl: text("profile_image_url"),
  accessTier: text("access_tier").default("free").notNull(),
  // End of the 14-day signup trial. NULL means "no trial applies" - either a
  // paying account, or one of the pre-pricing accounts that keeps its old
  // tier. Only meaningful while accessTier is "trial"; see resolveTier().
  trialEndsAt: timestamp("trial_ends_at"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  betaInviteCode: text("beta_invite_code"),
  isAdmin: integer("is_admin").default(0).notNull(),
  articlesUsedThisMonth: integer("articles_used_this_month").default(0).notNull(),
  brandsUsed: integer("brands_used").default(0).notNull(),
  usageResetDate: timestamp("usage_reset_date").defaultNow(),
  emailVerified: integer("email_verified").default(0).notNull(),
  weeklyReportEnabled: integer("weekly_report_enabled").default(1).notNull(),
  lastWeeklyReportSentAt: timestamp("last_weekly_report_sent_at"),
  // Separate dedup stamp for the weekly DIGEST (weekly_catchup terminal
  // email). It previously shared lastWeeklyReportSentAt with the Sunday
  // visibility-report job, so whichever fired first stamped the column and
  // permanently suppressed the other. A dedicated stamp lets both send and
  // keeps the digest's "alerts since last digest" window accurate.
  lastWeeklyDigestSentAt: timestamp("last_weekly_digest_sent_at"),
  visibilityGuideVisitedAt: timestamp("visibility_guide_visited_at"),
  // Free-form onboarding flags persist on the server.
  // so dismiss state syncs across devices. Keys defined in
  // server/routes/onboarding.ts (see ONBOARDING_FIELDS).
  onboardingState: jsonb("onboarding_state").default({}).notNull(),
  bufferAccessToken: text("buffer_access_token"),
  // Soft-delete state. Set when the user requests account deletion.
  // - the row stays for the 30-day grace period so an admin can restore
  // accidental deletions; the daily cron then hard-deletes after grace.
  deletedAt: timestamp("deleted_at"),
  deletionScheduledFor: timestamp("deletion_scheduled_for"),
  // Email deliverability state. Values: 'active', 'bounced',
  // 'complained', 'unsubscribed'. The email service refuses to send
  // when this isn't 'active' so we don't keep blasting addresses that
  // hurt our domain reputation.
  emailStatus: text("email_status").default("active").notNull(),
  // The first non-null value is set on the user's
  // first verified login. The welcome-email trigger fires exactly once
  // (when this is NULL pre-login) and then this stamp is set. Existing
  // rows are backfilled to NOW() in migration 0054 so we don't spam old
  // accounts.
  lastLoginAt: timestamp("last_login_at"),
  // A dedicated welcome-email gate
  // `lastLoginAt` recovers its literal meaning. NULL = welcome email
  // has not been sent yet; stamped atomically with the welcome-email
  // dispatch on first login. Existing rows backfilled to NOW() in
  // migration 0056 so we don't spam pre-existing accounts.
  welcomedAt: timestamp("welcomed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const betaInviteCodes = pgTable("beta_invite_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses").default(1).notNull(),
  usedCount: integer("used_count").default(0).notNull(),
  accessTier: text("access_tier").default("beta").notNull(),
  expiresAt: timestamp("expires_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type BetaInviteCode = typeof betaInviteCodes.$inferSelect;
export type InsertBetaInviteCode = typeof betaInviteCodes.$inferInsert;

export const waitlist = pgTable("waitlist", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  source: text("source").default("landing"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWaitlistSchema = createInsertSchema(waitlist).omit({
  id: true,
  createdAt: true,
});
export type Waitlist = typeof waitlist.$inferSelect;
export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;

/**
 * Per-tier caps. `-1` means unlimited; `0` means the feature is not part of
 * that plan at all (a hard no, not an exhausted allowance).
 *
 * The two sellable plans are `pro` ($99/mo) and `agency` ($500/mo). Article
 * generation is the paid line between them: Pro is the AI-visibility tracking
 * product and deliberately generates no content.
 *
 * The other entries are not sold:
 *   trial      14 days, granted on signup. No card, no plan chosen.
 *   expired    a trial that ran out with no subscription. Read-only in effect.
 *   free       legacy only - the accounts that predate this pricing. Not
 *              offered to new signups and absent from the pricing page.
 *   beta       redeemed invite codes (betaInviteCodes.accessTier).
 *   enterprise sales-led, set by hand after a call. No self-serve price.
 *   admin      internal.
 */
/**
 * Per-tier caps. `-1` means unlimited; `0` means the feature is not part of
 * that tier at all (a hard no, not an exhausted allowance).
 *
 * Stripe owns the trial now. A card is collected before the app opens, the
 * subscription is created with a 14-day Stripe trial, and Stripe charges on
 * day 15 - so there is no app-managed trial tier and no expiry to evaluate
 * here. During `trialing` the webhooks grant the PLAN's tier, because that is
 * what the customer chose and will be billed for.
 *
 *   pending    account created, no plan chosen yet. The signup gate catches
 *              this and sends them to plan selection. Zero entitlements, so
 *              no work can be started before a card exists.
 *   readonly   the terminal state for a trial that was cancelled or a
 *              subscription that ultimately failed. Existing data stays
 *              VISIBLE - nothing deletes it - but no new work can be started,
 *              so a non-paying account costs no recurring LLM spend.
 *   free       legacy only: the 30 accounts that predate this pricing. Not
 *              offered to anyone new.
 *   beta       redeemed invite codes.
 *   enterprise sales-led, set by hand after a call.
 */
export const usageLimits = {
  pending: { articlesPerMonth: 0, maxBrands: 0 },
  readonly: { articlesPerMonth: 0, maxBrands: 0 },
  free: { articlesPerMonth: 5, maxBrands: 1 },
  beta: { articlesPerMonth: 20, maxBrands: 3 },
  pro: { articlesPerMonth: 0, maxBrands: 3 },
  agency: { articlesPerMonth: 40, maxBrands: 10 },
  enterprise: { articlesPerMonth: 200, maxBrands: -1 },
  admin: { articlesPerMonth: -1, maxBrands: -1 },
};

/** Tiers a customer can actually buy, in ascending order. */
export const SELLABLE_TIERS = ["pro", "agency"] as const;
export type SellableTier = (typeof SELLABLE_TIERS)[number];

/**
 * What each plan is supposed to cost, in cents. USD, monthly.
 *
 * The single source for "is this Stripe price the one we mean". A Stripe price
 * that does not match is a stale catalogue, not a price change - the live
 * account still carries a "Pro" product at $79 from the previous pricing, with
 * tier metadata identical to ours. Two places have to agree about this or the
 * app either advertises a price it will not charge, or gates people behind a
 * plan they cannot buy:
 *   - the pricing page, which refuses to offer checkout on a mismatch
 *   - the signup gate, which refuses to block anyone when nothing is buyable
 */
export const PLAN_PRICE_CENTS: Record<SellableTier, number> = {
  pro: 9900,
  agency: 50000,
};

/** True when Stripe is carrying a live, correctly-priced version of a plan we
 *  sell. Shared so the gate and the pricing page can never disagree. */
export function hasPurchasablePlan(
  products: Array<{
    metadata?: Record<string, string> | null;
    prices?: Array<{ unit_amount?: number | null; currency?: string | null }> | null;
  }>,
): boolean {
  return products.some((p) => {
    const tier = p.metadata?.tier as SellableTier | undefined;
    if (!tier || !(tier in PLAN_PRICE_CENTS)) return false;
    return (p.prices ?? []).some(
      (price) =>
        price.unit_amount === PLAN_PRICE_CENTS[tier] &&
        (price.currency ?? "usd").toLowerCase() === "usd",
    );
  });
}

/** Tiers that entitle the account to work that costs us money. Anything else
 *  is read-only or unstarted, and the schedulers must skip it - a lapsed
 *  account should never keep consuming weekly scans. */
export const PAYING_TIERS: string[] = ["pro", "agency", "enterprise", "beta", "free", "admin"];

export function isPayingTier(tier: string | null | undefined): boolean {
  return !!tier && PAYING_TIERS.includes(tier);
}

/**
 * The tier a user's entitlements come from.
 *
 * Deliberately a straight lookup with no date arithmetic. The previous version
 * evaluated an app-managed `trialEndsAt` at read time, which existed only
 * because the app was tracking trials itself. Stripe tracks them now and
 * drives every transition by webhook, so a second opinion computed here could
 * only ever disagree with the system actually taking the money.
 *
 * Unknown tiers resolve to `pending` (zero entitlements), not `free`. Failing
 * closed is right for a value that decides what someone may spend our money
 * on, and `free` is a real grant that no unrecognised row should inherit.
 */
export function resolveTier(user: { accessTier?: string | null }): keyof typeof usageLimits {
  const tier = (user.accessTier ?? "pending") as keyof typeof usageLimits;
  return tier in usageLimits ? tier : "pending";
}

/** Length of the free trial granted at signup. */
export const TRIAL_DAYS = 14;
