// Dashboard brand-perception service.
//
// Brand perception scoring - five axes (trust/quality/value/market/
// innovation) judged from what AI models actually said about the brand
// (server/lib/perceptionScorer.ts). Runs are persisted so the dashboard
// reads the newest one instead of paying an LLM call on every render.
//
// Also covers the perception PROBES pipeline (migration 0116), which asks
// each engine directly rather than inferring from citation answers.
//
// Extracted verbatim from server/routes/dashboard.ts. No Express types here.

import { db } from "../db";
import { desc, eq, and, inArray } from "drizzle-orm";
import {
  brandPerceptionRuns,
  brandPerceptionProbeRuns,
  brandPerceptionProbes,
} from "@shared/schema";
import type { Brand } from "@shared/schema";
import { runPerceptionScoring } from "../lib/perceptionRun";
import { startPerceptionProbeRun, advancePerceptionProbeRun } from "../lib/perceptionProbes";

// One slice of a probe run. A full pass is 6 engines x (5 grounded calls + 1
// judge call); this bounds how much of that a single /advance request takes on
// before handing control back so the client can render progress.
const PROBE_SLICE_MS = 25_000;

// Minimum gap between perception scoring runs for one brand. Evidence only
// changes when a new citation check lands, so re-scoring sooner spends an LLM
// call to recompute the same answer.
export const PERCEPTION_COOLDOWN_MS = 60 * 60 * 1000;

// Drizzle returns `numeric` columns as strings, so trust/quality/value/
// market/innovation/overall arrive as e.g. "66.6" - convert to number
// before serialising so the JSON contract stays numeric. Null stays
// null (never NaN, never 0).
function numericOrNull(v: string | number | null): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function serializePerceptionRun(row: typeof brandPerceptionRuns.$inferSelect) {
  return {
    trust: numericOrNull(row.trust),
    quality: numericOrNull(row.quality),
    value: numericOrNull(row.value),
    market: numericOrNull(row.market),
    innovation: numericOrNull(row.innovation),
    overall: numericOrNull(row.overall),
    praised: row.praised,
    questioned: row.questioned,
    evidenceCount: row.evidenceCount,
    model: row.model,
    // Null on runs written before migration 0115. The client renders the
    // score without the evidence panel in that case rather than implying
    // quotes exist that were never captured.
    evidence: (row.evidence ?? null) as Array<{ text: string; platform: string }> | null,
    evidencePlatforms: row.evidencePlatforms ?? null,
    axisNotes: (row.axisNotes ?? null) as Record<string, string> | null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ==========================================================================
// GET /api/dashboard/perception/:brandId - read only, no LLM, cheap.
// ==========================================================================
export async function getBrandPerception(brandId: string) {
  // Single query: last up-to-7 runs, newest first. Feeds both the
  // "latest" card (row 0) and the sparkline "history" (reversed to
  // oldest-first below) - no second round-trip / N+1.
  const recentRuns = await db
    .select({
      overall: brandPerceptionRuns.overall,
      createdAt: brandPerceptionRuns.createdAt,
    })
    .from(brandPerceptionRuns)
    .where(eq(brandPerceptionRuns.brandId, brandId))
    .orderBy(desc(brandPerceptionRuns.createdAt))
    .limit(7);

  const [latest] = await db
    .select()
    .from(brandPerceptionRuns)
    .where(eq(brandPerceptionRuns.brandId, brandId))
    .orderBy(desc(brandPerceptionRuns.createdAt))
    .limit(1);

  // Oldest first; nulls excluded; newest run's own overall is last.
  const history = recentRuns
    .map((r) => numericOrNull(r.overall))
    .filter((v): v is number => v !== null)
    .reverse();

  return latest ? { ...serializePerceptionRun(latest), history } : null;
}

// POST /api/dashboard/perception/:brandId/run - computes and persists one
// run. Behind aiLimitMiddleware because it calls an LLM (unlike the
// read-only GET above and unlike site-health).
export type RunBrandPerceptionOutcome =
  | { kind: "cooldown"; retryAfterSeconds: number }
  | { kind: "scored"; data: ReturnType<typeof serializePerceptionRun> };

export async function runBrandPerceptionScoring(brand: Brand): Promise<RunBrandPerceptionOutcome> {
  // COST SAFEGUARD. Every run spends an LLM call over up to 40 excerpts,
  // and nothing about the underlying evidence changes minute to minute -
  // it only moves when a new citation check lands. `aiLimitMiddleware`
  // caps a USER's overall AI usage, but says nothing about one brand
  // being re-scored in a loop, so this adds a per-brand cooldown.
  //
  // Enforced from brand_perception_runs.created_at rather than an
  // in-memory counter: that survives a restart and is correct across
  // multiple instances, where a per-process Map would let N instances
  // each allow a run.
  const [recent] = await db
    .select({ createdAt: brandPerceptionRuns.createdAt })
    .from(brandPerceptionRuns)
    .where(eq(brandPerceptionRuns.brandId, brand.id))
    .orderBy(desc(brandPerceptionRuns.createdAt))
    .limit(1);

  if (recent?.createdAt) {
    const ageMs = Date.now() - new Date(recent.createdAt).getTime();
    if (ageMs < PERCEPTION_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((PERCEPTION_COOLDOWN_MS - ageMs) / 1000);
      return { kind: "cooldown", retryAfterSeconds: retryAfterSec };
    }
  }

  // The scoring itself lives in lib/perceptionRun.ts so the weekly
  // brand-activation job runs the exact same code. It always writes a
  // row now, even with zero evidence (every axis NULL) - that record
  // is how the UI tells "scored, nothing to say yet" apart from
  // "never scored".
  const inserted = await runPerceptionScoring(brand);
  return { kind: "scored", data: serializePerceptionRun(inserted) };
}

// ── Perception probes (migration 0116) ──────────────────────────────────
// The functions above score perception INFERRED from citation answers. These
// three drive the pipeline that ASKS each engine directly. Same kickoff /
// advance / read shape as citation runs, because a full pass is 30 grounded
// calls and cannot complete inside one request.

// GET - latest probe run plus its matrix. Read only, no LLM.
export async function getPerceptionProbes(brandId: string) {
  const [run] = await db
    .select()
    .from(brandPerceptionProbeRuns)
    .where(eq(brandPerceptionProbeRuns.brandId, brandId))
    .orderBy(desc(brandPerceptionProbeRuns.startedAt))
    .limit(1);

  if (!run) return null;

  const probes = await db
    .select()
    .from(brandPerceptionProbes)
    .where(eq(brandPerceptionProbes.runId, run.id));

  return {
    runId: run.id,
    status: run.status,
    probesDone: run.probesDone,
    probesTotal: run.probesTotal,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    errorMessage: run.errorMessage,
    probes: probes.map((p) => ({
      platform: p.platform,
      axis: p.axis,
      question: p.question,
      status: p.status,
      answer: p.answer,
      sources: (p.sources ?? []) as Array<{ url: string }>,
      // numeric comes back as a string from the driver - convert here,
      // never in the client, so one place owns the conversion.
      score: p.score === null ? null : Number(p.score),
      noInformation: p.noInformation,
      note: p.note,
      errorMessage: p.errorMessage,
    })),
  };
}

// POST - create a run and its pending probe rows, then return immediately.
export async function startOrGetActivePerceptionProbeRun(brand: Brand) {
  // Refuse to stack runs: a second in-flight run would double the spend
  // and race the first one's rows.
  const [active] = await db
    .select()
    .from(brandPerceptionProbeRuns)
    .where(
      and(
        eq(brandPerceptionProbeRuns.brandId, brand.id),
        inArray(brandPerceptionProbeRuns.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  if (active) {
    return { runId: active.id, alreadyRunning: true };
  }

  const { runId, probesTotal } = await startPerceptionProbeRun(brand);
  return { runId, probesTotal, alreadyRunning: false };
}

// POST - do as much of the run as fits in one slice. Polled by the client,
// and backed up by cron so a closed tab does not strand a run.
export async function advanceOwnedPerceptionProbeRun(brand: Brand, runId: string) {
  // Verify the run belongs to this brand before touching it - the brand
  // is ownership-checked, the runId in the body is not.
  const [run] = await db
    .select()
    .from(brandPerceptionProbeRuns)
    .where(
      and(eq(brandPerceptionProbeRuns.id, runId), eq(brandPerceptionProbeRuns.brandId, brand.id)),
    )
    .limit(1);
  if (!run) return null;

  return advancePerceptionProbeRun(
    brand,
    runId,
    Date.now() + PROBE_SLICE_MS,
    brand.userId ?? undefined,
  );
}
