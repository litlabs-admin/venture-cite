import {
  eq,
  and,
  desc,
  asc,
  sql,
  gte,
  gt,
  lt,
  or,
  isNull,
  inArray,
  getTableColumns,
} from "drizzle-orm";
import type { InsertTourEvent } from "@shared/schema";
import type { KnownTourId, TourStateOp } from "./lib/tourRegistry";
import { db } from "./db";
import * as schema from "@shared/schema";
import {
  type ClaimedContentGenerationJob,
  type CompletedContentJob,
  type CompletedContentJobCost,
  type ContentJobTerminalUpdate,
  type FailedContentJob,
} from "./storage";
import { enqueueContentCostCommand } from "./outbox/contentCostOutboxAdapter";
import {
  type User,
  type InsertUser,
  type Citation,
  type InsertCitation,
  type Analytics,
  type InsertAnalytics,
  type Article,
  type InsertArticle,
  type Distribution,
  type InsertDistribution,
  type GeoRanking,
  type InsertGeoRanking,
  type BrandPrompt,
  type InsertBrandPrompt,
  type PromptTag,
  type PromptAudience,
  type PromptSetHealthRun,
  type PromptPhrasingTest,
  type GeoSignalRun,
  type InsertGeoSignalRun,
  type ContentGenerationJob,
  type InsertContentGenerationJob,
  type Brand,
  type InsertBrand,
  type BetaInviteCode,
  type InsertBetaInviteCode,
  type BrandVisibilitySnapshot,
  type InsertBrandVisibilitySnapshot,
  type Listicle,
  type InsertListicle,
  type WikipediaMention,
  type InsertWikipediaMention,
  type BofuContent,
  type InsertBofuContent,
  type FaqItem,
  type InsertFaqItem,
  type BrandMention,
  type InsertBrandMention,
  type TrackedContentUrl,
  type InsertTrackedContentUrl,
  type CitationQuality,
  type InsertCitationQuality,
  type BrandHallucination,
  type InsertBrandHallucination,
  type BrandFactSheet,
  type InsertBrandFactSheet,
  type BrandFactScrapeRun,
  type InsertBrandFactScrapeRun,
  type BrandFactScrapePage,
  type InsertBrandFactScrapePage,
  type BrandMonthlyCostCap,
  type MetricsHistory,
  type InsertMetricsHistory,
  type AlertSettings,
  type InsertAlertSettings,
  type AlertHistory,
  type InsertAlertHistory,
  type AgentTask,
  type InsertAgentTask,
  type KeywordResearch,
  type InsertKeywordResearch,
  type CommunityPost,
  type InsertCommunityPost,
  type CitationRun,
  type InsertCitationRun,
  type ArticleRevision,
  type InsertArticleRevision,
  type ScanJob,
  type SourceHealth,
  type InsertSourceHealth,
  type SentimentCache,
} from "@shared/schema";

export { applyTourStateOp } from "./lib/tourStateOps";
import { applyTourStateOp } from "./lib/tourStateOps";

const CONTENT_JOB_LEASE_SECONDS = 90;

export class DatabaseStorage {
  // List DAOs accept optional pagination. Internal callers
  // that need every row (analytics rollups, scheduled jobs) omit opts
  // and get the legacy "all rows" behavior. HTTP routes pass through
  // parsePagination() so unbounded responses can't escape.
  async getCitations(opts?: { limit?: number; offset?: number }): Promise<Citation[]> {
    const q = db.select().from(schema.citations);
    if (opts?.limit !== undefined) {
      return await q.limit(opts.limit).offset(opts.offset ?? 0);
    }
    return await q;
  }

  async getCitationsByUserId(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<Citation[]> {
    const q = db.select().from(schema.citations).where(eq(schema.citations.userId, userId));
    if (opts?.limit !== undefined) {
      return await q.limit(opts.limit).offset(opts.offset ?? 0);
    }
    return await q;
  }

  async createCitation(insertCitation: InsertCitation): Promise<Citation> {
    const result = await db.insert(schema.citations).values(insertCitation).returning();
    const analyticsRows = await db.select().from(schema.analytics);
    if (analyticsRows.length > 0) {
      await db
        .update(schema.analytics)
        .set({
          totalCitations: sql`${schema.analytics.totalCitations} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.analytics.id, analyticsRows[0].id));
    }
    return result[0];
  }

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
  }

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
  }

  // Every brand reader filters out soft-deleted rows so the
  // UI doesn't see brands that are inside their 30-day grace window.
  // The cron-driven hard-delete (runBrandPurgeJob) eventually removes
  // them; until then they stay in the DB but invisible to the API.

  // Optimistic-lock variant of updateBrand. The caller passes the
  // version they last read; the UPDATE only matches when nobody has
  // written in between. Returns undefined when 0 rows matched - caller
  // must distinguish "not found" from "version conflict" by re-fetching.

  // Atomically change autopilot_status from 'failed' to 'pending'. The
  // WHERE clause is what guarantees race safety - two simultaneous
  // retries both reach the UPDATE, but only one row will match the
  // "still failed" predicate; the other returns 0 rows. Caller maps
  // false → 409. Also clears autopilotError so the stale failure
  // message doesn't bleed into the new run.

  async getTourState(userId: string): Promise<Record<string, unknown>> {
    const [row] = await db
      .select({ onboardingState: schema.users.onboardingState })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    const state = (row?.onboardingState ?? {}) as Record<string, unknown>;
    const tours = (state.tours as Record<string, unknown> | undefined) ?? {};
    return tours;
  }

  async patchTourState(
    userId: string,
    op: TourStateOp,
    args: {
      tourId?: KnownTourId;
      version?: number;
      brandId?: string | null;
      timestamp: string;
    },
  ): Promise<Record<string, unknown>> {
    // Read-modify-write of the whole onboarding_state column, so it must
    // be atomic: a SELECT ... FOR UPDATE row lock serializes concurrent
    // tour patches AND blocks the sibling /api/onboarding/state writer
    // (any UPDATE of this row waits on the lock) for the duration of the
    // transaction. Without this, two concurrent writers each computed
    // from a stale snapshot and the second clobbered the first (lost
    // updates, including legacy onboarding flags).
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ onboardingState: schema.users.onboardingState })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1)
        .for("update");

      const existing = (current?.onboardingState ?? {}) as Record<string, unknown>;
      const tours = (existing.tours ?? {}) as Record<string, unknown>;
      const next = applyTourStateOp(tours, op, args);

      const merged = { ...existing, tours: next };

      const [updated] = await tx
        .update(schema.users)
        .set({ onboardingState: merged })
        .where(eq(schema.users.id, userId))
        .returning({ onboardingState: schema.users.onboardingState });

      const newTours = ((updated?.onboardingState as Record<string, unknown> | undefined)?.tours ??
        {}) as Record<string, unknown>;
      return newTours;
    });
  }

  async recordTourEvents(events: InsertTourEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    await db
      .insert(schema.tourEvents)
      .values(events)
      .onConflictDoNothing({ target: schema.tourEvents.id });
    return events.length;
  }

  async deleteOldTourEvents(olderThan: Date): Promise<number> {
    // Retain on server_received_at (server clock), not occurred_at
    // (clamped, but still client-influenced) - retention must key off
    // a trusted column so rows can't dodge or trigger early cleanup.
    const result = await db.execute(sql`
      DELETE FROM tour_events WHERE server_received_at < ${olderThan.toISOString()}
    `);
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  }

  // Schedule a brand for deletion in 30 days. Return the
  // updated row or undefined if the brand wasn't found / already
  // soft-deleted. Idempotent: re-scheduling preserves the original
  // grace window so a double-click doesn't extend the timer.

  async createArticle(insertArticle: InsertArticle): Promise<Article> {
    const result = await db
      .insert(schema.articles)
      .values({
        ...insertArticle,
        author: insertArticle.author ?? "GEO Platform",
        viewCount: 0,
        citationCount: 0,
      })
      .returning();
    return result[0];
  }

  async getArticles(opts?: { limit?: number; offset?: number }): Promise<Article[]> {
    const q = db.select().from(schema.articles);
    if (opts?.limit !== undefined) {
      return await q.limit(opts.limit).offset(opts.offset ?? 0);
    }
    return await q;
  }

  // SQL scoping by brand owner makes LIMIT mean
  // "100 of your articles" instead of "100 globally then filter to yours".
  // Joins through brands so soft-deleted brands' articles are excluded.
  async getArticlesByUserId(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<Article[]> {
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;
    const result = await db
      .select({ articles: schema.articles })
      .from(schema.articles)
      .innerJoin(schema.brands, eq(schema.articles.brandId, schema.brands.id))
      .where(and(eq(schema.brands.userId, userId), isNull(schema.brands.deletedAt)))
      .orderBy(desc(schema.articles.createdAt))
      .limit(limit)
      .offset(offset);
    return result.map((r) => r.articles);
  }

  async getArticleById(id: string): Promise<Article | undefined> {
    const result = await db.select().from(schema.articles).where(eq(schema.articles.id, id));
    return result[0];
  }

  async updateArticle(
    id: string,
    articleUpdate: Partial<InsertArticle>,
  ): Promise<Article | undefined> {
    const result = await db
      .update(schema.articles)
      .set({
        ...articleUpdate,
        updatedAt: new Date(),
        version: sql`${schema.articles.version} + 1`,
      })
      .where(eq(schema.articles.id, id))
      .returning();
    return result[0];
  }

  // Optimistic-lock variant of updateArticle.
  async updateArticleIfVersion(
    id: string,
    expectedVersion: number,
    articleUpdate: Partial<InsertArticle>,
  ): Promise<Article | undefined> {
    const result = await db
      .update(schema.articles)
      .set({
        ...articleUpdate,
        updatedAt: new Date(),
        version: sql`${schema.articles.version} + 1`,
      })
      .where(and(eq(schema.articles.id, id), eq(schema.articles.version, expectedVersion)))
      .returning();
    return result[0];
  }

  async deleteArticle(id: string): Promise<boolean> {
    const result = await db.delete(schema.articles).where(eq(schema.articles.id, id)).returning();
    return result.length > 0;
  }

  async incrementArticleViews(id: string): Promise<void> {
    await db
      .update(schema.articles)
      .set({ viewCount: sql`${schema.articles.viewCount} + 1` })
      .where(eq(schema.articles.id, id));
  }

  async incrementArticleCitations(id: string): Promise<void> {
    await db
      .update(schema.articles)
      .set({ citationCount: sql`${schema.articles.citationCount} + 1` })
      .where(eq(schema.articles.id, id));

    const analyticsRows = await db.select().from(schema.analytics);
    if (analyticsRows.length > 0) {
      await db
        .update(schema.analytics)
        .set({
          totalCitations: sql`${schema.analytics.totalCitations} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.analytics.id, analyticsRows[0].id));
    }
  }

  async createDistribution(insertDistribution: InsertDistribution): Promise<Distribution> {
    const result = await db.insert(schema.distributions).values(insertDistribution).returning();
    return result[0];
  }

  async getDistributions(articleId?: string): Promise<Distribution[]> {
    if (articleId) {
      return await db
        .select()
        .from(schema.distributions)
        .where(eq(schema.distributions.articleId, articleId));
    }
    return await db.select().from(schema.distributions);
  }

  async getDistributionById(id: string): Promise<Distribution | undefined> {
    const result = await db
      .select()
      .from(schema.distributions)
      .where(eq(schema.distributions.id, id));
    return result[0];
  }

  async updateDistribution(
    id: string,
    update: Partial<InsertDistribution>,
  ): Promise<Distribution | undefined> {
    const result = await db
      .update(schema.distributions)
      .set(update)
      .where(eq(schema.distributions.id, id))
      .returning();
    return result[0];
  }

  async createGeoRanking(insertRanking: InsertGeoRanking): Promise<GeoRanking> {
    // onConflictDoNothing guards the partial unique index on
    // (run_id, brand_prompt_id, ai_platform) - migration 0085. The unlocked
    // kickoff-inline run and the cron drain can otherwise both write the same
    // (run, prompt, platform) cell, and the run aggregate COUNT(*)/SUM would
    // then double-count, corrupting total_checks / citation_rate.
    const result = await db
      .insert(schema.geoRankings)
      .values(insertRanking)
      .onConflictDoNothing()
      .returning();
    if (result[0]) return result[0];
    // Conflict: a row for this (run, prompt, platform) already exists - the
    // index only fires when both run_id and brand_prompt_id are non-null, so
    // both are safe to filter on here. Return the existing row so the caller's
    // contract (always get a row back) holds.
    const [existing] = await db
      .select()
      .from(schema.geoRankings)
      .where(
        and(
          eq(schema.geoRankings.runId, insertRanking.runId as string),
          eq(schema.geoRankings.brandPromptId, insertRanking.brandPromptId as string),
          eq(schema.geoRankings.aiPlatform, insertRanking.aiPlatform),
        ),
      )
      .limit(1);
    return existing;
  }

  async getGeoRankings(articleId?: string): Promise<GeoRanking[]> {
    if (articleId) {
      return await db
        .select()
        .from(schema.geoRankings)
        .where(eq(schema.geoRankings.articleId, articleId));
    }
    return await db.select().from(schema.geoRankings);
  }

  async getGeoRankingsByPlatform(platform: string): Promise<GeoRanking[]> {
    return await db
      .select()
      .from(schema.geoRankings)
      .where(eq(schema.geoRankings.aiPlatform, platform));
  }

  async countCitedRankingsForArticle(articleId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.geoRankings)
      .where(and(eq(schema.geoRankings.articleId, articleId), eq(schema.geoRankings.isCited, 1)));
    return result[0]?.count ?? 0;
  }

  async getGeoRankingsByBrandPromptIds(ids: string[], sinceDate?: Date): Promise<GeoRanking[]> {
    if (ids.length === 0) return [];
    const conditions = [inArray(schema.geoRankings.brandPromptId, ids)];
    if (sinceDate) conditions.push(gte(schema.geoRankings.checkedAt, sinceDate));
    return await db
      .select()
      .from(schema.geoRankings)
      .where(and(...conditions))
      .orderBy(desc(schema.geoRankings.checkedAt));
  }

  async getPromptCitationCounts(
    promptIds: string[],
  ): Promise<Array<{ brandPromptId: string | null; checks: number; cited: number }>> {
    if (promptIds.length === 0) return [];
    return await db
      .select({
        brandPromptId: schema.geoRankings.brandPromptId,
        checks: sql<number>`count(*)::int`,
        cited: sql<number>`count(*) filter (where is_cited = 1)::int`,
      })
      .from(schema.geoRankings)
      .where(inArray(schema.geoRankings.brandPromptId, promptIds))
      .groupBy(schema.geoRankings.brandPromptId);
  }

  async getCitedRelevanceStats(
    promptIds: string[],
  ): Promise<{ cited: number; scored: number; avgRelevance: number | null }> {
    if (promptIds.length === 0) return { cited: 0, scored: 0, avgRelevance: null };
    const [result] = await db
      .select({
        cited: sql<number>`count(*) filter (where is_cited = 1)::int`,
        scored: sql<number>`count(relevance_score) filter (where is_cited = 1)::int`,
        avgRelevance: sql<
          number | null
        >`(avg(relevance_score) filter (where is_cited = 1))::float8`,
      })
      .from(schema.geoRankings)
      .where(inArray(schema.geoRankings.brandPromptId, promptIds));
    return result ?? { cited: 0, scored: 0, avgRelevance: null };
  }

  async getWeeklyCitationTrend(
    promptIds: string[],
    since: Date,
  ): Promise<Array<{ weekStart: string; total: number; cited: number }>> {
    if (promptIds.length === 0) return [];
    const weekStart = sql<string>`date_trunc('week', ${schema.geoRankings.checkedAt})::date`;
    return await db
      .select({
        weekStart,
        total: sql<number>`count(*)::int`,
        cited: sql<number>`count(*) filter (where is_cited = 1)::int`,
      })
      .from(schema.geoRankings)
      .where(
        and(
          inArray(schema.geoRankings.brandPromptId, promptIds),
          gte(schema.geoRankings.checkedAt, since),
        ),
      )
      .groupBy(weekStart)
      .orderBy(weekStart);
  }

  async getGeoRankingsByArticleIds(ids: string[], sinceDate?: Date): Promise<GeoRanking[]> {
    if (ids.length === 0) return [];
    const conditions = [inArray(schema.geoRankings.articleId, ids)];
    if (sinceDate) conditions.push(gte(schema.geoRankings.checkedAt, sinceDate));
    return await db
      .select()
      .from(schema.geoRankings)
      .where(and(...conditions))
      .orderBy(desc(schema.geoRankings.checkedAt));
  }

  async updateGeoRanking(id: string, update: Partial<GeoRanking>): Promise<GeoRanking | undefined> {
    const [row] = await db
      .update(schema.geoRankings)
      .set(update)
      .where(eq(schema.geoRankings.id, id))
      .returning();
    return row;
  }

  async createBrandPrompt(p: InsertBrandPrompt): Promise<BrandPrompt> {
    const [row] = await db.insert(schema.brandPrompts).values(p).returning();
    return row;
  }

  async getBrandPromptsByBrandId(
    brandId: string,
    opts: { status?: "tracked" | "suggested" | "archived" | "all" } = {},
  ): Promise<BrandPrompt[]> {
    const status = opts.status ?? "tracked";
    const where =
      status === "all"
        ? eq(schema.brandPrompts.brandId, brandId)
        : and(eq(schema.brandPrompts.brandId, brandId), eq(schema.brandPrompts.status, status));
    return await db
      .select()
      .from(schema.brandPrompts)
      .where(where)
      .orderBy(asc(schema.brandPrompts.orderIndex));
  }

  async deleteBrandPromptsByBrandId(brandId: string): Promise<void> {
    await db.delete(schema.brandPrompts).where(eq(schema.brandPrompts.brandId, brandId));
  }

  async archiveBrandPrompts(brandId: string): Promise<void> {
    // Archive every tracked prompt for this brand. Does not touch
    // suggestions - call archiveSuggestedPrompts for those.
    await db
      .update(schema.brandPrompts)
      .set({ isActive: 0, status: "archived" })
      .where(
        and(eq(schema.brandPrompts.brandId, brandId), eq(schema.brandPrompts.status, "tracked")),
      );
  }

  async archiveSuggestedPrompts(brandId: string): Promise<void> {
    await db
      .update(schema.brandPrompts)
      .set({ isActive: 0, status: "archived" })
      .where(
        and(eq(schema.brandPrompts.brandId, brandId), eq(schema.brandPrompts.status, "suggested")),
      );
  }

  async updateBrandPromptText(id: string, prompt: string): Promise<BrandPrompt | undefined> {
    const [row] = await db
      .update(schema.brandPrompts)
      .set({ prompt })
      .where(eq(schema.brandPrompts.id, id))
      .returning();
    return row;
  }

  async archiveBrandPrompt(id: string): Promise<void> {
    await db
      .update(schema.brandPrompts)
      .set({ isActive: 0, status: "archived" })
      .where(eq(schema.brandPrompts.id, id));
  }

  /** Flip a prompt between tracked and archived - the "ON" toggle. Keeps the
   *  legacy `isActive` int in lockstep with `status` so any older reader that
   *  still consults it does not see a contradiction. */
  async setBrandPromptStatus(
    id: string,
    status: "tracked" | "archived",
  ): Promise<BrandPrompt | undefined> {
    const [row] = await db
      .update(schema.brandPrompts)
      .set({ status, isActive: status === "tracked" ? 1 : 0 })
      .where(eq(schema.brandPrompts.id, id))
      .returning();
    return row;
  }

  async getBrandPromptById(id: string): Promise<BrandPrompt | undefined> {
    const [row] = await db.select().from(schema.brandPrompts).where(eq(schema.brandPrompts.id, id));
    return row;
  }

  /** The ON/OFF toggle. Orthogonal to status - does not touch isActive/status
   *  at all, see the column comment in shared/schema.ts. */
  async setBrandPromptPaused(id: string, paused: boolean): Promise<BrandPrompt | undefined> {
    const [row] = await db
      .update(schema.brandPrompts)
      .set({ paused })
      .where(eq(schema.brandPrompts.id, id))
      .returning();
    return row;
  }

  async getPromptTagsByBrandId(brandId: string): Promise<PromptTag[]> {
    return db
      .select()
      .from(schema.promptTags)
      .where(eq(schema.promptTags.brandId, brandId))
      .orderBy(asc(schema.promptTags.name));
  }

  /** { tagId: count of tracked/archived prompts currently wearing it }. */
  async getPromptTagCounts(brandId: string): Promise<Record<string, number>> {
    const rows = await db
      .select({
        tagId: schema.brandPromptTags.tagId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.brandPromptTags)
      .innerJoin(schema.promptTags, eq(schema.promptTags.id, schema.brandPromptTags.tagId))
      .where(eq(schema.promptTags.brandId, brandId))
      .groupBy(schema.brandPromptTags.tagId);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.tagId] = r.count;
    return out;
  }

  async createPromptTag(t: {
    brandId: string;
    name: string;
    color?: string | null;
  }): Promise<PromptTag> {
    const [row] = await db
      .insert(schema.promptTags)
      .values({ brandId: t.brandId, name: t.name, color: t.color ?? null })
      .returning();
    return row;
  }

  async updatePromptTag(
    id: string,
    update: { name?: string; color?: string | null },
  ): Promise<PromptTag | undefined> {
    const [row] = await db
      .update(schema.promptTags)
      .set(update)
      .where(eq(schema.promptTags.id, id))
      .returning();
    return row;
  }

  async deletePromptTag(id: string): Promise<void> {
    await db.delete(schema.promptTags).where(eq(schema.promptTags.id, id));
  }

  async getTagIdsByPromptId(promptId: string): Promise<string[]> {
    const rows = await db
      .select({ tagId: schema.brandPromptTags.tagId })
      .from(schema.brandPromptTags)
      .where(eq(schema.brandPromptTags.brandPromptId, promptId));
    return rows.map((r) => r.tagId);
  }

  async getPromptTagsMapByBrandId(brandId: string): Promise<Record<string, string[]>> {
    const rows = await db
      .select({
        brandPromptId: schema.brandPromptTags.brandPromptId,
        tagId: schema.brandPromptTags.tagId,
      })
      .from(schema.brandPromptTags)
      .innerJoin(schema.promptTags, eq(schema.promptTags.id, schema.brandPromptTags.tagId))
      .where(eq(schema.promptTags.brandId, brandId));
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      (out[r.brandPromptId] ??= []).push(r.tagId);
    }
    return out;
  }

  async attachPromptTag(promptId: string, tagId: string): Promise<void> {
    await db
      .insert(schema.brandPromptTags)
      .values({ brandPromptId: promptId, tagId })
      .onConflictDoNothing();
  }

  async detachPromptTag(promptId: string, tagId: string): Promise<void> {
    await db
      .delete(schema.brandPromptTags)
      .where(
        and(
          eq(schema.brandPromptTags.brandPromptId, promptId),
          eq(schema.brandPromptTags.tagId, tagId),
        ),
      );
  }

  async getPromptAudiencesByBrandId(brandId: string): Promise<PromptAudience[]> {
    return db
      .select()
      .from(schema.promptAudiences)
      .where(eq(schema.promptAudiences.brandId, brandId))
      .orderBy(asc(schema.promptAudiences.name));
  }

  async getPromptAudienceCounts(brandId: string): Promise<Record<string, number>> {
    const rows = await db
      .select({
        audienceId: schema.brandPromptAudiences.audienceId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.brandPromptAudiences)
      .innerJoin(
        schema.promptAudiences,
        eq(schema.promptAudiences.id, schema.brandPromptAudiences.audienceId),
      )
      .where(eq(schema.promptAudiences.brandId, brandId))
      .groupBy(schema.brandPromptAudiences.audienceId);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.audienceId] = r.count;
    return out;
  }

  async createPromptAudience(a: {
    brandId: string;
    name: string;
    description?: string | null;
    funnelStage?: string | null;
    generatedBy?: "ai" | "manual";
  }): Promise<PromptAudience> {
    const [row] = await db
      .insert(schema.promptAudiences)
      .values({
        brandId: a.brandId,
        name: a.name,
        description: a.description ?? null,
        funnelStage: a.funnelStage ?? null,
        generatedBy: a.generatedBy ?? "manual",
      })
      .returning();
    return row;
  }

  async deletePromptAudience(id: string): Promise<void> {
    await db.delete(schema.promptAudiences).where(eq(schema.promptAudiences.id, id));
  }

  async getAudienceIdsByPromptId(promptId: string): Promise<string[]> {
    const rows = await db
      .select({ audienceId: schema.brandPromptAudiences.audienceId })
      .from(schema.brandPromptAudiences)
      .where(eq(schema.brandPromptAudiences.brandPromptId, promptId));
    return rows.map((r) => r.audienceId);
  }

  async getPromptAudienceMapByBrandId(brandId: string): Promise<Record<string, string[]>> {
    const rows = await db
      .select({
        brandPromptId: schema.brandPromptAudiences.brandPromptId,
        audienceId: schema.brandPromptAudiences.audienceId,
      })
      .from(schema.brandPromptAudiences)
      .innerJoin(
        schema.promptAudiences,
        eq(schema.promptAudiences.id, schema.brandPromptAudiences.audienceId),
      )
      .where(eq(schema.promptAudiences.brandId, brandId));
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      (out[r.brandPromptId] ??= []).push(r.audienceId);
    }
    return out;
  }

  async attachPromptAudience(promptId: string, audienceId: string): Promise<void> {
    await db
      .insert(schema.brandPromptAudiences)
      .values({ brandPromptId: promptId, audienceId })
      .onConflictDoNothing();
  }

  async detachPromptAudience(promptId: string, audienceId: string): Promise<void> {
    await db
      .delete(schema.brandPromptAudiences)
      .where(
        and(
          eq(schema.brandPromptAudiences.brandPromptId, promptId),
          eq(schema.brandPromptAudiences.audienceId, audienceId),
        ),
      );
  }

  async getLatestAiAudienceCreatedAt(brandId: string): Promise<Date | null> {
    const [row] = await db
      .select({ createdAt: schema.promptAudiences.createdAt })
      .from(schema.promptAudiences)
      .where(
        and(
          eq(schema.promptAudiences.brandId, brandId),
          eq(schema.promptAudiences.generatedBy, "ai"),
        ),
      )
      .orderBy(desc(schema.promptAudiences.createdAt))
      .limit(1);
    return row?.createdAt ?? null;
  }

  async getLatestSetHealthRun(brandId: string): Promise<PromptSetHealthRun | undefined> {
    const [row] = await db
      .select()
      .from(schema.promptSetHealthRuns)
      .where(eq(schema.promptSetHealthRuns.brandId, brandId))
      .orderBy(desc(schema.promptSetHealthRuns.createdAt))
      .limit(1);
    return row;
  }

  async createSetHealthRun(run: {
    brandId: string;
    score: number | null;
    verdict: string | null;
    topFix: unknown;
    issues: unknown[];
    workingWell: string[];
  }): Promise<PromptSetHealthRun> {
    const [row] = await db
      .insert(schema.promptSetHealthRuns)
      .values({
        brandId: run.brandId,
        score: run.score,
        verdict: run.verdict,
        topFix: run.topFix as any,
        issues: run.issues as any,
        workingWell: run.workingWell,
      })
      .returning();
    return row;
  }

  async getPhrasingTestsByPromptId(promptId: string): Promise<PromptPhrasingTest[]> {
    return db
      .select()
      .from(schema.promptPhrasingTests)
      .where(eq(schema.promptPhrasingTests.brandPromptId, promptId))
      .orderBy(desc(schema.promptPhrasingTests.createdAt));
  }

  async getPhrasingTestById(id: string): Promise<PromptPhrasingTest | undefined> {
    const [row] = await db
      .select()
      .from(schema.promptPhrasingTests)
      .where(eq(schema.promptPhrasingTests.id, id));
    return row;
  }

  async createPhrasingTest(t: {
    brandPromptId: string;
    phrasing: string;
    rationale?: string | null;
  }): Promise<PromptPhrasingTest> {
    const [row] = await db
      .insert(schema.promptPhrasingTests)
      .values({
        brandPromptId: t.brandPromptId,
        phrasing: t.phrasing,
        rationale: t.rationale ?? null,
      })
      .returning();
    return row;
  }

  async setPhrasingTestResults(
    id: string,
    results: unknown,
  ): Promise<PromptPhrasingTest | undefined> {
    const [row] = await db
      .update(schema.promptPhrasingTests)
      .set({ results: results as any })
      .where(eq(schema.promptPhrasingTests.id, id))
      .returning();
    return row;
  }

  /** Persist a manual reordering. Written in one transaction so a failure
   *  part-way cannot leave two prompts sharing an index. */
  async reorderBrandPrompts(brandId: string, orderedIds: string[]): Promise<void> {
    if (orderedIds.length === 0) return;
    await db.transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx
          .update(schema.brandPrompts)
          .set({ orderIndex: index })
          .where(and(eq(schema.brandPrompts.id, id), eq(schema.brandPrompts.brandId, brandId)));
      }
    });
  }

  /** Highest orderIndex currently in use, so a newly created prompt lands at
   *  the bottom of the list instead of colliding with position 0. */
  async getMaxBrandPromptOrderIndex(brandId: string): Promise<number> {
    const rows = await db
      .select({ orderIndex: schema.brandPrompts.orderIndex })
      .from(schema.brandPrompts)
      .where(eq(schema.brandPrompts.brandId, brandId))
      .orderBy(desc(schema.brandPrompts.orderIndex))
      .limit(1);
    return rows[0]?.orderIndex ?? -1;
  }

  async promoteSuggestionToTracked(
    suggestionId: string,
    replaceTrackedId: string | null,
  ): Promise<void> {
    // Use an atomic swap when replacing. Both updates succeed together
    // so we can't end up with two tracked prompts (or none) for the slot.
    // When replaceTrackedId is null, the user is filling an
    // empty slot (tracked count < cap) - just promote, no archive.
    await db.transaction(async (tx) => {
      if (replaceTrackedId) {
        await tx
          .update(schema.brandPrompts)
          .set({ isActive: 0, status: "archived" })
          .where(eq(schema.brandPrompts.id, replaceTrackedId));
      }
      await tx
        .update(schema.brandPrompts)
        .set({ isActive: 1, status: "tracked" })
        .where(eq(schema.brandPrompts.id, suggestionId));
    });
  }

  async createPromptGeneration(brandId: string): Promise<schema.PromptGeneration> {
    // Count existing generations for this brand to determine the next number
    const existing = await db
      .select({ id: schema.promptGenerations.id })
      .from(schema.promptGenerations)
      .where(eq(schema.promptGenerations.brandId, brandId));
    const generationNumber = existing.length + 1;

    const [row] = await db
      .insert(schema.promptGenerations)
      .values({ brandId, generationNumber })
      .returning();
    return row;
  }

  async getPromptGenerationsByBrandId(brandId: string): Promise<schema.PromptGeneration[]> {
    return await db
      .select()
      .from(schema.promptGenerations)
      .where(eq(schema.promptGenerations.brandId, brandId))
      .orderBy(desc(schema.promptGenerations.createdAt));
  }

  async getGeoRankingsByRunId(runId: string): Promise<GeoRanking[]> {
    return await db
      .select()
      .from(schema.geoRankings)
      .where(eq(schema.geoRankings.runId, runId))
      .orderBy(asc(schema.geoRankings.prompt), asc(schema.geoRankings.aiPlatform));
  }

  async getRecentArticlesByBrandId(brandId: string, limit: number): Promise<Article[]> {
    return await db
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.brandId, brandId))
      .orderBy(desc(schema.articles.createdAt))
      .limit(limit);
  }

  async getVisibilityProgress(brandId: string) {
    return await db
      .select()
      .from(schema.visibilityProgress)
      .where(eq(schema.visibilityProgress.brandId, brandId));
  }

  async setVisibilityStep(brandId: string, engineId: string, stepId: string): Promise<void> {
    await db
      .insert(schema.visibilityProgress)
      .values({ brandId, engineId, stepId })
      .onConflictDoNothing();
  }

  async unsetVisibilityStep(brandId: string, engineId: string, stepId: string): Promise<void> {
    await db
      .delete(schema.visibilityProgress)
      .where(
        and(
          eq(schema.visibilityProgress.brandId, brandId),
          eq(schema.visibilityProgress.engineId, engineId),
          eq(schema.visibilityProgress.stepId, stepId),
        ),
      );
  }

  async recordGeoSignalRun(run: InsertGeoSignalRun): Promise<GeoSignalRun> {
    const [row] = await db.insert(schema.geoSignalRuns).values(run).returning();
    return row;
  }

  async getLastGeoSignalRunAt(brandId: string): Promise<Date | null> {
    const [row] = await db
      .select({ ranAt: schema.geoSignalRuns.ranAt })
      .from(schema.geoSignalRuns)
      .where(eq(schema.geoSignalRuns.brandId, brandId))
      .orderBy(desc(schema.geoSignalRuns.ranAt))
      .limit(1);
    return row?.ranAt ? new Date(row.ranAt as string | Date) : null;
  }

  /** Phase 6 - Pulse cross-feature. Returns the latest Signals run's
   *  ranAt AND its overallScore so the recommendations engine can fire
   *  a DIFFERENT rec for a low-scoring scan ("Your last scan returned
   *  35% - content depth is below threshold") vs just a stale-scan
   *  rec ("Last scan was N days ago"). Previously the engine only had
   *  ranAt and treated every scan equally regardless of result. */
  async getLastGeoSignalSummary(
    brandId: string,
  ): Promise<{ ranAt: Date; overallScore: number | null } | null> {
    const [row] = await db
      .select({
        ranAt: schema.geoSignalRuns.ranAt,
        overallScore: schema.geoSignalRuns.overallScore,
      })
      .from(schema.geoSignalRuns)
      .where(eq(schema.geoSignalRuns.brandId, brandId))
      .orderBy(desc(schema.geoSignalRuns.ranAt))
      .limit(1);
    if (!row?.ranAt) return null;
    return {
      ranAt: new Date(row.ranAt as string | Date),
      overallScore: row.overallScore ?? null,
    };
  }

  async createCitationRun(run: InsertCitationRun): Promise<CitationRun> {
    const [row] = await db.insert(schema.citationRuns).values(run).returning();
    return row;
  }

  async updateCitationRun(
    id: string,
    update: Partial<CitationRun>,
  ): Promise<CitationRun | undefined> {
    const [row] = await db
      .update(schema.citationRuns)
      .set(update)
      .where(eq(schema.citationRuns.id, id))
      .returning();
    return row;
  }

  async getCitationRunsByBrandId(brandId: string, limit = 50): Promise<CitationRun[]> {
    return await db
      .select()
      .from(schema.citationRuns)
      .where(eq(schema.citationRuns.brandId, brandId))
      .orderBy(desc(schema.citationRuns.startedAt))
      .limit(limit);
  }

  // The async kickoff path uses this single-row read. The HTTP handler
  // creates the row, hands the runId to a detached `runBrandPrompts(...)`,
  // and returns immediately; runBrandPrompts uses this to load it back.
  async getCitationRunById(runId: string): Promise<CitationRun | undefined> {
    const [row] = await db
      .select()
      .from(schema.citationRuns)
      .where(eq(schema.citationRuns.id, runId))
      .limit(1);
    return row;
  }

  // Recompute totals and a per-platform breakdown for a run by
  // reading geo_rankings live. The canonical aggregator - call this any
  // time is_cited mutates on a ranking (re-detect, future bulk fixes)
  // so the cached aggregate on citation_runs stays in sync with what the
  // drill-down would show. Cheaper than dragging it through application
  // code: one indexed read of the run's rankings.
  async recomputeCitationRunAggregate(runId: string): Promise<{
    totalChecks: number;
    totalCited: number;
    citationRate: number;
  }> {
    const runRows = await db
      .select({
        isCited: schema.geoRankings.isCited,
        aiPlatform: schema.geoRankings.aiPlatform,
      })
      .from(schema.geoRankings)
      .where(eq(schema.geoRankings.runId, runId));

    const totalChecks = runRows.length;
    const totalCited = runRows.filter((x) => x.isCited === 1).length;
    const citationRate = totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0;

    const platformMap = new Map<string, { cited: number; checks: number }>();
    for (const x of runRows) {
      const e = platformMap.get(x.aiPlatform) || { cited: 0, checks: 0 };
      e.checks += 1;
      if (x.isCited === 1) e.cited += 1;
      platformMap.set(x.aiPlatform, e);
    }
    const platformBreakdown = Object.fromEntries(
      Array.from(platformMap.entries()).map(([p, s]) => [
        p,
        { ...s, rate: s.checks > 0 ? Math.round((s.cited / s.checks) * 100) : 0 },
      ]),
    );

    await db
      .update(schema.citationRuns)
      .set({ totalChecks, totalCited, citationRate, platformBreakdown })
      .where(eq(schema.citationRuns.id, runId));

    return { totalChecks, totalCited, citationRate };
  }

  // The live-update polling hook uses this lightweight "is any run live for this brand" check.
  // live-update polling hook on every dependent page. Hits the partial
  // index on (brand_id, status) - should be O(1) regardless of run history.
  async getActiveCitationRuns(
    brandId: string,
  ): Promise<Array<{ id: string; startedAt: Date; progressPct: number; status: string }>> {
    const rows = await db
      .select({
        id: schema.citationRuns.id,
        startedAt: schema.citationRuns.startedAt,
        progressPct: schema.citationRuns.progressPct,
        status: schema.citationRuns.status,
      })
      .from(schema.citationRuns)
      .where(
        and(
          eq(schema.citationRuns.brandId, brandId),
          inArray(schema.citationRuns.status, ["pending", "running"]),
        ),
      )
      .orderBy(desc(schema.citationRuns.startedAt));
    return rows;
  }

  // Atomic progress bump. The worker calls this every Nth completed task
  // so the SSE handler + status-gate endpoint see live values without a
  // full updateCitationRun round-trip.
  async bumpCitationRunProgress(
    runId: string,
    progressPct: number,
    totalChecks: number,
    totalCited: number,
  ): Promise<void> {
    await db
      .update(schema.citationRuns)
      .set({
        progressPct,
        totalChecks,
        totalCited,
        status: "running",
      })
      .where(eq(schema.citationRuns.id, runId));
  }

  // Single read of one run's live state for the SSE handler's tick loop.
  async getCitationRunLiveState(runId: string): Promise<
    | {
        id: string;
        status: string;
        progressPct: number;
        totalChecks: number;
        totalCited: number;
        citationRate: number;
      }
    | undefined
  > {
    const [row] = await db
      .select({
        id: schema.citationRuns.id,
        status: schema.citationRuns.status,
        progressPct: schema.citationRuns.progressPct,
        totalChecks: schema.citationRuns.totalChecks,
        totalCited: schema.citationRuns.totalCited,
        citationRate: schema.citationRuns.citationRate,
      })
      .from(schema.citationRuns)
      .where(eq(schema.citationRuns.id, runId))
      .limit(1);
    return row;
  }

  // Returns rankings written for this run since the cursor (a timestamp).
  // Used by the SSE handler to emit per-ranking events without re-sending
  // already-emitted rows. Ordered by checkedAt so the cursor advances
  // monotonically.
  async getRecentRankingsForRun(
    runId: string,
    sinceMs: number,
    limit: number = 50,
  ): Promise<Array<{ id: string; aiPlatform: string; isCited: number; checkedAt: Date | null }>> {
    const since = new Date(sinceMs);
    const rows = await db
      .select({
        id: schema.geoRankings.id,
        aiPlatform: schema.geoRankings.aiPlatform,
        isCited: schema.geoRankings.isCited,
        checkedAt: schema.geoRankings.checkedAt,
      })
      .from(schema.geoRankings)
      .where(
        and(eq(schema.geoRankings.runId, runId), sql`${schema.geoRankings.checkedAt} > ${since}`),
      )
      .orderBy(asc(schema.geoRankings.checkedAt))
      .limit(limit);
    return rows;
  }

  async enqueueContentJob(job: InsertContentGenerationJob): Promise<ContentGenerationJob> {
    const [row] = await db.insert(schema.contentGenerationJobs).values(job).returning();
    return row;
  }

  // Atomic claim: pick the oldest pending job and flip it to running in one
  // UPDATE so two worker ticks can't grab the same job. Returns undefined if
  // nothing is pending.
  async claimPendingContentJob(): Promise<ContentGenerationJob | undefined> {
    const result = await db.execute(sql`
      update public.content_generation_jobs
      set status = 'running', started_at = now()
      where id = (
        select id from public.content_generation_jobs
        where status = 'pending'
        order by created_at asc
        limit 1
        for update skip locked
      )
      returning id, user_id as "userId", brand_id as "brandId", status,
        request_payload as "requestPayload", article_id as "articleId",
        error_message as "errorMessage", created_at as "createdAt",
        started_at as "startedAt", completed_at as "completedAt"
    `);
    const row = (result as any).rows?.[0];
    return row as ContentGenerationJob | undefined;
  }

  async updateContentJob(
    id: string,
    update: Partial<ContentGenerationJob>,
  ): Promise<ContentGenerationJob | undefined> {
    const [row] = await db
      .update(schema.contentGenerationJobs)
      .set(update)
      .where(eq(schema.contentGenerationJobs.id, id))
      .returning();
    return row;
  }

  async getContentJobById(id: string, userId: string): Promise<ContentGenerationJob | undefined> {
    const [row] = await db
      .select()
      .from(schema.contentGenerationJobs)
      .where(
        and(
          eq(schema.contentGenerationJobs.id, id),
          eq(schema.contentGenerationJobs.userId, userId),
        ),
      )
      .limit(1);
    return row;
  }

  async getContentJobByIdAdmin(id: string): Promise<ContentGenerationJob | undefined> {
    const [row] = await db
      .select()
      .from(schema.contentGenerationJobs)
      .where(eq(schema.contentGenerationJobs.id, id))
      .limit(1);
    return row;
  }

  async updateContentJobResponseId(
    jobId: string,
    advanceToken: string,
    openaiResponseId: string,
  ): Promise<boolean> {
    const result = await db
      .update(schema.contentGenerationJobs)
      .set({ openaiResponseId })
      .where(
        and(
          eq(schema.contentGenerationJobs.id, jobId),
          eq(schema.contentGenerationJobs.advanceToken, advanceToken),
          eq(schema.contentGenerationJobs.status, "running"),
        ),
      )
      .returning({ id: schema.contentGenerationJobs.id });
    return result.length > 0;
  }

  async claimContentJobForSlice(
    id: string,
    sliceBudgetSeconds: number,
  ): Promise<ClaimedContentGenerationJob | undefined> {
    const leaseSeconds = Math.max(sliceBudgetSeconds, CONTENT_JOB_LEASE_SECONDS);
    const result = await db.execute(sql`
      UPDATE public.content_generation_jobs
      SET status = 'running',
          started_at = COALESCE(started_at, now()),
          last_advance_started_at = now(),
          advance_token = gen_random_uuid()::text,
          advance_lease_expires_at = now() + make_interval(secs => ${leaseSeconds})
      WHERE id = ${id}
        AND status IN ('pending', 'running')
        AND (
          advance_lease_expires_at IS NULL
          OR advance_lease_expires_at < now()
        )
      RETURNING id, user_id AS "userId", brand_id AS "brandId", status,
        request_payload AS "requestPayload", article_id AS "articleId",
        error_message AS "errorMessage", error_kind AS "errorKind",
        stream_buffer AS "streamBuffer", refunded_at AS "refundedAt",
        last_advance_started_at AS "lastAdvanceStartedAt",
        advance_token AS "advanceToken", advance_lease_expires_at AS "advanceLeaseExpiresAt",
        created_at AS "createdAt", started_at AS "startedAt",
        completed_at AS "completedAt"
    `);
    const row = (result as any).rows?.[0];
    return row as ClaimedContentGenerationJob | undefined;
  }

  async finishContentJobSlice(
    id: string,
    advanceToken: string,
    update: ContentJobTerminalUpdate,
  ): Promise<ContentGenerationJob | undefined> {
    const [row] = await db
      .update(schema.contentGenerationJobs)
      .set({ ...update, advanceToken: null, advanceLeaseExpiresAt: null })
      .where(
        and(
          eq(schema.contentGenerationJobs.id, id),
          eq(schema.contentGenerationJobs.advanceToken, advanceToken),
          eq(schema.contentGenerationJobs.status, "running"),
        ),
      )
      .returning();
    return row;
  }

  async completeContentJobSlice(
    id: string,
    advanceToken: string,
    article: CompletedContentJob,
    cost: CompletedContentJobCost,
  ): Promise<boolean> {
    return this.completeContentJobSliceInTransaction(id, advanceToken, article, cost);
  }

  /** Legacy completion path for callers that do not have provider usage data. */
  async completeContentJobSliceLegacy(
    id: string,
    advanceToken: string,
    article: CompletedContentJob,
  ): Promise<boolean> {
    return this.completeContentJobSliceInTransaction(id, advanceToken, article, null);
  }

  private async completeContentJobSliceInTransaction(
    id: string,
    advanceToken: string,
    article: CompletedContentJob,
    cost: CompletedContentJobCost | null,
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [job] = await tx
        .update(schema.contentGenerationJobs)
        .set({
          status: "succeeded",
          completedAt: new Date(),
          advanceToken: null,
          advanceLeaseExpiresAt: null,
        })
        .where(
          and(
            eq(schema.contentGenerationJobs.id, id),
            eq(schema.contentGenerationJobs.advanceToken, advanceToken),
            eq(schema.contentGenerationJobs.status, "running"),
          ),
        )
        .returning({
          articleId: schema.contentGenerationJobs.articleId,
          userId: schema.contentGenerationJobs.userId,
          brandId: schema.contentGenerationJobs.brandId,
        });
      if (!job) return false;
      if (!job.articleId) {
        throw new Error("Content generation job has no article");
      }

      const [updatedArticle] = await tx
        .update(schema.articles)
        .set({
          status: "ready",
          content: article.content,
          title: article.title,
          aiGenerated: true,
          jobId: null,
          version: sql`${schema.articles.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.articles.id, job.articleId), eq(schema.articles.jobId, id)))
        .returning({ id: schema.articles.id });
      if (!updatedArticle) {
        throw new Error("Content generation article is missing or has a newer job");
      }

      await tx.insert(schema.articleRevisions).values({
        articleId: job.articleId,
        content: article.content,
        source: "generated",
        createdBy: "system",
      });
      if (cost) {
        if (!job.userId || !job.brandId) {
          throw new Error("Content generation job has no user or brand for cost recording");
        }
        await tx.execute(sql`set local role venturecite_content_request`);
        await tx.execute(sql`select set_config('venturecite.user_id', ${job.userId}, true)`);
        await enqueueContentCostCommand(tx, {
          ...cost,
          contentJobId: id,
          userId: job.userId,
          brandId: job.brandId,
        });
      }
      return true;
    });
  }

  async failContentJobSlice(
    id: string,
    advanceToken: string,
    failure: FailedContentJob,
  ): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [job] = await tx
        .update(schema.contentGenerationJobs)
        .set({
          status: "failed",
          errorKind: failure.errorKind,
          errorMessage: failure.errorMessage,
          completedAt: new Date(),
          advanceToken: null,
          advanceLeaseExpiresAt: null,
        })
        .where(
          and(
            eq(schema.contentGenerationJobs.id, id),
            eq(schema.contentGenerationJobs.advanceToken, advanceToken),
            eq(schema.contentGenerationJobs.status, "running"),
          ),
        )
        .returning({ articleId: schema.contentGenerationJobs.articleId });
      if (!job) return false;
      if (!job.articleId) {
        throw new Error("Content generation job has no article");
      }

      const [updatedArticle] = await tx
        .update(schema.articles)
        .set({ status: "failed", jobId: null, updatedAt: new Date() })
        .where(and(eq(schema.articles.id, job.articleId), eq(schema.articles.jobId, id)))
        .returning({ id: schema.articles.id });
      if (!updatedArticle) {
        throw new Error("Content generation article is missing or has a newer job");
      }
      return true;
    });
  }

  async renewContentJobSliceLease(id: string, advanceToken: string): Promise<boolean> {
    const result = await db.execute(sql`
      UPDATE public.content_generation_jobs
      SET advance_lease_expires_at = now() + make_interval(secs => ${CONTENT_JOB_LEASE_SECONDS})
      WHERE id = ${id}
        AND advance_token = ${advanceToken}
        AND status = 'running'
      RETURNING id
    `);
    return ((result as { rows?: unknown[] }).rows?.length ?? 0) > 0;
  }

  async releaseContentJobSliceLease(id: string, advanceToken: string): Promise<boolean> {
    const result = await db.execute(sql`
      UPDATE public.content_generation_jobs
      SET advance_token = NULL,
          advance_lease_expires_at = NULL
      WHERE id = ${id}
        AND advance_token = ${advanceToken}
        AND status = 'running'
      RETURNING id
    `);
    return ((result as { rows?: unknown[] }).rows?.length ?? 0) > 0;
  }

  async cancelContentJob(id: string): Promise<ContentGenerationJob | undefined> {
    const [row] = await db
      .update(schema.contentGenerationJobs)
      .set({
        status: "cancelled",
        completedAt: new Date(),
        advanceToken: null,
        advanceLeaseExpiresAt: null,
      })
      .where(
        and(
          eq(schema.contentGenerationJobs.id, id),
          inArray(schema.contentGenerationJobs.status, ["pending", "running"]),
        ),
      )
      .returning();
    return row;
  }

  async resetArticleForCancelledContentJob(id: string): Promise<boolean> {
    const result = await db.execute(sql`
      UPDATE public.articles
      SET status = 'draft', job_id = NULL, updated_at = now()
      WHERE job_id = ${id}
        AND EXISTS (
          SELECT 1
          FROM public.content_generation_jobs
          WHERE id = ${id}
            AND status = 'cancelled'
        )
      RETURNING id
    `);
    return ((result as { rows?: unknown[] }).rows?.length ?? 0) > 0;
  }

  async setArticleGeneratingForContentJob(id: string, advanceToken: string): Promise<boolean> {
    const result = await db.execute(sql`
      UPDATE public.articles
      SET status = 'generating', updated_at = now()
      WHERE id = (
        SELECT article_id
        FROM public.content_generation_jobs
        WHERE id = ${id}
          AND advance_token = ${advanceToken}
          AND status = 'running'
      )
        AND status IN ('draft', 'generating')
      RETURNING id
    `);
    return ((result as { rows?: unknown[] }).rows?.length ?? 0) > 0;
  }

  async getActiveContentJob(userId: string): Promise<ContentGenerationJob | undefined> {
    const [row] = await db
      .select()
      .from(schema.contentGenerationJobs)
      .where(
        and(
          eq(schema.contentGenerationJobs.userId, userId),
          or(
            eq(schema.contentGenerationJobs.status, "pending"),
            eq(schema.contentGenerationJobs.status, "running"),
          ),
        ),
      )
      .orderBy(desc(schema.contentGenerationJobs.createdAt))
      .limit(1);
    return row;
  }

  async getRecentCompletedContentJob(userId: string): Promise<ContentGenerationJob | undefined> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db
      .select()
      .from(schema.contentGenerationJobs)
      .where(
        and(
          eq(schema.contentGenerationJobs.userId, userId),
          eq(schema.contentGenerationJobs.status, "succeeded"),
          gte(schema.contentGenerationJobs.completedAt, oneDayAgo),
        ),
      )
      .orderBy(desc(schema.contentGenerationJobs.completedAt))
      .limit(1);
    return row;
  }

  // Crash recovery - flip `running` jobs older than N minutes back to
  // `failed`. Called once on server boot so we don't have orphaned rows.
  // Also classify the failure as 'timeout', which the refund
  // helper considers refundable) and returns the affected jobs so the
  // caller can issue refunds + flip the linked article back to draft.
  async failStuckContentJobs(
    olderThanMinutes: number,
  ): Promise<Array<{ id: string; userId: string; articleId: string | null }>> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const result = await db
      .update(schema.contentGenerationJobs)
      .set({
        status: "failed",
        errorMessage: "Job was interrupted (server restart or crash).",
        errorKind: "timeout",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.contentGenerationJobs.status, "running"),
          sql`${schema.contentGenerationJobs.startedAt} < ${cutoff}`,
        ),
      )
      .returning({
        id: schema.contentGenerationJobs.id,
        userId: schema.contentGenerationJobs.userId,
        articleId: schema.contentGenerationJobs.articleId,
      });
    return result;
  }

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
  }

  async incrementArticleUsage(userId: string): Promise<boolean> {
    const result = await db
      .update(schema.users)
      .set({ articlesUsedThisMonth: sql`${schema.users.articlesUsedThisMonth} + 1` })
      .where(eq(schema.users.id, userId))
      .returning();
    return result.length > 0;
  }

  async resetMonthlyUsage(userId: string): Promise<void> {
    await db
      .update(schema.users)
      .set({ articlesUsedThisMonth: 0, usageResetDate: new Date() })
      .where(eq(schema.users.id, userId));
  }

  // Case-insensitive append. Returns true if the variation was added,
  // false if it already existed (or the brand doesn't exist). The dedup
  // runs client-side because Postgres array-contains is case-sensitive.
  async createBrandVisibilitySnapshot(
    snapshot: InsertBrandVisibilitySnapshot,
  ): Promise<BrandVisibilitySnapshot> {
    const result = await db.insert(schema.brandVisibilitySnapshots).values(snapshot).returning();
    return result[0];
  }

  async getBrandVisibilitySnapshots(
    brandId: string,
    limit?: number,
  ): Promise<BrandVisibilitySnapshot[]> {
    const query = db
      .select()
      .from(schema.brandVisibilitySnapshots)
      .where(eq(schema.brandVisibilitySnapshots.brandId, brandId))
      .orderBy(desc(schema.brandVisibilitySnapshots.snapshotDate));
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async createListicle(insertListicle: InsertListicle): Promise<Listicle> {
    const result = await db.insert(schema.listicles).values(insertListicle).returning();
    return result[0];
  }

  async getListicles(brandId?: string): Promise<Listicle[]> {
    if (brandId) {
      return await db.select().from(schema.listicles).where(eq(schema.listicles.brandId, brandId));
    }
    return await db.select().from(schema.listicles);
  }

  async getListicleById(id: string): Promise<Listicle | undefined> {
    const result = await db.select().from(schema.listicles).where(eq(schema.listicles.id, id));
    return result[0];
  }

  async updateListicle(id: string, update: Partial<InsertListicle>): Promise<Listicle | undefined> {
    const result = await db
      .update(schema.listicles)
      .set({ ...update, lastChecked: new Date() })
      .where(eq(schema.listicles.id, id))
      .returning();
    return result[0];
  }

  async deleteListicle(id: string): Promise<boolean> {
    const result = await db.delete(schema.listicles).where(eq(schema.listicles.id, id)).returning();
    return result.length > 0;
  }

  async createWikipediaMention(insertMention: InsertWikipediaMention): Promise<WikipediaMention> {
    const result = await db.insert(schema.wikipediaMentions).values(insertMention).returning();
    return result[0];
  }

  async getWikipediaMentions(brandId?: string): Promise<WikipediaMention[]> {
    if (brandId) {
      return await db
        .select()
        .from(schema.wikipediaMentions)
        .where(eq(schema.wikipediaMentions.brandId, brandId));
    }
    return await db.select().from(schema.wikipediaMentions);
  }

  async updateWikipediaMention(
    id: string,
    update: Partial<InsertWikipediaMention>,
  ): Promise<WikipediaMention | undefined> {
    const result = await db
      .update(schema.wikipediaMentions)
      .set({ ...update, lastVerified: new Date() })
      .where(eq(schema.wikipediaMentions.id, id))
      .returning();
    return result[0];
  }

  async deleteWikipediaMention(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.wikipediaMentions)
      .where(eq(schema.wikipediaMentions.id, id))
      .returning();
    return result.length > 0;
  }

  async createBofuContent(insertContent: InsertBofuContent): Promise<BofuContent> {
    const result = await db.insert(schema.bofuContent).values(insertContent).returning();
    return result[0];
  }

  async getBofuContent(brandId?: string, contentType?: string): Promise<BofuContent[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.bofuContent.brandId, brandId));
    if (contentType) conditions.push(eq(schema.bofuContent.contentType, contentType));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.bofuContent)
        .where(and(...conditions));
    }
    return await db.select().from(schema.bofuContent);
  }

  async getBofuContentById(id: string): Promise<BofuContent | undefined> {
    const result = await db.select().from(schema.bofuContent).where(eq(schema.bofuContent.id, id));
    return result[0];
  }

  async updateBofuContent(
    id: string,
    update: Partial<InsertBofuContent>,
  ): Promise<BofuContent | undefined> {
    const result = await db
      .update(schema.bofuContent)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.bofuContent.id, id))
      .returning();
    return result[0];
  }

  async deleteBofuContent(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.bofuContent)
      .where(eq(schema.bofuContent.id, id))
      .returning();
    return result.length > 0;
  }

  async createFaqItem(insertFaq: InsertFaqItem): Promise<FaqItem> {
    const result = await db.insert(schema.faqItems).values(insertFaq).returning();
    return result[0];
  }

  async getFaqItems(brandId?: string, articleId?: string): Promise<FaqItem[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.faqItems.brandId, brandId));
    if (articleId) conditions.push(eq(schema.faqItems.articleId, articleId));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.faqItems)
        .where(and(...conditions));
    }
    return await db.select().from(schema.faqItems);
  }

  async getFaqItemById(id: string): Promise<FaqItem | undefined> {
    const result = await db.select().from(schema.faqItems).where(eq(schema.faqItems.id, id));
    return result[0];
  }

  async updateFaqItem(id: string, update: Partial<InsertFaqItem>): Promise<FaqItem | undefined> {
    const result = await db
      .update(schema.faqItems)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.faqItems.id, id))
      .returning();
    return result[0];
  }

  async deleteFaqItem(id: string): Promise<boolean> {
    const result = await db.delete(schema.faqItems).where(eq(schema.faqItems.id, id)).returning();
    return result.length > 0;
  }

  async createBrandMention(insertMention: InsertBrandMention): Promise<BrandMention> {
    const withDiscoveredAt = {
      ...insertMention,
      discoveredAt: (insertMention as { discoveredAt?: Date }).discoveredAt ?? new Date(),
    };
    const result = await db.insert(schema.brandMentions).values(withDiscoveredAt).returning();
    return result[0];
  }

  async getBrandMentions(brandId?: string, platform?: string): Promise<BrandMention[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.brandMentions.brandId, brandId));
    if (platform) conditions.push(eq(schema.brandMentions.platform, platform));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.brandMentions)
        .where(and(...conditions))
        .orderBy(desc(schema.brandMentions.discoveredAt));
    }
    return await db
      .select()
      .from(schema.brandMentions)
      .orderBy(desc(schema.brandMentions.discoveredAt));
  }

  async getBrandMentionById(id: string): Promise<BrandMention | undefined> {
    const result = await db
      .select()
      .from(schema.brandMentions)
      .where(eq(schema.brandMentions.id, id));
    return result[0];
  }

  async updateBrandMention(
    id: string,
    update: Partial<InsertBrandMention>,
  ): Promise<BrandMention | undefined> {
    const result = await db
      .update(schema.brandMentions)
      .set(update)
      .where(eq(schema.brandMentions.id, id))
      .returning();
    return result[0];
  }

  async deleteBrandMention(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.brandMentions)
      .where(eq(schema.brandMentions.id, id))
      .returning();
    return result.length > 0;
  }

  // Idempotent scanner inserts. Return the row only if
  // the insert actually happened (i.e. no unique-index conflict). Used
  // by the listicle / wikipedia / mention scanners to count "newly
  // inserted" vs "skipped duplicate" without a pre-read.
  async tryInsertListicle(insert: InsertListicle): Promise<Listicle | null> {
    const result = await db
      .insert(schema.listicles)
      .values(insert)
      .onConflictDoNothing()
      .returning();
    return result[0] ?? null;
  }

  async tryInsertWikipediaMention(
    insert: InsertWikipediaMention,
  ): Promise<WikipediaMention | null> {
    const result = await db
      .insert(schema.wikipediaMentions)
      .values(insert)
      .onConflictDoNothing()
      .returning();
    return result[0] ?? null;
  }

  async tryInsertBrandMention(insert: InsertBrandMention): Promise<BrandMention | null> {
    // Force discoveredAt from the Node process's `new Date()` rather than
    // letting Postgres default it via `now()`. The DB clock or session
    // timezone can be hours off from real UTC, which made every mention
    // display "about 6 hours ago" the moment it was inserted. JS Date
    // is always an absolute UTC instant, independent of host config.
    const withDiscoveredAt = {
      ...insert,
      discoveredAt: (insert as { discoveredAt?: Date }).discoveredAt ?? new Date(),
    };
    const result = await db
      .insert(schema.brandMentions)
      .values(withDiscoveredAt)
      .onConflictDoNothing()
      .returning();
    return result[0] ?? null;
  }

  // Trigram similarity-based FAQ deduplication. Return the highest
  // similarity > threshold, or null if none. Falls back to exact-match
  // when the pg_trgm extension or function is unavailable (the
  // similarity() call throws → caller catches and treats as no match).
  //
  // similarity() is schema-qualified as extensions.similarity() because
  // pg_trgm lives in the `extensions` schema (migration 0084), and the
  // pooler connection's search_path ("$user", public) does not include it.
  async findSimilarFaqQuestion(
    brandId: string,
    question: string,
    threshold = 0.65,
  ): Promise<{ id: string; question: string; similarity: number } | null> {
    try {
      const rows = await db.execute(sql`
        SELECT id, question, extensions.similarity(question, ${question}) AS sim
        FROM faq_items
        WHERE brand_id = ${brandId}
          AND extensions.similarity(question, ${question}) >= ${threshold}
        ORDER BY sim DESC
        LIMIT 1
      `);
      const row = (rows as any).rows?.[0] ?? (rows as any)[0];
      if (!row) return null;
      return {
        id: String(row.id),
        question: String(row.question),
        similarity: Number(row.sim),
      };
    } catch {
      // pg_trgm not available - fall back to exact case-insensitive match.
      const exact = await db
        .select({ id: schema.faqItems.id, question: schema.faqItems.question })
        .from(schema.faqItems)
        .where(
          and(
            eq(schema.faqItems.brandId, brandId),
            sql`lower(${schema.faqItems.question}) = lower(${question})`,
          ),
        )
        .limit(1);
      if (exact.length === 0) return null;
      return { id: exact[0].id, question: exact[0].question, similarity: 1 };
    }
  }

  // ============================================================
  // tracked_content_urls and self-citation tracking.
  // ============================================================

  async upsertTrackedContentUrl(insert: InsertTrackedContentUrl): Promise<TrackedContentUrl> {
    // One row per (source_type, source_id) - when a piece of content's
    // published_url changes we update in place rather than churning.
    const existing = await db
      .select()
      .from(schema.trackedContentUrls)
      .where(
        and(
          eq(schema.trackedContentUrls.sourceType, insert.sourceType),
          eq(schema.trackedContentUrls.sourceId, insert.sourceId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const updated = await db
        .update(schema.trackedContentUrls)
        .set({
          brandId: insert.brandId,
          url: insert.url,
          normalizedUrl: insert.normalizedUrl,
        })
        .where(eq(schema.trackedContentUrls.id, existing[0].id))
        .returning();
      return updated[0];
    }
    const inserted = await db.insert(schema.trackedContentUrls).values(insert).returning();
    return inserted[0];
  }

  async deleteTrackedContentUrlBySource(
    sourceType: "bofu" | "faq",
    sourceId: string,
  ): Promise<boolean> {
    const result = await db
      .delete(schema.trackedContentUrls)
      .where(
        and(
          eq(schema.trackedContentUrls.sourceType, sourceType),
          eq(schema.trackedContentUrls.sourceId, sourceId),
        ),
      )
      .returning();
    return result.length > 0;
  }

  async getTrackedContentUrlsByBrandId(brandId: string): Promise<TrackedContentUrl[]> {
    return await db
      .select()
      .from(schema.trackedContentUrls)
      .where(eq(schema.trackedContentUrls.brandId, brandId));
  }

  async stampSelfCitation(
    sourceType: "bofu" | "faq",
    sourceId: string,
    at: Date = new Date(),
  ): Promise<void> {
    if (sourceType === "bofu") {
      await db
        .update(schema.bofuContent)
        .set({ lastCitedAt: at })
        .where(eq(schema.bofuContent.id, sourceId));
    } else {
      await db
        .update(schema.faqItems)
        .set({ lastCitedAt: at })
        .where(eq(schema.faqItems.id, sourceId));
    }
  }

  async incrementCitationRunSelfCitations(runId: string, by = 1): Promise<void> {
    await db
      .update(schema.citationRuns)
      .set({
        selfCitationCount: sql`${schema.citationRuns.selfCitationCount} + ${by}`,
      })
      .where(eq(schema.citationRuns.id, runId));
  }

  // ============================================================
  // GEO Tools header summary. A single query returns the count rollup.
  // per brand. Used by GET /api/geo-tools/summary/:brandId.
  // ============================================================

  async getGeoToolsSummary(brandId: string): Promise<{
    listicles: { total: number; included: number };
    wikipedia: { existing: number; opportunities: number };
    bofu: { drafts: number; published: number; cited30d: number };
    faqs: { drafts: number; published: number; cited30d: number };
    mentions: { total: number; unaddressed: number; negative: number };
  }> {
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [listicleAgg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        included: sql<number>`count(*) filter (where is_included = 1)::int`,
      })
      .from(schema.listicles)
      .where(eq(schema.listicles.brandId, brandId));

    const [wikiAgg] = await db
      .select({
        existing: sql<number>`count(*) filter (where mention_type = 'existing')::int`,
        opportunities: sql<number>`count(*) filter (where mention_type = 'opportunity')::int`,
      })
      .from(schema.wikipediaMentions)
      .where(eq(schema.wikipediaMentions.brandId, brandId));

    const [bofuAgg] = await db
      .select({
        drafts: sql<number>`count(*) filter (where published_at is null)::int`,
        published: sql<number>`count(*) filter (where published_at is not null)::int`,
        cited30d: sql<number>`count(*) filter (where last_cited_at >= ${cutoff30d})::int`,
      })
      .from(schema.bofuContent)
      .where(eq(schema.bofuContent.brandId, brandId));

    const [faqAgg] = await db
      .select({
        drafts: sql<number>`count(*) filter (where published_at is null)::int`,
        published: sql<number>`count(*) filter (where published_at is not null)::int`,
        cited30d: sql<number>`count(*) filter (where last_cited_at >= ${cutoff30d})::int`,
      })
      .from(schema.faqItems)
      .where(eq(schema.faqItems.brandId, brandId));

    const [mentionAgg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        unaddressed: sql<number>`count(*) filter (where status = 'new')::int`,
        negative: sql<number>`count(*) filter (where sentiment = 'negative')::int`,
      })
      .from(schema.brandMentions)
      .where(eq(schema.brandMentions.brandId, brandId));

    return {
      listicles: {
        total: listicleAgg?.total ?? 0,
        included: listicleAgg?.included ?? 0,
      },
      wikipedia: {
        existing: wikiAgg?.existing ?? 0,
        opportunities: wikiAgg?.opportunities ?? 0,
      },
      bofu: {
        drafts: bofuAgg?.drafts ?? 0,
        published: bofuAgg?.published ?? 0,
        cited30d: bofuAgg?.cited30d ?? 0,
      },
      faqs: {
        drafts: faqAgg?.drafts ?? 0,
        published: faqAgg?.published ?? 0,
        cited30d: faqAgg?.cited30d ?? 0,
      },
      mentions: {
        total: mentionAgg?.total ?? 0,
        unaddressed: mentionAgg?.unaddressed ?? 0,
        negative: mentionAgg?.negative ?? 0,
      },
    };
  }

  async createCitationQuality(insertQuality: InsertCitationQuality): Promise<CitationQuality> {
    const result = await db.insert(schema.citationQuality).values(insertQuality).returning();
    return result[0];
  }

  async getCitationQualities(
    brandId?: string,
    filters?: { aiPlatform?: string; minScore?: number },
  ): Promise<CitationQuality[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.citationQuality.brandId, brandId));
    if (filters?.aiPlatform)
      conditions.push(eq(schema.citationQuality.aiPlatform, filters.aiPlatform));
    if (filters?.minScore !== undefined)
      conditions.push(gte(schema.citationQuality.totalQualityScore, filters.minScore));
    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(schema.citationQuality)
            .where(and(...conditions))
            .orderBy(desc(schema.citationQuality.totalQualityScore))
        : await db
            .select()
            .from(schema.citationQuality)
            .orderBy(desc(schema.citationQuality.totalQualityScore));

    // Wave D - Phase-1 fallback. citation_quality is a Phase-2 table the
    // active pipeline doesn't populate, so for real brands this always
    // returns []. Synthesize rows from geo_rankings so the Citation
    // Quality breakdown card actually renders.
    // Only kicks in when filtered to a brand; global queries skip it.
    if (rows.length === 0 && brandId) {
      const bps = await this.getBrandPromptsByBrandId(brandId);
      if (bps.length === 0) return rows;
      const rankings = await this.getGeoRankingsByBrandPromptIds(bps.map((b) => b.id));
      const cited = rankings.filter((r) => r.isCited === 1);
      if (cited.length === 0) return rows;
      const synthesized: CitationQuality[] = cited
        .map((r) => {
          const rank = r.rank ?? 99;
          const relevance = r.relevanceScore ?? 50;
          const authority = r.authorityScore ?? 50;
          // Position score inverts rank: rank 1 = 100, rank 10+ = 0
          const positionScore = Math.max(0, Math.min(100, 100 - (rank - 1) * 10));
          // Quality = weighted mix of position + relevance + authority.
          const totalQualityScore = Math.round(
            positionScore * 0.4 + relevance * 0.4 + authority * 0.2,
          );
          if (filters?.minScore !== undefined && totalQualityScore < filters.minScore) return null;
          if (filters?.aiPlatform && r.aiPlatform !== filters.aiPlatform) return null;
          return {
            id: `phase1:${r.id}`,
            brandId,
            articleId: r.articleId,
            aiPlatform: r.aiPlatform,
            prompt: r.prompt,
            citationUrl: r.citingOutletUrl ?? null,
            authorityScore: authority,
            relevanceScore: relevance,
            // No "recency" signal in Phase-1 data - derive from checkedAt
            // age: brand-new rows = 100, 90+ day old = 0.
            recencyScore: Math.max(
              0,
              Math.min(
                100,
                Math.round(
                  100 -
                    ((Date.now() - new Date(r.checkedAt).getTime()) / (90 * 24 * 60 * 60 * 1000)) *
                      100,
                ),
              ),
            ),
            positionScore,
            isPrimaryCitation: rank <= 3 ? 1 : 0,
            totalQualityScore,
            sourceType: r.sourceType ?? "ai-generated",
            competingCitations: null,
            scoredAt: r.checkedAt,
            metadata: { phase: 1, rank } as any,
          } as CitationQuality;
        })
        .filter((x): x is CitationQuality => x !== null)
        .sort((a, b) => b.totalQualityScore - a.totalQualityScore);
      return synthesized;
    }
    return rows;
  }

  async getCitationQualityById(id: string): Promise<CitationQuality | undefined> {
    const result = await db
      .select()
      .from(schema.citationQuality)
      .where(eq(schema.citationQuality.id, id));
    return result[0];
  }

  async updateCitationQuality(
    id: string,
    update: Partial<InsertCitationQuality>,
  ): Promise<CitationQuality | undefined> {
    const result = await db
      .update(schema.citationQuality)
      .set(update)
      .where(eq(schema.citationQuality.id, id))
      .returning();
    return result[0];
  }

  async deleteCitationQuality(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.citationQuality)
      .where(eq(schema.citationQuality.id, id))
      .returning();
    return result.length > 0;
  }

  async getCitationQualityStats(brandId: string): Promise<{
    avgQualityScore: number;
    primaryCitations: number;
    secondaryCitations: number;
    bySourceType: Record<string, number>;
  }> {
    const qualities = await this.getCitationQualities(brandId);

    // Fallback to Phase 1 data if Phase 2 citation_quality table is empty.
    // Compute a proxy "quality score" from rank (better rank → higher score)
    // and group citations by whether the citing outlet is the brand's own
    // site vs Reddit/Quora/Wikipedia/other.
    if (qualities.length === 0) {
      const brandPrompts = await this.getBrandPromptsByBrandId(brandId);
      const rankings =
        brandPrompts.length > 0
          ? (await this.getGeoRankingsByBrandPromptIds(brandPrompts.map((p) => p.id))).filter(
              (r) => r.isCited === 1,
            )
          : [];
      if (rankings.length === 0) {
        return { avgQualityScore: 0, primaryCitations: 0, secondaryCitations: 0, bySourceType: {} };
      }
      // rank 1-3 → primary, rank 4+ or null → secondary
      const primaryCitations = rankings.filter((r) => r.rank !== null && r.rank <= 3).length;
      const secondaryCitations = rankings.length - primaryCitations;
      // Average score: top rank = 100, rank 10 = 10, no rank = 50 baseline.
      const avgQualityScore =
        rankings.reduce((sum, r) => {
          if (r.rank === null || r.rank === undefined) return sum + 50;
          return sum + Math.max(0, 100 - (r.rank - 1) * 10);
        }, 0) / rankings.length;
      const bySourceType: Record<string, number> = {};
      rankings.forEach((r) => {
        const url = r.citingOutletUrl || "";
        let type = "other";
        if (url.includes("reddit.com")) type = "reddit";
        else if (url.includes("quora.com")) type = "quora";
        else if (url.includes("wikipedia.org")) type = "wikipedia";
        else if (url.includes("youtube.com")) type = "youtube";
        else if (url.includes("linkedin.com")) type = "linkedin";
        else if (url.includes("medium.com")) type = "medium";
        bySourceType[type] = (bySourceType[type] || 0) + 1;
      });
      return { avgQualityScore, primaryCitations, secondaryCitations, bySourceType };
    }

    const avgQualityScore =
      qualities.length > 0
        ? qualities.reduce((sum, q) => sum + q.totalQualityScore, 0) / qualities.length
        : 0;
    const primaryCitations = qualities.filter((q) => q.isPrimaryCitation === 1).length;
    const secondaryCitations = qualities.filter((q) => q.isPrimaryCitation === 0).length;

    const bySourceType: Record<string, number> = {};
    qualities.forEach((q) => {
      const type = q.sourceType || "unknown";
      bySourceType[type] = (bySourceType[type] || 0) + 1;
    });

    return { avgQualityScore, primaryCitations, secondaryCitations, bySourceType };
  }

  // Upsert on (brand_id, ai_platform, md5(claimed_statement)). Closes the
  // dedup race where two concurrent detector runs both read an empty seen
  // set and both inserted. On conflict, bump last_seen_at + seen_count so
  // the UI can show "seen 12 times" instead of 12 near-duplicate rows.
  async createBrandHallucination(
    insertHallucination: InsertBrandHallucination,
  ): Promise<BrandHallucination> {
    const h = insertHallucination as any;
    // db.execute returns raw snake_case rows. Upsert for the id, then
    // re-read via Drizzle so callers see camelCase-mapped fields.
    const result = await db.execute<{ id: string }>(sql`
      INSERT INTO brand_hallucinations (
        brand_id, ai_platform, prompt, claimed_statement, actual_fact,
        hallucination_type, severity, category, is_resolved,
        remediation_steps, remediation_status,
        ranking_id, citing_outlet_url, citation_context, article_title,
        metadata, last_seen_at, seen_count
      ) VALUES (
        ${h.brandId},
        ${h.aiPlatform},
        ${h.prompt},
        ${h.claimedStatement},
        ${h.actualFact ?? null},
        ${h.hallucinationType},
        ${h.severity ?? "medium"},
        ${h.category ?? null},
        ${h.isResolved ?? 0},
        ${h.remediationSteps ?? null},
        ${h.remediationStatus ?? "pending"},
        ${h.rankingId ?? null},
        ${h.citingOutletUrl ?? null},
        ${h.citationContext ?? null},
        ${h.articleTitle ?? null},
        ${h.metadata ?? null},
        now(),
        1
      )
      ON CONFLICT (brand_id, ai_platform, md5(claimed_statement))
      DO UPDATE SET
        last_seen_at = now(),
        seen_count = brand_hallucinations.seen_count + 1,
        -- Preserve actualFact if the re-detection happened to omit it.
        actual_fact = COALESCE(EXCLUDED.actual_fact, brand_hallucinations.actual_fact),
        ranking_id = COALESCE(EXCLUDED.ranking_id, brand_hallucinations.ranking_id),
        citing_outlet_url = COALESCE(EXCLUDED.citing_outlet_url, brand_hallucinations.citing_outlet_url),
        citation_context = COALESCE(EXCLUDED.citation_context, brand_hallucinations.citation_context)
      RETURNING id;
    `);
    const id = (result as any).rows?.[0]?.id;
    if (!id) throw new Error("createBrandHallucination upsert returned no id");
    const [row] = await db
      .select()
      .from(schema.brandHallucinations)
      .where(eq(schema.brandHallucinations.id, id))
      .limit(1);
    if (!row) throw new Error("createBrandHallucination: row not found after upsert");
    return row;
  }

  async getBrandHallucinations(
    brandId?: string,
    filters?: { severity?: string; isResolved?: boolean },
  ): Promise<BrandHallucination[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.brandHallucinations.brandId, brandId));
    if (filters?.severity)
      conditions.push(eq(schema.brandHallucinations.severity, filters.severity));
    if (filters?.isResolved !== undefined)
      conditions.push(eq(schema.brandHallucinations.isResolved, filters.isResolved ? 1 : 0));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.brandHallucinations)
        .where(and(...conditions))
        .orderBy(desc(schema.brandHallucinations.detectedAt));
    }
    return await db
      .select()
      .from(schema.brandHallucinations)
      .orderBy(desc(schema.brandHallucinations.detectedAt));
  }

  async getBrandHallucinationById(id: string): Promise<BrandHallucination | undefined> {
    const result = await db
      .select()
      .from(schema.brandHallucinations)
      .where(eq(schema.brandHallucinations.id, id));
    return result[0];
  }

  async updateBrandHallucination(
    id: string,
    update: Partial<InsertBrandHallucination>,
  ): Promise<BrandHallucination | undefined> {
    const result = await db
      .update(schema.brandHallucinations)
      .set(update)
      .where(eq(schema.brandHallucinations.id, id))
      .returning();
    return result[0];
  }

  async deleteBrandHallucination(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.brandHallucinations)
      .where(eq(schema.brandHallucinations.id, id))
      .returning();
    return result.length > 0;
  }

  async resolveBrandHallucination(id: string): Promise<BrandHallucination | undefined> {
    const result = await db
      .update(schema.brandHallucinations)
      .set({ isResolved: 1, resolvedAt: new Date(), remediationStatus: "resolved" })
      .where(eq(schema.brandHallucinations.id, id))
      .returning();
    return result[0];
  }

  async getHallucinationStats(brandId: string): Promise<{
    total: number;
    resolved: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const hallucinations = await this.getBrandHallucinations(brandId);
    const total = hallucinations.length;
    const resolved = hallucinations.filter((h) => h.isResolved === 1).length;

    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    hallucinations.forEach((h) => {
      bySeverity[h.severity] = (bySeverity[h.severity] || 0) + 1;
      byType[h.hallucinationType] = (byType[h.hallucinationType] || 0) + 1;
    });

    return { total, resolved, bySeverity, byType };
  }

  // ============================================================================
  // Spec 2 §6: Brand Fact Sheet scrape runs + pages + cost caps + diff
  // ============================================================================

  // --- scrape runs ---

  async createScrapeRun(run: InsertBrandFactScrapeRun): Promise<BrandFactScrapeRun> {
    const [row] = await db.insert(schema.brandFactScrapeRuns).values(run).returning();
    return row;
  }

  async getScrapeRunById(runId: string): Promise<BrandFactScrapeRun | null> {
    const [row] = await db
      .select()
      .from(schema.brandFactScrapeRuns)
      .where(eq(schema.brandFactScrapeRuns.id, runId))
      .limit(1);
    return row ?? null;
  }

  async getLatestCompletedScrapeRun(brandId: string): Promise<BrandFactScrapeRun | null> {
    const rows = await db
      .select()
      .from(schema.brandFactScrapeRuns)
      .where(
        and(
          eq(schema.brandFactScrapeRuns.brandId, brandId),
          eq(schema.brandFactScrapeRuns.status, "completed"),
        ),
      )
      .orderBy(desc(schema.brandFactScrapeRuns.startedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async getInFlightScrapeRun(brandId: string): Promise<{ id: string } | null> {
    const rows = await db
      .select({ id: schema.brandFactScrapeRuns.id })
      .from(schema.brandFactScrapeRuns)
      .where(
        and(
          eq(schema.brandFactScrapeRuns.brandId, brandId),
          sql`${schema.brandFactScrapeRuns.status} NOT IN ('completed','failed','timeout','cancelled')`,
        ),
      )
      .orderBy(desc(schema.brandFactScrapeRuns.startedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async getLastCompletedScrapeRunAt(brandId: string): Promise<Date | null> {
    const rows = await db
      .select({ completedAt: schema.brandFactScrapeRuns.completedAt })
      .from(schema.brandFactScrapeRuns)
      .where(
        and(
          eq(schema.brandFactScrapeRuns.brandId, brandId),
          eq(schema.brandFactScrapeRuns.status, "completed"),
        ),
      )
      .orderBy(desc(schema.brandFactScrapeRuns.completedAt))
      .limit(1);
    const completedAt = rows[0]?.completedAt;
    return completedAt ? new Date(completedAt) : null;
  }

  async updateScrapeRunStatus(
    runId: string,
    status: BrandFactScrapeRun["status"],
    fields?: {
      completedAt?: Date | null;
      errorKind?: string | null;
      errorMessage?: string | null;
      progress?: unknown;
    },
  ): Promise<BrandFactScrapeRun | null> {
    const update: Record<string, unknown> = {
      status,
      lastAdvanceAt: new Date(),
    };
    if (fields?.completedAt !== undefined) update.completedAt = fields.completedAt;
    if (fields?.errorKind !== undefined) update.errorKind = fields.errorKind;
    if (fields?.errorMessage !== undefined) update.errorMessage = fields.errorMessage;
    if (fields?.progress !== undefined) update.progress = fields.progress;
    const [row] = await db
      .update(schema.brandFactScrapeRuns)
      .set(update)
      .where(eq(schema.brandFactScrapeRuns.id, runId))
      .returning();
    return row ?? null;
  }

  async transitionScrapeRunStatusCAS(
    runId: string,
    expected: BrandFactScrapeRun["status"],
    next: BrandFactScrapeRun["status"],
  ): Promise<BrandFactScrapeRun | null> {
    const [row] = await db
      .update(schema.brandFactScrapeRuns)
      .set({ status: next, lastAdvanceAt: new Date() })
      .where(
        and(
          eq(schema.brandFactScrapeRuns.id, runId),
          eq(schema.brandFactScrapeRuns.status, expected),
        ),
      )
      .returning();
    return row ?? null;
  }

  async incrementScrapeRunCounters(
    runId: string,
    deltas: Partial<{
      pagesFetched: number;
      pagesFailed: number;
      factsExtracted: number;
      factsValidated: number;
      factsRedacted: number;
      llmCostCents: number;
      llmCalls: number;
      llmInputTokens: number;
      llmOutputTokens: number;
    }>,
  ): Promise<void> {
    // Use a single SQL with column-level increment expressions. Drizzle's
    // .set() lifts sql tags so we can build per-column `col + delta` snippets.
    const setClause: Record<string, unknown> = {};
    if (deltas.pagesFetched != null)
      setClause.pagesFetched = sql`${schema.brandFactScrapeRuns.pagesFetched} + ${deltas.pagesFetched}`;
    if (deltas.pagesFailed != null)
      setClause.pagesFailed = sql`${schema.brandFactScrapeRuns.pagesFailed} + ${deltas.pagesFailed}`;
    if (deltas.factsExtracted != null)
      setClause.factsExtracted = sql`${schema.brandFactScrapeRuns.factsExtracted} + ${deltas.factsExtracted}`;
    if (deltas.factsValidated != null)
      setClause.factsValidated = sql`${schema.brandFactScrapeRuns.factsValidated} + ${deltas.factsValidated}`;
    if (deltas.factsRedacted != null)
      setClause.factsRedacted = sql`${schema.brandFactScrapeRuns.factsRedacted} + ${deltas.factsRedacted}`;
    if (deltas.llmCostCents != null)
      setClause.llmCostCents = sql`${schema.brandFactScrapeRuns.llmCostCents} + ${deltas.llmCostCents}`;
    if (deltas.llmCalls != null)
      setClause.llmCalls = sql`${schema.brandFactScrapeRuns.llmCalls} + ${deltas.llmCalls}`;
    if (deltas.llmInputTokens != null)
      setClause.llmInputTokens = sql`${schema.brandFactScrapeRuns.llmInputTokens} + ${deltas.llmInputTokens}`;
    if (deltas.llmOutputTokens != null)
      setClause.llmOutputTokens = sql`${schema.brandFactScrapeRuns.llmOutputTokens} + ${deltas.llmOutputTokens}`;
    if (Object.keys(setClause).length === 0) return;
    await db
      .update(schema.brandFactScrapeRuns)
      .set(setClause)
      .where(eq(schema.brandFactScrapeRuns.id, runId));
  }

  // --- scrape pages ---

  async createScrapePage(page: InsertBrandFactScrapePage): Promise<BrandFactScrapePage> {
    const [row] = await db.insert(schema.brandFactScrapePages).values(page).returning();
    return row;
  }

  async updateScrapePageStatus(
    pageId: string,
    status: BrandFactScrapePage["status"],
    fields?: Partial<
      Pick<
        BrandFactScrapePage,
        | "fetchedAt"
        | "bytes"
        | "statusCode"
        | "contentType"
        | "lang"
        | "factCount"
        | "llmCostCents"
        | "errorKind"
        | "errorMessage"
        | "excerpt"
      >
    >,
  ): Promise<BrandFactScrapePage | null> {
    const update: Record<string, unknown> = { status };
    if (fields) Object.assign(update, fields);
    const [row] = await db
      .update(schema.brandFactScrapePages)
      .set(update)
      .where(eq(schema.brandFactScrapePages.id, pageId))
      .returning();
    return row ?? null;
  }

  async listScrapePagesForRun(runId: string): Promise<BrandFactScrapePage[]> {
    return await db
      .select()
      .from(schema.brandFactScrapePages)
      .where(eq(schema.brandFactScrapePages.runId, runId))
      .orderBy(asc(schema.brandFactScrapePages.id));
  }

  async getScrapePageById(
    pageId: string,
  ): Promise<{ id: string; runId: string; url: string; canonicalUrl: string } | null> {
    const rows = await db
      .select({
        id: schema.brandFactScrapePages.id,
        runId: schema.brandFactScrapePages.runId,
        url: schema.brandFactScrapePages.url,
        canonicalUrl: schema.brandFactScrapePages.canonicalUrl,
      })
      .from(schema.brandFactScrapePages)
      .where(eq(schema.brandFactScrapePages.id, pageId))
      .limit(1);
    return rows[0] ?? null;
  }

  // --- monthly cost caps ---

  async getMonthlyCostCap(brandId: string, monthKey: string): Promise<BrandMonthlyCostCap | null> {
    const [row] = await db
      .select()
      .from(schema.brandMonthlyCostCaps)
      .where(
        and(
          eq(schema.brandMonthlyCostCaps.brandId, brandId),
          eq(schema.brandMonthlyCostCaps.monthKey, monthKey),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async incrementMonthlyCostCents(
    brandId: string,
    monthKey: string,
    deltaCents: number,
  ): Promise<BrandMonthlyCostCap> {
    // Upsert. Drizzle's onConflictDoUpdate with `excluded` semantics keeps
    // the migration's default monthlyCapCents (500) for new rows and adds
    // deltaCents to existing fact_scrape_cents for old rows.
    const [row] = await db
      .insert(schema.brandMonthlyCostCaps)
      .values({
        brandId,
        monthKey,
        factScrapeCents: deltaCents,
        monthlyCapCents: 500,
      })
      .onConflictDoUpdate({
        target: [schema.brandMonthlyCostCaps.brandId, schema.brandMonthlyCostCaps.monthKey],
        set: {
          factScrapeCents: sql`${schema.brandMonthlyCostCaps.factScrapeCents} + ${deltaCents}`,
        },
      })
      .returning();
    return row;
  }

  // --- pause toggle ---

  async getBrandFactScrapeEnabled(brandId: string): Promise<boolean> {
    const [row] = await db
      .select({ enabled: schema.brands.factScrapeEnabled })
      .from(schema.brands)
      .where(eq(schema.brands.id, brandId))
      .limit(1);
    return row?.enabled ?? false;
  }

  async setBrandFactScrapeEnabled(brandId: string, enabled: boolean): Promise<boolean> {
    const [row] = await db
      .update(schema.brands)
      .set({ factScrapeEnabled: enabled })
      .where(eq(schema.brands.id, brandId))
      .returning({ enabled: schema.brands.factScrapeEnabled });
    return row?.enabled ?? enabled;
  }

  // --- diff ---

  async getBrandFactSheetConflicts(
    brandId: string,
  ): Promise<Array<{ userFact: BrandFactSheet; scrapedFact: BrandFactSheet }>> {
    // Pull every active (user, scraped) row for this brand, group in JS.
    // Counts are small (typically <50 rows per brand) so a single SELECT
    // + in-memory grouping is correct and simple.
    const rows = await db
      .select()
      .from(schema.brandFactSheet)
      .where(
        and(
          eq(schema.brandFactSheet.brandId, brandId),
          sql`${schema.brandFactSheet.acceptedAt} IS NULL`,
          sql`${schema.brandFactSheet.dismissedAt} IS NULL`,
        ),
      );
    const userByKey = new Map<string, BrandFactSheet>();
    const scrapedByKey = new Map<string, BrandFactSheet>();
    for (const r of rows) {
      const key = `${r.domain}::${r.subcategory}::${r.factKey}`;
      if (r.source === "user") userByKey.set(key, r);
      else if (r.source === "scraped") scrapedByKey.set(key, r);
    }
    const conflicts: Array<{ userFact: BrandFactSheet; scrapedFact: BrandFactSheet }> = [];
    userByKey.forEach((userFact, key) => {
      const scrapedFact = scrapedByKey.get(key);
      if (scrapedFact) conflicts.push({ userFact, scrapedFact });
    });
    return conflicts;
  }

  async acceptFact(
    factId: string,
    options: { dismissOtherSide: boolean },
  ): Promise<BrandFactSheet | null> {
    // Stamp accepted_at on this fact.
    const [target] = await db
      .update(schema.brandFactSheet)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.brandFactSheet.id, factId))
      .returning();
    if (!target) return null;
    if (options.dismissOtherSide) {
      // Find the conflicting row (same brand/domain/subcategory/factKey, different source).
      await db
        .update(schema.brandFactSheet)
        .set({ dismissedAt: new Date() })
        .where(
          and(
            eq(schema.brandFactSheet.brandId, target.brandId),
            eq(schema.brandFactSheet.domain, target.domain),
            eq(schema.brandFactSheet.subcategory, target.subcategory),
            eq(schema.brandFactSheet.factKey, target.factKey),
            sql`${schema.brandFactSheet.source} != ${target.source}`,
            sql`${schema.brandFactSheet.dismissedAt} IS NULL`,
          ),
        );
    }
    return target;
  }

  async dismissFact(factId: string): Promise<BrandFactSheet | null> {
    const [row] = await db
      .update(schema.brandFactSheet)
      .set({ dismissedAt: new Date() })
      .where(eq(schema.brandFactSheet.id, factId))
      .returning();
    return row ?? null;
  }

  async listFactsByRunIdSince(
    runId: string,
    sinceId: string | null,
    limit: number,
  ): Promise<BrandFactSheet[]> {
    // HIGH 5 (narrower fix chosen): UUID v4 ids are random, so ordering by id
    // alone is non-monotonic and a late-arriving row with a smaller id would
    // be skipped on reconnect. We now ORDER BY created_at ASC, id ASC so the
    // stream emits in insertion order. The `id > sinceId` cursor is retained
    // (rather than a composite (created_at, id) cursor) to keep the change
    // surgical; rare skip/replay on reconnect with identical-ms inserts is
    // an acceptable trade-off vs. broader signature churn.
    const conditions = [eq(schema.brandFactSheet.runId, runId)];
    if (sinceId) conditions.push(sql`${schema.brandFactSheet.id} > ${sinceId}`);
    return await db
      .select()
      .from(schema.brandFactSheet)
      .where(and(...conditions))
      .orderBy(asc(schema.brandFactSheet.createdAt), asc(schema.brandFactSheet.id))
      .limit(limit);
  }

  async createMetricsSnapshot(snapshot: InsertMetricsHistory): Promise<MetricsHistory> {
    const result = await db.insert(schema.metricsHistory).values(snapshot).returning();
    return result[0];
  }

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
  }

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
  }

  async createAlertSetting(setting: InsertAlertSettings): Promise<AlertSettings> {
    const result = await db.insert(schema.alertSettings).values(setting).returning();
    return result[0];
  }

  async getAlertSettings(brandId: string): Promise<AlertSettings[]> {
    return await db
      .select()
      .from(schema.alertSettings)
      .where(eq(schema.alertSettings.brandId, brandId));
  }

  async getAlertSettingById(id: string): Promise<AlertSettings | undefined> {
    const result = await db
      .select()
      .from(schema.alertSettings)
      .where(eq(schema.alertSettings.id, id));
    return result[0];
  }

  async updateAlertSetting(
    id: string,
    update: Partial<InsertAlertSettings>,
  ): Promise<AlertSettings | undefined> {
    const result = await db
      .update(schema.alertSettings)
      .set(update)
      .where(eq(schema.alertSettings.id, id))
      .returning();
    return result[0];
  }

  async deleteAlertSetting(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.alertSettings)
      .where(eq(schema.alertSettings.id, id))
      .returning();
    return result.length > 0;
  }

  async createAlertHistory(history: InsertAlertHistory): Promise<AlertHistory> {
    const result = await db.insert(schema.alertHistory).values(history).returning();
    return result[0];
  }

  async getAlertHistory(brandId: string, limit: number = 50): Promise<AlertHistory[]> {
    return await db
      .select()
      .from(schema.alertHistory)
      .where(eq(schema.alertHistory.brandId, brandId))
      .orderBy(desc(schema.alertHistory.sentAt))
      .limit(limit);
  }

  async createKeywordResearch(keyword: InsertKeywordResearch): Promise<KeywordResearch> {
    const result = await db.insert(schema.keywordResearch).values(keyword).returning();
    return result[0];
  }

  async getKeywordResearch(
    brandId: string,
    filters?: { status?: string; category?: string },
  ): Promise<KeywordResearch[]> {
    const conditions = [eq(schema.keywordResearch.brandId, brandId)];
    if (filters?.status) conditions.push(eq(schema.keywordResearch.status, filters.status));
    if (filters?.category) conditions.push(eq(schema.keywordResearch.category, filters.category));
    return await db
      .select()
      .from(schema.keywordResearch)
      .where(and(...conditions));
  }

  async getKeywordResearchById(id: string): Promise<KeywordResearch | undefined> {
    const result = await db
      .select()
      .from(schema.keywordResearch)
      .where(eq(schema.keywordResearch.id, id));
    return result[0];
  }

  async updateKeywordResearch(
    id: string,
    update: Partial<InsertKeywordResearch>,
  ): Promise<KeywordResearch | undefined> {
    const result = await db
      .update(schema.keywordResearch)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.keywordResearch.id, id))
      .returning();
    return result[0];
  }

  async deleteKeywordResearch(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.keywordResearch)
      .where(eq(schema.keywordResearch.id, id))
      .returning();
    return result.length > 0;
  }

  async getTopKeywordOpportunities(
    brandId: string,
    limit: number = 10,
  ): Promise<KeywordResearch[]> {
    return await db
      .select()
      .from(schema.keywordResearch)
      .where(
        and(
          eq(schema.keywordResearch.brandId, brandId),
          eq(schema.keywordResearch.status, "discovered"),
        ),
      )
      .orderBy(desc(schema.keywordResearch.opportunityScore))
      .limit(limit);
  }

  async createCommunityPost(post: InsertCommunityPost): Promise<CommunityPost> {
    const result = await db.insert(schema.communityPosts).values(post).returning();
    return result[0];
  }

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
  }

  async getCommunityPostById(id: string): Promise<CommunityPost | undefined> {
    const result = await db
      .select()
      .from(schema.communityPosts)
      .where(eq(schema.communityPosts.id, id));
    return result[0];
  }

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
  }

  async deleteCommunityPost(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.communityPosts)
      .where(eq(schema.communityPosts.id, id))
      .returning();
    return result.length > 0;
  }

  // ── Unified article methods ───────────────────────────────────────────────

  async createDraftArticle(
    userId: string,
    brandId: string,
    fields: {
      title?: string | null;
      keywords?: string[] | null;
      industry?: string | null;
      contentType?: string | null;
      targetCustomers?: string | null;
      geography?: string | null;
      contentStyle?: string | null;
    },
  ): Promise<Article> {
    // Verify the brand belongs to the user before creating an article under it.
    const ownsBrand = await db
      .select({ id: schema.brands.id })
      .from(schema.brands)
      .where(
        and(
          eq(schema.brands.id, brandId),
          eq(schema.brands.userId, userId),
          isNull(schema.brands.deletedAt),
        ),
      )
      .limit(1);
    if (ownsBrand.length === 0) {
      throw new Error("Brand not found or not owned by user");
    }
    const result = await db
      .insert(schema.articles)
      .values({
        brandId,
        title: fields.title ?? null,
        content: null,
        keywords: fields.keywords ?? null,
        industry: fields.industry ?? null,
        contentType: fields.contentType ?? null,
        targetCustomers: fields.targetCustomers ?? null,
        geography: fields.geography ?? null,
        contentStyle: fields.contentStyle ?? "b2c",
        status: "draft",
        author: "GEO Platform",
      })
      .returning();
    return result[0];
  }

  async getArticlesByUserIdWithStatus(
    userId: string,
    opts: { status?: string | string[]; brandId?: string; limit?: number; offset?: number },
  ): Promise<Article[]> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const conds = [eq(schema.brands.userId, userId), isNull(schema.brands.deletedAt)];
    if (opts.brandId) conds.push(eq(schema.articles.brandId, opts.brandId));
    if (opts.status) {
      if (Array.isArray(opts.status)) {
        conds.push(inArray(schema.articles.status, opts.status));
      } else {
        conds.push(eq(schema.articles.status, opts.status));
      }
    }
    const result = await db
      .select({ articles: schema.articles })
      .from(schema.articles)
      .innerJoin(schema.brands, eq(schema.articles.brandId, schema.brands.id))
      .where(and(...conds))
      .orderBy(desc(schema.articles.updatedAt))
      .limit(limit)
      .offset(offset);
    return result.map((r) => r.articles);
  }

  async getArticleByJobId(jobId: string): Promise<Article | undefined> {
    const result = await db
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.jobId, jobId))
      .limit(1);
    return result[0];
  }

  async setArticleGeneratingFromDraft(articleId: string, jobId: string): Promise<void> {
    // Flip draft|generating → generating. The route handler already does
    // this synchronously so the UI flips on click; this call is the worker
    // re-asserting the state when it claims the job (idempotent).
    await db
      .update(schema.articles)
      .set({
        status: "generating",
        jobId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.articles.id, articleId),
          inArray(schema.articles.status, ["draft", "generating"]),
        ),
      );
  }

  async setArticleReady(articleId: string, content: string, title: string | null): Promise<void> {
    await db
      .update(schema.articles)
      .set({
        status: "ready",
        content,
        title: title ?? sql`${schema.articles.title}`, // keep existing title if caller passes null
        jobId: null,
        version: sql`${schema.articles.version} + 1`,
        // This is the only path that flips
        // ai_generated=true. Manual creates (POST /api/articles) leave the
        // default false, so the AI-disclosure pill only renders for worker
        // output.
        aiGenerated: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.articles.id, articleId));
  }

  async setArticleFailed(articleId: string): Promise<void> {
    await db
      .update(schema.articles)
      .set({ status: "failed", jobId: null, updatedAt: new Date() })
      .where(eq(schema.articles.id, articleId));
  }

  async setArticleDraft(articleId: string): Promise<void> {
    await db
      .update(schema.articles)
      .set({ status: "draft", jobId: null, updatedAt: new Date() })
      .where(eq(schema.articles.id, articleId));
  }

  async createRevision(input: InsertArticleRevision): Promise<ArticleRevision> {
    const result = await db.insert(schema.articleRevisions).values(input).returning();
    return result[0];
  }

  async listRevisions(articleId: string, limit: number = 50): Promise<ArticleRevision[]> {
    return db
      .select()
      .from(schema.articleRevisions)
      .where(eq(schema.articleRevisions.articleId, articleId))
      .orderBy(desc(schema.articleRevisions.createdAt))
      .limit(limit);
  }

  async getRevisionById(revisionId: string): Promise<ArticleRevision | undefined> {
    const result = await db
      .select()
      .from(schema.articleRevisions)
      .where(eq(schema.articleRevisions.id, revisionId))
      .limit(1);
    return result[0];
  }

  // ─── Mentions rebuild (Task 7) ────────────────────────────────────────────

  // Source health ------------------------------------------------------------

  async getSourceHealth(brandId: string, source: string): Promise<SourceHealth | undefined> {
    const [row] = await db
      .select()
      .from(schema.sourceHealth)
      .where(and(eq(schema.sourceHealth.brandId, brandId), eq(schema.sourceHealth.source, source)))
      .limit(1);
    return row;
  }

  async upsertSourceHealth(input: InsertSourceHealth): Promise<void> {
    await db
      .insert(schema.sourceHealth)
      .values(input)
      .onConflictDoUpdate({
        target: [schema.sourceHealth.brandId, schema.sourceHealth.source],
        set: {
          consecutiveFailures: input.consecutiveFailures ?? 0,
          lastFailureAt: input.lastFailureAt ?? null,
          lastFailureReason: input.lastFailureReason ?? null,
          pausedUntil: input.pausedUntil ?? null,
          lastSuccessfulScanAt: input.lastSuccessfulScanAt ?? null,
        },
      });
  }

  // Sentiment cache ----------------------------------------------------------

  async getCachedSentiment(contentHash: string): Promise<SentimentCache | undefined> {
    const [row] = await db
      .select()
      .from(schema.sentimentCache)
      .where(eq(schema.sentimentCache.contentHash, contentHash))
      .limit(1);
    return row;
  }

  async upsertCachedSentiment(input: {
    contentHash: string;
    sentiment: string;
    sentimentScore: string;
  }): Promise<void> {
    await db
      .insert(schema.sentimentCache)
      .values({
        contentHash: input.contentHash,
        sentiment: input.sentiment,
        sentimentScore: input.sentimentScore,
      })
      .onConflictDoUpdate({
        target: schema.sentimentCache.contentHash,
        set: {
          sentiment: input.sentiment,
          sentimentScore: input.sentimentScore,
          cachedAt: new Date(),
        },
      });
  }

  async pruneOldSentimentCache(beforeDays: number): Promise<number> {
    const res = await db.execute(sql`
      DELETE FROM sentiment_cache
      WHERE cached_at < now() - (${beforeDays} || ' days')::interval
      RETURNING content_hash
    `);
    const r = res as unknown as { rows?: unknown[] } & unknown[];
    return r.rows?.length ?? (Array.isArray(r) ? r.length : 0);
  }

  // Daily sentiment cap counter ----------------------------------------------

  async countSentimentCallsForBrandSince(brandId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.brandMentions)
      .where(
        and(
          eq(schema.brandMentions.brandId, brandId),
          eq(schema.brandMentions.sentimentSource, "llm"),
          gte(schema.brandMentions.discoveredAt, since),
        ),
      );
    return row?.count ?? 0;
  }

  // Brand mention monitoring -------------------------------------------------

  async setBrandMonitorMentions(brandId: string, enabled: boolean): Promise<void> {
    await db
      .update(schema.brands)
      .set({ monitorMentions: enabled })
      .where(eq(schema.brands.id, brandId));
  }

  // Ordered least-recently-scanned first, never-scanned before that.
  //
  // The order matters because runMentionScanJob now honours a deadline and
  // bails mid-list. Unordered, Postgres would hand back much the same
  // sequence every tick, so the same prefix would be rescanned forever and
  // the tail would never be reached at all. Oldest-first makes each run pick
  // up where the last one stopped.
  async listBrandsWithMentionMonitoring(): Promise<{ id: string; userId: string }[]> {
    const lastScan = db
      .select({
        brandId: schema.scanJobs.brandId,
        lastAt: sql<Date | null>`max(${schema.scanJobs.createdAt})`.as("last_at"),
      })
      .from(schema.scanJobs)
      .groupBy(schema.scanJobs.brandId)
      .as("last_scan");

    const rows = await db
      .select({ id: schema.brands.id, userId: schema.brands.userId })
      .from(schema.brands)
      .leftJoin(lastScan, eq(lastScan.brandId, schema.brands.id))
      .where(eq(schema.brands.monitorMentions, true))
      .orderBy(sql`${lastScan.lastAt} asc nulls first`);
    // userId is nullable in the schema (historical design); brands with
    // monitor_mentions=true must have a user, so cast is safe in practice.
    return rows.map((r) => ({ id: r.id, userId: r.userId ?? "" }));
  }

  // Mention helpers ----------------------------------------------------------

  async getBrandMention(id: string): Promise<BrandMention | undefined> {
    const [row] = await db
      .select()
      .from(schema.brandMentions)
      .where(eq(schema.brandMentions.id, id))
      .limit(1);
    return row;
  }

  async deleteManyBrandMentions(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .delete(schema.brandMentions)
      .where(inArray(schema.brandMentions.id, ids))
      .returning({ id: schema.brandMentions.id });
    return result.length;
  }

  async deleteAllMentionsForBrand(brandId: string): Promise<number> {
    const result = await db
      .delete(schema.brandMentions)
      .where(eq(schema.brandMentions.brandId, brandId))
      .returning({ id: schema.brandMentions.id });
    return result.length;
  }

  async getOwnedMentionIds(ids: string[], userId: string): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select({ id: schema.brandMentions.id })
      .from(schema.brandMentions)
      .innerJoin(schema.brands, eq(schema.brandMentions.brandId, schema.brands.id))
      .where(and(inArray(schema.brandMentions.id, ids), eq(schema.brands.userId, userId)));
    return rows.map((r) => r.id);
  }

  async updateBrandMentionStatus(id: string, status: string): Promise<void> {
    await db.update(schema.brandMentions).set({ status }).where(eq(schema.brandMentions.id, id));
  }

  async getMentionStatsForBrand(brandId: string): Promise<{
    total: number;
    byPlatform: Record<string, number>;
    bySentiment: { positive: number; neutral: number; negative: number };
    byStatus: Record<string, number>;
  }> {
    // Single-pass aggregate for total + sentiment breakdown.
    // `total` is every mention. The positive/neutral/negative buckets are
    // scoped to sentiment_source = 'llm': sentimentBatcher writes a fake
    // {neutral, score 0} verdict on LLM failure / budget cap (tagged
    // 'fallback' / 'capped'), so counting those would inflate "neutral"
    // and misreport the real sentiment distribution.
    const [agg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        positive: sql<number>`count(*) filter (where sentiment = 'positive' and sentiment_source = 'llm')::int`,
        neutral: sql<number>`count(*) filter (where sentiment = 'neutral' and sentiment_source = 'llm')::int`,
        negative: sql<number>`count(*) filter (where sentiment = 'negative' and sentiment_source = 'llm')::int`,
      })
      .from(schema.brandMentions)
      .where(eq(schema.brandMentions.brandId, brandId));

    // Per-platform breakdown.
    const platformRows = await db
      .select({
        platform: schema.brandMentions.platform,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.brandMentions)
      .where(eq(schema.brandMentions.brandId, brandId))
      .groupBy(schema.brandMentions.platform);

    // Per-status breakdown.
    const statusRows = await db
      .select({
        status: schema.brandMentions.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.brandMentions)
      .where(eq(schema.brandMentions.brandId, brandId))
      .groupBy(schema.brandMentions.status);

    const byPlatform: Record<string, number> = {};
    for (const r of platformRows) {
      if (r.platform) byPlatform[r.platform] = r.count;
    }

    const byStatus: Record<string, number> = {};
    for (const r of statusRows) {
      if (r.status) byStatus[r.status] = r.count;
    }

    return {
      total: agg?.total ?? 0,
      byPlatform,
      bySentiment: {
        positive: agg?.positive ?? 0,
        neutral: agg?.neutral ?? 0,
        negative: agg?.negative ?? 0,
      },
      byStatus,
    };
  }

  // Paginated mention list ---------------------------------------------------

  async listMentionsForBrand(
    brandId: string,
    opts: {
      cursor?: { discoveredAt: Date; id: string };
      limit?: number;
      status?: string;
      platform?: string;
      sentiment?: string;
      from?: Date;
      to?: Date;
      q?: string;
      sort?: "newest" | "oldest" | "engagement";
    },
  ): Promise<{ rows: BrandMention[]; nextCursor: { discoveredAt: Date; id: string } | null }> {
    const limit = Math.min(opts.limit ?? 25, 100);
    const sort = opts.sort ?? "newest";

    // Raw `SELECT *` returns snake_case column names; the rest of the app
    // (Drizzle types + frontend) expects camelCase. Map at the boundary.
    const mapRow = (r: Record<string, unknown>): BrandMention => ({
      id: r.id as string,
      brandId: r.brand_id as string,
      platform: r.platform as string,
      sourceUrl: r.source_url as string,
      sourceTitle: (r.source_title as string | null) ?? null,
      mentionContext: (r.mention_context as string | null) ?? null,
      sentiment: (r.sentiment as string | null) ?? null,
      sentimentScore: (r.sentiment_score as string | null) ?? null,
      engagementScore: (r.engagement_score as number | null) ?? null,
      authorUsername: (r.author_username as string | null) ?? null,
      isVerified: r.is_verified as number,
      mentionedAt: r.mentioned_at ? new Date(r.mentioned_at as string) : null,
      discoveredAt: new Date(r.discovered_at as string),
      metadata: (r.metadata ?? null) as BrandMention["metadata"],
      status: r.status as string,
      mentionLocation: (r.mention_location as string | null) ?? null,
      linkStatus: (r.link_status as string | null) ?? null,
      lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at as string) : null,
      matchedVariation: (r.matched_variation as string | null) ?? null,
      matchedField: (r.matched_field as string | null) ?? null,
      source: (r.source as string | null) ?? null,
      scannerVersion: (r.scanner_version as number | null) ?? null,
      sentimentSource: (r.sentiment_source as string | null) ?? null,
      engagementNormalized: (r.engagement_normalized as number | null) ?? null,
    });

    // Build filter conditions.
    // All filtering is applied inline via raw SQL templates in each sort branch
    // (ILIKE across OR'd columns isn't expressible in Drizzle's ORM helpers).
    let rows: BrandMention[];

    if (sort === "engagement") {
      // Keyset pagination on (engagement_normalized DESC, id ASC).
      const cursorClause =
        opts.cursor != null
          ? sql`AND (engagement_normalized, id) < (
              (SELECT engagement_normalized FROM brand_mentions WHERE id = ${opts.cursor.id}),
              ${opts.cursor.id}
            )`
          : sql``;

      const qFilter = opts.q
        ? sql`AND (source_title ILIKE ${"%" + opts.q + "%"} OR mention_context ILIKE ${"%" + opts.q + "%"})`
        : sql``;

      const res = await db.execute(sql`
        SELECT * FROM brand_mentions
        WHERE brand_id = ${brandId}
          ${opts.status ? sql`AND status = ${opts.status}` : sql``}
          ${opts.platform ? sql`AND platform = ${opts.platform}` : sql``}
          ${opts.sentiment ? sql`AND sentiment = ${opts.sentiment}` : sql``}
          ${opts.from ? sql`AND discovered_at >= ${opts.from}` : sql``}
          ${opts.to ? sql`AND discovered_at <= ${opts.to}` : sql``}
          ${qFilter}
          ${cursorClause}
        ORDER BY engagement_normalized DESC NULLS LAST, id ASC
        LIMIT ${limit + 1}
      `);
      const data = (res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[]);
      rows = (data as Record<string, unknown>[]).map(mapRow);
    } else if (sort === "oldest") {
      // Keyset on (discovered_at ASC, id ASC).
      const cursorClause =
        opts.cursor != null
          ? sql`AND (discovered_at, id) > (${opts.cursor.discoveredAt}, ${opts.cursor.id})`
          : sql``;

      const qFilter = opts.q
        ? sql`AND (source_title ILIKE ${"%" + opts.q + "%"} OR mention_context ILIKE ${"%" + opts.q + "%"})`
        : sql``;

      const res = await db.execute(sql`
        SELECT * FROM brand_mentions
        WHERE brand_id = ${brandId}
          ${opts.status ? sql`AND status = ${opts.status}` : sql``}
          ${opts.platform ? sql`AND platform = ${opts.platform}` : sql``}
          ${opts.sentiment ? sql`AND sentiment = ${opts.sentiment}` : sql``}
          ${opts.from ? sql`AND discovered_at >= ${opts.from}` : sql``}
          ${opts.to ? sql`AND discovered_at <= ${opts.to}` : sql``}
          ${qFilter}
          ${cursorClause}
        ORDER BY discovered_at ASC, id ASC
        LIMIT ${limit + 1}
      `);
      const data = (res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[]);
      rows = (data as Record<string, unknown>[]).map(mapRow);
    } else {
      // Default: newest first - keyset on (discovered_at DESC, id DESC).
      const cursorClause =
        opts.cursor != null
          ? sql`AND (discovered_at, id) < (${opts.cursor.discoveredAt}, ${opts.cursor.id})`
          : sql``;

      const qFilter = opts.q
        ? sql`AND (source_title ILIKE ${"%" + opts.q + "%"} OR mention_context ILIKE ${"%" + opts.q + "%"})`
        : sql``;

      const res = await db.execute(sql`
        SELECT * FROM brand_mentions
        WHERE brand_id = ${brandId}
          ${opts.status ? sql`AND status = ${opts.status}` : sql``}
          ${opts.platform ? sql`AND platform = ${opts.platform}` : sql``}
          ${opts.sentiment ? sql`AND sentiment = ${opts.sentiment}` : sql``}
          ${opts.from ? sql`AND discovered_at >= ${opts.from}` : sql``}
          ${opts.to ? sql`AND discovered_at <= ${opts.to}` : sql``}
          ${qFilter}
          ${cursorClause}
        ORDER BY discovered_at DESC, id DESC
        LIMIT ${limit + 1}
      `);
      const data = (res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[]);
      rows = (data as Record<string, unknown>[]).map(mapRow);
    }

    // Determine next cursor.
    let nextCursor: { discoveredAt: Date; id: string } | null = null;
    if (rows.length > limit) {
      rows = rows.slice(0, limit);
      const last = rows[rows.length - 1];
      nextCursor = {
        discoveredAt:
          last.discoveredAt instanceof Date
            ? last.discoveredAt
            : new Date(last.discoveredAt as string),
        id: last.id,
      };
    }

    return { rows, nextCursor };
  }

  // ── fact_scrape_cache ─────────────────────────────────────────────────
  async getFactScrapeCache(cacheKey: string) {
    const rows = await db
      .select({
        cacheKey: schema.factScrapeCache.cacheKey,
        valueJson: schema.factScrapeCache.valueJson,
        expiresAt: schema.factScrapeCache.expiresAt,
      })
      .from(schema.factScrapeCache)
      .where(
        and(
          eq(schema.factScrapeCache.cacheKey, cacheKey),
          gt(schema.factScrapeCache.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertFactScrapeCache(row: {
    cacheKey: string;
    source: "search_llm" | "wikidata";
    brandId: string;
    valueJson: unknown;
    expiresAt: Date;
  }): Promise<void> {
    await db
      .insert(schema.factScrapeCache)
      .values({
        cacheKey: row.cacheKey,
        source: row.source,
        brandId: row.brandId,
        valueJson: row.valueJson,
        expiresAt: row.expiresAt,
      })
      .onConflictDoUpdate({
        target: schema.factScrapeCache.cacheKey,
        set: {
          valueJson: row.valueJson,
          expiresAt: row.expiresAt,
          createdAt: new Date(),
        },
      });
  }

  async deleteExpiredFactScrapeCache(): Promise<number> {
    const result = await db
      .delete(schema.factScrapeCache)
      .where(lt(schema.factScrapeCache.expiresAt, new Date()));
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  }

  // ── fact_scrape_logs ──────────────────────────────────────────────────
  async insertFactScrapeLog(row: {
    runId: string;
    source:
      | "static_pages"
      | "search_llm"
      | "user_enrich"
      | "aggregate"
      | "paste"
      | "wikidata"
      | "structured_data";
    status: "done" | "failed" | "skipped";
    factCount?: number;
    latencyMs?: number;
    providerLatencyMs?: number;
    errorKind?: string;
    diagnostics?: unknown;
  }): Promise<void> {
    await db.insert(schema.factScrapeLogs).values({
      runId: row.runId,
      source: row.source,
      status: row.status,
      factCount: row.factCount ?? 0,
      latencyMs: row.latencyMs ?? null,
      providerLatencyMs: row.providerLatencyMs ?? null,
      errorKind: row.errorKind ?? null,
      diagnostics: (row.diagnostics ?? null) as never,
    });
  }

  async listFactScrapeLogsForRun(runId: string) {
    return await db
      .select({
        source: schema.factScrapeLogs.source,
        status: schema.factScrapeLogs.status,
        factCount: schema.factScrapeLogs.factCount,
        errorKind: schema.factScrapeLogs.errorKind,
        createdAt: schema.factScrapeLogs.createdAt,
      })
      .from(schema.factScrapeLogs)
      .where(eq(schema.factScrapeLogs.runId, runId))
      .orderBy(asc(schema.factScrapeLogs.createdAt));
  }

  // ── system_state ──────────────────────────────────────────────────────
  async getSystemState(key: string) {
    const rows = await db
      .select({ valueJson: schema.systemState.valueJson })
      .from(schema.systemState)
      .where(eq(schema.systemState.key, key))
      .limit(1);
    return rows[0]?.valueJson ?? null;
  }

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
  }

  // ── Lifecycle sweeps ──────────────────────────────────────────────────
  async deleteOldFactScrapePages(olderThanDays: number): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM brand_fact_scrape_pages
      WHERE run_id IN (
        SELECT id FROM brand_fact_scrape_runs
        WHERE started_at < now() - (${olderThanDays} || ' days')::interval
      )
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  }

  async deleteOldFactScrapeRuns(olderThanDays: number): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM brand_fact_scrape_runs
      WHERE started_at < now() - (${olderThanDays} || ' days')::interval
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  }

  async deleteOldFactScrapeLogs(olderThanDays: number): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM fact_scrape_logs
      WHERE created_at < now() - (${olderThanDays} || ' days')::interval
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  }
}
