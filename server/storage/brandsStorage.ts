import { and, asc, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import type { IStorage } from "../storage";
import * as schema from "@shared/schema";
import type {
  Brand,
  BrandFactScrapeRun,
  BrandFactSheet,
  BrandVisibilitySnapshot,
  InsertBrand,
  InsertBrandFactSheet,
  ScanJob,
  WorkflowRun,
} from "@shared/schema";

export type WorkflowRunFilters = {
  status?: string;
  workflowKey?: string;
};

export const brandsStorage = {
  async createBrand(insertBrand: InsertBrand): Promise<Brand> {
    const result = await db
      .insert(schema.brands)
      .values({
        ...insertBrand,
        tone: insertBrand.tone ?? "professional",
      })
      .returning();
    return result[0];
  },

  async getBrands(): Promise<Brand[]> {
    return await db.select().from(schema.brands).where(isNull(schema.brands.deletedAt));
  },

  async getBrandsByUserId(userId: string): Promise<Brand[]> {
    return await db
      .select()
      .from(schema.brands)
      .where(and(eq(schema.brands.userId, userId), isNull(schema.brands.deletedAt)));
  },

  async getBrandById(id: string): Promise<Brand | undefined> {
    const result = await db
      .select()
      .from(schema.brands)
      .where(and(eq(schema.brands.id, id), isNull(schema.brands.deletedAt)));
    return result[0];
  },

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
  },

  async markAutopilotAttempt(brandId: string): Promise<void> {
    // Increment in SQL, not read-modify-write: the cron sweep and a boot-time
    // resume can touch the same brand concurrently, and a lost increment would
    // let a broken brand retry past its cap.
    await db.execute(sql`
      UPDATE brands
      SET autopilot_attempts = autopilot_attempts + 1,
          autopilot_last_attempt_at = now()
      WHERE id = ${brandId}
    `);
  },

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
  },

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
  },

  async transitionAutopilotFromFailedToPending(brandId: string): Promise<boolean> {
    const result = await db
      .update(schema.brands)
      .set({
        autopilotStatus: "pending",
        autopilotError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.brands.id, brandId), eq(schema.brands.autopilotStatus, "failed")))
      .returning({ id: schema.brands.id });
    return result.length > 0;
  },

  async deleteBrand(id: string): Promise<boolean> {
    // Hard-delete primitive - used by the brand purge cron after the
    // grace window. Application code should call softDeleteBrand
    // instead so users get a 30-day undo window. The FK cascade
    // (migrations/0003_fk_hardening.sql) cleans up child rows.
    await this.clearTourStateForBrand(id);
    const result = await db.delete(schema.brands).where(eq(schema.brands.id, id)).returning();
    return result.length > 0;
  },

  async clearTourStateForBrand(brandId: string): Promise<void> {
    // Strip perBrand[brandId] sub-tree from every user that has it.
    // Called from deleteBrand (synchronous hard delete) AND directly
    // from the brand-purge cron (runBrandPurgeJob raw-deletes the row
    // without going through deleteBrand, so it must call this itself -
    // otherwise the JSONB sub-tree is orphaned forever on purge).
    await db.execute(sql`
      UPDATE users
      SET onboarding_state = jsonb_set(
        onboarding_state,
        '{tours,perBrand}',
        COALESCE(onboarding_state->'tours'->'perBrand', '{}'::jsonb) - ${brandId}
      )
      WHERE onboarding_state->'tours'->'perBrand' ? ${brandId}
    `);
  },

  async softDeleteBrand(id: string, graceDays = 30): Promise<Brand | undefined> {
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
    const result = await db
      .update(schema.brands)
      .set({ deletedAt: now, deletionScheduledFor: scheduledFor })
      .where(and(eq(schema.brands.id, id), isNull(schema.brands.deletedAt)))
      .returning();
    return result[0];
  },

  async updateBrandsUsed(userId: string, count: number): Promise<void> {
    await db.update(schema.users).set({ brandsUsed: count }).where(eq(schema.users.id, userId));
  },

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
  },

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
  },

  async createBrandFact(insertFact: InsertBrandFactSheet): Promise<BrandFactSheet> {
    const result = await db.insert(schema.brandFactSheet).values(insertFact).returning();
    return result[0];
  },

  async getBrandFacts(brandId: string): Promise<BrandFactSheet[]> {
    // 2026-05-28: query-time dedup across sources.
    //
    // The partial unique index on `(brandId, domain, subcategory, factKey)`
    // is filtered to `source='scraped' AND dismissed_at IS NULL`, so user-
    // entered rows + scraped rows for the SAME logical fact can both
    // exist. The UI then renders them twice - the user-reported "duplicate
    // unrelated data" symptom.
    //
    // Collapse them here. Within a (domain, subcategory, factKey) group:
    //   1. Prefer user_manual (explicit user edit) over user (onboarding-
    //      derived) over scraped over paste.
    //   2. Within the same source priority, prefer the row whose value
    //      survived more sources (sources.length on valuePayload), then
    //      higher confidence, then most recent updatedAt.
    //   3. Carry the OTHER source's value into the canonical row's
    //      valuePayload.alternatives so the user can still see it in the
    //      provenance disclosure.
    //
    // Result: one row per logical fact, all variants visible on demand,
    // no double-render.
    const rows = await db
      .select()
      .from(schema.brandFactSheet)
      .where(and(eq(schema.brandFactSheet.brandId, brandId), eq(schema.brandFactSheet.isActive, 1)))
      .orderBy(asc(schema.brandFactSheet.subcategory));

    if (rows.length === 0) return rows;

    const SOURCE_PRIORITY: Record<string, number> = {
      user_manual: 4,
      user: 3,
      scraped: 2,
      paste: 1,
    };

    type Row = (typeof rows)[number];
    type Payload = {
      n?: number;
      items?: string[];
      sources?: Array<{ url: string; excerpt: string; confidence: number }>;
      alternatives?: Array<{
        value: string;
        sources: Array<{ url: string; excerpt: string; confidence: number }>;
      }>;
      otherLabel?: string;
    };

    const normalizeForDedup = (s: string): string =>
      (s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const key = `${row.domain}|${row.subcategory}|${row.factKey}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }

    const out: Row[] = [];
    for (const bucket of Array.from(groups.values())) {
      if (bucket.length === 1) {
        out.push(bucket[0]);
        continue;
      }

      // Pick winner.
      bucket.sort((a: Row, b: Row) => {
        const pa = SOURCE_PRIORITY[a.source ?? "scraped"] ?? 0;
        const pb = SOURCE_PRIORITY[b.source ?? "scraped"] ?? 0;
        if (pa !== pb) return pb - pa;
        const sa = ((a.valuePayload as Payload | null)?.sources ?? []).length;
        const sb = ((b.valuePayload as Payload | null)?.sources ?? []).length;
        if (sa !== sb) return sb - sa;
        const ca = Number(a.confidence ?? 0);
        const cb = Number(b.confidence ?? 0);
        if (ca !== cb) return cb - ca;
        const ua = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const ub = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return ub - ua;
      });

      const winner = bucket[0];
      const others = bucket.slice(1);
      const winnerNorm = normalizeForDedup(winner.factValue ?? "");

      const winnerPayload: Payload = (winner.valuePayload as Payload | null) ?? {};
      const carriedAlternatives = [...(winnerPayload.alternatives ?? [])];

      for (const loser of others) {
        const loserNorm = normalizeForDedup(loser.factValue ?? "");
        const loserPayload: Payload = (loser.valuePayload as Payload | null) ?? {};
        if (loserNorm === winnerNorm) {
          // Same value - merge losing row's sources into the winner's.
          const winnerSources = winnerPayload.sources ?? [];
          const loserSources = loserPayload.sources ?? [];
          const byUrl = new Map(winnerSources.map((s) => [s.url, s]));
          for (const s of loserSources) {
            if (!byUrl.has(s.url)) byUrl.set(s.url, s);
          }
          winnerPayload.sources = Array.from(byUrl.values()).slice(0, 20);
        } else {
          // Different value - carry as an alternative.
          const existing = carriedAlternatives.find(
            (a) => normalizeForDedup(a.value) === loserNorm,
          );
          if (existing) {
            const merged = new Map(existing.sources.map((s) => [s.url, s]));
            for (const s of loserPayload.sources ?? []) {
              if (!merged.has(s.url)) merged.set(s.url, s);
            }
            existing.sources = Array.from(merged.values()).slice(0, 20);
          } else {
            carriedAlternatives.push({
              value: loser.factValue ?? "",
              sources: loserPayload.sources ?? [],
            });
          }
        }
      }

      const finalPayload: Payload = {
        ...winnerPayload,
        alternatives: carriedAlternatives.length > 0 ? carriedAlternatives.slice(0, 10) : undefined,
      };

      out.push({ ...winner, valuePayload: finalPayload as Row["valuePayload"] });
    }

    return out;
  },

  async getBrandFactById(id: string): Promise<BrandFactSheet | undefined> {
    const result = await db
      .select()
      .from(schema.brandFactSheet)
      .where(eq(schema.brandFactSheet.id, id));
    return result[0];
  },

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
  },

  async deleteBrandFact(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.brandFactSheet)
      .where(eq(schema.brandFactSheet.id, id))
      .returning();
    return result.length > 0;
  },

  async listScrapeRunsForBrand(brandId: string, limit = 10): Promise<BrandFactScrapeRun[]> {
    return await db
      .select()
      .from(schema.brandFactScrapeRuns)
      .where(eq(schema.brandFactScrapeRuns.brandId, brandId))
      .orderBy(desc(schema.brandFactScrapeRuns.startedAt))
      .limit(limit);
  },

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
  },

  async getMostRecentManualScanForBrand(brandId: string): Promise<ScanJob | undefined> {
    const [row] = await db
      .select()
      .from(schema.scanJobs)
      .where(and(eq(schema.scanJobs.brandId, brandId), eq(schema.scanJobs.trigger, "manual")))
      .orderBy(desc(schema.scanJobs.createdAt))
      .limit(1);
    return row;
  },

  async getRunsByBrand(brandId: string, filters: WorkflowRunFilters = {}): Promise<WorkflowRun[]> {
    const clauses = [eq(schema.workflowRuns.brandId, brandId)];
    if (filters.status) clauses.push(eq(schema.workflowRuns.status, filters.status));
    if (filters.workflowKey) clauses.push(eq(schema.workflowRuns.workflowKey, filters.workflowKey));
    return db
      .select()
      .from(schema.workflowRuns)
      .where(and(...clauses))
      .orderBy(desc(schema.workflowRuns.createdAt));
  },
} satisfies Partial<IStorage> & ThisType<IStorage> & Record<string, unknown>;
