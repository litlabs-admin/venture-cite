// Endpoints read only by the /v2/ screens.
//
// These exist because /v2/ states a different number from the live dashboard
// on purpose: failed provider calls are excluded from the mention-rate
// denominator here and counted in it there. Rather than add a flag to the
// dashboard endpoints - where a default-off flag is one careless caller away
// from changing the live numbers - the v2 read lives on its own path and
// calls its own service.

import type { Express } from "express";
import { storage } from "../storage";
import { requireUser } from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { getV2MentionRate } from "../services/v2Visibility";

export function setupV2Routes(app: Express): void {
  // ==========================================================================
  // GET /api/v2/visibility/mention-rate/:brandId
  // Mention rate over the trailing 8 weeks, failed provider calls excluded
  // from the denominator and reported as their own count.
  // ==========================================================================
  app.get(
    "/api/v2/visibility/mention-rate/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const data = await getV2MentionRate(brand.id);
        res.json({ success: true, data });
      } catch (error) {
        sendError(res, error, "Failed to load mention rate");
      }
    }),
  );
}
