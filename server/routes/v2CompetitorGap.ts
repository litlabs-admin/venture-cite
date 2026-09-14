// Board 38 (Competitor gap, /v2/diagnostics/competitor-gap) - live backend.
//
// GET returns a real, brand-scoped slice of citation-check history: the
// brand's own geo_rankings rows and the tracked (core-tier) competitors'
// competitor_geo_rankings rows, over a 60-day window. The client aggregates
// this into the performance/gap tables shown on the board and re-aggregates
// it locally when the user changes the engine or window-length scope
// control - no field on this response is fabricated; a metric this backend
// cannot compute (recommendation rate, market) is simply absent and the
// client renders an honest "Not measured" state for it.
//
// POST creates a real work task for one buyer-question gap, through the
// same work-task repository the rest of the work system uses
// (server/domains/work/repository.ts's createTaskWithTriggerEvidence) - it
// does not reimplement task-creation policy. The gap is re-verified
// server-side against the last 30 days before a task is created, so the
// client cannot fabricate evidence a real citation check never produced.

import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { requireBrand, requireUser } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";
import { createRequestActor } from "../lib/requestActor";
import { createWorkRepository } from "../domains/work/repository";
import { WORK_POLICY_VERSION } from "../domains/work/policy";
import { extractDomain } from "../lib/brandMatcher";
import type { TriggerEvidenceReference } from "../domains/work/opportunities";
import type { Competitor, GeoRanking, CompetitorGeoRanking } from "@shared/schema";

const RAW_WINDOW_DAYS = 60;
const TASK_WINDOW_DAYS = 30;
const MAX_COMPETITORS = 6;
const MAX_ROWS = 4000;

type MentionedBrand = { name: string; cited: boolean; rank: number | null };

function parseMentionedBrands(value: unknown): MentionedBrand[] {
  if (!Array.isArray(value)) return [];
  const out: MentionedBrand[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const name = (entry as Record<string, unknown>).name;
    const cited = (entry as Record<string, unknown>).cited;
    const rank = (entry as Record<string, unknown>).rank;
    if (typeof name !== "string" || name.trim().length === 0) continue;
    out.push({
      name: name.trim(),
      cited: cited === true,
      rank: typeof rank === "number" && Number.isFinite(rank) ? rank : null,
    });
  }
  return out;
}

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function projectMeasurement(row: GeoRanking) {
  return {
    brandPromptId: row.brandPromptId,
    aiPlatform: row.aiPlatform,
    checkedAt: row.checkedAt.toISOString(),
    isCited: row.isCited === 1,
    rank: typeof row.rank === "number" ? row.rank : null,
    mentionedBrands: parseMentionedBrands(
      (row as unknown as Record<string, unknown>).mentionedBrands,
    ),
  };
}

function projectCompetitorMeasurement(row: CompetitorGeoRanking) {
  return {
    competitorId: row.competitorId,
    brandPromptId: row.brandPromptId,
    aiPlatform: row.aiPlatform,
    checkedAt: row.checkedAt.toISOString(),
    isCited: row.isCited === 1,
    rank: typeof row.rank === "number" ? row.rank : null,
    citingOutletUrl: row.citingOutletUrl ?? null,
    citationContext: row.citationContext ?? null,
  };
}

export function setupV2CompetitorGapRoutes(app: Express): void {
  app.get(
    "/api/v2/competitor-gap/:brandId",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const prompts = await storage.getBrandPromptsByBrandId(brand.id, { status: "tracked" });
        const promptIds = prompts.map((p) => p.id);
        const windowStart = since(RAW_WINDOW_DAYS);

        const measurementsRaw =
          promptIds.length > 0
            ? await storage.getGeoRankingsByBrandPromptIds(promptIds, windowStart)
            : [];

        const competitors =
          ((await storage.getCompetitors(brand.id, { tier: "core" })) as
            Competitor[] | undefined) ?? [];
        const coreCompetitors = competitors.slice(0, MAX_COMPETITORS);

        const competitorMeasurementsRaw =
          coreCompetitors.length > 0
            ? await storage.getCompetitorGeoRankingsForCompetitors(
                coreCompetitors.map((c) => c.id),
                { since: windowStart },
              )
            : [];

        // Real regions recorded on the tracked buyer questions - not a
        // fabricated market. "global" is the schema default, not a market
        // decision, so it does not count as a distinct market value.
        const regions = new Set(
          prompts
            .map((p) => (p.region ?? "").trim())
            .filter((r) => r.length > 0 && r.toLowerCase() !== "global"),
        );
        const market = regions.size === 1 ? Array.from(regions)[0] : null;

        const measurements = measurementsRaw
          .slice()
          .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())
          .slice(0, MAX_ROWS)
          .map(projectMeasurement);
        const competitorMeasurements = competitorMeasurementsRaw
          .slice()
          .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())
          .slice(0, MAX_ROWS)
          .map(projectCompetitorMeasurement);

        res.json({
          success: true,
          data: {
            brand: { id: brand.id, name: brand.name },
            generatedAt: new Date().toISOString(),
            scope: {
              totalTrackedPrompts: prompts.length,
              windowDaysFetched: RAW_WINDOW_DAYS,
              defaultWindowDays: TASK_WINDOW_DAYS,
              market,
            },
            prompts: prompts.map((p) => ({
              id: p.id,
              text: p.prompt,
              category: p.category ?? null,
            })),
            competitors: coreCompetitors.map((c) => ({
              id: c.id,
              name: c.name,
              nameVariations: c.nameVariations ?? [],
            })),
            measurements,
            competitorMeasurements,
          },
        });
      } catch (error) {
        sendError(res, error, "Unable to load the competitor gap comparison");
      }
    }),
  );

  const createTaskSchema = z.object({ brandPromptId: z.string().trim().min(1) }).strict();

  app.post(
    "/api/v2/competitor-gap/:brandId/tasks",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const parsed = createTaskSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ success: false, error: "invalid_request", details: parsed.error.issues });
        }
        const { brandPromptId } = parsed.data;

        const prompt = await storage.getBrandPromptById(brandPromptId);
        if (!prompt || prompt.brandId !== brand.id) {
          return res.status(404).json({ success: false, error: "not_found" });
        }

        // Re-verify the gap against the official 30-day scope server-side.
        // The client's filters (engine, window) are a preview lens only -
        // a task is only ever created against the frozen scope the rail
        // describes, using evidence this request fetches itself.
        const windowStart = since(TASK_WINDOW_DAYS);
        const brandRows = await storage.getGeoRankingsByBrandPromptIds(
          [brandPromptId],
          windowStart,
        );
        const venturePrCited = brandRows.some((r) => r.isCited === 1);

        const competitors =
          ((await storage.getCompetitors(brand.id, { tier: "core" })) as
            Competitor[] | undefined) ?? [];
        const coreCompetitors = competitors.slice(0, MAX_COMPETITORS);
        const competitorRows =
          coreCompetitors.length > 0
            ? await storage.getCompetitorGeoRankingsForCompetitors(
                coreCompetitors.map((c) => c.id),
                { since: windowStart },
              )
            : [];
        const competitorById = new Map(coreCompetitors.map((c) => [c.id, c]));

        const citingRows = competitorRows.filter(
          (r) =>
            r.brandPromptId === brandPromptId &&
            r.isCited === 1 &&
            typeof r.citingOutletUrl === "string" &&
            /^https?:\/\//i.test(r.citingOutletUrl),
        );

        if (venturePrCited || citingRows.length === 0) {
          return res.status(422).json({
            success: false,
            error: "no_gap_evidence",
            message: venturePrCited
              ? `${brand.name} is already cited for this question in the last ${TASK_WINDOW_DAYS} days.`
              : "No competitor has cited evidence for this question in the last 30 days.",
          });
        }

        // At most one evidence row per competitor, most recent first, capped
        // so the task carries a readable amount of evidence.
        const bestByCompetitor = new Map<string, (typeof citingRows)[number]>();
        for (const row of citingRows) {
          const existing = bestByCompetitor.get(row.competitorId);
          if (!existing || row.checkedAt > existing.checkedAt) {
            bestByCompetitor.set(row.competitorId, row);
          }
        }
        const evidenceRows = Array.from(bestByCompetitor.values())
          .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())
          .slice(0, 4);

        const evidence: TriggerEvidenceReference[] = evidenceRows.map((row) => {
          const competitor = competitorById.get(row.competitorId);
          const competitorName = competitor?.name ?? "A tracked competitor";
          const domain = extractDomain(row.citingOutletUrl!) ?? row.citingOutletUrl!;
          return {
            kind: "source",
            label: `${competitorName} cited by ${domain}`,
            sourceUrl: row.citingOutletUrl!,
            retrievedAt: row.checkedAt.toISOString(),
            excerpt:
              (row.citationContext ?? "").trim().slice(0, 2000) ||
              `${competitorName} was cited in an AI answer to this buyer question; ${brand.name} was not.`,
          };
        });

        const competitorNames = evidenceRows
          .map((row) => competitorById.get(row.competitorId)?.name)
          .filter((name): name is string => Boolean(name));

        const actor = createRequestActor(user.id);
        const repository = createWorkRepository({ actor, database: db });
        const questionText = prompt.prompt.trim();
        const taskKey = `competitor_gap:${brandPromptId}`;

        const result = await repository.createTaskWithTriggerEvidence(
          brand.id,
          {
            taskKey,
            taskType: "improve_page_for_buyer_need",
            title: `Close the competitor gap on "${questionText.slice(0, 90)}"`,
            desiredResult: `${brand.name} appears with cited evidence when AI engines answer this buyer question, alongside ${competitorNames.join(", ")}.`,
            buyerNeed: questionText,
            recommendedChange:
              "Publish or update a page that directly answers this buyer question with evidence AI engines can cite.",
            reason: `${competitorNames.join(", ")} ${competitorNames.length === 1 ? "is" : "are"} cited for this question in the last ${TASK_WINDOW_DAYS} days while ${brand.name} is absent.`,
            completionRule: { required: ["content_change", "confirmation"] },
            measurementScope: {
              kind: "prompt_set",
              promptSetId: brandPromptId,
              period: "last_30_days",
            },
            nextCheckAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            ruleVersion: WORK_POLICY_VERSION,
          },
          evidence,
        );

        if (!result) {
          return res.status(404).json({ success: false, error: "not_found" });
        }

        res.json({
          success: true,
          data: {
            created: result.created,
            task: {
              id: result.task.id,
              taskKey: result.task.taskKey,
              title: result.task.title,
              state: result.task.state,
              points: result.task.points,
            },
          },
        });
      } catch (error) {
        sendError(res, error, "Unable to create the gap task");
      }
    }),
  );
}
