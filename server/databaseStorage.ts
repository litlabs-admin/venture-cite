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
  type Article,
  type InsertArticle,
  type Distribution,
  type InsertDistribution,
  type GeoRanking,
  type InsertGeoRanking,
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
  type AgentTask,
  type InsertAgentTask,
  type KeywordResearch,
  type InsertKeywordResearch,
  type CitationRun,
  type InsertCitationRun,
  type ArticleRevision,
  type InsertArticleRevision,
  type ScanJob,
} from "@shared/schema";

export { applyTourStateOp } from "./lib/tourStateOps";

const CONTENT_JOB_LEASE_SECONDS = 90;

export class DatabaseStorage {
  // List DAOs accept optional pagination. Internal callers
  // that need every row (analytics rollups, scheduled jobs) omit opts
  // and get the legacy "all rows" behavior. HTTP routes pass through
  // parsePagination() so unbounded responses can't escape.

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

  async countCitedRankingsForArticle(articleId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.geoRankings)
      .where(and(eq(schema.geoRankings.articleId, articleId), eq(schema.geoRankings.isCited, 1)));
    return result[0]?.count ?? 0;
  }

  async getRecentArticlesByBrandId(brandId: string, limit: number): Promise<Article[]> {
    return await db
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.brandId, brandId))
      .orderBy(desc(schema.articles.createdAt))
      .limit(limit);
  }

  /** Phase 6 - Pulse cross-feature. Returns the latest Signals run's
   *  ranAt AND its overallScore so the recommendations engine can fire
   *  a DIFFERENT rec for a low-scoring scan ("Your last scan returned
   *  35% - content depth is below threshold") vs just a stale-scan
   *  rec ("Last scan was N days ago"). Previously the engine only had
   *  ranAt and treated every scan equally regardless of result. */

  // The async kickoff path uses this single-row read. The HTTP handler
  // creates the row, hands the runId to a detached `runBrandPrompts(...)`,
  // and returns immediately; runBrandPrompts uses this to load it back.

  // Recompute totals and a per-platform breakdown for a run by
  // reading geo_rankings live. The canonical aggregator - call this any
  // time is_cited mutates on a ranking (re-detect, future bulk fixes)
  // so the cached aggregate on citation_runs stays in sync with what the
  // drill-down would show. Cheaper than dragging it through application
  // code: one indexed read of the run's rankings.

  // The live-update polling hook uses this lightweight "is any run live for this brand" check.
  // live-update polling hook on every dependent page. Hits the partial
  // index on (brand_id, status) - should be O(1) regardless of run history.

  // Atomic progress bump. The worker calls this every Nth completed task
  // so the SSE handler + status-gate endpoint see live values without a
  // full updateCitationRun round-trip.

  // Single read of one run's live state for the SSE handler's tick loop.

  // Returns rankings written for this run since the cursor (a timestamp).
  // Used by the SSE handler to emit per-ranking events without re-sending
  // already-emitted rows. Ordered by checkedAt so the cursor advances
  // monotonically.

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

  async incrementArticleUsage(userId: string): Promise<boolean> {
    const result = await db
      .update(schema.users)
      .set({ articlesUsedThisMonth: sql`${schema.users.articlesUsedThisMonth} + 1` })
      .where(eq(schema.users.id, userId))
      .returning();
    return result.length > 0;
  }

  // Case-insensitive append. Returns true if the variation was added,
  // false if it already existed (or the brand doesn't exist). The dedup
  // runs client-side because Postgres array-contains is case-sensitive.

  // ============================================================================

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

  // Sentiment cache ----------------------------------------------------------

  // Daily sentiment cap counter ----------------------------------------------

  // Brand mention monitoring -------------------------------------------------

  // ── system_state ──────────────────────────────────────────────────────
}
