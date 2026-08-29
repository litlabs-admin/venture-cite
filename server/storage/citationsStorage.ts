import { eq, and, desc, asc, sql, gte, inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import {
  type Citation,
  type InsertCitation,
  type GeoRanking,
  type InsertGeoRanking,
  type GeoSignalRun,
  type InsertGeoSignalRun,
  type BrandVisibilitySnapshot,
  type InsertBrandVisibilitySnapshot,
  type CitationQuality,
  type InsertCitationQuality,
  type CitationRun,
  type InsertCitationRun,
} from "@shared/schema";
import type { IStorage } from "../storage";
import { citationRatePct } from "@shared/visibilityMetrics";

export const citationsStorage = {
  async getCitations(opts?: { limit?: number; offset?: number }): Promise<Citation[]> {
    const q = db.select().from(schema.citations);
    if (opts?.limit !== undefined) {
      return await q.limit(opts.limit).offset(opts.offset ?? 0);
    }
    return await q;
  },

  async getCitationsByUserId(
    userId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<Citation[]> {
    const q = db.select().from(schema.citations).where(eq(schema.citations.userId, userId));
    if (opts?.limit !== undefined) {
      return await q.limit(opts.limit).offset(opts.offset ?? 0);
    }
    return await q;
  },

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
  },

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
  },

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
  },

  async getGeoRankings(articleId?: string): Promise<GeoRanking[]> {
    if (articleId) {
      return await db
        .select()
        .from(schema.geoRankings)
        .where(eq(schema.geoRankings.articleId, articleId));
    }
    return await db.select().from(schema.geoRankings);
  },

  async getGeoRankingsByPlatform(platform: string): Promise<GeoRanking[]> {
    return await db
      .select()
      .from(schema.geoRankings)
      .where(eq(schema.geoRankings.aiPlatform, platform));
  },

  async getGeoRankingsByBrandPromptIds(ids: string[], sinceDate?: Date): Promise<GeoRanking[]> {
    if (ids.length === 0) return [];
    const conditions = [inArray(schema.geoRankings.brandPromptId, ids)];
    if (sinceDate) conditions.push(gte(schema.geoRankings.checkedAt, sinceDate));
    return await db
      .select()
      .from(schema.geoRankings)
      .where(and(...conditions))
      .orderBy(desc(schema.geoRankings.checkedAt));
  },

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
  },

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
  },

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
  },

  async getGeoRankingsByArticleIds(ids: string[], sinceDate?: Date): Promise<GeoRanking[]> {
    if (ids.length === 0) return [];
    const conditions = [inArray(schema.geoRankings.articleId, ids)];
    if (sinceDate) conditions.push(gte(schema.geoRankings.checkedAt, sinceDate));
    return await db
      .select()
      .from(schema.geoRankings)
      .where(and(...conditions))
      .orderBy(desc(schema.geoRankings.checkedAt));
  },

  async updateGeoRanking(id: string, update: Partial<GeoRanking>): Promise<GeoRanking | undefined> {
    const [row] = await db
      .update(schema.geoRankings)
      .set(update)
      .where(eq(schema.geoRankings.id, id))
      .returning();
    return row;
  },

  async getGeoRankingsByRunId(runId: string): Promise<GeoRanking[]> {
    return await db
      .select()
      .from(schema.geoRankings)
      .where(eq(schema.geoRankings.runId, runId))
      .orderBy(asc(schema.geoRankings.prompt), asc(schema.geoRankings.aiPlatform));
  },

  async getVisibilityProgress(brandId: string) {
    return await db
      .select()
      .from(schema.visibilityProgress)
      .where(eq(schema.visibilityProgress.brandId, brandId));
  },

  async setVisibilityStep(brandId: string, engineId: string, stepId: string): Promise<void> {
    await db
      .insert(schema.visibilityProgress)
      .values({ brandId, engineId, stepId })
      .onConflictDoNothing();
  },

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
  },

  async recordGeoSignalRun(run: InsertGeoSignalRun): Promise<GeoSignalRun> {
    const [row] = await db.insert(schema.geoSignalRuns).values(run).returning();
    return row;
  },

  async getLastGeoSignalRunAt(brandId: string): Promise<Date | null> {
    const [row] = await db
      .select({ ranAt: schema.geoSignalRuns.ranAt })
      .from(schema.geoSignalRuns)
      .where(eq(schema.geoSignalRuns.brandId, brandId))
      .orderBy(desc(schema.geoSignalRuns.ranAt))
      .limit(1);
    return row?.ranAt ? new Date(row.ranAt as string | Date) : null;
  },

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
  },

  async createCitationRun(run: InsertCitationRun): Promise<CitationRun> {
    const [row] = await db.insert(schema.citationRuns).values(run).returning();
    return row;
  },

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
  },

  async getCitationRunsByBrandId(brandId: string, limit = 50): Promise<CitationRun[]> {
    return await db
      .select()
      .from(schema.citationRuns)
      .where(eq(schema.citationRuns.brandId, brandId))
      .orderBy(desc(schema.citationRuns.startedAt))
      .limit(limit);
  },

  async getCitationRunById(runId: string): Promise<CitationRun | undefined> {
    const [row] = await db
      .select()
      .from(schema.citationRuns)
      .where(eq(schema.citationRuns.id, runId))
      .limit(1);
    return row;
  },

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
    const citationRate = citationRatePct(totalCited, totalChecks);

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
        { ...s, rate: citationRatePct(s.cited, s.checks) },
      ]),
    );

    await db
      .update(schema.citationRuns)
      .set({ totalChecks, totalCited, citationRate, platformBreakdown })
      .where(eq(schema.citationRuns.id, runId));

    return { totalChecks, totalCited, citationRate };
  },

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
  },

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
  },

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
  },

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
  },

  async createBrandVisibilitySnapshot(
    snapshot: InsertBrandVisibilitySnapshot,
  ): Promise<BrandVisibilitySnapshot> {
    const result = await db.insert(schema.brandVisibilitySnapshots).values(snapshot).returning();
    return result[0];
  },

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
  },

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
  },

  async incrementCitationRunSelfCitations(runId: string, by = 1): Promise<void> {
    await db
      .update(schema.citationRuns)
      .set({
        selfCitationCount: sql`${schema.citationRuns.selfCitationCount} + ${by}`,
      })
      .where(eq(schema.citationRuns.id, runId));
  },

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
  },

  async createCitationQuality(insertQuality: InsertCitationQuality): Promise<CitationQuality> {
    const result = await db.insert(schema.citationQuality).values(insertQuality).returning();
    return result[0];
  },

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
  },

  async getCitationQualityById(id: string): Promise<CitationQuality | undefined> {
    const result = await db
      .select()
      .from(schema.citationQuality)
      .where(eq(schema.citationQuality.id, id));
    return result[0];
  },

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
  },

  async deleteCitationQuality(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.citationQuality)
      .where(eq(schema.citationQuality.id, id))
      .returning();
    return result.length > 0;
  },

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
  },
} satisfies Partial<IStorage> & ThisType<IStorage>;
