// LLM-jobs polling endpoints.
//
// The mutation route (POST /api/keyword-research/discover, etc.) calls
// enqueueLlmJob() and returns a jobId. The client then polls this
// endpoint until status='succeeded'|'failed'.
//
// Auth: a user can only poll jobs they themselves enqueued. Cron-spawned
// jobs (user_id NULL) are admin-only. Brand-scoped jobs additionally
// gate on ownership of the brand so a user can't see another tenant's
// jobs even on the off chance the jobId leaks.

import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import { asyncHandler } from "../lib/asyncHandler";
import { sendError } from "../lib/routesShared";
import { requireUser, sendOwnershipError, OwnershipError } from "../lib/ownership";
import { pollLlmJob, listRecentLlmJobsForUser } from "../lib/llmJobs";
import { logger } from "../lib/logger";

export function setupLlmJobsRoutes(app: Express): void {
  // Single-job poll. Returns:
  //   { status: 'pending' | 'running', jobId }                        — keep polling
  //   { status: 'succeeded', jobId, result }                          — render result
  //   { status: 'failed' | 'cancelled', jobId, errorKind, errorMessage } — surface to user
  app.get(
    "/api/llm-jobs/:jobId",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const jobId = req.params.jobId;
        if (!jobId || jobId.length < 8) {
          return sendError(res, null, "Invalid job id", 400);
        }

        // Ownership gate FIRST — before pollLlmJob, which finalizes the job
        // and persists its side effects. A caller must not be able to
        // force-finalize a job they don't own just by knowing its id.
        const ownsJob = await db
          .select({ userId: schema.llmJobs.userId, brandId: schema.llmJobs.brandId })
          .from(schema.llmJobs)
          .where(eq(schema.llmJobs.id, jobId))
          .limit(1);
        const owner = ownsJob[0];
        // 404 (not 403) on every miss — anti-enumeration, hides existence.
        if (!owner) {
          return sendError(res, null, "Job not found", 404);
        }
        const isAdminUser = (user as { isAdmin?: number }).isAdmin === 1;
        // Cron-spawned jobs have userId=null — admin-only (the fail-open
        // `owner.userId && …` guard previously exposed these to any caller).
        if (owner.userId === null) {
          if (!isAdminUser) return sendError(res, null, "Job not found", 404);
        } else if (owner.userId !== user.id) {
          return sendError(res, null, "Job not found", 404);
        }

        const poll = await pollLlmJob(jobId);
        if (!poll) {
          return sendError(res, null, "Job not found", 404);
        }

        // Cache-Control: prevent browser HTTP cache from confusing the
        // polling loop. Each GET must hit the server.
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        return res.json({ success: true, ...poll });
      } catch (err) {
        if (err instanceof OwnershipError) return sendOwnershipError(res, err);
        logger.error({ err }, "GET /api/llm-jobs/:jobId failed");
        return sendError(res, err, "Failed to poll job");
      }
    }),
  );

  // List the caller's recent jobs. Used by the Diagnose → Jobs tab.
  app.get(
    "/api/llm-jobs",
    isAuthenticated,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const limit = Math.min(
          50,
          Math.max(1, parseInt((req.query.limit as string) ?? "20", 10) || 20),
        );
        const jobs = await listRecentLlmJobsForUser(user.id, limit);
        res.setHeader("Cache-Control", "no-store");
        return res.json({
          success: true,
          jobs: jobs.map((j) => ({
            jobId: j.id,
            kind: j.kind,
            status: j.status,
            createdAt: j.createdAt,
            completedAt: j.completedAt,
            errorKind: j.errorKind,
            errorMessage: j.errorMessage,
            // Don't send result blob on the list view — too big. Client
            // calls /:jobId for individual rendering.
          })),
        });
      } catch (err) {
        if (err instanceof OwnershipError) return sendOwnershipError(res, err);
        logger.error({ err }, "GET /api/llm-jobs failed");
        return sendError(res, err, "Failed to list jobs");
      }
    }),
  );
}

// Imports below the function so the public surface is the first thing
// readers see. The own-row gate needs direct db access since we don't
// want pollLlmJob() to leak user_id in its return shape.
import { db } from "../db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
