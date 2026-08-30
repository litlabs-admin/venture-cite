import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import type { IStorage } from "../storage";
import * as schema from "@shared/schema";
import type {
  AlertHistory,
  Analytics,
  BrandHallucination,
  CommunityPost,
  InsertAlertHistory,
  InsertAnalytics,
  InsertCommunityPost,
  InsertMetricsHistory,
  InsertTourEvent,
  MetricsHistory,
} from "@shared/schema";

export const platformStorage = {
  async getAnalytics(): Promise<Analytics | undefined> {
    let analyticsRows = await db.select().from(schema.analytics);

    if (analyticsRows.length === 0) {
      const created = await db
        .insert(schema.analytics)
        .values({
          totalCitations: 0,
          weeklyGrowth: "0",
          avgPosition: "0",
          monthlyTraffic: 0,
        })
        .returning();
      analyticsRows = created;
    }

    const row = analyticsRows[0];

    const allArticles = await db.select().from(schema.articles);

    const totalCitations = allArticles.reduce(
      (sum, article) => sum + (article.citationCount || 0),
      0,
    );
    const totalViews = allArticles.reduce((sum, article) => sum + (article.viewCount || 0), 0);

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentArticles = allArticles.filter((a) => new Date(a.createdAt) > oneWeekAgo);
    const weeklyGrowth =
      recentArticles.length > 0
        ? Math.round((recentArticles.length / Math.max(allArticles.length, 1)) * 100)
        : 0;

    return {
      id: row.id,
      totalCitations: totalCitations,
      weeklyGrowth: weeklyGrowth.toString(),
      avgPosition: row.avgPosition,
      monthlyTraffic: totalViews,
      updatedAt: new Date(),
    };
  },

  async updateAnalytics(analyticsUpdate: InsertAnalytics): Promise<Analytics> {
    const existing = await db.select().from(schema.analytics);
    if (existing.length > 0) {
      const result = await db
        .update(schema.analytics)
        .set({ ...analyticsUpdate, updatedAt: new Date() })
        .where(eq(schema.analytics.id, existing[0].id))
        .returning();
      return result[0];
    }
    const result = await db
      .insert(schema.analytics)
      .values({
        ...analyticsUpdate,
        updatedAt: new Date(),
      })
      .returning();
    return result[0];
  },

  async recordTourEvents(events: InsertTourEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    await db
      .insert(schema.tourEvents)
      .values(events)
      .onConflictDoNothing({ target: schema.tourEvents.id });
    return events.length;
  },

  async deleteOldTourEvents(olderThan: Date): Promise<number> {
    // Retain on server_received_at (server clock), not occurred_at
    // (clamped, but still client-influenced) - retention must key off
    // a trusted column so rows can't dodge or trigger early cleanup.
    const result = await db.execute(sql`
      DELETE FROM tour_events WHERE server_received_at < ${olderThan.toISOString()}
    `);
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  },

  async getUserUsage(
    userId: string,
  ): Promise<{ articlesUsed: number; brandsUsed: number; resetDate: Date | null } | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    const user = result[0];
    if (!user) return undefined;

    const now = new Date();
    const resetDate = user.usageResetDate ? new Date(user.usageResetDate) : null;
    // Compare absolute months (year*12+month) so a January 2026 reset-date vs
    // January 2025 now doesn't collide on the same month number.
    const absMonth = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (resetDate && absMonth(now) !== absMonth(resetDate)) {
      await this.resetMonthlyUsage(userId);
      return { articlesUsed: 0, brandsUsed: user.brandsUsed || 0, resetDate: now };
    }

    return {
      articlesUsed: user.articlesUsedThisMonth || 0,
      brandsUsed: user.brandsUsed || 0,
      resetDate: resetDate,
    };
  },

  async resetMonthlyUsage(userId: string): Promise<void> {
    await db
      .update(schema.users)
      .set({ articlesUsedThisMonth: 0, usageResetDate: new Date() })
      .where(eq(schema.users.id, userId));
  },

  async createMetricsSnapshot(snapshot: InsertMetricsHistory): Promise<MetricsHistory> {
    const result = await db.insert(schema.metricsHistory).values(snapshot).returning();
    return result[0];
  },

  async getMetricsHistory(
    brandId: string,
    metricType?: string,
    days: number = 30,
  ): Promise<MetricsHistory[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const conditions = [
      eq(schema.metricsHistory.brandId, brandId),
      gte(schema.metricsHistory.snapshotDate, cutoffDate),
    ];
    if (metricType) conditions.push(eq(schema.metricsHistory.metricType, metricType));

    return await db
      .select()
      .from(schema.metricsHistory)
      .where(and(...conditions))
      .orderBy(asc(schema.metricsHistory.snapshotDate));
  },

  async recordCurrentMetrics(brandId: string): Promise<void> {
    // The "Record Snapshot" button on the Trends tab calls this. Compute
    // share-of-answer from brand_prompts × geo_rankings - the tables the
    // active citation pipeline actually writes to. (The prompt_portfolio
    // table this used to prefer was dead - the active pipeline never wrote
    // to it - and was dropped; see migration 0082.)
    const brandPrompts = await this.getBrandPromptsByBrandId(brandId);
    if (brandPrompts.length > 0) {
      const rankings = await this.getGeoRankingsByBrandPromptIds(brandPrompts.map((p) => p.id));
      const totalChecks = rankings.length;
      const citedChecks = rankings.filter((r) => r.isCited === 1).length;
      const soaValue = totalChecks > 0 ? (citedChecks / totalChecks) * 100 : 0;
      await this.createMetricsSnapshot({
        brandId,
        metricType: "share_of_answer",
        metricValue: soaValue.toFixed(2),
        metricDetails: {
          promptCount: brandPrompts.length,
          totalChecks,
          citedChecks,
        },
      } as any);
    }

    // citation_quality - average totalQualityScore across citations.
    // getCitationQualities has its own Phase-1 fallback (Wave D), so this
    // always returns something when there are cited rankings.
    const citations = await this.getCitationQualities(brandId);
    if (citations.length > 0) {
      const avgQuality =
        citations.reduce((sum, c) => sum + c.totalQualityScore, 0) / citations.length;
      await this.createMetricsSnapshot({
        brandId,
        metricType: "citation_quality",
        metricValue: avgQuality.toFixed(2),
        metricDetails: { citationCount: citations.length },
      } as any);
    }

    // hallucinations - always write a row (even 0 unresolved is useful for
    // trend tracking).
    const hallucinations = await this.getBrandHallucinations(brandId);
    const unresolvedCount = hallucinations.filter(
      (h: BrandHallucination) => h.isResolved === 0,
    ).length;
    await this.createMetricsSnapshot({
      brandId,
      metricType: "hallucinations",
      metricValue: unresolvedCount.toString(),
      metricDetails: { total: hallucinations.length, unresolved: unresolvedCount },
    } as any);
  },

  async createAlertHistory(history: InsertAlertHistory): Promise<AlertHistory> {
    const result = await db.insert(schema.alertHistory).values(history).returning();
    return result[0];
  },

  async getAlertHistory(brandId: string, limit: number = 50): Promise<AlertHistory[]> {
    return await db
      .select()
      .from(schema.alertHistory)
      .where(eq(schema.alertHistory.brandId, brandId))
      .orderBy(desc(schema.alertHistory.sentAt))
      .limit(limit);
  },

  async createCommunityPost(post: InsertCommunityPost): Promise<CommunityPost> {
    const result = await db.insert(schema.communityPosts).values(post).returning();
    return result[0];
  },

  async getCommunityPosts(
    brandId?: string,
    filters?: { platform?: string; status?: string },
  ): Promise<CommunityPost[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.communityPosts.brandId, brandId));
    if (filters?.platform) conditions.push(eq(schema.communityPosts.platform, filters.platform));
    if (filters?.status) conditions.push(eq(schema.communityPosts.status, filters.status));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.communityPosts)
        .where(and(...conditions));
    }
    return await db.select().from(schema.communityPosts);
  },

  async getCommunityPostById(id: string): Promise<CommunityPost | undefined> {
    const result = await db
      .select()
      .from(schema.communityPosts)
      .where(eq(schema.communityPosts.id, id));
    return result[0];
  },

  async updateCommunityPost(
    id: string,
    update: Partial<InsertCommunityPost>,
  ): Promise<CommunityPost | undefined> {
    const result = await db
      .update(schema.communityPosts)
      .set(update)
      .where(eq(schema.communityPosts.id, id))
      .returning();
    return result[0];
  },

  async deleteCommunityPost(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.communityPosts)
      .where(eq(schema.communityPosts.id, id))
      .returning();
    return result.length > 0;
  },

  async getSystemState(key: string) {
    const rows = await db
      .select({ valueJson: schema.systemState.valueJson })
      .from(schema.systemState)
      .where(eq(schema.systemState.key, key))
      .limit(1);
    return rows[0]?.valueJson ?? null;
  },

  async setSystemState(key: string, value: unknown): Promise<void> {
    await db
      .insert(schema.systemState)
      .values({
        key,
        valueJson: value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.systemState.key,
        set: { valueJson: value, updatedAt: new Date() },
      });
  },
} satisfies Partial<IStorage> & ThisType<IStorage>;
