import { and, desc, eq, getTableColumns, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type {
  AgentTask,
  BrandFactScrapeRun,
  ContentGenerationJob,
  InsertAgentTask,
  InsertWorkflowRun,
  ScanJob,
  WorkflowRun,
} from "@shared/schema";
import type { IStorage } from "../storage";

// A scan job older than this that is still 'queued'/'running' is considered
// dead (serverless timeout, deploy, or crash). Used both by the freshness
// bound in getActiveScanJobForBrand and by the failStaleScanJobs reaper.
const SCAN_JOB_STALE_MINUTES = 30;

export const jobsStorage = {
  async createRun(data: InsertWorkflowRun): Promise<WorkflowRun> {
    const [row] = await db.insert(schema.workflowRuns).values(data).returning();
    return row;
  },

  async getRun(id: string): Promise<WorkflowRun | undefined> {
    const [row] = await db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, id))
      .limit(1);
    return row;
  },

  async getActiveRuns(): Promise<WorkflowRun[]> {
    return db
      .select()
      .from(schema.workflowRuns)
      .where(inArray(schema.workflowRuns.status, ["running", "pending"]));
  },

  async getActiveRunsByUser(userId: string): Promise<WorkflowRun[]> {
    return db
      .select()
      .from(schema.workflowRuns)
      .where(
        and(
          eq(schema.workflowRuns.userId, userId),
          inArray(schema.workflowRuns.status, ["running", "pending"]),
        ),
      );
  },

  async updateRun(id: string, patch: Partial<WorkflowRun>): Promise<WorkflowRun | undefined> {
    const [row] = await db
      .update(schema.workflowRuns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.workflowRuns.id, id))
      .returning();
    return row;
  },

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
          advance_lease_expires_at IS NULL
          OR advance_lease_expires_at < now()
        )
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
    return ((result as any).rows ?? []) as ContentGenerationJob[];
  },

  async findSlicePendingRuns(staleSeconds: number, limit: number): Promise<BrandFactScrapeRun[]> {
    const cutoff = new Date(Date.now() - staleSeconds * 1000);
    // HIGH 11: skip runs for brands with fact_scrape_enabled=false so
    // the drain doesn't keep churning a paused brand into 'blocked' fails.
    //
    // Also rescue 'pending' runs whose initial dispatch never fired:
    // @vercel/functions waitUntil is a no-op when the per-request Vercel
    // context isn't installed (our bundle doesn't install it), so any
    // path still using waitUntil leaves the run in 'pending' indefinitely.
    // The daily-orchestrator drain picks them up here.
    const rows = await db
      .select({ run: schema.brandFactScrapeRuns })
      .from(schema.brandFactScrapeRuns)
      .innerJoin(schema.brands, eq(schema.brandFactScrapeRuns.brandId, schema.brands.id))
      .where(
        and(
          or(
            and(
              eq(schema.brandFactScrapeRuns.status, "slice_pending"),
              lt(schema.brandFactScrapeRuns.lastAdvanceAt, cutoff),
            ),
            and(
              eq(schema.brandFactScrapeRuns.status, "pending"),
              lt(schema.brandFactScrapeRuns.startedAt, cutoff),
            ),
          ),
          eq(schema.brands.factScrapeEnabled, true),
        ),
      )
      .limit(limit);
    return rows.map((r) => r.run);
  },

  async createAgentTask(insertTask: InsertAgentTask): Promise<AgentTask> {
    const result = await db.insert(schema.agentTasks).values(insertTask).returning();
    return result[0];
  },

  async getAgentTaskById(id: string): Promise<AgentTask | undefined> {
    const result = await db.select().from(schema.agentTasks).where(eq(schema.agentTasks.id, id));
    return result[0];
  },

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
  },

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
  },

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
  },

  async getScanJob(id: string): Promise<(ScanJob & { brandName: string }) | undefined> {
    const [row] = await db
      .select({ ...getTableColumns(schema.scanJobs), brandName: schema.brands.name })
      .from(schema.scanJobs)
      .leftJoin(schema.brands, eq(schema.scanJobs.brandId, schema.brands.id))
      .where(eq(schema.scanJobs.id, id))
      .limit(1);
    if (!row) return undefined;
    return { ...row, brandName: row.brandName ?? "" };
  },

  async getActiveScanJobForBrand(brandId: string): Promise<ScanJob | undefined> {
    // Freshness bound: never attach a new scan to a job older than the stale
    // threshold. A scan killed mid-run stays status='running' forever; without
    // this bound every future scan would attach to the dead job and wedge
    // scanning permanently. The cron reaper (failStaleScanJobs) flips these to
    // 'failed', but this guard makes attachment safe even before the reaper
    // has run.
    const staleCutoff = new Date(Date.now() - SCAN_JOB_STALE_MINUTES * 60 * 1000);
    const [row] = await db
      .select()
      .from(schema.scanJobs)
      .where(
        and(
          eq(schema.scanJobs.brandId, brandId),
          or(eq(schema.scanJobs.status, "queued"), eq(schema.scanJobs.status, "running")),
          sql`${schema.scanJobs.createdAt} >= ${staleCutoff}`,
        ),
      )
      .orderBy(desc(schema.scanJobs.createdAt))
      .limit(1);
    return row;
  },

  // Stale-job reaper. A scan job killed mid-run (serverless timeout, deploy,
  // crash) is never reset and stays 'queued'/'running' forever, wedging all
  // future scans for that brand. Flip anything older than the threshold to
  // 'failed'. Mirrors failStuckContentJobs. Uses created_at because queued
  // jobs may never have started_at set.
  async failStaleScanJobs(olderThanMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const result = await db
      .update(schema.scanJobs)
      .set({
        status: "failed",
        error: "Scan was interrupted (timeout, deploy, or crash).",
        completedAt: new Date(),
      })
      .where(
        and(
          or(eq(schema.scanJobs.status, "queued"), eq(schema.scanJobs.status, "running")),
          sql`${schema.scanJobs.createdAt} < ${cutoff}`,
        ),
      )
      .returning({ id: schema.scanJobs.id });
    return result.length;
  },

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
  },

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
  },

  async pruneOldScanJobs(beforeDays: number): Promise<number> {
    const res = await db.execute(sql`
      DELETE FROM scan_jobs
      WHERE status IN ('complete', 'failed')
        AND completed_at < now() - (${beforeDays} || ' days')::interval
      RETURNING id
    `);
    const r = res as unknown as { rows?: unknown[] } & unknown[];
    return r.rows?.length ?? (Array.isArray(r) ? r.length : 0);
  },

  async deleteExpiredLlmConcurrencySlots(): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM llm_concurrency_slots WHERE expires_at < now()
    `);
    return (result as unknown as { rowCount: number | null }).rowCount ?? 0;
  },
} satisfies Partial<IStorage> & ThisType<IStorage> & Record<string, unknown>;
