// Read (and one small write) endpoints for the /v2/visibility/report screen.
// The aggregation logic lives in ../services/v2Report.ts, kept free of any
// database import so it can be unit tested without one; this file is just
// the HTTP wiring: ownership checks and the database reads that feed it.

import type { Express } from "express";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import * as schema from "@shared/schema";
import { requireUser } from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { summarizeReport } from "../services/v2Report";

const REPORT_LOOKBACK_DAYS = 60;
const REPORT_NOTE_MAX_LENGTH = 4000;

function reportNoteKey(brandId: string): string {
  return `v2-report-note:${brandId}`;
}

export function setupV2ReportsRoutes(app: Express): void {
  // ==========================================================================
  // GET /api/v2/visibility/report/:brandId
  // ==========================================================================
  app.get(
    "/api/v2/visibility/report/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const prompts = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
        const promptIds = prompts.map((prompt) => prompt.id);
        const since = new Date(Date.now() - REPORT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const rows =
          promptIds.length > 0
            ? await storage.getGeoRankingsByBrandPromptIds(promptIds, since)
            : [];
        const summary = summarizeReport(rows, prompts, brand.name);
        res.json({ success: true, data: summary });
      } catch (error) {
        sendError(res, error, "Failed to load the visibility report");
      }
    }),
  );

  // ==========================================================================
  // GET /api/v2/visibility/report/:brandId/note
  // PUT /api/v2/visibility/report/:brandId/note  { note: string }
  //
  // No table in the product owns a free-text note against a review period.
  // `system_state` is the existing generic key/value store used for exactly
  // this shape of durable per-brand value elsewhere (promptsStorage.ts's
  // re-detect-all timestamp), so the note lives there rather than behind a
  // migration this brief was not assigned.
  // ==========================================================================
  app.get(
    "/api/v2/visibility/report/:brandId/note",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const [row] = await db
          .select({
            valueJson: schema.systemState.valueJson,
            updatedAt: schema.systemState.updatedAt,
          })
          .from(schema.systemState)
          .where(eq(schema.systemState.key, reportNoteKey(brand.id)))
          .limit(1);
        const stored = row?.valueJson as { note?: string } | undefined;
        res.json({
          success: true,
          data: { note: stored?.note ?? "", updatedAt: row?.updatedAt?.toISOString() ?? null },
        });
      } catch (error) {
        sendError(res, error, "Failed to load the report note");
      }
    }),
  );

  app.put(
    "/api/v2/visibility/report/:brandId/note",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const raw = (req.body as { note?: unknown } | undefined)?.note;
        if (typeof raw !== "string") {
          return res.status(400).json({ success: false, error: "note must be a string" });
        }
        const note = raw.slice(0, REPORT_NOTE_MAX_LENGTH);
        const now = new Date();
        await db
          .insert(schema.systemState)
          .values({ key: reportNoteKey(brand.id), valueJson: { note }, updatedAt: now })
          .onConflictDoUpdate({
            target: schema.systemState.key,
            set: { valueJson: { note }, updatedAt: now },
          });
        res.json({ success: true, data: { note, updatedAt: now.toISOString() } });
      } catch (error) {
        sendError(res, error, "Failed to save the report note");
      }
    }),
  );
}
