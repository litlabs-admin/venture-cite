import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { buildCoreCompetitorRows, mergeLeaderboardByDomain } from "../lib/leaderboardMerge";
import type { IStorage } from "../storage";
import * as schema from "@shared/schema";
import type {
  Brand,
  Competitor,
  CompetitorCitationSnapshot,
  CompetitorGeoRanking,
  GeoRanking,
  InsertCompetitor,
  InsertCompetitorCitationSnapshot,
  InsertCompetitorGeoRanking,
} from "@shared/schema";

export const competitorsStorage = {
  // Upsert on (brand_id, lower(name), lower(coalesce(domain,''))) to close
  // the race window between manual + scheduled discovery. Ignored /
  // soft-deleted rows are revived only if discovered_by is being set to
  // "manual" (user deliberately re-added it); otherwise they are kept
  // tombstoned and only lastSeenAt is bumped.
  async createCompetitor(insertCompetitor: InsertCompetitor): Promise<Competitor> {
    const discoveredBy = insertCompetitor.discoveredBy ?? "manual";
    const isManual = discoveredBy === "manual";
    // Single source of truth for the tier policy: callers may set tier
    // explicitly (discovery does, per-source), but when they don't we derive
    // it so every entry point stays consistent. Manual adds (Add dialog AND
    // onboarding) and AI profile-inferred competitors are the curated core
    // set; citation-mined / auto / scheduler rows are the discovered pool.
    const tier =
      insertCompetitor.tier ??
      (discoveredBy === "manual" || discoveredBy === "ai" ? "core" : "discovered");
    // Use raw SQL so we can target the functional unique index
    // (lower(name), lower(coalesce(domain,''))). db.execute returns raw
    // snake_case pg rows - we only use it for the id, then re-read via
    // Drizzle to get the camelCase-mapped row callers expect.
    const result = await db.execute<{ id: string }>(sql`
      INSERT INTO competitors (
        brand_id, name, domain, industry, description,
        discovered_by, tier, relevance_score, deleted_at, is_ignored, last_seen_at
      ) VALUES (
        ${insertCompetitor.brandId},
        ${insertCompetitor.name},
        ${insertCompetitor.domain},
        ${insertCompetitor.industry ?? null},
        ${insertCompetitor.description ?? null},
        ${discoveredBy},
        ${tier},
        ${insertCompetitor.relevanceScore ?? null},
        NULL,
        0,
        now()
      )
      ON CONFLICT (brand_id, lower(name), lower(coalesce(domain, '')))
      DO UPDATE SET
        industry = COALESCE(EXCLUDED.industry, competitors.industry),
        description = COALESCE(EXCLUDED.description, competitors.description),
        relevance_score = COALESCE(EXCLUDED.relevance_score, competitors.relevance_score),
        last_seen_at = now(),
        -- Manual re-add promotes to core; automated re-discovery never demotes
        -- an existing tier (so a user-curated core row stays core).
        tier = CASE WHEN ${isManual} THEN 'core' ELSE competitors.tier END,
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
  },

  async getCompetitors(
    brandId?: string,
    opts?: { includeDeleted?: boolean; tier?: "core" | "discovered" },
  ): Promise<Competitor[]> {
    const includeDeleted = opts?.includeDeleted === true;
    const conditions = [] as any[];
    if (brandId) conditions.push(eq(schema.competitors.brandId, brandId));
    if (!includeDeleted) conditions.push(isNull(schema.competitors.deletedAt));
    // `core` is the curated competitive set: manual adds and AI-inferred
    // direct competitors. `discovered` is the citation-mined pool - every
    // entity a model happened to name in an answer, which includes product
    // lines ("iPhone", "S Pen"), publishers ("CNET"), operating systems
    // ("macOS") and the tracked brand itself. That pool is useful as MENTION
    // data; it is not a competitor list, and anything presenting a
    // competitive set must ask for core.
    if (opts?.tier) conditions.push(eq(schema.competitors.tier, opts.tier));
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);
    const q = db.select().from(schema.competitors);
    return await (where ? q.where(where) : q);
  },

  async getCompetitorById(id: string): Promise<Competitor | undefined> {
    const result = await db.select().from(schema.competitors).where(eq(schema.competitors.id, id));
    return result[0];
  },

  // Partial update - used by the edit dialog on the competitors page.
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
  },

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
  },

  // Soft-delete: flip deleted_at so the row hides from normal lists but
  // snapshots remain for historical leaderboard trends.
  async deleteCompetitor(id: string): Promise<boolean> {
    const result = await db
      .update(schema.competitors)
      .set({ deletedAt: new Date() })
      .where(eq(schema.competitors.id, id))
      .returning();
    return result.length > 0;
  },

  // Permanent tombstone: user marked as false-positive so cron won't
  // re-insert it. Also soft-deletes so it disappears from lists.
  async ignoreCompetitor(id: string): Promise<boolean> {
    const result = await db
      .update(schema.competitors)
      .set({ isIgnored: 1, deletedAt: new Date() })
      .where(eq(schema.competitors.id, id))
      .returning();
    return result.length > 0;
  },

  // Per-run, per-prompt competitor citation row. It is idempotent through
  // the unique index (competitor_id, run_id, brand_prompt_id, ai_platform)
  // from migration 0027, so a retried citation run updates rather than
  // duplicating.
  async createCompetitorGeoRanking(row: InsertCompetitorGeoRanking): Promise<CompetitorGeoRanking> {
    const [result] = await db
      .insert(schema.competitorGeoRankings)
      .values({
        competitorId: row.competitorId,
        runId: row.runId,
        brandPromptId: row.brandPromptId,
        aiPlatform: row.aiPlatform,
        isCited: row.isCited ?? 0,
        rank: row.rank ?? null,
        relevanceScore: row.relevanceScore ?? null,
        citationContext: row.citationContext ?? null,
        citingOutletUrl: row.citingOutletUrl ?? null,
        sentiment: row.sentiment ?? null,
      })
      .onConflictDoUpdate({
        target: [
          schema.competitorGeoRankings.competitorId,
          schema.competitorGeoRankings.runId,
          schema.competitorGeoRankings.brandPromptId,
          schema.competitorGeoRankings.aiPlatform,
        ],
        set: {
          isCited: sql`EXCLUDED.is_cited`,
          rank: sql`COALESCE(EXCLUDED.rank, ${schema.competitorGeoRankings.rank})`,
          relevanceScore: sql`COALESCE(EXCLUDED.relevance_score, ${schema.competitorGeoRankings.relevanceScore})`,
          citationContext: sql`COALESCE(EXCLUDED.citation_context, ${schema.competitorGeoRankings.citationContext})`,
          citingOutletUrl: sql`COALESCE(EXCLUDED.citing_outlet_url, ${schema.competitorGeoRankings.citingOutletUrl})`,
          sentiment: sql`COALESCE(EXCLUDED.sentiment, ${schema.competitorGeoRankings.sentiment})`,
          checkedAt: sql`now()`,
        },
      })
      .returning();
    if (!result) throw new Error("createCompetitorGeoRanking upsert returned no row");
    return result;
  },

  async createCompetitorGeoRankings(
    rows: InsertCompetitorGeoRanking[],
  ): Promise<CompetitorGeoRanking[]> {
    if (rows.length === 0) return [];
    return await db
      .insert(schema.competitorGeoRankings)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          schema.competitorGeoRankings.competitorId,
          schema.competitorGeoRankings.runId,
          schema.competitorGeoRankings.brandPromptId,
          schema.competitorGeoRankings.aiPlatform,
        ],
        set: {
          isCited: sql`EXCLUDED.is_cited`,
          rank: sql`COALESCE(EXCLUDED.rank, ${schema.competitorGeoRankings.rank})`,
          relevanceScore: sql`COALESCE(EXCLUDED.relevance_score, ${schema.competitorGeoRankings.relevanceScore})`,
          citationContext: sql`COALESCE(EXCLUDED.citation_context, ${schema.competitorGeoRankings.citationContext})`,
          citingOutletUrl: sql`COALESCE(EXCLUDED.citing_outlet_url, ${schema.competitorGeoRankings.citingOutletUrl})`,
          sentiment: sql`COALESCE(EXCLUDED.sentiment, ${schema.competitorGeoRankings.sentiment})`,
          checkedAt: sql`now()`,
        },
      })
      .returning();
  },

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
  },

  async getCompetitorGeoRankingsForCompetitors(
    competitorIds: string[],
    opts: { since: Date },
  ): Promise<CompetitorGeoRanking[]> {
    if (competitorIds.length === 0) return [];
    return await db
      .select()
      .from(schema.competitorGeoRankings)
      .where(
        and(
          inArray(schema.competitorGeoRankings.competitorId, competitorIds),
          gte(schema.competitorGeoRankings.checkedAt, opts.since),
        ),
      )
      .orderBy(desc(schema.competitorGeoRankings.checkedAt));
  },

  // Scoped by explicit runIds, not by a time window - see the interface
  // comment. Indexed by cgr_brand_prompt_idx on brand_prompt_id.
  async getCompetitorGeoRankingsByPromptRuns(
    brandPromptId: string,
    runIds: string[],
  ): Promise<CompetitorGeoRanking[]> {
    if (runIds.length === 0) return [];
    return await db
      .select()
      .from(schema.competitorGeoRankings)
      .where(
        and(
          eq(schema.competitorGeoRankings.brandPromptId, brandPromptId),
          inArray(schema.competitorGeoRankings.runId, runIds),
        ),
      )
      .orderBy(desc(schema.competitorGeoRankings.checkedAt));
  },

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
  },

  async getCompetitorCitationSnapshots(
    competitorId: string,
  ): Promise<CompetitorCitationSnapshot[]> {
    return await db
      .select()
      .from(schema.competitorCitationSnapshots)
      .where(eq(schema.competitorCitationSnapshots.competitorId, competitorId))
      .orderBy(desc(schema.competitorCitationSnapshots.snapshotDate));
  },

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
  },

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
    // cumulative totals - which is what makes "Square" look like it
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

    // Wave B - a brand's citations live on geo_rankings rows keyed by
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

    // Read from the per-run, per-prompt competitor_geo_rankings
    // table so the leaderboard reflects actual LLM-judged citations, not
    // a coarse aggregate. One row per (competitor × platform × prompt ×
    // run); count cited rows within the window, bucket by platform.
    // Read EVERY competitor row, then present only the core ones.
    //
    // Presentation must be core-only: this is a competitive set, so it holds
    // competitor BRANDS and nothing else. Ranking the citation-mined
    // `discovered` pool alongside them put "iPhone", "iPad", "AirPods",
    // "Apple Watch", "MacBook Air", "S Pen" and "Samsung Galaxy Tab" on the
    // board as rival companies, plus publishers (CNET, PCMag) and the
    // tracked brand itself, twice. 82 of the Apple brand's 96 rows.
    //
    // But the COUNTS still have to come from every row. competitor_geo_
    // rankings are keyed by competitor row id, and the same company often
    // exists as both a core row and a discovered one - measured live, core
    // `Spotify / spotify.com` had 0 citations while discovered `Spotify / ""`
    // had 11. Filtering before counting would silently discard those.
    const allCompetitors = brandId
      ? await this.getCompetitors(brandId)
      : await this.getCompetitors();
    if (allCompetitors.length > 0) {
      const compIds = allCompetitors.map((c) => c.id);
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

      // One row per core competitor, carrying the citations of every row for
      // the same company (see server/lib/leaderboardMerge).
      leaderboard.push(...buildCoreCompetitorRows(allCompetitors, perCompetitor));
    }

    // Fold rows that are the same company (see server/lib/leaderboardMerge).
    const merged = mergeLeaderboardByDomain(leaderboard);
    leaderboard.length = 0;
    leaderboard.push(...merged);

    // Compute share-of-voice so each row answers the "are they cited more
    // than me, and by how much?" question directly.
    const totalAll = leaderboard.reduce((s, r) => s + r.totalCitations, 0);
    for (const row of leaderboard) {
      row.shareOfVoice = totalAll > 0 ? Math.round((row.totalCitations / totalAll) * 1000) / 10 : 0;
    }

    return leaderboard.sort((a, b) => b.totalCitations - a.totalCitations);
  },
} satisfies Partial<IStorage> & ThisType<IStorage>;
