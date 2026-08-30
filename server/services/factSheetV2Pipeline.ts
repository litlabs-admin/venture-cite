// Brand Fact Sheet v2 pipeline orchestration service (plan/full-rescrape/
// aggregate). Extracted verbatim from server/routes/factSheetV2.ts (phase
// B7-16). No Express types - ownership enforcement (`requireBrand`) and the
// website-normalization 400 check stay in the route.
//
// `/plan` and `/full-rescrape` evaluated the exact same guard sequence
// (in-flight run, cooldown, cost cap) independently in the original route
// file - a genuine internal duplicate, not a v1/v2 divergence - folded into
// `evaluateFactSheetRunGuards` here and called from both route handlers.

import { storage } from "../storage";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { discoverSitemapUrls } from "../lib/factAgent/v2/sitemapDiscovery";
import { selectTopUrls } from "../lib/factAgent/v2/urlTierScoring";
import { evaluatePlanGuards, type PlanGuardVerdict } from "../lib/factAgent/v2/planGuards";
import { canonicalizeUrl } from "../lib/factAgent/canonicalize";
import { runAggregate } from "../lib/factAgent/v2/aggregate";
import { safeFetchTextWithLockedIp } from "../lib/ssrf";
import { waitUntil } from "@vercel/functions";
import type { Brand } from "@shared/schema";

// Same guards as /plan so a server-driven re-scrape can't stack on an
// in-flight run, ignore the cooldown, or bust the monthly cost cap. The
// structured verdict shape matches /plan so the client renders the same
// cooldown / already-running states.
export async function evaluateFactSheetRunGuards(brand: Brand): Promise<PlanGuardVerdict> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const [inFlight, lastCompletedAt, costCap] = await Promise.all([
    storage.getInFlightScrapeRun(brand.id),
    storage.getLastCompletedScrapeRunAt(brand.id),
    storage.getMonthlyCostCap(brand.id, monthKey),
  ]);

  return evaluatePlanGuards({
    brand: { id: brand.id, factScrapeEnabled: (brand as any).factScrapeEnabled !== false },
    inFlightRun: inFlight,
    lastCompletedRunAt: lastCompletedAt,
    costCap: costCap
      ? { factScrapeCents: costCap.factScrapeCents, monthlyCapCents: costCap.monthlyCapCents }
      : null,
  });
}

// POST /api/brand-fact-sheet/plan
export async function createFactSheetPlan(params: {
  brandId: string;
  normalizedWebsite: string;
  triggeredBy: "user_rescrape" | "onboarding";
}) {
  const { brandId, normalizedWebsite, triggeredBy } = params;

  const candidates = await discoverSitemapUrls(normalizedWebsite, async (url) =>
    safeFetchTextWithLockedIp(url, { maxBytes: 500_000 }).then((r) => ({
      status: r.status,
      text: r.text,
    })),
  );
  const selected = selectTopUrls(normalizedWebsite, candidates);

  const run = await storage.createScrapeRun({
    brandId,
    status: "pending",
    triggeredBy,
  });

  const pageRows: Array<{ pageId: string; url: string }> = [];
  const seen = new Set<string>();
  for (const url of selected) {
    const canonical = canonicalizeUrl(url);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const page = await storage.createScrapePage({
      runId: run.id,
      url,
      canonicalUrl: canonical,
      status: "pending",
    });
    pageRows.push({ pageId: page.id, url: page.url ?? url });
  }

  logger.info(
    { brandId, runId: run.id, pageCount: pageRows.length, triggeredBy },
    "factSheetV2.plan: dispatched",
  );

  return { runId: run.id, pages: pageRows };
}

// POST /api/brand-fact-sheet/full-rescrape
//
// Server-driven: kick the SAME full pipeline onboarding uses and return
// immediately. The run row is created inside runFullScrapeForBrand; the
// client discovers it via the existing GET /runs?brandId= poll + SSE
// stream. Resumable through the fact-scrape backstop + monthly-refresh cron
// if the function is suspended mid-run - no browser tab required.
//
// Lazy import: runFullScrape pulls in `db` at module load (which throws
// without DATABASE_URL). Importing it here instead of at the top keeps the
// v2-route unit tests (which mock storage, not db) collectable in a
// DB-less environment.
export async function startFactSheetFullRescrape(brand: Brand): Promise<void> {
  // Awaited here (not inside the waitUntil'd promise) so a module-load
  // failure surfaces synchronously to the route's existing try/catch,
  // exactly as it did when the route awaited this import directly.
  const { runFullScrapeForBrand } = await import("../lib/factAgent/v2/runFullScrape");
  waitUntil(
    runFullScrapeForBrand(
      {
        id: brand.id,
        name: brand.name,
        website: brand.website,
        industry: brand.industry,
        description: brand.description,
        products: Array.isArray(brand.products) ? (brand.products as string[]) : [],
        targetAudience: brand.targetAudience,
        uniqueSellingPoints: Array.isArray(brand.uniqueSellingPoints)
          ? (brand.uniqueSellingPoints as string[])
          : [],
        keyValues: Array.isArray(brand.keyValues)
          ? (brand.keyValues as string[]).join(", ")
          : ((brand.keyValues as string | null) ?? null),
        brandVoice: brand.brandVoice,
        tone: brand.tone,
      },
      Date.now() + 50_000,
      "manual_rescrape",
    ).catch((err) => {
      captureAndFlush(err, { tags: { source: "factSheetV2.full-rescrape" } });
    }),
  );
}

// POST /api/brand-fact-sheet/aggregate
export async function aggregateFactSheetRun(params: { runId: string; brandId: string }) {
  const result = await runAggregate({ runId: params.runId, brandId: params.brandId });
  return {
    status: result.status,
    errorKind: result.errorKind,
    totalFacts: result.totalFacts,
    disagreementsIncremented: result.disagreementsIncremented,
  };
}
