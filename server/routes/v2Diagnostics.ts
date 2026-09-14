// Endpoints read only by the /v2/diagnostics/geo-signals screen (board 12).
//
// The board needs three real things the existing recommendations projection
// does not carry: the GEO signal score history from `geo_signal_runs`, a
// citation source-type mix from `geo_rankings` (sourceType/isCited/citedUrls),
// and - when one has ever been captured for the brand's own homepage - a
// structured-data completeness read from `schema_audits`. Nothing here is
// derived or invented; every field is a direct read or a count over rows that
// already exist, scoped to the authenticated user's brand.

import type { Express } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { geoSignalRuns, geoRankings } from "@shared/schema";
import { requireUser, requireBrand, OwnershipError } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";
import { normaliseUrl, urlHashOf } from "../services/schemaAudit";
import { schemaAudits } from "@shared/schema";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function setupV2DiagnosticsRoutes(app: Express): void {
  // ==========================================================================
  // GET /api/v2/diagnostics/geo-signals/:brandId
  // ==========================================================================
  app.get(
    "/api/v2/diagnostics/geo-signals/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);
        const since = new Date(Date.now() - THIRTY_DAYS_MS);

        // Runs in the trailing 30 days feed both the score history chart and
        // the latest/previous score comparison. When the brand has not
        // re-scanned in 30 days, fall back to the two most recent runs so a
        // score can still be shown - a brand that scanned once should not
        // read as "never measured".
        const recentRuns = await db
          .select({ ranAt: geoSignalRuns.ranAt, overallScore: geoSignalRuns.overallScore })
          .from(geoSignalRuns)
          .where(and(eq(geoSignalRuns.brandId, brand.id), gte(geoSignalRuns.ranAt, since)))
          .orderBy(desc(geoSignalRuns.ranAt));
        const latestRuns =
          recentRuns.length > 0
            ? recentRuns
            : await db
                .select({ ranAt: geoSignalRuns.ranAt, overallScore: geoSignalRuns.overallScore })
                .from(geoSignalRuns)
                .where(eq(geoSignalRuns.brandId, brand.id))
                .orderBy(desc(geoSignalRuns.ranAt))
                .limit(2);
        const [latest, previous] = latestRuns;
        const history = [...recentRuns]
          .reverse()
          .flatMap((row) =>
            row.overallScore === null
              ? []
              : [{ date: new Date(row.ranAt).toISOString(), score: row.overallScore }],
          );

        // Citation source mix over the trailing 30 days, grouped by the
        // matcher-assigned sourceType. `detected` counts every check that
        // recorded a source type; `verified` counts the subset the checker
        // actually confirmed as a citation (isCited = 1).
        const citationRows = await db
          .select({
            sourceType: geoRankings.sourceType,
            isCited: geoRankings.isCited,
            citedUrls: geoRankings.citedUrls,
          })
          .from(geoRankings)
          .where(and(eq(geoRankings.brandId, brand.id), gte(geoRankings.checkedAt, since)));

        const bySourceType = new Map<string, { detected: number; verified: number }>();
        let citedUrlCount = 0;
        for (const row of citationRows) {
          citedUrlCount += row.citedUrls?.length ?? 0;
          if (!row.sourceType) continue;
          const entry = bySourceType.get(row.sourceType) ?? { detected: 0, verified: 0 };
          entry.detected += 1;
          if (row.isCited === 1) entry.verified += 1;
          bySourceType.set(row.sourceType, entry);
        }

        // A structured-data read for the brand's own homepage, only if one has
        // ever been cached (`POST /api/geo-signals/schema-audit` triggers the
        // capture; this route never triggers a fetch itself).
        let schemaAudit: { url: string; completenessByType: Record<string, number> } | null = null;
        if (brand.website) {
          const hash = urlHashOf(normaliseUrl(brand.website));
          const [auditRow] = await db
            .select({ url: schemaAudits.url, completenessByType: schemaAudits.completenessByType })
            .from(schemaAudits)
            .where(eq(schemaAudits.urlHash, hash))
            .limit(1);
          if (auditRow) {
            schemaAudit = {
              url: auditRow.url,
              completenessByType: (auditRow.completenessByType ?? {}) as Record<string, number>,
            };
          }
        }

        res.json({
          success: true,
          data: {
            brandName: brand.name,
            score: latest?.overallScore ?? null,
            previousScore: previous?.overallScore ?? null,
            history,
            sourceMix: Array.from(bySourceType.entries()).map(([sourceType, counts]) => ({
              sourceType,
              detected: counts.detected,
              verified: counts.verified,
            })),
            citedUrlCount,
            schemaAudit,
          },
        });
      } catch (error) {
        if (error instanceof OwnershipError) {
          return res.status(error.status).json({ success: false, error: error.message });
        }
        sendError(res, error, "Failed to load GEO signal data");
      }
    }),
  );
}
