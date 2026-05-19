// /diagnose Issues aggregator route (Task 20).
//
// Single read-only endpoint that returns the unified Issues list +
// per-type stats for one brand. Synthesizes at read time from the existing
// source tables — no new persistence. See server/lib/diagnoseIssues.ts for
// the aggregation logic.

import type { Express } from "express";
import { requireUser, requireBrand } from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { getDiagnoseIssues } from "../lib/diagnoseIssues";

export function setupDiagnoseRoutes(app: Express): void {
  app.get(
    "/api/diagnose/issues/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);
        const result = await getDiagnoseIssues(req.params.brandId);
        res.json({ success: true, data: result });
      } catch (error) {
        sendError(res, error, "Failed to fetch diagnose issues");
      }
    }),
  );
}
