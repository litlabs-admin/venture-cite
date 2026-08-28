import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "../db";
import type { IStorage } from "../storage";
import * as schema from "@shared/schema";
import type {
  BrandFactScrapePage,
  BrandFactScrapeRun,
  BrandFactSheet,
  BrandMonthlyCostCap,
  InsertBrandFactScrapePage,
  InsertBrandFactScrapeRun,
} from "@shared/schema";

export const factAgentStorage = {
  async createScrapeRun(run: InsertBrandFactScrapeRun): Promise<BrandFactScrapeRun> {
    const [row] = await db.insert(schema.brandFactScrapeRuns).values(run).returning();
    return row;
  },

  async getScrapeRunById(runId: string): Promise<BrandFactScrapeRun | null> {
    const [row] = await db
      .select()
      .from(schema.brandFactScrapeRuns)
      .where(eq(schema.brandFactScrapeRuns.id, runId))
      .limit(1);
    return row ?? null;
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  async createScrapePage(page: InsertBrandFactScrapePage): Promise<BrandFactScrapePage> {
    const [row] = await db.insert(schema.brandFactScrapePages).values(page).returning();
    return row;
  },

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
  },

  async listScrapePagesForRun(runId: string): Promise<BrandFactScrapePage[]> {
    return await db
      .select()
      .from(schema.brandFactScrapePages)
      .where(eq(schema.brandFactScrapePages.runId, runId))
      .orderBy(asc(schema.brandFactScrapePages.id));
  },

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
  },

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
  },

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
  },

  async getBrandFactScrapeEnabled(brandId: string): Promise<boolean> {
    const [row] = await db
      .select({ enabled: schema.brands.factScrapeEnabled })
      .from(schema.brands)
      .where(eq(schema.brands.id, brandId))
      .limit(1);
    return row?.enabled ?? false;
  },

  async setBrandFactScrapeEnabled(brandId: string, enabled: boolean): Promise<boolean> {
    const [row] = await db
      .update(schema.brands)
      .set({ factScrapeEnabled: enabled })
      .where(eq(schema.brands.id, brandId))
      .returning({ enabled: schema.brands.factScrapeEnabled });
    return row?.enabled ?? enabled;
  },

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
  },

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
  },

  async dismissFact(factId: string): Promise<BrandFactSheet | null> {
    const [row] = await db
      .update(schema.brandFactSheet)
      .set({ dismissedAt: new Date() })
      .where(eq(schema.brandFactSheet.id, factId))
      .returning();
    return row ?? null;
  },

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
  },

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
  },

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
  },

  async deleteExpiredFactScrapeCache(): Promise<number> {
    const result = await db
      .delete(schema.factScrapeCache)
      .where(lt(schema.factScrapeCache.expiresAt, new Date()));
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  },

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
  },

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
  },

  async deleteOldFactScrapePages(olderThanDays: number): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM brand_fact_scrape_pages
      WHERE run_id IN (
        SELECT id FROM brand_fact_scrape_runs
        WHERE started_at < now() - (${olderThanDays} || ' days')::interval
      )
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  },

  async deleteOldFactScrapeRuns(olderThanDays: number): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM brand_fact_scrape_runs
      WHERE started_at < now() - (${olderThanDays} || ' days')::interval
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  },

  async deleteOldFactScrapeLogs(olderThanDays: number): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM fact_scrape_logs
      WHERE created_at < now() - (${olderThanDays} || ' days')::interval
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  },
} satisfies Partial<IStorage> & ThisType<IStorage>;
