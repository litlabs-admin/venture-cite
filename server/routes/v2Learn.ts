// Learn's own persistence.
//
// The six lessons ship as static content in shared/v2Lessons.ts. The one
// thing that can't live in static content is which of them THIS user has
// completed - that's what this file exposes.
//
//   GET  /api/v2/learn/progress  - every lesson this user has completed
//   POST /api/v2/learn/complete  - record one lesson as complete
//
// No new table and no migration. A lesson completion is recorded as a row in
// the existing tour_events stream (server/routes/tours.ts,
// migrations/0051_tour_engine.sql): the column shapes already fit (a durable
// id, a userId, an optional brandId, an event type, an occurredAt), and the
// table itself has no CHECK constraint tying tour_id/event_type to
// server/lib/tourRegistry.ts's lists - that registry is enforced only by
// POST /api/tours/events' zod schema, which this route never calls. Learn
// writes straight through platformStorage.recordTourEvents with its own
// constant tour_id ("v2-learn") and event_type
// ("v2_learn_lesson_completed"), so tourRegistry.ts (owned by another area,
// parity-tested against the client tour registry) never has to learn about
// lessons, and the tour engine's own admin metrics query
// (`GROUP BY tour_id ... FILTER (WHERE event_type = 'tour_completed')`, etc.)
// is unaffected - "v2-learn" never matches one of its tour_-prefixed filters.
//
// Idempotent by construction: the event id is a deterministic hash of
// (userId, lessonId), not a random uuid, so completing the same lesson twice
// inserts the same row twice and the second insert no-ops on the primary key
// (platformStorage.recordTourEvents already does onConflictDoNothing on id).
// That also means re-completing a lesson can never double the learning
// points a client derives from the completion list.

import type { Express } from "express";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import * as schema from "@shared/schema";
import { platformStorage } from "../storage/platformStorage";
import { requireUser, requireBrand } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";
import { isV2LessonId } from "@shared/v2Lessons";

const LEARN_TOUR_ID = "v2-learn";
const LESSON_COMPLETED_EVENT = "v2_learn_lesson_completed";
const LEARN_TOUR_VERSION = 1;

/**
 * Deterministic, not random: the same (userId, lessonId) pair always hashes
 * to the same id, which is what makes the insert idempotent on tour_events'
 * primary key. That column is a Postgres `uuid`, but Postgres's uuid type
 * accepts any string in 8-4-4-4-12 hex-group form - it does not validate
 * version/variant nibbles, so a plain sha256-derived id is a legal value.
 */
function lessonEventId(userId: string, lessonId: string): string {
  const hex = createHash("sha256").update(`v2-learn:${userId}:${lessonId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const completeBodySchema = z.object({
  lessonId: z.string().refine(isV2LessonId, "Unknown lessonId"),
  brandId: z.string().nullable().optional(),
});

export type V2LearnCompletion = { lessonId: string; completedAt: string; brandId: string | null };

async function readCompletions(userId: string): Promise<V2LearnCompletion[]> {
  const rows = await db
    .select({
      lessonId: schema.tourEvents.stepId,
      completedAt: schema.tourEvents.occurredAt,
      brandId: schema.tourEvents.brandId,
    })
    .from(schema.tourEvents)
    .where(
      and(
        eq(schema.tourEvents.userId, userId),
        eq(schema.tourEvents.tourId, LEARN_TOUR_ID),
        eq(schema.tourEvents.eventType, LESSON_COMPLETED_EVENT),
      ),
    );

  return rows
    .filter((row) => isV2LessonId(row.lessonId ?? undefined))
    .map((row) => ({
      lessonId: row.lessonId as string,
      completedAt: row.completedAt.toISOString(),
      brandId: row.brandId,
    }));
}

export function setupV2LearnRoutes(app: Express): void {
  // GET /api/v2/learn/progress - not brand-scoped. Like GET /api/tours/state,
  // lesson completion is a fact about the user taking the course, not about
  // any one brand - a completion optionally remembers which brand was
  // selected at the time (below), but reading progress never filters by it.
  app.get(
    "/api/v2/learn/progress",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const completions = await readCompletions(user.id);
        res.json({ success: true, data: { completions } });
      } catch (error) {
        sendError(res, error, "Failed to load Learn progress");
      }
    }),
  );

  // POST /api/v2/learn/complete - record one lesson as complete for this
  // user. brandId is optional context (which brand was selected when the
  // lesson was finished); when present it is verified against the caller
  // before being stored, the same ownership check every brand-scoped write
  // in this codebase uses.
  app.post(
    "/api/v2/learn/complete",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const parsed = completeBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: "Invalid request body.",
            details: parsed.error.flatten(),
          });
        }

        const { lessonId, brandId } = parsed.data;
        if (brandId) {
          await requireBrand(brandId, user.id);
        }

        await platformStorage.recordTourEvents([
          {
            id: lessonEventId(user.id, lessonId),
            userId: user.id,
            brandId: brandId ?? null,
            tourId: LEARN_TOUR_ID,
            tourVersion: LEARN_TOUR_VERSION,
            stepId: lessonId,
            stepIndex: null,
            eventType: LESSON_COMPLETED_EVENT,
            triggerType: "manual",
            dwellMs: null,
            occurredAt: new Date(),
          },
        ]);

        const completions = await readCompletions(user.id);
        res.json({ success: true, data: { completions } });
      } catch (error) {
        sendError(res, error, "Failed to record lesson completion");
      }
    }),
  );
}
