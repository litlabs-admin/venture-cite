import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import {
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
  type BrandHallucination,
  type InsertBrandHallucination,
} from "@shared/schema";
import type { IStorage } from "../storage";

export const signalsStorage = {
  async createListicle(insertListicle: InsertListicle): Promise<Listicle> {
    const result = await db.insert(schema.listicles).values(insertListicle).returning();
    return result[0];
  },

  async getListicles(brandId?: string): Promise<Listicle[]> {
    if (brandId) {
      return await db.select().from(schema.listicles).where(eq(schema.listicles.brandId, brandId));
    }
    return await db.select().from(schema.listicles);
  },

  async getListicleById(id: string): Promise<Listicle | undefined> {
    const result = await db.select().from(schema.listicles).where(eq(schema.listicles.id, id));
    return result[0];
  },

  async updateListicle(id: string, update: Partial<InsertListicle>): Promise<Listicle | undefined> {
    const result = await db
      .update(schema.listicles)
      .set({ ...update, lastChecked: new Date() })
      .where(eq(schema.listicles.id, id))
      .returning();
    return result[0];
  },

  async deleteListicle(id: string): Promise<boolean> {
    const result = await db.delete(schema.listicles).where(eq(schema.listicles.id, id)).returning();
    return result.length > 0;
  },

  async createWikipediaMention(insertMention: InsertWikipediaMention): Promise<WikipediaMention> {
    const result = await db.insert(schema.wikipediaMentions).values(insertMention).returning();
    return result[0];
  },

  async getWikipediaMentions(brandId?: string): Promise<WikipediaMention[]> {
    if (brandId) {
      return await db
        .select()
        .from(schema.wikipediaMentions)
        .where(eq(schema.wikipediaMentions.brandId, brandId));
    }
    return await db.select().from(schema.wikipediaMentions);
  },

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
  },

  async deleteWikipediaMention(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.wikipediaMentions)
      .where(eq(schema.wikipediaMentions.id, id))
      .returning();
    return result.length > 0;
  },

  async createBofuContent(insertContent: InsertBofuContent): Promise<BofuContent> {
    const result = await db.insert(schema.bofuContent).values(insertContent).returning();
    return result[0];
  },

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
  },

  async getBofuContentById(id: string): Promise<BofuContent | undefined> {
    const result = await db.select().from(schema.bofuContent).where(eq(schema.bofuContent.id, id));
    return result[0];
  },

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
  },

  async deleteBofuContent(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.bofuContent)
      .where(eq(schema.bofuContent.id, id))
      .returning();
    return result.length > 0;
  },

  async createFaqItem(insertFaq: InsertFaqItem): Promise<FaqItem> {
    const result = await db.insert(schema.faqItems).values(insertFaq).returning();
    return result[0];
  },

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
  },

  async getFaqItemById(id: string): Promise<FaqItem | undefined> {
    const result = await db.select().from(schema.faqItems).where(eq(schema.faqItems.id, id));
    return result[0];
  },

  async updateFaqItem(id: string, update: Partial<InsertFaqItem>): Promise<FaqItem | undefined> {
    const result = await db
      .update(schema.faqItems)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.faqItems.id, id))
      .returning();
    return result[0];
  },

  async deleteFaqItem(id: string): Promise<boolean> {
    const result = await db.delete(schema.faqItems).where(eq(schema.faqItems.id, id)).returning();
    return result.length > 0;
  },

  async createBrandMention(insertMention: InsertBrandMention): Promise<BrandMention> {
    const withDiscoveredAt = {
      ...insertMention,
      discoveredAt: (insertMention as { discoveredAt?: Date }).discoveredAt ?? new Date(),
    };
    const result = await db.insert(schema.brandMentions).values(withDiscoveredAt).returning();
    return result[0];
  },

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
  },

  async getBrandMentionById(id: string): Promise<BrandMention | undefined> {
    const result = await db
      .select()
      .from(schema.brandMentions)
      .where(eq(schema.brandMentions.id, id));
    return result[0];
  },

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
  },

  async deleteBrandMention(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.brandMentions)
      .where(eq(schema.brandMentions.id, id))
      .returning();
    return result.length > 0;
  },

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
  },

  async tryInsertWikipediaMention(
    insert: InsertWikipediaMention,
  ): Promise<WikipediaMention | null> {
    const result = await db
      .insert(schema.wikipediaMentions)
      .values(insert)
      .onConflictDoNothing()
      .returning();
    return result[0] ?? null;
  },

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
  },

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
  },

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
  },

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
  },

  async getTrackedContentUrlsByBrandId(brandId: string): Promise<TrackedContentUrl[]> {
    return await db
      .select()
      .from(schema.trackedContentUrls)
      .where(eq(schema.trackedContentUrls.brandId, brandId));
  },

  // ============================================================
  // GEO Tools header summary. A single query returns the count rollup.
  // per brand. Used by GET /api/geo-tools/summary/:brandId.
  // ============================================================

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
  },

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
  },

  async getBrandHallucinationById(id: string): Promise<BrandHallucination | undefined> {
    const result = await db
      .select()
      .from(schema.brandHallucinations)
      .where(eq(schema.brandHallucinations.id, id));
    return result[0];
  },

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
  },

  async deleteBrandHallucination(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.brandHallucinations)
      .where(eq(schema.brandHallucinations.id, id))
      .returning();
    return result.length > 0;
  },

  async resolveBrandHallucination(id: string): Promise<BrandHallucination | undefined> {
    const result = await db
      .update(schema.brandHallucinations)
      .set({ isResolved: 1, resolvedAt: new Date(), remediationStatus: "resolved" })
      .where(eq(schema.brandHallucinations.id, id))
      .returning();
    return result[0];
  },

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
  },
  async setBrandMonitorMentions(brandId: string, enabled: boolean): Promise<void> {
    await db
      .update(schema.brands)
      .set({ monitorMentions: enabled })
      .where(eq(schema.brands.id, brandId));
  },

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
  },

  // Mention helpers ----------------------------------------------------------

  async getBrandMention(id: string): Promise<BrandMention | undefined> {
    const [row] = await db
      .select()
      .from(schema.brandMentions)
      .where(eq(schema.brandMentions.id, id))
      .limit(1);
    return row;
  },

  async deleteManyBrandMentions(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .delete(schema.brandMentions)
      .where(inArray(schema.brandMentions.id, ids))
      .returning({ id: schema.brandMentions.id });
    return result.length;
  },

  async deleteAllMentionsForBrand(brandId: string): Promise<number> {
    const result = await db
      .delete(schema.brandMentions)
      .where(eq(schema.brandMentions.brandId, brandId))
      .returning({ id: schema.brandMentions.id });
    return result.length;
  },

  async getOwnedMentionIds(ids: string[], userId: string): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select({ id: schema.brandMentions.id })
      .from(schema.brandMentions)
      .innerJoin(schema.brands, eq(schema.brandMentions.brandId, schema.brands.id))
      .where(and(inArray(schema.brandMentions.id, ids), eq(schema.brands.userId, userId)));
    return rows.map((r) => r.id);
  },

  async updateBrandMentionStatus(id: string, status: string): Promise<void> {
    await db.update(schema.brandMentions).set({ status }).where(eq(schema.brandMentions.id, id));
  },

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
  },

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
  },
} satisfies Partial<IStorage> & ThisType<IStorage>;
