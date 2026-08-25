// Aggregate business KPIs for the internal dashboard.
//
// PUBLIC + AGGREGATE ONLY. This route has no auth, exactly like /api/board.
// It must NEVER return emails, names, ids, stripe ids, or any other
// per-user/per-row data - counts and averages only. If you are adding a
// field here, ask yourself whether it could identify a single person or
// row; if yes, it does not belong on this endpoint.

import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { users, brands, articles, brandPrompts, citationRuns, geoRankings } from "@shared/schema";
import { asyncHandler } from "../lib/routesShared";

export function setupInternalKpisRoutes(app: Express) {
  app.get(
    "/api/internal/kpis",
    asyncHandler(async (_req, res) => {
      const [
        [totalUsersRow],
        [activeBrandsRow],
        usersByTierRows,
        [payingUsersRow],
        payingByTierRows,
        [signupsRow],
        [totalArticlesRow],
        [totalPromptsRow],
        [totalCitationRunsRow],
        citationRunsByStatusRows,
        [totalCitationChecksRow],
        [citedChecksRow],
      ] = await Promise.all([
        db.select({ n: sql<number>`count(*)::int` }).from(users),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(brands)
          .where(sql`${brands.deletedAt} is null`),
        db
          .select({ tier: users.accessTier, n: sql<number>`count(*)::int` })
          .from(users)
          .groupBy(users.accessTier),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(users)
          .where(sql`${users.stripeSubscriptionId} is not null`),
        db
          .select({ tier: users.accessTier, n: sql<number>`count(*)::int` })
          .from(users)
          .where(sql`${users.stripeSubscriptionId} is not null`)
          .groupBy(users.accessTier),
        db
          .select({
            d7: sql<number>`count(*) filter (where ${users.createdAt} >= now() - interval '7 days')::int`,
            d30: sql<number>`count(*) filter (where ${users.createdAt} >= now() - interval '30 days')::int`,
          })
          .from(users),
        db.select({ n: sql<number>`count(*)::int` }).from(articles),
        db.select({ n: sql<number>`count(*)::int` }).from(brandPrompts),
        db.select({ n: sql<number>`count(*)::int` }).from(citationRuns),
        db
          .select({ status: citationRuns.status, n: sql<number>`count(*)::int` })
          .from(citationRuns)
          .groupBy(citationRuns.status),
        db.select({ n: sql<number>`count(*)::int` }).from(geoRankings),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(geoRankings)
          .where(sql`${geoRankings.isCited} = 1`),
      ]);

      const usersByTier: Record<string, number> = {};
      for (const r of usersByTierRows) {
        if (r.tier) usersByTier[r.tier] = r.n;
      }

      const payingByTier: Record<string, number> = {};
      for (const r of payingByTierRows) {
        if (r.tier) payingByTier[r.tier] = r.n;
      }

      const citationRunsByStatus: Record<string, number> = {};
      for (const r of citationRunsByStatusRows) {
        if (r.status) citationRunsByStatus[r.status] = r.n;
      }

      res.json({
        totalUsers: totalUsersRow?.n ?? 0,
        activeBrands: activeBrandsRow?.n ?? 0,
        usersByTier,
        payingUsers: payingUsersRow?.n ?? 0,
        payingByTier,
        signups7d: signupsRow?.d7 ?? 0,
        signups30d: signupsRow?.d30 ?? 0,
        totalArticles: totalArticlesRow?.n ?? 0,
        totalPrompts: totalPromptsRow?.n ?? 0,
        totalCitationRuns: totalCitationRunsRow?.n ?? 0,
        citationRunsByStatus,
        totalCitationChecks: totalCitationChecksRow?.n ?? 0,
        citedChecks: citedChecksRow?.n ?? 0,
      });
    }),
  );
}
