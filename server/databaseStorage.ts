import {
  eq,
  and,
  desc,
  asc,
  sql,
  gte,
  lte,
  lt,
  or,
  ne,
  isNull,
  inArray,
  getTableColumns,
} from "drizzle-orm";
import type { InsertTourEvent } from "@shared/schema";
import type { KnownTourId, TourStateOp } from "./lib/tourRegistry";
import { db } from "./db";
import * as schema from "@shared/schema";
import { randomUUID } from "crypto";
import { IStorage } from "./storage";
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
  type ContentGenerationJob,
  type InsertContentGenerationJob,
  type Brand,
  type InsertBrand,
  type CommerceSession,
  type InsertCommerceSession,
  type PurchaseEvent,
  type InsertPurchaseEvent,
  type PublicationReference,
  type InsertPublicationReference,
  type PublicationMetric,
  type InsertPublicationMetric,
  type BetaInviteCode,
  type InsertBetaInviteCode,
  type Competitor,
  type InsertCompetitor,
  type CompetitorCitationSnapshot,
  type InsertCompetitorCitationSnapshot,
  type CompetitorGeoRanking,
  type InsertCompetitorGeoRanking,
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
  type PromptPortfolio,
  type InsertPromptPortfolio,
  type CitationQuality,
  type InsertCitationQuality,
  type BrandHallucination,
  type InsertBrandHallucination,
  type BrandFactSheet,
  type InsertBrandFactSheet,
  type MetricsHistory,
  type InsertMetricsHistory,
  type AlertSettings,
  type InsertAlertSettings,
  type AlertHistory,
  type InsertAlertHistory,
  type AiSource,
  type InsertAiSource,
  type AiTrafficSession,
  type InsertAiTrafficSession,
  type PromptTestRun,
  type InsertPromptTestRun,
  type AgentTask,
  type InsertAgentTask,
  type OutreachCampaign,
  type InsertOutreachCampaign,
  type PublicationTarget,
  type InsertPublicationTarget,
  type OutreachEmail,
  type InsertOutreachEmail,
  type AutomationRule,
  type InsertAutomationRule,
  type AutomationExecution,
  type InsertAutomationExecution,
  type KeywordResearch,
  type InsertKeywordResearch,
  type CommunityPost,
  type InsertCommunityPost,
  type CitationRun,
  type InsertCitationRun,
  type ArticleRevision,
  type InsertArticleRevision,
  type ChatbotMessage,
  type ChatbotThread,
  type ScanJob,
  type SourceHealth,
  type InsertSourceHealth,
  type SentimentCache,
} from "@shared/schema";

export { applyTourStateOp } from "./lib/tourStateOps";
import { applyTourStateOp } from "./lib/tourStateOps";

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.email, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db
      .insert(schema.users)
      .values({
        ...insertUser,
        accessTier: insertUser.accessTier ?? "free",
        isAdmin: insertUser.isAdmin ?? 0,
        articlesUsedThisMonth: insertUser.articlesUsedThisMonth ?? 0,
        brandsUsed: insertUser.brandsUsed ?? 0,
        usageResetDate: insertUser.usageResetDate ?? new Date(),
      })
      .returning();
    return result[0];
  }

  // Wave 4.6: list DAOs accept optional pagination. Internal callers
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

  async createBrand(insertBrand: InsertBrand): Promise<Brand> {
    const result = await db
      .insert(schema.brands)
      .values({
        ...insertBrand,
        tone: insertBrand.tone ?? "professional",
      })
      .returning();
    return result[0];
  }

  // Wave 4.5: every brand reader filters out soft-deleted rows so the
  // UI doesn't see brands that are inside their 30-day grace window.
  // The cron-driven hard-delete (runBrandPurgeJob) eventually removes
  // them; until then they stay in the DB but invisible to the API.

  async getBrands(): Promise<Brand[]> {
    return await db.select().from(schema.brands).where(isNull(schema.brands.deletedAt));
  }

  async getBrandsByUserId(userId: string): Promise<Brand[]> {
    return await db
      .select()
      .from(schema.brands)
      .where(and(eq(schema.brands.userId, userId), isNull(schema.brands.deletedAt)));
  }

  async getBrandById(id: string): Promise<Brand | undefined> {
    const result = await db
      .select()
      .from(schema.brands)
      .where(and(eq(schema.brands.id, id), isNull(schema.brands.deletedAt)));
    return result[0];
  }

  async getBrandByIdForUser(id: string, userId: string): Promise<Brand | undefined> {
    const result = await db
      .select()
      .from(schema.brands)
      .where(
        and(
          eq(schema.brands.id, id),
          eq(schema.brands.userId, userId),
          isNull(schema.brands.deletedAt),
        ),
      );
    return result[0];
  }

  async updateBrand(id: string, brandUpdate: Partial<InsertBrand>): Promise<Brand | undefined> {
    const result = await db
      .update(schema.brands)
      .set({
        ...brandUpdate,
        updatedAt: new Date(),
        version: sql`${schema.brands.version} + 1`,
      })
      .where(eq(schema.brands.id, id))
      .returning();
    return result[0];
  }

  // Wave 4.4: optimistic-lock variant of updateBrand. Caller passes the
  // version they last read; the UPDATE only matches when nobody has
  // written in between. Returns undefined when 0 rows matched — caller
  // must distinguish "not found" from "version conflict" by re-fetching.
  async updateBrandIfVersion(
    id: string,
    expectedVersion: number,
    brandUpdate: Partial<InsertBrand>,
  ): Promise<Brand | undefined> {
    const result = await db
      .update(schema.brands)
      .set({
        ...brandUpdate,
        updatedAt: new Date(),
        version: sql`${schema.brands.version} + 1`,
      })
      .where(and(eq(schema.brands.id, id), eq(schema.brands.version, expectedVersion)))
      .returning();
    return result[0];
  }

  async deleteBrand(id: string): Promise<boolean> {
    // Hard-delete primitive — used by the brand purge cron after the
    // grace window. Application code should call softDeleteBrand
    // instead so users get a 30-day undo window. The FK cascade
    // (migrations/0003_fk_hardening.sql) cleans up child rows.
    await this.clearTourStateForBrand(id);
    const result = await db.delete(schema.brands).where(eq(schema.brands.id, id)).returning();
    return result.length > 0;
  }

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
    const [current] = await db
      .select({ onboardingState: schema.users.onboardingState })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const existing = (current?.onboardingState ?? {}) as Record<string, unknown>;
    const tours = (existing.tours ?? {}) as Record<string, unknown>;
    const next = applyTourStateOp(tours, op, args);

    const merged = { ...existing, tours: next };

    const [updated] = await db
      .update(schema.users)
      .set({ onboardingState: merged })
      .where(eq(schema.users.id, userId))
      .returning({ onboardingState: schema.users.onboardingState });

    const newTours = ((updated?.onboardingState as Record<string, unknown> | undefined)?.tours ??
      {}) as Record<string, unknown>;
    return newTours;
  }

  async clearTourStateForBrand(brandId: string): Promise<void> {
    // Strip perBrand[brandId] sub-tree from every user that has it.
    // Called from deleteBrand and softDeleteBrand grace-window expiry.
    await db.execute(sql`
      UPDATE users
      SET onboarding_state = jsonb_set(
        onboarding_state,
        '{tours,perBrand}',
        COALESCE(onboarding_state->'tours'->'perBrand', '{}'::jsonb) - ${brandId}
      )
      WHERE onboarding_state->'tours'->'perBrand' ? ${brandId}
    `);
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
    const result = await db.execute(sql`
      DELETE FROM tour_events WHERE occurred_at < ${olderThan.toISOString()}
    `);
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  }

  // Wave 4.5: schedule a brand for deletion in 30 days. Returns the
  // updated row or undefined if the brand wasn't found / already
  // soft-deleted. Idempotent: re-scheduling preserves the original
  // grace window so a double-click doesn't extend the timer.
  async softDeleteBrand(id: string, graceDays = 30): Promise<Brand | undefined> {
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
    const result = await db
      .update(schema.brands)
      .set({ deletedAt: now, deletionScheduledFor: scheduledFor })
      .where(and(eq(schema.brands.id, id), isNull(schema.brands.deletedAt)))
      .returning();
    return result[0];
  }

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

  // Wave 4.6: SQL-level scoping by brand owner so LIMIT actually means
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

  // Wave 4.4: optimistic-lock variant of updateArticle.
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
    const result = await db.insert(schema.geoRankings).values(insertRanking).returning();
    return result[0];
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
    // suggestions — call archiveSuggestedPrompts for those.
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

  async promoteSuggestionToTracked(
    suggestionId: string,
    replaceTrackedId: string | null,
  ): Promise<void> {
    // Wave 4.3: atomic swap when replacing — both updates succeed together
    // so we can't end up with two tracked prompts (or none) for the slot.
    // Wave 9.1: when replaceTrackedId is null, the user is filling an
    // empty slot (tracked count < cap) — just promote, no archive.
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

  // Wave 9: single-row read used by the async kickoff path. The HTTP handler
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

  // Wave 9.1: recompute totals + per-platform breakdown for a run by
  // reading geo_rankings live. The canonical aggregator — call this any
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

  // Wave 8: lightweight "is any run live for this brand" check used by the
  // live-update polling hook on every dependent page. Hits the partial
  // index on (brand_id, status) — should be O(1) regardless of run history.
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

  async updateContentJobResponseId(jobId: string, openaiResponseId: string): Promise<void> {
    await db
      .update(schema.contentGenerationJobs)
      .set({ openaiResponseId })
      .where(eq(schema.contentGenerationJobs.id, jobId));
  }

  async claimContentJobForSlice(
    id: string,
    sliceBudgetSeconds: number,
  ): Promise<ContentGenerationJob | undefined> {
    // Win the lock by setting last_advance_started_at = now() WHERE the
    // existing value is NULL or older than the slice budget. Drizzle's
    // raw sql is the cleanest way to express the time-window guard.
    const result = await db.execute(sql`
      UPDATE public.content_generation_jobs
      SET last_advance_started_at = now()
      WHERE id = ${id}
        AND status IN ('pending', 'running')
        AND (
          last_advance_started_at IS NULL
          OR last_advance_started_at < now() - make_interval(secs => ${sliceBudgetSeconds})
        )
      RETURNING id, user_id AS "userId", brand_id AS "brandId", status,
        request_payload AS "requestPayload", article_id AS "articleId",
        error_message AS "errorMessage", error_kind AS "errorKind",
        stream_buffer AS "streamBuffer", refunded_at AS "refundedAt",
        last_advance_started_at AS "lastAdvanceStartedAt",
        created_at AS "createdAt", started_at AS "startedAt",
        completed_at AS "completedAt"
    `);
    const row = (result as any).rows?.[0];
    return row as ContentGenerationJob | undefined;
  }

  async listAdvanceablePendingJobs(limit: number): Promise<ContentGenerationJob[]> {
    const result = await db.execute(sql`
      SELECT id, user_id AS "userId", brand_id AS "brandId", status,
        request_payload AS "requestPayload", article_id AS "articleId",
        error_message AS "errorMessage", error_kind AS "errorKind",
        stream_buffer AS "streamBuffer", refunded_at AS "refundedAt",
        last_advance_started_at AS "lastAdvanceStartedAt",
        created_at AS "createdAt", started_at AS "startedAt",
        completed_at AS "completedAt"
      FROM public.content_generation_jobs
      WHERE status IN ('pending', 'running')
        AND (
          last_advance_started_at IS NULL
          OR last_advance_started_at < now() - INTERVAL '5 minutes'
        )
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
    return ((result as any).rows ?? []) as ContentGenerationJob[];
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

  // Crash recovery — flip `running` jobs older than N minutes back to
  // `failed`. Called once on server boot so we don't have orphaned rows.
  // Wave 7: also classifies the failure as 'timeout' (which the refund
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

  async createCommerceSession(insertSession: InsertCommerceSession): Promise<CommerceSession> {
    const result = await db.insert(schema.aiCommerceSessions).values(insertSession).returning();
    return result[0];
  }

  async getCommerceSessions(filters?: {
    articleId?: string;
    brandId?: string;
    aiPlatform?: string;
  }): Promise<CommerceSession[]> {
    const conditions = [];
    if (filters?.articleId) {
      conditions.push(eq(schema.aiCommerceSessions.articleId, filters.articleId));
    }
    if (filters?.brandId) {
      conditions.push(eq(schema.aiCommerceSessions.brandId, filters.brandId));
    }
    if (filters?.aiPlatform) {
      conditions.push(eq(schema.aiCommerceSessions.aiPlatform, filters.aiPlatform));
    }
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.aiCommerceSessions)
        .where(and(...conditions));
    }
    return await db.select().from(schema.aiCommerceSessions);
  }

  async createPurchaseEvent(insertEvent: InsertPurchaseEvent): Promise<PurchaseEvent> {
    const result = await db.insert(schema.purchaseEvents).values(insertEvent).returning();
    return result[0];
  }

  async getPurchaseEvents(filters?: {
    articleId?: string;
    brandId?: string;
    aiPlatform?: string;
  }): Promise<PurchaseEvent[]> {
    const conditions = [];
    if (filters?.articleId) {
      conditions.push(eq(schema.purchaseEvents.articleId, filters.articleId));
    }
    if (filters?.brandId) {
      conditions.push(eq(schema.purchaseEvents.brandId, filters.brandId));
    }
    if (filters?.aiPlatform) {
      conditions.push(eq(schema.purchaseEvents.aiPlatform, filters.aiPlatform));
    }
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.purchaseEvents)
        .where(and(...conditions));
    }
    return await db.select().from(schema.purchaseEvents);
  }

  async getTotalRevenue(filters?: { brandId?: string; aiPlatform?: string }): Promise<number> {
    const events = await this.getPurchaseEvents(filters);
    return events.reduce((total, event) => {
      const revenue =
        typeof event.revenue === "string" ? parseFloat(event.revenue) : Number(event.revenue);
      return total + revenue;
    }, 0);
  }

  async createPublicationReference(
    insertRef: InsertPublicationReference,
  ): Promise<PublicationReference> {
    const result = await db.insert(schema.publicationReferences).values(insertRef).returning();
    return result[0];
  }

  async getPublicationReferences(filters?: {
    industry?: string;
    aiPlatform?: string;
  }): Promise<PublicationReference[]> {
    const conditions = [];
    if (filters?.industry) {
      conditions.push(eq(schema.publicationReferences.industry, filters.industry));
    }
    if (filters?.aiPlatform) {
      conditions.push(eq(schema.publicationReferences.aiPlatform, filters.aiPlatform));
    }
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.publicationReferences)
        .where(and(...conditions));
    }
    return await db.select().from(schema.publicationReferences);
  }

  async updatePublicationReference(
    id: string,
    update: Partial<InsertPublicationReference>,
  ): Promise<PublicationReference | undefined> {
    const result = await db
      .update(schema.publicationReferences)
      .set({ ...update, lastSeenAt: new Date() })
      .where(eq(schema.publicationReferences.id, id))
      .returning();
    return result[0];
  }

  async upsertPublicationMetric(insertMetric: InsertPublicationMetric): Promise<PublicationMetric> {
    const existing = await db
      .select()
      .from(schema.publicationMetrics)
      .where(
        and(
          eq(schema.publicationMetrics.outletDomain, insertMetric.outletDomain),
          eq(schema.publicationMetrics.industry, insertMetric.industry),
        ),
      );

    if (existing.length > 0) {
      const result = await db
        .update(schema.publicationMetrics)
        .set({
          outletName: insertMetric.outletName,
          totalCitations: insertMetric.totalCitations ?? existing[0].totalCitations,
          aiPlatformBreakdown: insertMetric.aiPlatformBreakdown ?? existing[0].aiPlatformBreakdown,
          authorityScore: insertMetric.authorityScore ?? existing[0].authorityScore,
          trendDirection: insertMetric.trendDirection ?? existing[0].trendDirection,
          lastUpdated: new Date(),
        })
        .where(eq(schema.publicationMetrics.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db
      .insert(schema.publicationMetrics)
      .values({
        ...insertMetric,
        totalCitations: insertMetric.totalCitations ?? 0,
        authorityScore: insertMetric.authorityScore ?? "0",
        trendDirection: insertMetric.trendDirection ?? "stable",
      })
      .returning();
    return result[0];
  }

  async getPublicationMetrics(industry?: string): Promise<PublicationMetric[]> {
    if (industry) {
      return await db
        .select()
        .from(schema.publicationMetrics)
        .where(eq(schema.publicationMetrics.industry, industry));
    }
    return await db.select().from(schema.publicationMetrics);
  }

  async getTopPublicationsByIndustry(
    industry: string,
    limit: number = 10,
  ): Promise<PublicationMetric[]> {
    return await db
      .select()
      .from(schema.publicationMetrics)
      .where(eq(schema.publicationMetrics.industry, industry))
      .orderBy(desc(schema.publicationMetrics.totalCitations))
      .limit(limit);
  }

  async updateUserStripeInfo(
    userId: string,
    info: { stripeCustomerId?: string; stripeSubscriptionId?: string; accessTier?: string },
  ): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set(info)
      .where(eq(schema.users.id, userId))
      .returning();
    return result[0];
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId));
    return result[0];
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

  async updateBrandsUsed(userId: string, count: number): Promise<void> {
    await db.update(schema.users).set({ brandsUsed: count }).where(eq(schema.users.id, userId));
  }

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
  }

  async getBetaInviteCodeByCode(codeStr: string): Promise<BetaInviteCode | undefined> {
    const result = await db
      .select()
      .from(schema.betaInviteCodes)
      .where(eq(schema.betaInviteCodes.code, codeStr));
    return result[0];
  }

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
  }

  async getAllBetaInviteCodes(): Promise<BetaInviteCode[]> {
    return await db.select().from(schema.betaInviteCodes);
  }

  async deleteBetaInviteCode(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.betaInviteCodes)
      .where(eq(schema.betaInviteCodes.id, id))
      .returning();
    return result.length > 0;
  }

  // Upsert on (brand_id, lower(name), lower(coalesce(domain,''))) to close
  // the race window between manual + scheduled discovery. Ignored /
  // soft-deleted rows are revived only if discovered_by is being set to
  // "manual" (user deliberately re-added it); otherwise they are kept
  // tombstoned and only lastSeenAt is bumped.
  async createCompetitor(insertCompetitor: InsertCompetitor): Promise<Competitor> {
    const isManual = (insertCompetitor.discoveredBy ?? "manual") === "manual";
    // Use raw SQL so we can target the functional unique index
    // (lower(name), lower(coalesce(domain,''))). db.execute returns raw
    // snake_case pg rows — we only use it for the id, then re-read via
    // Drizzle to get the camelCase-mapped row callers expect.
    const result = await db.execute<{ id: string }>(sql`
      INSERT INTO competitors (
        brand_id, name, domain, industry, description,
        discovered_by, deleted_at, is_ignored, last_seen_at
      ) VALUES (
        ${insertCompetitor.brandId},
        ${insertCompetitor.name},
        ${insertCompetitor.domain},
        ${insertCompetitor.industry ?? null},
        ${insertCompetitor.description ?? null},
        ${insertCompetitor.discoveredBy ?? "manual"},
        NULL,
        0,
        now()
      )
      ON CONFLICT (brand_id, lower(name), lower(coalesce(domain, '')))
      DO UPDATE SET
        industry = COALESCE(EXCLUDED.industry, competitors.industry),
        description = COALESCE(EXCLUDED.description, competitors.description),
        last_seen_at = now(),
        -- Revive soft-deleted rows only on manual re-add.
        deleted_at = CASE WHEN ${isManual} THEN NULL ELSE competitors.deleted_at END,
        is_ignored = CASE WHEN ${isManual} THEN 0 ELSE competitors.is_ignored END
      RETURNING id;
    `);
    const id = (result as any).rows?.[0]?.id;
    if (!id) throw new Error("createCompetitor upsert returned no id");
    const [row] = await db
      .select()
      .from(schema.competitors)
      .where(eq(schema.competitors.id, id))
      .limit(1);
    if (!row) throw new Error("createCompetitor: row not found after upsert");
    return row;
  }

  async getCompetitors(
    brandId?: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<Competitor[]> {
    const includeDeleted = opts?.includeDeleted === true;
    const conditions = [] as any[];
    if (brandId) conditions.push(eq(schema.competitors.brandId, brandId));
    if (!includeDeleted) conditions.push(isNull(schema.competitors.deletedAt));
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);
    const q = db.select().from(schema.competitors);
    return await (where ? q.where(where) : q);
  }

  async getCompetitorById(id: string): Promise<Competitor | undefined> {
    const result = await db.select().from(schema.competitors).where(eq(schema.competitors.id, id));
    return result[0];
  }

  // Partial update — used by the edit dialog on the competitors page.
  // Only columns the user is expected to edit are included; caller must
  // whitelist at the route level.
  async updateCompetitor(
    id: string,
    patch: Partial<schema.InsertCompetitor>,
  ): Promise<Competitor | undefined> {
    const result = await db
      .update(schema.competitors)
      .set(patch)
      .where(eq(schema.competitors.id, id))
      .returning();
    return result[0];
  }

  // Case-insensitive append. Returns true if the variation was added,
  // false if it already existed (or the brand doesn't exist). The dedup
  // runs client-side because Postgres array-contains is case-sensitive.
  async addBrandNameVariation(brandId: string, variation: string): Promise<boolean> {
    const trimmed = variation.trim();
    if (!trimmed) return false;
    const brand = await this.getBrandById(brandId);
    if (!brand) return false;
    const existing = (brand.nameVariations ?? []) as string[];
    const lower = trimmed.toLowerCase();
    if (existing.some((v) => v.toLowerCase() === lower)) return false;
    const next = [...existing, trimmed];
    await db
      .update(schema.brands)
      .set({ nameVariations: next })
      .where(eq(schema.brands.id, brandId));
    return true;
  }

  async addCompetitorNameVariation(competitorId: string, variation: string): Promise<boolean> {
    const trimmed = variation.trim();
    if (!trimmed) return false;
    const competitor = await this.getCompetitorById(competitorId);
    if (!competitor) return false;
    const existing = ((competitor as Competitor).nameVariations ?? []) as string[];
    const lower = trimmed.toLowerCase();
    if (existing.some((v) => v.toLowerCase() === lower)) return false;
    const next = [...existing, trimmed];
    await db
      .update(schema.competitors)
      .set({ nameVariations: next })
      .where(eq(schema.competitors.id, competitorId));
    return true;
  }

  // Soft-delete: flip deleted_at so the row hides from normal lists but
  // snapshots remain for historical leaderboard trends.
  async deleteCompetitor(id: string): Promise<boolean> {
    const result = await db
      .update(schema.competitors)
      .set({ deletedAt: new Date() })
      .where(eq(schema.competitors.id, id))
      .returning();
    return result.length > 0;
  }

  // Permanent tombstone: user marked as false-positive so cron won't
  // re-insert it. Also soft-deletes so it disappears from lists.
  async ignoreCompetitor(id: string): Promise<boolean> {
    const result = await db
      .update(schema.competitors)
      .set({ isIgnored: 1, deletedAt: new Date() })
      .where(eq(schema.competitors.id, id))
      .returning();
    return result.length > 0;
  }

  // Wave 2 — per-run, per-prompt competitor citation row. Idempotent via
  // the unique index (competitor_id, run_id, brand_prompt_id, ai_platform)
  // from migration 0027, so a retried citation run updates rather than
  // duplicating.
  async createCompetitorGeoRanking(row: InsertCompetitorGeoRanking): Promise<CompetitorGeoRanking> {
    const r = row as any;
    const result = await db.execute<{ id: string }>(sql`
      INSERT INTO competitor_geo_rankings (
        competitor_id, run_id, brand_prompt_id, ai_platform,
        is_cited, rank, relevance_score, citation_context, citing_outlet_url, sentiment
      ) VALUES (
        ${r.competitorId},
        ${r.runId},
        ${r.brandPromptId},
        ${r.aiPlatform},
        ${r.isCited ?? 0},
        ${r.rank ?? null},
        ${r.relevanceScore ?? null},
        ${r.citationContext ?? null},
        ${r.citingOutletUrl ?? null},
        ${r.sentiment ?? null}
      )
      ON CONFLICT (competitor_id, run_id, brand_prompt_id, ai_platform)
      DO UPDATE SET
        is_cited = EXCLUDED.is_cited,
        rank = COALESCE(EXCLUDED.rank, competitor_geo_rankings.rank),
        relevance_score = COALESCE(EXCLUDED.relevance_score, competitor_geo_rankings.relevance_score),
        citation_context = COALESCE(EXCLUDED.citation_context, competitor_geo_rankings.citation_context),
        citing_outlet_url = COALESCE(EXCLUDED.citing_outlet_url, competitor_geo_rankings.citing_outlet_url),
        sentiment = COALESCE(EXCLUDED.sentiment, competitor_geo_rankings.sentiment),
        checked_at = now()
      RETURNING id;
    `);
    const id = (result as any).rows?.[0]?.id;
    if (!id) throw new Error("createCompetitorGeoRanking upsert returned no id");
    const [selected] = await db
      .select()
      .from(schema.competitorGeoRankings)
      .where(eq(schema.competitorGeoRankings.id, id))
      .limit(1);
    if (!selected) throw new Error("createCompetitorGeoRanking: row not found");
    return selected;
  }

  async getCompetitorGeoRankings(
    competitorId: string,
    opts?: { runId?: string; since?: Date },
  ): Promise<CompetitorGeoRanking[]> {
    const conditions = [eq(schema.competitorGeoRankings.competitorId, competitorId)];
    if (opts?.runId) conditions.push(eq(schema.competitorGeoRankings.runId, opts.runId));
    if (opts?.since) conditions.push(gte(schema.competitorGeoRankings.checkedAt, opts.since));
    return await db
      .select()
      .from(schema.competitorGeoRankings)
      .where(and(...conditions))
      .orderBy(desc(schema.competitorGeoRankings.checkedAt));
  }

  // Upsert on (competitor_id, ai_platform, run_id). If the same run
  // ingests the same (competitor, platform) twice (retry, retry storm),
  // we update citation_count instead of inserting a duplicate snapshot.
  async createCompetitorCitationSnapshot(
    insertSnapshot: InsertCompetitorCitationSnapshot,
  ): Promise<CompetitorCitationSnapshot> {
    if ((insertSnapshot as any).runId) {
      // Same rationale as createCompetitor: db.execute returns raw
      // snake_case rows. Re-read via Drizzle for camelCase mapping.
      const result = await db.execute<{ id: string }>(sql`
        INSERT INTO competitor_citation_snapshots (
          competitor_id, ai_platform, citation_count, run_id, metadata
        ) VALUES (
          ${insertSnapshot.competitorId},
          ${insertSnapshot.aiPlatform},
          ${insertSnapshot.citationCount ?? 0},
          ${(insertSnapshot as any).runId},
          ${insertSnapshot.metadata ?? null}
        )
        ON CONFLICT (competitor_id, ai_platform, run_id)
        WHERE run_id IS NOT NULL
        DO UPDATE SET
          citation_count = EXCLUDED.citation_count,
          metadata = EXCLUDED.metadata
        RETURNING id;
      `);
      const id = (result as any).rows?.[0]?.id;
      if (!id) throw new Error("createCompetitorCitationSnapshot upsert returned no id");
      const [row] = await db
        .select()
        .from(schema.competitorCitationSnapshots)
        .where(eq(schema.competitorCitationSnapshots.id, id))
        .limit(1);
      if (!row) throw new Error("createCompetitorCitationSnapshot: row not found");
      return row;
    }
    // Legacy path for callers that don't yet pass a runId.
    const result = await db
      .insert(schema.competitorCitationSnapshots)
      .values(insertSnapshot)
      .returning();
    return result[0];
  }

  async getCompetitorCitationSnapshots(
    competitorId: string,
  ): Promise<CompetitorCitationSnapshot[]> {
    return await db
      .select()
      .from(schema.competitorCitationSnapshots)
      .where(eq(schema.competitorCitationSnapshots.competitorId, competitorId))
      .orderBy(desc(schema.competitorCitationSnapshots.snapshotDate));
  }

  async getCompetitorLatestCitations(
    competitorId: string,
  ): Promise<{ platform: string; count: number }[]> {
    const snapshots = await this.getCompetitorCitationSnapshots(competitorId);
    const latestByPlatform = new Map<string, number>();
    for (const snapshot of snapshots) {
      if (!latestByPlatform.has(snapshot.aiPlatform)) {
        latestByPlatform.set(snapshot.aiPlatform, snapshot.citationCount);
      }
    }
    return Array.from(latestByPlatform.entries()).map(([platform, count]) => ({ platform, count }));
  }

  async getCompetitorLeaderboard(
    brandId?: string,
    opts?: { since?: Date },
  ): Promise<
    {
      name: string;
      domain: string;
      isOwn: boolean;
      totalCitations: number;
      platformBreakdown: Record<string, number>;
      shareOfVoice: number;
    }[]
  > {
    // 3 queries total: brands, cited rankings, competitor snapshots.
    // `opts.since` constrains every time-scoped read so the leaderboard
    // reflects a window (default: last 30 days) instead of all-time
    // cumulative totals — which is what makes "Square" look like it
    // exploded when really the numbers just accumulate forever.
    const since = opts?.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const leaderboard: {
      name: string;
      domain: string;
      isOwn: boolean;
      totalCitations: number;
      platformBreakdown: Record<string, number>;
      shareOfVoice: number;
    }[] = [];

    const brands = brandId
      ? ([await this.getBrandById(brandId)].filter(Boolean) as Brand[])
      : await this.getBrands();
    if (brands.length === 0) return leaderboard;

    const brandIds = brands.map((b) => b.id);

    // Wave B — a brand's citations live on geo_rankings rows keyed by
    // BOTH article_id (from article-attached citation runs) and
    // brand_prompt_id (from brand-prompt citation runs). The original
    // leaderboard only summed articles, so any brand whose citations were
    // driven by the prompts-only flow (most real brands) showed 0
    // citations and therefore 0% share-of-voice. Below we sum both paths
    // against the same window.

    // Pull every article for these brands in one query.
    const allArticles = await db
      .select({ id: schema.articles.id, brandId: schema.articles.brandId })
      .from(schema.articles)
      .where(inArray(schema.articles.brandId, brandIds));
    const articleToBrand = new Map<string, string>();
    for (const a of allArticles) {
      if (a.brandId) articleToBrand.set(a.id, a.brandId);
    }
    const articleIds = allArticles.map((a) => a.id);

    // Pull every brand_prompt for these brands in one query.
    const allPrompts = await db
      .select({ id: schema.brandPrompts.id, brandId: schema.brandPrompts.brandId })
      .from(schema.brandPrompts)
      .where(inArray(schema.brandPrompts.brandId, brandIds));
    const promptToBrand = new Map<string, string>();
    for (const p of allPrompts) {
      promptToBrand.set(p.id, p.brandId);
    }
    const promptIds = allPrompts.map((p) => p.id);

    // Pull cited rankings for articles + brand_prompts in a single query.
    // Filters on (article_id IN ... OR brand_prompt_id IN ...) + is_cited=1
    // + checked_at >= since.
    let cited: GeoRanking[] = [];
    if (articleIds.length > 0 || promptIds.length > 0) {
      const orClauses: any[] = [];
      if (articleIds.length > 0) orClauses.push(inArray(schema.geoRankings.articleId, articleIds));
      if (promptIds.length > 0)
        orClauses.push(inArray(schema.geoRankings.brandPromptId, promptIds));
      const scope = orClauses.length === 1 ? orClauses[0] : or(...orClauses);
      cited = await db
        .select()
        .from(schema.geoRankings)
        .where(
          and(scope, eq(schema.geoRankings.isCited, 1), gte(schema.geoRankings.checkedAt, since)),
        );
    }

    // Bucket by brand via whichever key the ranking has. Dedup each
    // ranking by id so a row that has BOTH article_id and brand_prompt_id
    // (shouldn't happen today, but defensively) doesn't double-count.
    const perBrand = new Map<string, Record<string, number>>();
    for (const b of brandIds) perBrand.set(b, {});
    const seenRankings = new Set<string>();
    for (const r of cited) {
      if (seenRankings.has(r.id)) continue;
      seenRankings.add(r.id);
      let bId: string | undefined;
      if (r.articleId) bId = articleToBrand.get(r.articleId);
      if (!bId && r.brandPromptId) bId = promptToBrand.get(r.brandPromptId);
      if (!bId) continue;
      const bucket = perBrand.get(bId)!;
      bucket[r.aiPlatform] = (bucket[r.aiPlatform] || 0) + 1;
    }

    for (const brand of brands) {
      const breakdown = perBrand.get(brand.id) ?? {};
      const totalCitations = Object.values(breakdown).reduce((s, n) => s + n, 0);
      leaderboard.push({
        name: brand.name,
        domain: brand.website || brand.companyName,
        isOwn: true,
        totalCitations,
        platformBreakdown: breakdown,
        shareOfVoice: 0, // filled after all rows are in
      });
    }

    // Wave 2 — read from the per-run, per-prompt competitor_geo_rankings
    // table so the leaderboard reflects actual LLM-judged citations, not
    // a coarse aggregate. One row per (competitor × platform × prompt ×
    // run); count cited rows within the window, bucket by platform.
    const competitors = brandId ? await this.getCompetitors(brandId) : await this.getCompetitors();
    if (competitors.length > 0) {
      const compIds = competitors.map((c) => c.id);
      const cgr = await db
        .select()
        .from(schema.competitorGeoRankings)
        .where(
          and(
            inArray(schema.competitorGeoRankings.competitorId, compIds),
            eq(schema.competitorGeoRankings.isCited, 1),
            gte(schema.competitorGeoRankings.checkedAt, since),
          ),
        );

      const perCompetitor = new Map<string, Map<string, number>>();
      for (const c of compIds) perCompetitor.set(c, new Map());
      for (const r of cgr) {
        const bucket = perCompetitor.get(r.competitorId);
        if (!bucket) continue;
        bucket.set(r.aiPlatform, (bucket.get(r.aiPlatform) || 0) + 1);
      }

      for (const competitor of competitors) {
        const bucket = perCompetitor.get(competitor.id) ?? new Map<string, number>();
        const breakdown: Record<string, number> = {};
        let total = 0;
        bucket.forEach((count, platform) => {
          breakdown[platform] = count;
          total += count;
        });
        leaderboard.push({
          name: competitor.name,
          domain: competitor.domain,
          isOwn: false,
          totalCitations: total,
          platformBreakdown: breakdown,
          shareOfVoice: 0,
        });
      }
    }

    // Compute share-of-voice so each row answers the "are they cited more
    // than me, and by how much?" question directly.
    const totalAll = leaderboard.reduce((s, r) => s + r.totalCitations, 0);
    for (const row of leaderboard) {
      row.shareOfVoice = totalAll > 0 ? Math.round((row.totalCitations / totalAll) * 1000) / 10 : 0;
    }

    return leaderboard.sort((a, b) => b.totalCitations - a.totalCitations);
  }

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

  async getLatestBrandVisibility(brandId: string): Promise<{
    visibilityScore: number;
    shareOfVoice: number;
    sentiment: { positive: number; neutral: number; negative: number };
    platformBreakdown: Record<string, number>;
  } | null> {
    const snapshots = await this.getBrandVisibilitySnapshots(brandId);
    if (snapshots.length === 0) return null;

    const platformBreakdown: Record<string, number> = {};
    let totalVisibility = 0;
    let totalSoV = 0;
    let totalPositive = 0;
    let totalNeutral = 0;
    let totalNegative = 0;

    const latestByPlatform = new Map<string, BrandVisibilitySnapshot>();
    for (const snapshot of snapshots) {
      if (!latestByPlatform.has(snapshot.aiPlatform)) {
        latestByPlatform.set(snapshot.aiPlatform, snapshot);
      }
    }

    const entries = Array.from(latestByPlatform.entries());
    for (const [platform, snapshot] of entries) {
      platformBreakdown[platform] = snapshot.visibilityScore;
      totalVisibility += snapshot.visibilityScore;
      totalSoV += parseFloat(snapshot.shareOfVoice || "0");
      totalPositive += snapshot.sentimentPositive;
      totalNeutral += snapshot.sentimentNeutral;
      totalNegative += snapshot.sentimentNegative;
    }

    const platformCount = latestByPlatform.size || 1;

    return {
      visibilityScore: Math.round(totalVisibility / platformCount),
      shareOfVoice: Math.round((totalSoV / platformCount) * 10) / 10,
      sentiment: {
        positive: totalPositive,
        neutral: totalNeutral,
        negative: totalNegative,
      },
      platformBreakdown,
    };
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

  // Wave 9.4: idempotent inserts for scanners. Returns the row only if
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

  // Wave 9.4: trigram similarity-based FAQ dedup. Returns the highest
  // similarity > threshold, or null if none. Falls back to exact-match
  // when the pg_trgm extension or function is unavailable (the
  // similarity() call throws → caller catches and treats as no match).
  async findSimilarFaqQuestion(
    brandId: string,
    question: string,
    threshold = 0.65,
  ): Promise<{ id: string; question: string; similarity: number } | null> {
    try {
      const rows = await db.execute(sql`
        SELECT id, question, similarity(question, ${question}) AS sim
        FROM faq_items
        WHERE brand_id = ${brandId}
          AND similarity(question, ${question}) >= ${threshold}
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
      // pg_trgm not available — fall back to exact case-insensitive match.
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
  // Wave 9.4: tracked_content_urls + self-citation tracking.
  // ============================================================

  async upsertTrackedContentUrl(insert: InsertTrackedContentUrl): Promise<TrackedContentUrl> {
    // One row per (source_type, source_id) — when a piece of content's
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
  // Wave 9.4: GEO Tools header summary. Single round-trip count rollup
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

  async createPromptPortfolio(insertPrompt: InsertPromptPortfolio): Promise<PromptPortfolio> {
    const result = await db.insert(schema.promptPortfolio).values(insertPrompt).returning();
    return result[0];
  }

  async getPromptPortfolio(
    brandId?: string,
    filters?: { category?: string; funnelStage?: string; aiPlatform?: string },
  ): Promise<PromptPortfolio[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.promptPortfolio.brandId, brandId));
    if (filters?.category) conditions.push(eq(schema.promptPortfolio.category, filters.category));
    if (filters?.funnelStage)
      conditions.push(eq(schema.promptPortfolio.funnelStage, filters.funnelStage));
    if (filters?.aiPlatform)
      conditions.push(eq(schema.promptPortfolio.aiPlatform, filters.aiPlatform));
    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(schema.promptPortfolio)
            .where(and(...conditions))
            .orderBy(desc(schema.promptPortfolio.lastChecked))
        : await db
            .select()
            .from(schema.promptPortfolio)
            .orderBy(desc(schema.promptPortfolio.lastChecked));

    // Wave C.5 — Phase-1 fallback. prompt_portfolio is a deprecated table
    // that the active citation pipeline doesn't populate, so for real
    // brands this always returns []. Synthesize PromptPortfolio-shaped
    // rows from brand_prompts + their most recent geo_ranking so the
    // "Tracked Prompts" table on the Share-of-Answer tab shows real data.
    // Only kicks in when filtered to a specific brand — aggregate queries
    // still return the (real) Phase-2 rows.
    if (rows.length === 0 && brandId) {
      const bps = await this.getBrandPromptsByBrandId(brandId);
      if (bps.length === 0) return rows;
      const rankings = await this.getGeoRankingsByBrandPromptIds(bps.map((b) => b.id));
      // Index most-recent ranking per (prompt, platform) for the
      // isBrandCited / citationPosition / lastChecked fields.
      const latestByPromptPlatform = new Map<string, GeoRanking>();
      for (const r of rankings) {
        if (!r.brandPromptId) continue;
        const key = `${r.brandPromptId}::${r.aiPlatform}`;
        const prev = latestByPromptPlatform.get(key);
        if (!prev || new Date(r.checkedAt).getTime() > new Date(prev.checkedAt).getTime()) {
          latestByPromptPlatform.set(key, r);
        }
      }
      // Share-of-answer per prompt = cited / total across all runs.
      const citeStats = new Map<string, { cited: number; total: number }>();
      for (const r of rankings) {
        if (!r.brandPromptId) continue;
        const s = citeStats.get(r.brandPromptId) ?? { cited: 0, total: 0 };
        s.total += 1;
        if (r.isCited === 1) s.cited += 1;
        citeStats.set(r.brandPromptId, s);
      }

      const synthesized: PromptPortfolio[] = [];
      for (const bp of bps) {
        const cat = (bp.category?.trim() || "uncategorised").toLowerCase();
        const funnel =
          (bp.funnelStage?.trim() || "").toLowerCase() ||
          (cat === "informational"
            ? "awareness"
            : cat === "transactional"
              ? "decision"
              : cat === "comparison" || cat === "navigational"
                ? "consideration"
                : "uncategorised");
        if (filters?.category && filters.category !== cat) continue;
        if (filters?.funnelStage && filters.funnelStage !== funnel) continue;
        // Pick a representative platform row. Prefer one where cited.
        const rowsForPrompt = Array.from(latestByPromptPlatform.values()).filter(
          (r) => r.brandPromptId === bp.id,
        );
        const representative =
          rowsForPrompt.find((r) => r.isCited === 1) ?? rowsForPrompt[0] ?? null;
        if (filters?.aiPlatform && representative?.aiPlatform !== filters.aiPlatform) continue;
        const stats = citeStats.get(bp.id) ?? { cited: 0, total: 0 };
        const shareOfAnswer =
          stats.total > 0 ? ((stats.cited / stats.total) * 100).toFixed(2) : "0";
        synthesized.push({
          id: `phase1:${bp.id}`,
          brandId,
          prompt: bp.prompt,
          category: cat,
          funnelStage: funnel,
          competitorSet: null,
          region: bp.region || "global",
          aiPlatform: representative?.aiPlatform || "all",
          isBrandCited: representative?.isCited ?? 0,
          citationPosition: representative?.rank ?? null,
          shareOfAnswer,
          sentiment: representative?.sentiment || "neutral",
          answerVolatility: 0,
          consensusScore: 0,
          lastChecked: representative?.checkedAt || bp.createdAt,
          checkedHistory: null,
          createdAt: bp.createdAt,
          metadata: { phase: 1 } as any,
        } as PromptPortfolio);
      }
      return synthesized;
    }
    return rows;
  }

  async getPromptPortfolioById(id: string): Promise<PromptPortfolio | undefined> {
    const result = await db
      .select()
      .from(schema.promptPortfolio)
      .where(eq(schema.promptPortfolio.id, id));
    return result[0];
  }

  async updatePromptPortfolio(
    id: string,
    update: Partial<InsertPromptPortfolio>,
  ): Promise<PromptPortfolio | undefined> {
    const result = await db
      .update(schema.promptPortfolio)
      .set({ ...update, lastChecked: new Date() })
      .where(eq(schema.promptPortfolio.id, id))
      .returning();
    return result[0];
  }

  async deletePromptPortfolio(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.promptPortfolio)
      .where(eq(schema.promptPortfolio.id, id))
      .returning();
    return result.length > 0;
  }

  async getShareOfAnswerStats(brandId: string): Promise<{
    totalPrompts: number;
    citedPrompts: number;
    shareOfAnswer: number;
    byCategory: Record<string, { total: number; cited: number }>;
    byFunnel: Record<string, { total: number; cited: number }>;
    byCompetitor: Record<string, { total: number; cited: number; shareAgainst: number }>;
    avgVolatility: number;
    avgConsensus: number;
    volatilityDistribution: { stable: number; moderate: number; volatile: number };
  }> {
    // IMPORTANT: query the real prompt_portfolio table DIRECTLY — do NOT
    // go through getPromptPortfolio, which now synthesizes Phase-1 rows
    // when the table is empty. That fallback was masking the Phase-1
    // branch below, making Competitor Comparison + Answer Stability
    // always-empty (synthesized rows have competitorSet=null and
    // answerVolatility=0, so the Phase-2 code path produced zeros).
    const realPhase2 = await db
      .select()
      .from(schema.promptPortfolio)
      .where(eq(schema.promptPortfolio.brandId, brandId));
    const prompts = realPhase2;

    // Phase-1 fallback: when real prompt_portfolio is empty (the common
    // case — nothing in the active pipeline writes there), derive
    // share-of-answer from brand_prompts joined against geo_rankings, and
    // pull byCompetitor from competitor_geo_rankings.
    if (prompts.length === 0) {
      const brandPrompts = await this.getBrandPromptsByBrandId(brandId);
      const promptIds = brandPrompts.map((p) => p.id);
      const rankings =
        promptIds.length > 0 ? await this.getGeoRankingsByBrandPromptIds(promptIds) : [];
      // Semantic fix — previously these were raw ranking-row counts
      // (every prompt × platform × run contributed 1), so "Cited Prompts"
      // was actually "Cited Checks" and inflated by platform × run count.
      // Now:
      //   totalPrompts = distinct prompts tracked (brand_prompts)
      //   citedPrompts = distinct prompts cited in AT LEAST ONE check
      //   shareOfAnswer = citedChecks / totalChecks (still a per-check rate)
      const totalPrompts = brandPrompts.length;
      const citedPromptIds = new Set(
        rankings
          .filter((r) => r.isCited === 1 && r.brandPromptId)
          .map((r) => r.brandPromptId as string),
      );
      const citedPrompts = citedPromptIds.size;
      const totalChecks = rankings.length;
      const citedChecks = rankings.filter((r) => r.isCited === 1).length;
      const shareOfAnswer = totalChecks > 0 ? (citedChecks / totalChecks) * 100 : 0;

      // Build prompt_id → {category, funnelStage} lookup with fallbacks.
      // funnelStage derived from category when missing:
      //   informational → awareness; comparison → consideration;
      //   transactional → decision; navigational → consideration.
      const deriveFunnel = (category: string | null): string => {
        switch ((category || "").toLowerCase()) {
          case "informational":
            return "awareness";
          case "comparison":
          case "navigational":
            return "consideration";
          case "transactional":
            return "decision";
          default:
            return "uncategorised";
        }
      };
      const promptMeta = new Map<string, { category: string; funnelStage: string }>();
      for (const bp of brandPrompts) {
        const cat = bp.category?.trim() || "uncategorised";
        const funnel = bp.funnelStage?.trim() || deriveFunnel(bp.category);
        promptMeta.set(bp.id, { category: cat, funnelStage: funnel });
      }

      const byCategory: Record<string, { total: number; cited: number }> = {};
      const byFunnel: Record<string, { total: number; cited: number }> = {};
      for (const r of rankings) {
        const meta = r.brandPromptId
          ? (promptMeta.get(r.brandPromptId) ?? {
              category: "uncategorised",
              funnelStage: "uncategorised",
            })
          : { category: "uncategorised", funnelStage: "uncategorised" };
        if (!byCategory[meta.category]) byCategory[meta.category] = { total: 0, cited: 0 };
        byCategory[meta.category].total += 1;
        if (r.isCited === 1) byCategory[meta.category].cited += 1;
        if (!byFunnel[meta.funnelStage]) byFunnel[meta.funnelStage] = { total: 0, cited: 0 };
        byFunnel[meta.funnelStage].total += 1;
        if (r.isCited === 1) byFunnel[meta.funnelStage].cited += 1;
      }

      // Competitor comparison from competitor_geo_rankings.
      //
      // IMPORTANT denominator: competitor_geo_rankings only stores rows
      // when a competitor was cited (citationChecker keeps the table
      // narrow). Counting rows both for total and cited would force
      // shareAgainst = 100% for every competitor — which is the bug you
      // saw on the tab. The correct denominator is the brand's total
      // checks: "of N brand checks in this window, on how many was
      // competitor X cited?". That's cited / brandTotalChecks.
      const byCompetitor: Record<string, { total: number; cited: number; shareAgainst: number }> =
        {};
      if (promptIds.length > 0) {
        const competitors = await this.getCompetitors(brandId);
        if (competitors.length > 0) {
          const compIds = competitors.map((c) => c.id);
          const cgr = await db
            .select()
            .from(schema.competitorGeoRankings)
            .where(
              and(
                inArray(schema.competitorGeoRankings.competitorId, compIds),
                inArray(schema.competitorGeoRankings.brandPromptId, promptIds),
                eq(schema.competitorGeoRankings.isCited, 1),
              ),
            );
          const compIdToName = new Map(competitors.map((c) => [c.id, c.name]));
          const denom = totalChecks; // brand's total rankings in the window
          for (const row of cgr) {
            const name = compIdToName.get(row.competitorId);
            if (!name) continue;
            if (!byCompetitor[name])
              byCompetitor[name] = { total: denom, cited: 0, shareAgainst: 0 };
            byCompetitor[name].cited += 1;
          }
          Object.keys(byCompetitor).forEach((k) => {
            const d = byCompetitor[k];
            d.shareAgainst = d.total > 0 ? Math.round((d.cited / d.total) * 100) : 0;
          });
        }
      }

      // Answer stability — flip rate per (prompt × platform) across runs.
      // The previous version grouped by brand_prompt_id only, so a prompt
      // checked on 5 platforms × 3 runs = 15 rows got sorted by checkedAt
      // and consecutive rows could be different platforms — inflating the
      // apparent flip count with cross-platform noise. Grouping by
      // (prompt, platform) pair compares apples to apples: one series per
      // pair, ordered by run, measuring "did this prompt's answer on this
      // platform flip cited/not-cited between runs."
      //
      // Volatility = 100 * flips / (runs - 1)
      // Buckets:  stable ≤30 | moderate 31-60 | volatile >60
      // Pairs with fewer than 2 runs are skipped (not enough history to
      // measure flips; don't let them dilute the stable count with bogus
      // zeros).
      let totalVolatility = 0;
      const volatilityDistribution = { stable: 0, moderate: 0, volatile: 0 };
      const pairHistory = new Map<string, GeoRanking[]>();
      for (const r of rankings) {
        if (!r.brandPromptId || !r.aiPlatform) continue;
        const key = `${r.brandPromptId}::${r.aiPlatform}`;
        const arr = pairHistory.get(key) ?? [];
        arr.push(r);
        pairHistory.set(key, arr);
      }
      let pairsScored = 0;
      pairHistory.forEach((runs) => {
        if (runs.length < 2) return; // need ≥2 runs to measure flips
        const sorted = runs
          .slice()
          .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime());
        let flips = 0;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].isCited !== sorted[i - 1].isCited) flips += 1;
        }
        const vol = Math.round((flips / (sorted.length - 1)) * 100);
        totalVolatility += vol;
        pairsScored += 1;
        if (vol <= 30) volatilityDistribution.stable += 1;
        else if (vol <= 60) volatilityDistribution.moderate += 1;
        else volatilityDistribution.volatile += 1;
      });
      const avgVolatility = pairsScored > 0 ? totalVolatility / pairsScored : 0;
      // Consensus = inverse of volatility — no Phase-1 source of
      // cross-platform agreement, so we approximate: a prompt stable
      // across runs is a high-consensus prompt.
      const avgConsensus = Math.max(0, 100 - avgVolatility);

      return {
        totalPrompts,
        citedPrompts,
        shareOfAnswer,
        byCategory,
        byFunnel,
        byCompetitor,
        avgVolatility,
        avgConsensus,
        volatilityDistribution,
      };
    }

    const totalPrompts = prompts.length;
    const citedPrompts = prompts.filter((p) => p.isBrandCited === 1).length;
    const shareOfAnswer = totalPrompts > 0 ? (citedPrompts / totalPrompts) * 100 : 0;

    const byCategory: Record<string, { total: number; cited: number }> = {};
    const byFunnel: Record<string, { total: number; cited: number }> = {};
    const byCompetitor: Record<string, { total: number; cited: number; shareAgainst: number }> = {};

    let totalVolatility = 0;
    let totalConsensus = 0;
    const volatilityDistribution = { stable: 0, moderate: 0, volatile: 0 };

    prompts.forEach((p) => {
      if (!byCategory[p.category]) byCategory[p.category] = { total: 0, cited: 0 };
      byCategory[p.category].total++;
      if (p.isBrandCited === 1) byCategory[p.category].cited++;

      if (!byFunnel[p.funnelStage]) byFunnel[p.funnelStage] = { total: 0, cited: 0 };
      byFunnel[p.funnelStage].total++;
      if (p.isBrandCited === 1) byFunnel[p.funnelStage].cited++;

      if (p.competitorSet && p.competitorSet.length > 0) {
        p.competitorSet.forEach((competitor) => {
          if (!byCompetitor[competitor])
            byCompetitor[competitor] = { total: 0, cited: 0, shareAgainst: 0 };
          byCompetitor[competitor].total++;
          if (p.isBrandCited === 1) byCompetitor[competitor].cited++;
        });
      }

      totalVolatility += p.answerVolatility || 0;
      totalConsensus += p.consensusScore || 0;

      const vol = p.answerVolatility || 0;
      if (vol <= 30) volatilityDistribution.stable++;
      else if (vol <= 60) volatilityDistribution.moderate++;
      else volatilityDistribution.volatile++;
    });

    Object.keys(byCompetitor).forEach((comp) => {
      const data = byCompetitor[comp];
      data.shareAgainst = data.total > 0 ? (data.cited / data.total) * 100 : 0;
    });

    const avgVolatility = totalPrompts > 0 ? totalVolatility / totalPrompts : 0;
    const avgConsensus = totalPrompts > 0 ? totalConsensus / totalPrompts : 0;

    return {
      totalPrompts,
      citedPrompts,
      shareOfAnswer,
      byCategory,
      byFunnel,
      byCompetitor,
      avgVolatility,
      avgConsensus,
      volatilityDistribution,
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

    // Wave D — Phase-1 fallback. citation_quality is a Phase-2 table the
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
            // No "recency" signal in Phase-1 data — derive from checkedAt
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

  async createBrandFact(insertFact: InsertBrandFactSheet): Promise<BrandFactSheet> {
    const result = await db.insert(schema.brandFactSheet).values(insertFact).returning();
    return result[0];
  }

  async getBrandFacts(brandId: string): Promise<BrandFactSheet[]> {
    return await db
      .select()
      .from(schema.brandFactSheet)
      .where(and(eq(schema.brandFactSheet.brandId, brandId), eq(schema.brandFactSheet.isActive, 1)))
      .orderBy(asc(schema.brandFactSheet.factCategory));
  }

  async getBrandFactById(id: string): Promise<BrandFactSheet | undefined> {
    const result = await db
      .select()
      .from(schema.brandFactSheet)
      .where(eq(schema.brandFactSheet.id, id));
    return result[0];
  }

  async updateBrandFact(
    id: string,
    update: Partial<InsertBrandFactSheet>,
  ): Promise<BrandFactSheet | undefined> {
    const result = await db
      .update(schema.brandFactSheet)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.brandFactSheet.id, id))
      .returning();
    return result[0];
  }

  async deleteBrandFact(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.brandFactSheet)
      .where(eq(schema.brandFactSheet.id, id))
      .returning();
    return result.length > 0;
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
    // The "Record Snapshot" button on the Trends tab calls this. It used to
    // only read from the deprecated prompt_portfolio table (always empty in
    // the active pipeline) — so the button silently wrote nothing and the
    // chart stayed flat. Fall back to Phase-1 (brand_prompts + geo_rankings)
    // so a manual snapshot actually produces data.

    // Try Phase-2 prompt_portfolio first (richer metrics when present).
    const phase2Prompts = await db
      .select()
      .from(schema.promptPortfolio)
      .where(eq(schema.promptPortfolio.brandId, brandId));

    if (phase2Prompts.length > 0) {
      const citedPrompts = phase2Prompts.filter((p) => p.isBrandCited === 1);
      const soaValue = (citedPrompts.length / phase2Prompts.length) * 100;
      const avgVolatility =
        phase2Prompts.reduce((sum, p) => sum + (p.answerVolatility || 0), 0) / phase2Prompts.length;
      const avgConsensus =
        phase2Prompts.reduce((sum, p) => sum + (p.consensusScore || 0), 0) / phase2Prompts.length;
      await this.createMetricsSnapshot({
        brandId,
        metricType: "share_of_answer",
        metricValue: soaValue.toFixed(2),
        metricDetails: {
          promptCount: phase2Prompts.length,
          citedCount: citedPrompts.length,
          avgVolatility,
          avgConsensus,
        },
      } as any);
    } else {
      // Phase-1 fallback: compute share-of-answer from brand_prompts × geo_rankings.
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
    }

    // citation_quality — average totalQualityScore across citations.
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

    // hallucinations — always write a row (even 0 unresolved is useful for
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

  async createAiSource(insertSource: InsertAiSource): Promise<AiSource> {
    const result = await db.insert(schema.aiSources).values(insertSource).returning();
    return result[0];
  }

  async getAiSources(
    brandId?: string,
    filters?: { aiPlatform?: string; sourceType?: string },
  ): Promise<AiSource[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.aiSources.brandId, brandId));
    if (filters?.aiPlatform) conditions.push(eq(schema.aiSources.aiPlatform, filters.aiPlatform));
    if (filters?.sourceType) conditions.push(eq(schema.aiSources.sourceType, filters.sourceType));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.aiSources)
        .where(and(...conditions))
        .orderBy(desc(schema.aiSources.occurrenceCount));
    }
    return await db.select().from(schema.aiSources).orderBy(desc(schema.aiSources.occurrenceCount));
  }

  async getAiSourceById(id: string): Promise<AiSource | undefined> {
    const result = await db.select().from(schema.aiSources).where(eq(schema.aiSources.id, id));
    return result[0];
  }

  async updateAiSource(id: string, update: Partial<InsertAiSource>): Promise<AiSource | undefined> {
    const result = await db
      .update(schema.aiSources)
      .set({ ...update, lastSeenAt: new Date() })
      .where(eq(schema.aiSources.id, id))
      .returning();
    return result[0];
  }

  async deleteAiSource(id: string): Promise<boolean> {
    const result = await db.delete(schema.aiSources).where(eq(schema.aiSources.id, id)).returning();
    return result.length > 0;
  }

  async getTopAiSources(brandId: string, limit: number = 10): Promise<AiSource[]> {
    const phase2 = await db
      .select()
      .from(schema.aiSources)
      .where(eq(schema.aiSources.brandId, brandId))
      .orderBy(desc(schema.aiSources.authorityScore))
      .limit(limit);
    if (phase2.length > 0) return phase2;

    // Fallback: synthesise AiSource-shaped rows from Phase 1 geo_rankings
    // citations. This is a read-only projection — nothing gets persisted —
    // so users see real source data before any ai_sources rows are ingested.
    const brandPrompts = await this.getBrandPromptsByBrandId(brandId);
    const rankings =
      brandPrompts.length > 0
        ? (await this.getGeoRankingsByBrandPromptIds(brandPrompts.map((p) => p.id))).filter(
            (r) => r.isCited === 1 && r.citingOutletUrl,
          )
        : [];
    const grouped = new Map<
      string,
      {
        platforms: Set<string>;
        count: number;
        latestUrl: string;
        latestContext: string | null;
        latestAt: Date;
        name: string;
      }
    >();
    for (const r of rankings) {
      const url = r.citingOutletUrl!;
      let domain = url;
      try {
        domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        /* keep raw */
      }
      const key = `${domain}::${r.aiPlatform}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
        if (r.checkedAt && new Date(r.checkedAt) > existing.latestAt) {
          existing.latestUrl = url;
          existing.latestContext = r.citationContext;
          existing.latestAt = new Date(r.checkedAt);
        }
      } else {
        grouped.set(key, {
          platforms: new Set([r.aiPlatform]),
          count: 1,
          latestUrl: url,
          latestContext: r.citationContext,
          latestAt: r.checkedAt ? new Date(r.checkedAt) : new Date(),
          name: r.citingOutletName || domain,
        });
      }
    }
    const nowIso = new Date();
    const synthetic: AiSource[] = Array.from(grouped.entries())
      .map(([key, v]) => {
        const [domain, aiPlatform] = key.split("::");
        return {
          id: `synthetic-${key}`,
          brandId,
          aiPlatform,
          sourceUrl: v.latestUrl,
          sourceDomain: domain,
          sourceName: v.name,
          sourceType: domain.includes("reddit.com")
            ? "community"
            : domain.includes("quora.com")
              ? "community"
              : domain.includes("wikipedia.org")
                ? "reference"
                : domain.includes("youtube.com")
                  ? "video"
                  : "web",
          prompt: null,
          citationContext: v.latestContext,
          authorityScore: Math.min(100, v.count * 10),
          isBrandMentioned: 1,
          sentiment: "neutral",
          discoveredAt: v.latestAt,
          lastSeenAt: v.latestAt,
          occurrenceCount: v.count,
          metadata: { synthetic: true, derivedFrom: "geo_rankings" },
        } as AiSource;
      })
      .sort((a, b) => (b.authorityScore ?? 0) - (a.authorityScore ?? 0))
      .slice(0, limit);
    return synthetic;
  }

  async createAiTrafficSession(insertSession: InsertAiTrafficSession): Promise<AiTrafficSession> {
    const result = await db.insert(schema.aiTrafficSessions).values(insertSession).returning();
    return result[0];
  }

  async getAiTrafficSessions(
    brandId?: string,
    filters?: { aiPlatform?: string; converted?: boolean },
  ): Promise<AiTrafficSession[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.aiTrafficSessions.brandId, brandId));
    if (filters?.aiPlatform)
      conditions.push(eq(schema.aiTrafficSessions.aiPlatform, filters.aiPlatform));
    if (filters?.converted !== undefined)
      conditions.push(eq(schema.aiTrafficSessions.converted, filters.converted ? 1 : 0));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.aiTrafficSessions)
        .where(and(...conditions))
        .orderBy(desc(schema.aiTrafficSessions.createdAt));
    }
    return await db
      .select()
      .from(schema.aiTrafficSessions)
      .orderBy(desc(schema.aiTrafficSessions.createdAt));
  }

  async getAiTrafficStats(brandId: string): Promise<{
    totalSessions: number;
    totalPageViews: number;
    conversions: number;
    conversionRate: number;
    byPlatform: Record<string, { sessions: number; conversions: number }>;
    avgSessionDuration: number;
  }> {
    const sessions = await this.getAiTrafficSessions(brandId);
    const totalSessions = sessions.length;
    const totalPageViews = sessions.reduce((sum, s) => sum + (s.pageViews || 0), 0);
    const conversions = sessions.filter((s) => s.converted === 1).length;
    const conversionRate = totalSessions > 0 ? (conversions / totalSessions) * 100 : 0;

    const byPlatform: Record<string, { sessions: number; conversions: number }> = {};
    sessions.forEach((s) => {
      if (!byPlatform[s.aiPlatform]) byPlatform[s.aiPlatform] = { sessions: 0, conversions: 0 };
      byPlatform[s.aiPlatform].sessions++;
      if (s.converted === 1) byPlatform[s.aiPlatform].conversions++;
    });

    const sessionsWithDuration = sessions.filter((s) => s.sessionDuration !== null);
    const avgSessionDuration =
      sessionsWithDuration.length > 0
        ? sessionsWithDuration.reduce((sum, s) => sum + (s.sessionDuration || 0), 0) /
          sessionsWithDuration.length
        : 0;

    return {
      totalSessions,
      totalPageViews,
      conversions,
      conversionRate,
      byPlatform,
      avgSessionDuration,
    };
  }

  async createPromptTestRun(insertRun: InsertPromptTestRun): Promise<PromptTestRun> {
    const result = await db.insert(schema.promptTestRuns).values(insertRun).returning();
    return result[0];
  }

  async getPromptTestRuns(
    brandId?: string,
    filters?: { status?: string; promptPortfolioId?: string },
  ): Promise<PromptTestRun[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.promptTestRuns.brandId, brandId));
    if (filters?.status) conditions.push(eq(schema.promptTestRuns.runStatus, filters.status));
    if (filters?.promptPortfolioId)
      conditions.push(eq(schema.promptTestRuns.promptPortfolioId, filters.promptPortfolioId));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.promptTestRuns)
        .where(and(...conditions))
        .orderBy(desc(schema.promptTestRuns.createdAt));
    }
    return await db
      .select()
      .from(schema.promptTestRuns)
      .orderBy(desc(schema.promptTestRuns.createdAt));
  }

  async getPromptTestRunById(id: string): Promise<PromptTestRun | undefined> {
    const result = await db
      .select()
      .from(schema.promptTestRuns)
      .where(eq(schema.promptTestRuns.id, id));
    return result[0];
  }

  async updatePromptTestRun(
    id: string,
    update: Partial<InsertPromptTestRun>,
  ): Promise<PromptTestRun | undefined> {
    const result = await db
      .update(schema.promptTestRuns)
      .set(update)
      .where(eq(schema.promptTestRuns.id, id))
      .returning();
    return result[0];
  }

  async createAgentTask(insertTask: InsertAgentTask): Promise<AgentTask> {
    const result = await db.insert(schema.agentTasks).values(insertTask).returning();
    return result[0];
  }

  async getAgentTasks(
    brandId?: string,
    filters?: { status?: string; taskType?: string; priority?: string },
  ): Promise<AgentTask[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.agentTasks.brandId, brandId));
    if (filters?.status) conditions.push(eq(schema.agentTasks.status, filters.status));
    if (filters?.taskType) conditions.push(eq(schema.agentTasks.taskType, filters.taskType));
    if (filters?.priority) conditions.push(eq(schema.agentTasks.priority, filters.priority));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.agentTasks)
        .where(and(...conditions))
        .orderBy(desc(schema.agentTasks.createdAt));
    }
    return await db.select().from(schema.agentTasks).orderBy(desc(schema.agentTasks.createdAt));
  }

  async getAgentTaskById(id: string): Promise<AgentTask | undefined> {
    const result = await db.select().from(schema.agentTasks).where(eq(schema.agentTasks.id, id));
    return result[0];
  }

  async updateAgentTask(
    id: string,
    update: Partial<InsertAgentTask>,
  ): Promise<AgentTask | undefined> {
    const result = await db
      .update(schema.agentTasks)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.agentTasks.id, id))
      .returning();
    return result[0];
  }

  // Atomic status claim. Flips queued → in_progress in a single UPDATE so
  // concurrent callers can't both claim the same task (the loser's query
  // matches zero rows). Returns null if the task wasn't queued.
  async claimAgentTask(id: string): Promise<AgentTask | null> {
    const now = new Date();
    const result = await db
      .update(schema.agentTasks)
      .set({ status: "in_progress", startedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.agentTasks.id, id),
          inArray(schema.agentTasks.status, ["queued", "scheduled"]),
        ),
      )
      .returning();
    return result[0] ?? null;
  }

  async deleteAgentTask(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.agentTasks)
      .where(eq(schema.agentTasks.id, id))
      .returning();
    return result.length > 0;
  }

  async getNextQueuedTask(): Promise<AgentTask | undefined> {
    const queued = await db
      .select()
      .from(schema.agentTasks)
      .where(eq(schema.agentTasks.status, "queued"));
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sorted = queued.sort((a, b) => {
      const priorityDiff = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    return sorted[0];
  }

  async getAgentTaskStats(brandId?: string): Promise<{
    queued: number;
    inProgress: number;
    completed: number;
    failed: number;
    totalTokensUsed: number;
  }> {
    let tasks: AgentTask[];
    if (brandId) {
      tasks = await db
        .select()
        .from(schema.agentTasks)
        .where(eq(schema.agentTasks.brandId, brandId));
    } else {
      tasks = await db.select().from(schema.agentTasks);
    }

    const queued = tasks.filter((t) => t.status === "queued").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const failed = tasks.filter((t) => t.status === "failed").length;
    const totalTokensUsed = tasks.reduce((sum, t) => sum + (t.tokensUsed || 0), 0);

    return { queued, inProgress, completed, failed, totalTokensUsed };
  }

  async createOutreachCampaign(insertCampaign: InsertOutreachCampaign): Promise<OutreachCampaign> {
    const result = await db.insert(schema.outreachCampaigns).values(insertCampaign).returning();
    return result[0];
  }

  async getOutreachCampaigns(
    brandId?: string,
    filters?: { status?: string; campaignType?: string },
  ): Promise<OutreachCampaign[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.outreachCampaigns.brandId, brandId));
    if (filters?.status) conditions.push(eq(schema.outreachCampaigns.status, filters.status));
    if (filters?.campaignType)
      conditions.push(eq(schema.outreachCampaigns.campaignType, filters.campaignType));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.outreachCampaigns)
        .where(and(...conditions))
        .orderBy(desc(schema.outreachCampaigns.createdAt));
    }
    return await db
      .select()
      .from(schema.outreachCampaigns)
      .orderBy(desc(schema.outreachCampaigns.createdAt));
  }

  async getOutreachCampaignById(id: string): Promise<OutreachCampaign | undefined> {
    const result = await db
      .select()
      .from(schema.outreachCampaigns)
      .where(eq(schema.outreachCampaigns.id, id));
    return result[0];
  }

  async updateOutreachCampaign(
    id: string,
    update: Partial<InsertOutreachCampaign>,
  ): Promise<OutreachCampaign | undefined> {
    const result = await db
      .update(schema.outreachCampaigns)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.outreachCampaigns.id, id))
      .returning();
    return result[0];
  }

  async deleteOutreachCampaign(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.outreachCampaigns)
      .where(eq(schema.outreachCampaigns.id, id))
      .returning();
    return result.length > 0;
  }

  async getOutreachStats(
    brandId: string,
  ): Promise<{ total: number; byStatus: Record<string, number>; successRate: number }> {
    const campaigns = await this.getOutreachCampaigns(brandId);
    const total = campaigns.length;

    const byStatus: Record<string, number> = {};
    campaigns.forEach((c) => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    });

    const successfulStatuses = ["accepted", "completed"];
    const successful = campaigns.filter((c) => successfulStatuses.includes(c.status)).length;
    const attempted = campaigns.filter((c) => c.status !== "draft").length;
    const successRate = attempted > 0 ? (successful / attempted) * 100 : 0;

    return { total, byStatus, successRate };
  }

  async createPublicationTarget(insertTarget: InsertPublicationTarget): Promise<PublicationTarget> {
    const result = await db.insert(schema.publicationTargets).values(insertTarget).returning();
    return result[0];
  }

  async getPublicationTargets(
    brandId?: string,
    filters?: { status?: string; category?: string; industry?: string },
  ): Promise<PublicationTarget[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.publicationTargets.brandId, brandId));
    if (filters?.status) conditions.push(eq(schema.publicationTargets.status, filters.status));
    if (filters?.category)
      conditions.push(eq(schema.publicationTargets.category, filters.category));
    if (filters?.industry)
      conditions.push(eq(schema.publicationTargets.industry, filters.industry));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.publicationTargets)
        .where(and(...conditions))
        .orderBy(desc(schema.publicationTargets.relevanceScore));
    }
    return await db
      .select()
      .from(schema.publicationTargets)
      .orderBy(desc(schema.publicationTargets.relevanceScore));
  }

  async getPublicationTargetById(id: string): Promise<PublicationTarget | undefined> {
    const result = await db
      .select()
      .from(schema.publicationTargets)
      .where(eq(schema.publicationTargets.id, id));
    return result[0];
  }

  async updatePublicationTarget(
    id: string,
    update: Partial<InsertPublicationTarget>,
  ): Promise<PublicationTarget | undefined> {
    const result = await db
      .update(schema.publicationTargets)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.publicationTargets.id, id))
      .returning();
    return result[0];
  }

  async deletePublicationTarget(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.publicationTargets)
      .where(eq(schema.publicationTargets.id, id))
      .returning();
    return result.length > 0;
  }

  async discoverPublications(brandId: string, industry: string): Promise<PublicationTarget[]> {
    const discovered: PublicationTarget[] = [];
    const industryPublications: Record<
      string,
      Array<{
        name: string;
        domain: string;
        da: number;
        category: string;
        acceptsGuest: boolean;
        traffic: string;
      }>
    > = {
      technology: [
        {
          name: "TechCrunch",
          domain: "techcrunch.com",
          da: 94,
          category: "news_site",
          acceptsGuest: false,
          traffic: "15M",
        },
        {
          name: "The Verge",
          domain: "theverge.com",
          da: 92,
          category: "news_site",
          acceptsGuest: false,
          traffic: "20M",
        },
        {
          name: "Wired",
          domain: "wired.com",
          da: 94,
          category: "news_site",
          acceptsGuest: true,
          traffic: "12M",
        },
        {
          name: "VentureBeat",
          domain: "venturebeat.com",
          da: 91,
          category: "news_site",
          acceptsGuest: true,
          traffic: "8M",
        },
        {
          name: "Hacker Noon",
          domain: "hackernoon.com",
          da: 72,
          category: "blog",
          acceptsGuest: true,
          traffic: "2M",
        },
        {
          name: "Dev.to",
          domain: "dev.to",
          da: 78,
          category: "blog",
          acceptsGuest: true,
          traffic: "5M",
        },
        {
          name: "Medium - Technology",
          domain: "medium.com",
          da: 96,
          category: "blog",
          acceptsGuest: true,
          traffic: "100M",
        },
      ],
      marketing: [
        {
          name: "HubSpot Blog",
          domain: "blog.hubspot.com",
          da: 93,
          category: "blog",
          acceptsGuest: true,
          traffic: "10M",
        },
        {
          name: "Content Marketing Institute",
          domain: "contentmarketinginstitute.com",
          da: 79,
          category: "industry_publication",
          acceptsGuest: true,
          traffic: "1M",
        },
        {
          name: "Search Engine Journal",
          domain: "searchenginejournal.com",
          da: 89,
          category: "industry_publication",
          acceptsGuest: true,
          traffic: "4M",
        },
        {
          name: "MarketingProfs",
          domain: "marketingprofs.com",
          da: 82,
          category: "industry_publication",
          acceptsGuest: true,
          traffic: "800K",
        },
        {
          name: "AdWeek",
          domain: "adweek.com",
          da: 90,
          category: "news_site",
          acceptsGuest: false,
          traffic: "5M",
        },
      ],
      finance: [
        {
          name: "Forbes",
          domain: "forbes.com",
          da: 95,
          category: "news_site",
          acceptsGuest: true,
          traffic: "60M",
        },
        {
          name: "Investopedia",
          domain: "investopedia.com",
          da: 92,
          category: "industry_publication",
          acceptsGuest: true,
          traffic: "30M",
        },
        {
          name: "The Motley Fool",
          domain: "fool.com",
          da: 90,
          category: "industry_publication",
          acceptsGuest: false,
          traffic: "15M",
        },
        {
          name: "NerdWallet",
          domain: "nerdwallet.com",
          da: 90,
          category: "industry_publication",
          acceptsGuest: true,
          traffic: "20M",
        },
      ],
      healthcare: [
        {
          name: "HealthLine",
          domain: "healthline.com",
          da: 92,
          category: "industry_publication",
          acceptsGuest: true,
          traffic: "40M",
        },
        {
          name: "WebMD",
          domain: "webmd.com",
          da: 94,
          category: "industry_publication",
          acceptsGuest: false,
          traffic: "75M",
        },
        {
          name: "Medical News Today",
          domain: "medicalnewstoday.com",
          da: 91,
          category: "news_site",
          acceptsGuest: true,
          traffic: "30M",
        },
      ],
      default: [
        {
          name: "Inc.",
          domain: "inc.com",
          da: 92,
          category: "news_site",
          acceptsGuest: true,
          traffic: "15M",
        },
        {
          name: "Entrepreneur",
          domain: "entrepreneur.com",
          da: 92,
          category: "news_site",
          acceptsGuest: true,
          traffic: "10M",
        },
        {
          name: "Fast Company",
          domain: "fastcompany.com",
          da: 93,
          category: "news_site",
          acceptsGuest: false,
          traffic: "8M",
        },
        {
          name: "Business Insider",
          domain: "businessinsider.com",
          da: 94,
          category: "news_site",
          acceptsGuest: false,
          traffic: "40M",
        },
        {
          name: "LinkedIn Articles",
          domain: "linkedin.com",
          da: 99,
          category: "blog",
          acceptsGuest: true,
          traffic: "300M",
        },
      ],
    };

    const pubs = industryPublications[industry.toLowerCase()] || industryPublications["default"];
    if (pubs.length === 0) return discovered;

    // One query to find all existing domains for this brand, instead of one
    // query per publication.
    const pubDomains = pubs.map((p) => p.domain);
    const existing = await db
      .select({ domain: schema.publicationTargets.domain })
      .from(schema.publicationTargets)
      .where(
        and(
          inArray(schema.publicationTargets.domain, pubDomains),
          eq(schema.publicationTargets.brandId, brandId),
        ),
      );
    const existingDomains = new Set(existing.map((e) => e.domain));

    for (const pub of pubs) {
      if (existingDomains.has(pub.domain)) continue;
      const target = await this.createPublicationTarget({
        brandId,
        publicationName: pub.name,
        domain: pub.domain,
        category: pub.category,
        industry,
        domainAuthority: pub.da,
        monthlyTraffic: pub.traffic,
        acceptsGuestPosts: pub.acceptsGuest ? 1 : 0,
        relevanceScore: Math.floor(60 + Math.random() * 40),
        status: "discovered",
        discoveredBy: "ai",
      });
      discovered.push(target);
    }

    return discovered;
  }

  async findContacts(targetId: string): Promise<PublicationTarget | undefined> {
    const target = await this.getPublicationTargetById(targetId);
    if (!target) return undefined;

    const contactPatterns: Record<string, { role: string; email: string; name: string }> = {
      "techcrunch.com": { role: "editor", email: "tips@techcrunch.com", name: "Editorial Team" },
      "hackernoon.com": {
        role: "contributor",
        email: "contribute@hackernoon.com",
        name: "Editorial Team",
      },
      "dev.to": { role: "outreach", email: "hello@dev.to", name: "Community Team" },
      "blog.hubspot.com": { role: "contributor", email: "blog@hubspot.com", name: "Content Team" },
      "searchenginejournal.com": {
        role: "editor",
        email: "guest-posts@searchenginejournal.com",
        name: "Guest Post Editor",
      },
      "forbes.com": { role: "contributor", email: "tips@forbes.com", name: "Forbes Council" },
      "inc.com": { role: "editor", email: "editor@inc.com", name: "Editorial Team" },
      "entrepreneur.com": {
        role: "editor",
        email: "submit@entrepreneur.com",
        name: "Editorial Team",
      },
    };

    const contact = contactPatterns[target.domain];
    if (contact) {
      return this.updatePublicationTarget(targetId, {
        contactEmail: contact.email,
        contactName: contact.name,
        contactRole: contact.role,
        status: "contact_found",
      });
    }

    return this.updatePublicationTarget(targetId, {
      contactEmail: `editor@${target.domain}`,
      contactName: "Editorial Team",
      contactRole: "editor",
      status: "contact_found",
    });
  }

  async createOutreachEmail(insertEmail: InsertOutreachEmail): Promise<OutreachEmail> {
    const result = await db
      .insert(schema.outreachEmails)
      .values({
        ...insertEmail,
        trackingId: randomUUID(),
      })
      .returning();
    return result[0];
  }

  async getOutreachEmails(
    brandId?: string,
    filters?: { status?: string; campaignId?: string },
  ): Promise<OutreachEmail[]> {
    const conditions = [];
    if (brandId) conditions.push(eq(schema.outreachEmails.brandId, brandId));
    if (filters?.status) conditions.push(eq(schema.outreachEmails.status, filters.status));
    if (filters?.campaignId)
      conditions.push(eq(schema.outreachEmails.campaignId, filters.campaignId));
    if (conditions.length > 0) {
      return await db
        .select()
        .from(schema.outreachEmails)
        .where(and(...conditions))
        .orderBy(desc(schema.outreachEmails.createdAt));
    }
    return await db
      .select()
      .from(schema.outreachEmails)
      .orderBy(desc(schema.outreachEmails.createdAt));
  }

  async getOutreachEmailById(id: string): Promise<OutreachEmail | undefined> {
    const result = await db
      .select()
      .from(schema.outreachEmails)
      .where(eq(schema.outreachEmails.id, id));
    return result[0];
  }

  async updateOutreachEmail(
    id: string,
    update: Partial<InsertOutreachEmail>,
  ): Promise<OutreachEmail | undefined> {
    const result = await db
      .update(schema.outreachEmails)
      .set(update)
      .where(eq(schema.outreachEmails.id, id))
      .returning();
    return result[0];
  }

  async deleteOutreachEmail(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.outreachEmails)
      .where(eq(schema.outreachEmails.id, id))
      .returning();
    return result.length > 0;
  }

  async sendOutreachEmail(id: string): Promise<OutreachEmail | undefined> {
    const email = await this.getOutreachEmailById(id);
    if (!email) return undefined;

    const { logger } = await import("./lib/logger");
    const recipient = (email.recipientEmail || "").trim();
    if (!recipient || recipient === "pending@placeholder.local") {
      throw new Error("outreach_emails row has no real recipientEmail — cannot send");
    }

    // Resolve optional from address from the publication_target (its
    // editor contactEmail is NOT a from address; Resend requires a
    // verified sender domain). We keep the default FROM_ADDRESS from
    // emailService unless the brand has a verified custom sender. For
    // now we pass undefined and let emailService use its default.
    let fromOverride: string | undefined;
    try {
      if (email.brandId) {
        const brand = await this.getBrandById(email.brandId);
        // Future: surface brand.outreachFromAddress here once we add
        // per-brand sender verification. For now keep undefined so
        // emailService falls back to the platform FROM_ADDRESS.
        void brand;
      }
    } catch {
      /* non-fatal — just fall back to default FROM */
    }

    // Resend expects HTML; convert plain-text body by wrapping <br>'d.
    const html = (email.body || "")
      .split("\n")
      .map((line) => (line.trim().length === 0 ? "<br/>" : `<p>${line}</p>`))
      .join("\n");

    try {
      const { sendOutreachEmailViaResend } = await import("./emailService");
      await sendOutreachEmailViaResend({
        to: recipient,
        subject: email.subject || `Outreach from ${email.brandId}`,
        html,
        from: fromOverride,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, emailId: id }, "outreach send failed");
      await db
        .update(schema.outreachEmails)
        .set({ status: "failed", error: msg.slice(0, 1000) })
        .where(eq(schema.outreachEmails.id, id));
      throw err;
    }

    logger.info({ emailId: id, to: recipient }, "outreach email sent");

    const result = await db
      .update(schema.outreachEmails)
      .set({ status: "sent", sentAt: new Date(), error: null })
      .where(eq(schema.outreachEmails.id, id))
      .returning();

    if (email.publicationTargetId) {
      await this.updatePublicationTarget(email.publicationTargetId, {
        lastContactedAt: new Date(),
        previousOutreach: 1,
        status: "contacted",
      });
    }

    return result[0];
  }

  async getOutreachEmailStats(brandId: string): Promise<{
    sent: number;
    opened: number;
    replied: number;
    openRate: number;
    replyRate: number;
  }> {
    const emails = await this.getOutreachEmails(brandId);
    const sent = emails.filter((e) =>
      ["sent", "delivered", "opened", "clicked", "replied"].includes(e.status),
    ).length;
    const opened = emails.filter((e) => e.openedAt !== null).length;
    const replied = emails.filter((e) => e.repliedAt !== null).length;

    return {
      sent,
      opened,
      replied,
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      replyRate: sent > 0 ? (replied / sent) * 100 : 0,
    };
  }

  // Automation-rule DAO methods were removed when the workflow engine
  // replaced the Automation Rules theater. getAutomationRuleById is
  // retained below because the ownership helper `requireAutomationRule`
  // still references it for the remaining automation-executions routes.
  async getAutomationRuleById(id: string): Promise<AutomationRule | undefined> {
    const result = await db
      .select()
      .from(schema.automationRules)
      .where(eq(schema.automationRules.id, id));
    return result[0];
  }

  async createAutomationExecution(
    insertExecution: InsertAutomationExecution,
  ): Promise<AutomationExecution> {
    const result = await db.insert(schema.automationExecutions).values(insertExecution).returning();
    return result[0];
  }

  async getAutomationExecutions(
    ruleId?: string,
    limit: number = 50,
  ): Promise<AutomationExecution[]> {
    if (ruleId) {
      return await db
        .select()
        .from(schema.automationExecutions)
        .where(eq(schema.automationExecutions.automationRuleId, ruleId))
        .orderBy(desc(schema.automationExecutions.startedAt))
        .limit(limit);
    }
    return await db
      .select()
      .from(schema.automationExecutions)
      .orderBy(desc(schema.automationExecutions.startedAt))
      .limit(limit);
  }

  async updateAutomationExecution(
    id: string,
    update: Partial<InsertAutomationExecution>,
  ): Promise<AutomationExecution | undefined> {
    const result = await db
      .update(schema.automationExecutions)
      .set(update)
      .where(eq(schema.automationExecutions.id, id))
      .returning();
    return result[0];
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

  // ── Wave 7: unified-article methods (replaces the old content_drafts DAO) ──

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
        // Foundations Plan 4 Task 4: this is the only path that flips
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

  async listChatbotThreads(
    userId: string,
    limit = 50,
  ): Promise<Array<ChatbotThread & { messageCount: number }>> {
    const rows = await db.execute(sql`
      select t.*, coalesce(m.cnt, 0)::int as message_count
      from public.chatbot_threads t
      left join (
        select thread_id, count(*) as cnt
        from public.chatbot_messages
        group by thread_id
      ) m on m.thread_id = t.id
      where t.user_id = ${userId} and t.archived_at is null
      order by t.updated_at desc
      limit ${limit}
    `);
    const data = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      brandId: (r.brand_id as string | null) ?? null,
      title: r.title as string,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
      archivedAt: r.archived_at ? new Date(r.archived_at as string) : null,
      messageCount: (r.message_count as number) ?? 0,
    }));
  }

  async getChatbotThread(threadId: string): Promise<ChatbotThread | undefined> {
    const [row] = await db
      .select()
      .from(schema.chatbotThreads)
      .where(eq(schema.chatbotThreads.id, threadId))
      .limit(1);
    return row;
  }

  async createChatbotThread(userId: string, brandId?: string | null): Promise<ChatbotThread> {
    const [row] = await db
      .insert(schema.chatbotThreads)
      .values({
        userId,
        brandId: brandId ?? null,
      })
      .returning();
    return row;
  }

  async archiveChatbotThread(threadId: string): Promise<void> {
    await db
      .update(schema.chatbotThreads)
      .set({ archivedAt: new Date() })
      .where(eq(schema.chatbotThreads.id, threadId));
  }

  async restoreChatbotThread(threadId: string): Promise<void> {
    await db
      .update(schema.chatbotThreads)
      .set({ archivedAt: null })
      .where(eq(schema.chatbotThreads.id, threadId));
  }

  async setChatbotThreadTitle(threadId: string, title: string): Promise<void> {
    await db
      .update(schema.chatbotThreads)
      .set({ title })
      .where(eq(schema.chatbotThreads.id, threadId));
  }

  async touchChatbotThread(threadId: string): Promise<void> {
    await db
      .update(schema.chatbotThreads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.chatbotThreads.id, threadId));
  }

  async getChatbotThreadMessages(threadId: string, limit = 200): Promise<ChatbotMessage[]> {
    return db
      .select()
      .from(schema.chatbotMessages)
      .where(eq(schema.chatbotMessages.threadId, threadId))
      .orderBy(schema.chatbotMessages.createdAt)
      .limit(limit);
  }

  async insertChatbotMessage(msg: {
    userId: string;
    threadId: string;
    brandId?: string | null;
    role: "user" | "assistant";
    content: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    model?: string | null;
  }): Promise<ChatbotMessage> {
    const [row] = await db
      .insert(schema.chatbotMessages)
      .values({
        userId: msg.userId,
        threadId: msg.threadId,
        brandId: msg.brandId ?? null,
        role: msg.role,
        content: msg.content,
        inputTokens: msg.inputTokens ?? null,
        outputTokens: msg.outputTokens ?? null,
        model: msg.model ?? null,
      })
      .returning();
    return row;
  }

  async pruneChatbotMessages(): Promise<{ deletedByAge: number; deletedByCap: number }> {
    // 30-day TTL on messages.
    const ageRes = await db.execute(sql`
      delete from public.chatbot_messages
      where created_at < now() - interval '30 days'
      returning id
    `);
    const ageR = ageRes as unknown as { rows?: unknown[] } & unknown[];
    const deletedByAge = ageR.rows?.length ?? ageR.length ?? 0;

    // Per-user soft cap of 500 messages across threads, keeping newest.
    const capRes = await db.execute(sql`
      with ranked as (
        select id, row_number() over (partition by user_id order by created_at desc) as rn
        from public.chatbot_messages
      )
      delete from public.chatbot_messages
      where id in (select id from ranked where rn > 500)
      returning id
    `);
    const capR = capRes as unknown as { rows?: unknown[] } & unknown[];
    const deletedByCap = capR.rows?.length ?? capR.length ?? 0;

    // Hard-delete threads archived more than 30 days ago.
    await db.execute(sql`
      delete from public.chatbot_threads
      where archived_at is not null and archived_at < now() - interval '30 days'
    `);

    return { deletedByAge, deletedByCap };
  }

  // ─── Mentions rebuild (Task 7) ────────────────────────────────────────────

  // Scan jobs ----------------------------------------------------------------

  async createScanJob(input: {
    brandId: string;
    userId: string;
    trigger: "manual" | "cron";
  }): Promise<ScanJob> {
    // Explicit createdAt from JS Date avoids any DB/server timezone
    // misconfiguration causing "6 hours ago" relative-time bugs. JS Date is
    // an absolute UTC instant regardless of host TZ settings.
    const [row] = await db
      .insert(schema.scanJobs)
      .values({
        brandId: input.brandId,
        userId: input.userId,
        trigger: input.trigger,
        status: "queued",
        perSource: {},
        totals: {},
        createdAt: new Date(),
      })
      .returning();
    return row;
  }

  async getScanJob(id: string): Promise<(ScanJob & { brandName: string }) | undefined> {
    const [row] = await db
      .select({ ...getTableColumns(schema.scanJobs), brandName: schema.brands.name })
      .from(schema.scanJobs)
      .leftJoin(schema.brands, eq(schema.scanJobs.brandId, schema.brands.id))
      .where(eq(schema.scanJobs.id, id))
      .limit(1);
    if (!row) return undefined;
    return { ...row, brandName: row.brandName ?? "" };
  }

  async getActiveScanJobForBrand(brandId: string): Promise<ScanJob | undefined> {
    const [row] = await db
      .select()
      .from(schema.scanJobs)
      .where(
        and(
          eq(schema.scanJobs.brandId, brandId),
          or(eq(schema.scanJobs.status, "queued"), eq(schema.scanJobs.status, "running")),
        ),
      )
      .orderBy(desc(schema.scanJobs.createdAt))
      .limit(1);
    return row;
  }

  async getActiveScanJobsForUser(userId: string): Promise<Array<ScanJob & { brandName: string }>> {
    const rows = await db
      .select({ ...getTableColumns(schema.scanJobs), brandName: schema.brands.name })
      .from(schema.scanJobs)
      .leftJoin(schema.brands, eq(schema.scanJobs.brandId, schema.brands.id))
      .where(
        and(
          eq(schema.scanJobs.userId, userId),
          or(eq(schema.scanJobs.status, "queued"), eq(schema.scanJobs.status, "running")),
        ),
      )
      .orderBy(desc(schema.scanJobs.createdAt));
    return rows.map((r) => ({ ...r, brandName: r.brandName ?? "" }));
  }

  async getLastCompletedScanForBrand(
    brandId: string,
  ): Promise<(ScanJob & { brandName: string }) | undefined> {
    const [row] = await db
      .select({ ...getTableColumns(schema.scanJobs), brandName: schema.brands.name })
      .from(schema.scanJobs)
      .leftJoin(schema.brands, eq(schema.scanJobs.brandId, schema.brands.id))
      .where(and(eq(schema.scanJobs.brandId, brandId), eq(schema.scanJobs.status, "complete")))
      .orderBy(desc(schema.scanJobs.completedAt))
      .limit(1);
    if (!row) return undefined;
    return { ...row, brandName: row.brandName ?? "" };
  }

  async updateScanJob(
    id: string,
    patch: Partial<{
      status: string;
      perSource: unknown;
      totals: unknown;
      startedAt: Date;
      completedAt: Date;
      error: string;
    }>,
  ): Promise<void> {
    await db.update(schema.scanJobs).set(patch).where(eq(schema.scanJobs.id, id));
  }

  async pruneOldScanJobs(beforeDays: number): Promise<number> {
    const res = await db.execute(sql`
      DELETE FROM scan_jobs
      WHERE status IN ('complete', 'failed')
        AND completed_at < now() - (${beforeDays} || ' days')::interval
      RETURNING id
    `);
    const r = res as unknown as { rows?: unknown[] } & unknown[];
    return r.rows?.length ?? (Array.isArray(r) ? r.length : 0);
  }

  async getMostRecentManualScanForBrand(brandId: string): Promise<ScanJob | undefined> {
    const [row] = await db
      .select()
      .from(schema.scanJobs)
      .where(and(eq(schema.scanJobs.brandId, brandId), eq(schema.scanJobs.trigger, "manual")))
      .orderBy(desc(schema.scanJobs.createdAt))
      .limit(1);
    return row;
  }

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

  async listBrandsWithMentionMonitoring(): Promise<{ id: string; userId: string }[]> {
    const rows = await db
      .select({ id: schema.brands.id, userId: schema.brands.userId })
      .from(schema.brands)
      .where(eq(schema.brands.monitorMentions, true));
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
    const [agg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        positive: sql<number>`count(*) filter (where sentiment = 'positive')::int`,
        neutral: sql<number>`count(*) filter (where sentiment = 'neutral')::int`,
        negative: sql<number>`count(*) filter (where sentiment = 'negative')::int`,
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
      // Default: newest first — keyset on (discovered_at DESC, id DESC).
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
}
