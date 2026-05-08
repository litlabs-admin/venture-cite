// server/routes/tours.ts
//
// Tour engine API. Three endpoints:
//   GET  /api/tours/state            — read user's tour state blob
//   PATCH /api/tours/state           — whitelisted ops on tour state
//   POST /api/tours/events           — batched event ingestion (idempotent)
//   GET  /api/admin/tours/metrics    — admin-gated tour funnel metrics
//
// State lives in users.onboarding_state.tours (JSONB sub-tree).
// Events go to the tour_events table.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../lib/logger";
import { storage } from "../storage";
import {
  KNOWN_TOUR_IDS,
  KNOWN_EVENT_TYPES,
  TOUR_STATE_OPS,
  isKnownTourId,
  isKnownEventType,
} from "../lib/tourRegistry";
import { asyncHandler } from "../lib/routesShared";
import { captureAndFlush } from "../lib/sentryReport";

type AuthedReq = Request & { user?: { id: string; email?: string } };

function requireUserId(req: AuthedReq, res: Response): string | null {
  const id = req.user?.id;
  if (!id) {
    res.status(401).json({ success: false, error: "Not authenticated" });
    return null;
  }
  return id;
}

function isAdmin(req: AuthedReq): boolean {
  // Pre-launch admin check — gate by litlabs.io email domain.
  const email = req.user?.email;
  return typeof email === "string" && email.endsWith("@litlabs.io");
}

const PatchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("markCompleted"),
    tourId: z.string().refine(isKnownTourId, "Unknown tourId"),
    version: z.number().int().positive(),
    brandId: z.string().nullable().optional(),
  }),
  z.object({
    op: z.literal("markSkipped"),
    tourId: z.string().refine(isKnownTourId, "Unknown tourId"),
    version: z.number().int().positive(),
    brandId: z.string().nullable().optional(),
  }),
  z.object({
    op: z.literal("suppress"),
    tourId: z.string().refine((v) => v === "*" || isKnownTourId(v), "Unknown tourId"),
  }),
  z.object({
    op: z.literal("clearBrand"),
    brandId: z.string(),
  }),
]);

const EventSchema = z.object({
  id: z.string().uuid(),
  tourId: z.string().refine(isKnownTourId, "Unknown tourId"),
  tourVersion: z.number().int().positive(),
  stepId: z.string().nullable().optional(),
  stepIndex: z.number().int().nullable().optional(),
  eventType: z.string().refine(isKnownEventType, "Unknown eventType"),
  triggerType: z.enum(["auto", "manual", "preview"]).nullable().optional(),
  brandId: z.string().nullable().optional(),
  dwellMs: z.number().int().nonnegative().nullable().optional(),
  occurredAt: z.string().datetime(),
});

const EventsBatchSchema = z.object({
  events: z.array(EventSchema).min(1).max(50),
});

export function setupTourRoutes(app: Express): void {
  // GET /api/tours/state — returns the tours sub-tree of onboarding_state.
  app.get(
    "/api/tours/state",
    asyncHandler(async (req: AuthedReq, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const tours = await storage.getTourState(userId);

      // One-time backfill: pre-launch users who already saw the legacy guidedSeen
      // flag should have global-welcome marked complete so it doesn't auto-fire.
      // Removed after 30 days post-launch.
      if (!tours.global) {
        const result = await db.execute(sql`
          SELECT onboarding_state->>'guidedSeen' AS guided_seen, created_at
          FROM users WHERE id = ${userId} LIMIT 1
        `);
        const rows =
          (result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
        const row = Array.isArray(rows) ? rows[0] : undefined;
        const r = row as { guided_seen?: string; created_at?: string } | undefined;
        if (r?.guided_seen === "true" && r.created_at) {
          await storage.patchTourState(userId, "markCompleted", {
            tourId: "global-welcome",
            version: 1,
            brandId: null,
            timestamp: r.created_at,
          });
          const refreshed = await storage.getTourState(userId);
          return res.json({ success: true, data: refreshed });
        }
      }

      res.json({ success: true, data: tours });
    }),
  );

  // PATCH /api/tours/state — whitelisted ops only.
  app.patch(
    "/api/tours/state",
    asyncHandler(async (req: AuthedReq, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const parsed = PatchOpSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid PATCH body.",
          details: parsed.error.flatten(),
          allowedOps: TOUR_STATE_OPS,
        });
      }

      const data = parsed.data;
      const args =
        data.op === "suppress"
          ? { tourId: data.tourId, timestamp: new Date().toISOString() }
          : data.op === "clearBrand"
            ? { brandId: data.brandId, timestamp: new Date().toISOString() }
            : {
                tourId: data.tourId,
                version: data.version,
                brandId: data.brandId ?? null,
                timestamp: new Date().toISOString(),
              };

      const next = await storage.patchTourState(userId, data.op, args as never);
      res.json({ success: true, data: next });
    }),
  );

  // POST /api/tours/events — batched, idempotent.
  app.post(
    "/api/tours/events",
    asyncHandler(async (req: AuthedReq, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const parsed = EventsBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid events batch.",
          details: parsed.error.flatten(),
        });
      }

      const rows = parsed.data.events.map((e) => ({
        id: e.id,
        userId,
        brandId: e.brandId ?? null,
        tourId: e.tourId,
        tourVersion: e.tourVersion,
        stepId: e.stepId ?? null,
        stepIndex: e.stepIndex ?? null,
        eventType: e.eventType,
        triggerType: e.triggerType ?? null,
        dwellMs: e.dwellMs ?? null,
        occurredAt: new Date(e.occurredAt),
      }));

      try {
        await storage.recordTourEvents(rows);
        res.json({ success: true, count: rows.length });
      } catch (err) {
        logger.error({ err, count: rows.length }, "tour.events.persist_failed");
        captureAndFlush(err, { tags: { source: "tour-events" } });
        res.status(500).json({ success: false, error: "Failed to persist events." });
      }
    }),
  );

  // GET /api/admin/tours/metrics — admin-only funnel snapshot.
  app.get(
    "/api/admin/tours/metrics",
    asyncHandler(async (req: AuthedReq, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      if (!isAdmin(req)) {
        return res.status(404).json({ success: false, error: "Not found" });
      }

      const result = await db.execute(sql`
        WITH per_tour AS (
          SELECT
            tour_id,
            COUNT(*) FILTER (WHERE event_type = 'tour_auto_fired') AS auto_fired,
            COUNT(*) FILTER (WHERE event_type = 'tour_manual_replayed') AS manual_replayed,
            COUNT(*) FILTER (WHERE event_type = 'tour_completed') AS completed,
            COUNT(*) FILTER (WHERE event_type = 'tour_suppressed') AS suppressed,
            COUNT(*) FILTER (WHERE event_type = 'tour_skipped') AS skipped,
            COUNT(*) FILTER (WHERE event_type = 'tour_abandoned') AS abandoned,
            COUNT(*) FILTER (WHERE event_type = 'tour_step_target_missing') AS target_missing
          FROM tour_events
          WHERE occurred_at > now() - interval '30 days'
          GROUP BY tour_id
        )
        SELECT
          tour_id,
          auto_fired,
          manual_replayed,
          completed,
          suppressed,
          skipped,
          abandoned,
          target_missing,
          CASE WHEN auto_fired > 0 THEN ROUND(100.0 * completed / auto_fired, 1) ELSE 0 END AS completion_rate,
          CASE WHEN auto_fired > 0 THEN ROUND(100.0 * suppressed / auto_fired, 1) ELSE 0 END AS suppression_rate
        FROM per_tour
        ORDER BY auto_fired DESC
      `);

      res.json({ success: true, data: result.rows ?? result });
    }),
  );

  logger.info(
    { knownTours: KNOWN_TOUR_IDS.length, knownEvents: KNOWN_EVENT_TYPES.length },
    "tour routes registered",
  );
}
