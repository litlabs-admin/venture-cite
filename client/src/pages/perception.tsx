import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { RefreshCw, Loader2 } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { PanelLabel, NoValue, Delta } from "@/components/dashboard-panels/primitives";
import type { Perception, PlatformRank } from "@/components/dashboard-panels/useDashboardData";

// ─── Perception detail page ─────────────────────────────────────────────────
// Destination of the dashboard Perception panel's "Details ›" link. Reference
// layout (trakkr.ai/perception):
//   header: brand · last-scored date
//   hero:   PERCEPTION SCORE (big) + 7-DAY CHANGE
//   how ai describes you: praised / questioned chips
//   category scores: Trust/Quality/Value/Market/Innovation bars
//   perception over time: bar strip of past run scores
//
// Same honesty rules as the dashboard panel this expands: a null axis is
// skipped, `overall` is never recomputed client-side, and rendering this page
// never itself triggers a scoring run - only the Re-score button does, and
// that is rate-limited server-side (1h cooldown, 429 + Retry-After).

type PerceptionEnvelope = { success: boolean; data: Perception | null };

const AXES = [
  ["trust", "Trust"],
  ["quality", "Quality"],
  ["value", "Value"],
  ["market", "Market"],
  ["innovation", "Innovation"],
] as const;

/** Per-axis values carry one decimal - matches the reference and the
 *  dashboard panel's own fmt1. */
const fmt1 = (n: number) => n.toFixed(1);
/** The headline score is an integer - deliberate asymmetry with the per-axis
 *  decimals, matching the reference. Do not "fix" this to match fmt1. */
const fmt0 = (n: number) => String(Math.round(n));

function lastScoredLabel(iso: string | null | undefined): string {
  if (!iso) return "Never scored";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never scored";
  return `Last scored ${d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "praised" | "questioned" }) {
  return (
    <span
      className={`rounded-[4px] px-2.5 py-1 text-data ${
        tone === "praised" ? "bg-vc-accent-subtle text-vc-accent" : "bg-vc-muted text-vc-tertiary"
      }`}
    >
      {children}
    </span>
  );
}

/** Category score column: large text-stat number over a full-width bar,
 *  matching the reference's layout. The bar is below the label. Null axes
 *  never draw a bar or a fabricated number - a dash and no track. */
function CategoryScoreColumn({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null;
  /** Why this axis is blank. Only present for null axes on runs scored after
   *  notes were captured; older runs fall back to the generic title text. */
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label uppercase tracking-wider text-vc-label">{label}</span>
      {value !== null ? (
        <>
          <span className="text-stat font-semibold leading-none tabular-nums text-vc-primary">
            {fmt1(value)}
          </span>
          <div className="h-1.5 w-full bg-vc-muted" aria-hidden>
            <div
              className="h-full bg-vc-accent/70"
              style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <span
            className="text-stat font-semibold leading-none text-vc-hover"
            title={note ?? "The judge could not assess this axis from the available evidence"}
          >
            <NoValue className="text-stat font-semibold" />
          </span>
          {/* A blank with no explanation reads as a bug. Spell out that nothing
              was said about this axis, when we know that. */}
          {note && <span className="text-label leading-snug text-vc-tertiary">{note}</span>}
        </>
      )}
    </div>
  );
}

/** The excerpts the score was actually drawn from. Renders only when a run
 *  captured them - never a placeholder implying quotes we do not have. */
function EvidencePanel({
  evidence,
  evidenceCount,
  platforms,
}: {
  evidence: Array<{ text: string; platform: string }>;
  evidenceCount: number;
  platforms: string[];
}) {
  const shown = evidence.length;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <PanelLabel>What AI Actually Said</PanelLabel>
        <span className="text-label text-vc-tertiary">
          {/* Say plainly when the panel is a sample of a larger set, so the
              reader never mistakes 12 quotes for the whole basis of the score. */}
          {shown < evidenceCount
            ? `${shown} of ${evidenceCount} excerpts`
            : `${evidenceCount} ${evidenceCount === 1 ? "excerpt" : "excerpts"}`}
          {platforms.length > 0 && ` · ${platforms.join(", ")}`}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {evidence.map((e, i) => (
          <blockquote
            key={`${e.platform}-${i}`}
            className="border-l-2 border-vc-accent/40 pl-4 text-body leading-relaxed text-vc-label"
          >
            {e.text}
            <cite className="mt-1 block text-label not-italic uppercase tracking-wider text-vc-tertiary">
              {e.platform}
            </cite>
          </blockquote>
        ))}
      </div>
    </div>
  );
}

const TREND_SLOTS = 7;

/** Bar strip of past run scores, oldest first, matching the dashboard panel's
 *  own TrendStrip but larger - this is the page's dedicated section, not a
 *  sidebar sparkline. Fewer than 2 points cannot show a trend, so the section
 *  says that in words instead of drawing a flat line off one point. */
function PerceptionOverTime({ history, overall }: { history: number[]; overall: number | null }) {
  if (history.length < 2) {
    return (
      <p className="text-body text-vc-tertiary">
        {overall !== null
          ? `Tracking started - your first score is ${fmt1(overall)}. Historical trends appear after your next analysis.`
          : "Tracking started. Historical trends appear after your next analysis."}
      </p>
    );
  }

  const recent = history.slice(-TREND_SLOTS);
  const pad = TREND_SLOTS - recent.length;

  return (
    <div className="flex h-24 items-end gap-2" aria-hidden>
      {Array.from({ length: TREND_SLOTS }).map((_, i) => {
        const v = i < pad ? null : recent[i - pad];
        const h = v === null ? 0 : Math.max(4, Math.min(100, v));
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-20 w-full items-end">
              {v !== null && (
                <div
                  className="w-full rounded-t-sm bg-vc-accent/70"
                  style={{ height: `${h}%` }}
                  title={fmt1(v)}
                />
              )}
            </div>
            <span className="text-data tabular-nums text-vc-hover">
              {v === null ? "–" : fmt0(v)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── AI Model Breakdown ──────────────────────────────────────────────────────
// Reads GET /api/dashboard/rankings/:brandId - the same per-platform rollup
// the dashboard's Platforms panel uses - and reports CITATION counts per
// model. This is deliberately NOT a per-platform perception score: perception
// is scored as one aggregate judge run over round-robined evidence
// (server/lib/perceptionScorer.ts), which does not preserve per-platform
// attribution through to the final score. Splitting that out is a real
// feature gap (see docs/optimize-perception-reference.md), so this section
// labels its numbers as citations, never as perception.
const LOGO_FILES: Record<string, string> = {
  ChatGPT: "chatgpt",
  Claude: "claude",
  Perplexity: "perplexity",
  Gemini: "gemini",
  DeepSeek: "deepseek",
  Grok: "grok",
};

function PlatformLogo({ platform }: { platform: string }) {
  const file = LOGO_FILES[platform];
  if (!file) {
    return (
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-vc-muted text-label font-semibold text-vc-tertiary"
        aria-hidden
      >
        {platform.slice(0, 1)}
      </div>
    );
  }
  return (
    <img
      src={`/venturecite/images/ai-logos/${file}.svg`}
      alt=""
      className="h-8 w-8 flex-shrink-0"
      aria-hidden
    />
  );
}

function AiModelBreakdown({ platforms, loading }: { platforms: PlatformRank[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-sm bg-vc-muted" />
        ))}
      </div>
    );
  }

  if (platforms.length === 0) {
    return (
      <p className="text-data text-vc-tertiary">
        No platform-level citation data yet - run a citation check to populate this.
      </p>
    );
  }

  const recognized = platforms.filter((p) => p.citedCount > 0).length;

  return (
    <div>
      <p className="mb-4 text-data text-vc-tertiary">
        {recognized} of {platforms.length} recognize you
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {platforms.map((p) => (
          <div key={p.aiPlatform} className="rounded border border-vc-default p-4">
            <div className="mb-3 flex items-center gap-2">
              <PlatformLogo platform={p.aiPlatform} />
              <span className="text-caption font-semibold text-vc-primary">{p.aiPlatform}</span>
            </div>
            {p.citedCount === 0 ? (
              <p className="text-data text-vc-tertiary">Doesn't recognize the brand</p>
            ) : (
              <p className="text-data text-vc-secondary">
                <span className="text-caption font-semibold tabular-nums text-vc-primary">
                  {p.citedCount}
                </span>{" "}
                of {p.totalCount} prompts cited
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PerceptionPage() {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const [cooldownMsg, setCooldownMsg] = useState<string | null>(null);

  const queryKey = [`/api/dashboard/perception/${selectedBrandId}`];
  const { data, isLoading } = useQuery<PerceptionEnvelope>({
    queryKey,
    enabled: !!selectedBrandId,
  });

  const perception = data?.data ?? null;

  const rankingsQuery = useQuery<{ success: boolean; data: { platforms: PlatformRank[] } }>({
    queryKey: [`/api/dashboard/rankings/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });
  const platforms = rankingsQuery.data?.data?.platforms ?? [];

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/dashboard/perception/${selectedBrandId}/run`);
      return res.json();
    },
    onSuccess: () => {
      setCooldownMsg(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 429) {
        const body = error.body as { retryAfterSeconds?: number } | undefined;
        const secs = body?.retryAfterSeconds ?? 0;
        const mins = Math.max(1, Math.round(secs / 60));
        setCooldownMsg(`Scored recently - try again in ${mins} min`);
        return;
      }
      setCooldownMsg("Couldn't start a new scoring run. Try again shortly.");
    },
  });

  // Defensive defaults - a partial payload (an older shape, a degraded
  // response) must never throw and take the page down.
  const praised = perception?.praised ?? [];
  const questioned = perception?.questioned ?? [];
  const evidenceCount = perception?.evidenceCount ?? 0;
  const history = useMemo(() => perception?.history ?? [], [perception]);

  // 7-day change only renders when history actually has an older point to
  // compare against - otherwise it's a dash, never a fabricated 0.
  const change = history.length >= 2 ? history[history.length - 1] - history[0] : null;

  const reScoreButton = (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setCooldownMsg(null);
          runMutation.mutate();
        }}
        disabled={runMutation.isPending || !selectedBrandId}
        className="inline-flex items-center gap-1.5 rounded bg-vc-accent-subtle px-3 py-1.5 text-data font-medium text-vc-accent transition-all hover:bg-vc-accent hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {runMutation.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="h-3 w-3" aria-hidden />
        )}
        Re-score
      </button>
      {cooldownMsg && <span className="text-label text-vc-tertiary">{cooldownMsg}</span>}
    </div>
  );

  if (brandsLoading || isLoading) {
    return (
      <div className="min-h-screen bg-vc-page px-8 py-8">
        <div className="space-y-6">
          <div className="h-4 w-48 animate-pulse rounded-sm bg-vc-muted" />
          <div className="h-20 w-64 animate-pulse rounded-sm bg-vc-muted" />
          <div className="h-32 w-full animate-pulse rounded-sm bg-vc-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vc-page px-8 py-8">
      {/* Header: brand · last-scored date */}
      <div className="mb-8 flex items-center justify-between border-b border-vc-default pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-page font-semibold text-vc-primary">
            {selectedBrand?.name ?? "Perception"}
          </h1>
          <span className="text-data text-vc-tertiary">
            {lastScoredLabel(perception?.createdAt ?? null)}
          </span>
        </div>
        {reScoreButton}
      </div>

      {!perception ? (
        // NEVER SCORED - no run row exists at all. A first-class empty
        // state, not an error.
        <div className="flex flex-col items-center justify-center gap-3 rounded border border-dashed border-vc-default py-16 text-center">
          <p className="text-body text-vc-tertiary">
            This brand has never been scored for perception.
          </p>
          <p className="text-data text-vc-hover">
            Run a scoring pass to see how AI describes {selectedBrand?.name ?? "this brand"} across
            trust, quality, value, market, and innovation.
          </p>
        </div>
      ) : evidenceCount === 0 ? (
        // SCORED, NO EVIDENCE - a run happened, but the brand was never
        // named in any stored AI answer, so there was nothing to judge.
        // Distinct from "never scored": this tells the user WHY it's empty
        // and what changes it, instead of rendering a dashboard of dashes.
        <div className="flex flex-col items-center justify-center gap-3 rounded border border-dashed border-vc-default py-16 text-center">
          <p className="text-body text-vc-tertiary">
            No AI answer named {selectedBrand?.name ?? "this brand"} yet, so there is nothing to
            score.
          </p>
          <p className="text-data text-vc-hover">
            Perception is judged only from AI answers that mention the brand. Once{" "}
            {selectedBrand?.name ?? "this brand"} is cited in an AI answer, re-score to see trust,
            quality, value, market, and innovation.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Hero: score · rank · vs average · 7-day change */}
          <div className="grid grid-cols-2 gap-8 border-b border-vc-default pb-8 md:grid-cols-4">
            <div className="flex flex-col">
              <PanelLabel>Perception Score</PanelLabel>
              {perception.overall !== null ? (
                <span className="mt-2 text-stat font-semibold leading-none tabular-nums text-vc-accent">
                  {fmt0(perception.overall)}
                </span>
              ) : (
                <span className="mt-2">
                  <NoValue className="text-stat font-semibold leading-none" />
                </span>
              )}
              <span className="mt-2 text-data text-vc-label">
                How AI models perceive your brand
              </span>
            </div>
            <div className="flex flex-col">
              <PanelLabel>Rank</PanelLabel>
              <span className="mt-2">
                <NoValue className="text-page font-semibold leading-none" />
              </span>
              <span className="mt-2 text-data text-vc-label">No cross-account ranking data</span>
            </div>
            <div className="flex flex-col">
              <PanelLabel>Vs Average</PanelLabel>
              <span className="mt-2">
                <NoValue className="text-page font-semibold leading-none" />
              </span>
              <span className="mt-2 text-data text-vc-label">No benchmark data available</span>
            </div>
            <div className="flex flex-col">
              <PanelLabel>7-Day Change</PanelLabel>
              <span className="mt-2 text-page font-semibold leading-none">
                <Delta value={change} digits={1} />
              </span>
              <span className="mt-2 text-data text-vc-label">
                {evidenceCount} {evidenceCount === 1 ? "excerpt" : "excerpts"} cited
              </span>
            </div>
          </div>

          {/* How AI describes you */}
          <div>
            <div className="flex items-baseline justify-between">
              <PanelLabel>How AI Describes You</PanelLabel>
              <span className="text-data text-vc-tertiary">The words AI actually uses</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-label uppercase tracking-wider text-vc-label">Praised</p>
                {praised.length === 0 ? (
                  <p className="text-data text-vc-hover">
                    Nothing praised was distinguishable in the available evidence.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {praised.map((p, i) => (
                      <Chip key={`${p}-${i}`} tone="praised">
                        {p}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-label uppercase tracking-wider text-vc-label">Questioned</p>
                {questioned.length === 0 ? (
                  <p className="text-data text-vc-hover">
                    Nothing questioned was distinguishable in the available evidence.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {questioned.map((q, i) => (
                      <Chip key={`${q}-${i}`} tone="questioned">
                        {q}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Category scores: five large text-stat numbers, each over a
              full-width bar (see docs/optimize-perception-reference.md
              "Rebuild decisions" - the reference puts the bar UNDER the
              label, not beside it, unlike the dashboard's compact panel). */}
          <div>
            <PanelLabel>Category Scores</PanelLabel>
            <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-5">
              {AXES.map(([key, label]) => (
                <CategoryScoreColumn
                  key={key}
                  label={label}
                  value={perception[key]}
                  note={perception.axisNotes?.[key]}
                />
              ))}
            </div>
          </div>

          {/* The evidence behind the score. Only rendered for runs that stored
              it - older runs keep their score and simply omit this section. */}
          {perception.evidence && perception.evidence.length > 0 && (
            <EvidencePanel
              evidence={perception.evidence}
              evidenceCount={evidenceCount}
              platforms={perception.evidencePlatforms ?? []}
            />
          )}

          {/* Perception over time */}
          <div>
            <PanelLabel>Perception Over Time</PanelLabel>
            <div className="mt-4 rounded border border-vc-default p-6">
              <PerceptionOverTime history={history} overall={perception.overall} />
            </div>
          </div>

          {/* AI model breakdown */}
          <div>
            <PanelLabel>AI Model Breakdown</PanelLabel>
            <div className="mt-4">
              <AiModelBreakdown platforms={platforms} loading={rankingsQuery.isLoading} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
