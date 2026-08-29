import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import {
  type BrandPrompt,
  type InsertBrandPrompt,
  type PromptAudience,
  type PromptPhrasingTest,
  type PromptSetHealthRun,
  type PromptTag,
} from "@shared/schema";
import type { IStorage } from "../storage";

export const promptsStorage = {
  async createBrandPrompt(p: InsertBrandPrompt): Promise<BrandPrompt> {
    const [row] = await db.insert(schema.brandPrompts).values(p).returning();
    return row;
  },
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
  },
  async deleteBrandPromptsByBrandId(brandId: string): Promise<void> {
    await db.delete(schema.brandPrompts).where(eq(schema.brandPrompts.brandId, brandId));
  },
  async archiveBrandPrompts(brandId: string): Promise<void> {
    // Archive every tracked prompt for this brand. Does not touch
    // suggestions - call archiveSuggestedPrompts for those.
    await db
      .update(schema.brandPrompts)
      .set({ isActive: 0, status: "archived" })
      .where(
        and(eq(schema.brandPrompts.brandId, brandId), eq(schema.brandPrompts.status, "tracked")),
      );
  },
  async archiveSuggestedPrompts(brandId: string): Promise<void> {
    await db
      .update(schema.brandPrompts)
      .set({ isActive: 0, status: "archived" })
      .where(
        and(eq(schema.brandPrompts.brandId, brandId), eq(schema.brandPrompts.status, "suggested")),
      );
  },
  async updateBrandPromptText(id: string, prompt: string): Promise<BrandPrompt | undefined> {
    const [row] = await db
      .update(schema.brandPrompts)
      .set({ prompt })
      .where(eq(schema.brandPrompts.id, id))
      .returning();
    return row;
  },
  async archiveBrandPrompt(id: string): Promise<void> {
    await db
      .update(schema.brandPrompts)
      .set({ isActive: 0, status: "archived" })
      .where(eq(schema.brandPrompts.id, id));
  },
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
  },
  async getBrandPromptById(id: string): Promise<BrandPrompt | undefined> {
    const [row] = await db.select().from(schema.brandPrompts).where(eq(schema.brandPrompts.id, id));
    return row;
  },
  /** The ON/OFF toggle. Orthogonal to status - does not touch isActive/status
   *  at all, see the column comment in shared/schema.ts. */
  async setBrandPromptPaused(id: string, paused: boolean): Promise<BrandPrompt | undefined> {
    const [row] = await db
      .update(schema.brandPrompts)
      .set({ paused })
      .where(eq(schema.brandPrompts.id, id))
      .returning();
    return row;
  },
  async getPromptTagsByBrandId(brandId: string): Promise<PromptTag[]> {
    return db
      .select()
      .from(schema.promptTags)
      .where(eq(schema.promptTags.brandId, brandId))
      .orderBy(asc(schema.promptTags.name));
  },
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
  },
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
  },
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
  },
  async deletePromptTag(id: string): Promise<void> {
    await db.delete(schema.promptTags).where(eq(schema.promptTags.id, id));
  },
  async getTagIdsByPromptId(promptId: string): Promise<string[]> {
    const rows = await db
      .select({ tagId: schema.brandPromptTags.tagId })
      .from(schema.brandPromptTags)
      .where(eq(schema.brandPromptTags.brandPromptId, promptId));
    return rows.map((r) => r.tagId);
  },
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
  },
  async attachPromptTag(promptId: string, tagId: string): Promise<void> {
    await db
      .insert(schema.brandPromptTags)
      .values({ brandPromptId: promptId, tagId })
      .onConflictDoNothing();
  },
  async detachPromptTag(promptId: string, tagId: string): Promise<void> {
    await db
      .delete(schema.brandPromptTags)
      .where(
        and(
          eq(schema.brandPromptTags.brandPromptId, promptId),
          eq(schema.brandPromptTags.tagId, tagId),
        ),
      );
  },
  async getPromptAudiencesByBrandId(brandId: string): Promise<PromptAudience[]> {
    return db
      .select()
      .from(schema.promptAudiences)
      .where(eq(schema.promptAudiences.brandId, brandId))
      .orderBy(asc(schema.promptAudiences.name));
  },
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
  },
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
  },
  async deletePromptAudience(id: string): Promise<void> {
    await db.delete(schema.promptAudiences).where(eq(schema.promptAudiences.id, id));
  },
  async getAudienceIdsByPromptId(promptId: string): Promise<string[]> {
    const rows = await db
      .select({ audienceId: schema.brandPromptAudiences.audienceId })
      .from(schema.brandPromptAudiences)
      .where(eq(schema.brandPromptAudiences.brandPromptId, promptId));
    return rows.map((r) => r.audienceId);
  },
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
  },
  async attachPromptAudience(promptId: string, audienceId: string): Promise<void> {
    await db
      .insert(schema.brandPromptAudiences)
      .values({ brandPromptId: promptId, audienceId })
      .onConflictDoNothing();
  },
  async detachPromptAudience(promptId: string, audienceId: string): Promise<void> {
    await db
      .delete(schema.brandPromptAudiences)
      .where(
        and(
          eq(schema.brandPromptAudiences.brandPromptId, promptId),
          eq(schema.brandPromptAudiences.audienceId, audienceId),
        ),
      );
  },
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
  },
  // Re-detect-all has no dedicated result table to read a "last run" time
  // from (unlike set-health / AI audiences) - re-detect deliberately writes
  // no citation_runs row (see server/routes/prompts.ts). system_state is the
  // existing generic key/value store used for exactly this shape of durable
  // per-brand ledger elsewhere (see server/lib/jobDebounce.ts,
  // server/lib/siteHealthHistory.ts), so it's used here rather than an
  // in-memory Map, which resets on redeploy and doesn't coordinate across
  // instances.
  async getReDetectAllLastRunAt(brandId: string): Promise<Date | null> {
    const [row] = await db
      .select({ valueJson: schema.systemState.valueJson })
      .from(schema.systemState)
      .where(eq(schema.systemState.key, `re-detect-all:${brandId}`))
      .limit(1);
    const iso = (row?.valueJson as { lastRanAt?: string } | undefined)?.lastRanAt;
    if (!iso) return null;
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? null : at;
  },
  async setReDetectAllLastRunAt(brandId: string, at: Date): Promise<void> {
    const key = `re-detect-all:${brandId}`;
    const valueJson = { lastRanAt: at.toISOString() };
    await db
      .insert(schema.systemState)
      .values({ key, valueJson, updatedAt: at })
      .onConflictDoUpdate({
        target: schema.systemState.key,
        set: { valueJson, updatedAt: at },
      });
  },
  async getLatestSetHealthRun(brandId: string): Promise<PromptSetHealthRun | undefined> {
    const [row] = await db
      .select()
      .from(schema.promptSetHealthRuns)
      .where(eq(schema.promptSetHealthRuns.brandId, brandId))
      .orderBy(desc(schema.promptSetHealthRuns.createdAt))
      .limit(1);
    return row;
  },
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
  },
  async getPhrasingTestsByPromptId(promptId: string): Promise<PromptPhrasingTest[]> {
    return db
      .select()
      .from(schema.promptPhrasingTests)
      .where(eq(schema.promptPhrasingTests.brandPromptId, promptId))
      .orderBy(desc(schema.promptPhrasingTests.createdAt));
  },
  async getPhrasingTestById(id: string): Promise<PromptPhrasingTest | undefined> {
    const [row] = await db
      .select()
      .from(schema.promptPhrasingTests)
      .where(eq(schema.promptPhrasingTests.id, id));
    return row;
  },
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
  },
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
  },
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
  },
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
  },
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
  },
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
  },
  async getPromptGenerationsByBrandId(brandId: string): Promise<schema.PromptGeneration[]> {
    return await db
      .select()
      .from(schema.promptGenerations)
      .where(eq(schema.promptGenerations.brandId, brandId))
      .orderBy(desc(schema.promptGenerations.createdAt));
  },
} satisfies Partial<IStorage> & ThisType<IStorage>;
