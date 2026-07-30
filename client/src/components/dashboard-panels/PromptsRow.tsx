import { ChevronRight } from "lucide-react";
import { PanelLabel, PanelLink, NoValue, CCLink, DEST } from "./primitives";
import type { PromptRow, SiteHealth, MentionTone, Perception } from "./useDashboardData";

// ─── Top prompts + Site Health + Perception ──────────────────────────────────
// Third content row: prompts across two thirds, two stacked panels in the last.
// Prompt row spec (measured): 36px, py-2 px-2, index (10px mono, w-3) · prompt
// (12px, truncate) · volume (11px mono) · mentions (13px semibold, w-7) ·
// per-platform bars (w-7 h-3) · delta (11px mono, w-4).

function PromptLine({ row, index }: { row: PromptRow; index: number }) {
  const cited = row.platforms.filter((p) => p.isCited).length;
  return (
    <CCLink
      dest={DEST.prompts}
      className="group flex items-center gap-3 px-2 py-2 transition-colors duration-150 hover:bg-vc-muted/50"
    >
      <span className="w-3 flex-shrink-0 font-mono text-label tabular-nums text-vc-hover">
        {index}
      </span>
      <span className="min-w-0 flex-1 truncate text-caption text-vc-secondary transition-colors group-hover:text-vc-primary">
        {row.prompt}
      </span>
      {/* Search volume has no source: brand_prompts carries no volume column. */}
      <NoValue className="flex-shrink-0 font-mono text-data" />
      <span className="w-7 flex-shrink-0 text-right text-body font-semibold tabular-nums text-vc-primary">
        {cited}
      </span>
      <div className="flex h-3 w-7 flex-shrink-0 items-end gap-px" aria-hidden>
        {row.platforms.map((p) => (
          <div
            key={p.platform}
            className={`h-full flex-1 transition-all ${p.isCited ? "bg-vc-accent" : "bg-vc-default"}`}
          />
        ))}
      </div>
      <NoValue className="w-4 flex-shrink-0 text-right font-mono text-data" />
    </CCLink>
  );
}

// ─── Site Health ─────────────────────────────────────────────────────────────
// Measured against the reference: 56×56 donut (r=26, 3px stroke, track
// #f5f5f4, rotated -90° so it fills from 12 o'clock, round linecap), score
// centred over it, severity counts to the right, crawl meta beneath.
//
// WHAT THE SCORE IS: citation readiness — can AI systems FIND the site
// (robots.txt / sitemap.xml / llms.txt), are they ALLOWED to read it (AI
// crawler rules), and did our crawl of it actually SUCCEED (pages fetched vs
// failed). Weights live server-side in scoreSiteHealth() so they are auditable
// in one place. An earlier version of this panel scored only robots.txt
// crawler access and called it "Site Health"; that is one sub-signal of the
// reference's panel, not the panel.
//
// The severity counts are real rows from the last crawl — 5xx/fetch failures,
// 4xx, reachable-but-nothing-extractable, and non-HTML — not invented tiers.

const DONUT_R = 26.5; // measured: reference uses r=26.5, not 26
const CIRC = 2 * Math.PI * DONUT_R;

function Donut({ pct }: { pct: number | null }) {
  const filled = pct === null ? 0 : (Math.max(0, Math.min(100, pct)) / 100) * CIRC;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90" aria-hidden>
      <circle cx="28" cy="28" r={DONUT_R} fill="none" stroke="#f3f4f6" strokeWidth="3" />
      {pct !== null && (
        <circle
          cx="28"
          cy="28"
          r={DONUT_R}
          fill="none"
          stroke="var(--brand-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRC - filled}`}
        />
      )}
    </svg>
  );
}

// Severity ramp. The reference uses red / amber / yellow / stone-300, but this
// app is deliberately blue-only outside functional status (amber was removed
// app-wide). So: red for CRITICAL only, the brand accent for HIGH, and the
// neutral ramp for the two tiers that are informational rather than urgent —
// which is also exactly what the reference does for its own `low` (stone-300).
//
// The ramp descends in visual weight, so urgency reads before the label does,
// and the two quiet tiers stay quiet instead of competing with the accent.
const SEVERITY: Record<string, string> = {
  crit: "var(--negative)",
  high: "var(--brand-accent)",
  med: "#a8a29e", // stone-400
  low: "#d6d3d1", // stone-300 — same as the reference's own `low`
};

// Measured: 8×8 square swatch (no radius), count 12/600 ink, label 11/400.
function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 flex-shrink-0"
        style={{ backgroundColor: SEVERITY[label] }}
        aria-hidden
      />
      <span className="text-caption font-semibold tabular-nums text-vc-primary">{n}</span>
      <span className="text-data text-vc-label">{label}</span>
    </div>
  );
}

/** Measured: stone-100 fill, 4px radius, 2px/8px padding, 10px/400 stone-500.
 *  The reference's footer is three of these, not a dot-separated sentence. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[4px] bg-vc-muted px-2 py-0.5 text-label text-vc-tertiary">
      {children}
    </span>
  );
}

function relDays(iso: string | null): string | null {
  if (!iso) return null;
  const d = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (!Number.isFinite(d)) return null;
  if (d < 1) return "today";
  return `${Math.floor(d)}d ago`;
}

/** Exported for tests/unit/siteHealthPanel.test.tsx, which guards against the
 *  payload-shape crash that once took the whole dashboard down. */
export function SiteHealthPanel({
  health,
  loading,
}: {
  health: SiteHealth | null;
  loading: boolean;
}) {
  // NORMALISE BEFORE READING. This panel used to index `health.discovery[k]`
  // and `health.crawl.pagesCrawled` directly, which threw
  // "Cannot read properties of undefined" the moment the API returned anything
  // without those nested objects — a server still serving an older payload
  // shape, a partial response, a degraded error envelope. Because this panel
  // renders inside the dashboard's tree, that single throw took down the WHOLE
  // dashboard via the error boundary: one panel's payload must never be able
  // to do that. Defaults below are all "not measured", never "measured zero".
  // UNKNOWN default (null), not "absent" (false) — a missing payload means
  // "we haven't measured this", never "confirmed missing".
  const discovery = health?.discovery ?? {
    robotsTxt: null,
    sitemapXml: null,
    llmsTxt: null,
    mcpJson: null,
    securityTxt: null,
  };
  const crawl = health?.crawl ?? {
    pagesCrawled: null,
    pagesFailed: null,
    sitemapUrlCount: null,
    lastCrawlAt: null,
  };
  const issues = health?.issues ?? { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  const crawlers = health?.crawlers ?? {
    total: 0,
    allowed: 0,
    blocked: 0,
    unknown: 0,
    blockedCrawlers: [],
  };

  // Reference footer: "53 pages · nextjs · 1d ago". Same three slots here —
  // pages, detected platform, recency — plus the discovery count, which the
  // reference surfaces on its Optimize page rather than the tile. `platform`
  // is a real signature match (server/lib/platformDetect.ts) and is simply
  // omitted when nothing matched confidently, never guessed.
  // All FIVE files the reference lists (robots.txt, sitemap.xml, llms.txt,
  // mcp.json, security.txt). This counted only the first three while the
  // server had already started probing five, so the chip under-reported —
  // apple.com reads 3/5, not 2/3.
  // Chip counts only CONFIRMED-present files (=== true). Unknown (null) files
  // are neither present nor absent, so they must not be counted as failures —
  // the denominator stays 5 (all files probed), and when any file is unknown
  // the chip says so rather than silently rendering "3/5" as if that meant
  // "2 confirmed missing".
  const DISCOVERY_FILES = ["robotsTxt", "sitemapXml", "llmsTxt", "mcpJson", "securityTxt"] as const;
  const found = DISCOVERY_FILES.filter((k) => discovery[k] === true).length;
  const unknownCount = DISCOVERY_FILES.filter(
    (k) => discovery[k] === null || discovery[k] === undefined,
  ).length;
  const discoveryChip =
    unknownCount > 0
      ? `${found}/${DISCOVERY_FILES.length} discovery (${unknownCount} unknown)`
      : `${found}/${DISCOVERY_FILES.length} discovery`;
  // Prefer the sitemap's URL count — the SITE's size — for the "N pages"
  // chip, matching the reference ("53 pages" = the crawled site size, not
  // the cost-bounded fact-extraction sample). Falls back to the audited
  // page count only when the sitemap is unavailable.
  const pageCountForChip = crawl.sitemapUrlCount ?? crawl.pagesCrawled;
  const meta = health
    ? ([
        pageCountForChip !== null ? `${pageCountForChip} pages` : null,
        health.platform,
        discoveryChip,
        relDays(crawl.lastCrawlAt),
      ].filter(Boolean) as string[])
    : [];

  return (
    <div className="px-6 py-6">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex h-4 items-center justify-between">
          <PanelLabel>Site Health</PanelLabel>
          <PanelLink dest={DEST.siteHealth}>Optimize</PanelLink>
        </div>

        {loading ? (
          <div className="flex items-center gap-5">
            <div className="h-14 w-14 flex-shrink-0 rounded-full bg-vc-muted" />
            <div className="h-8 flex-1 rounded-sm bg-vc-muted" />
          </div>
        ) : health?.pending ? (
          // The compute hasn't finished within the deadline — a timeout is
          // NOT a measurement. Never render a score or zeroes here; the
          // background compute keeps running and the next load gets the
          // real answer.
          <div className="flex flex-1 items-center gap-5">
            <div className="relative flex-shrink-0">
              <Donut pct={null} />
              <div className="absolute inset-0 flex items-center justify-center">
                <NoValue className="text-ui font-semibold leading-none" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-data text-vc-tertiary">Measuring…</p>
              <p className="text-label text-vc-label">
                This can take a few seconds on a first audit — check back shortly.
              </p>
            </div>
          </div>
        ) : !health || health.score === null ? (
          // No website on the brand, or robots.txt unreadable. The donut stays
          // as an empty track and the figure is a dash — 0 would read as
          // "every crawler blocked", a very different and much worse fact.
          <div className="flex flex-1 items-center gap-5">
            <div className="relative flex-shrink-0">
              <Donut pct={null} />
              <div className="absolute inset-0 flex items-center justify-center">
                <NoValue className="text-ui font-semibold leading-none" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-data text-vc-tertiary">
                {health && !health.website
                  ? "No website on this brand"
                  : "Couldn't read robots.txt"}
              </p>
              <CCLink
                dest={health && !health.website ? DEST.settings : DEST.crawler}
                className="flex items-center gap-0.5 text-label text-vc-accent hover:underline"
              >
                {health && !health.website ? "Add a website" : "Check crawler access"}
                <ChevronRight className="h-2.5 w-2.5" aria-hidden />
              </CCLink>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-5">
            <div className="relative flex-shrink-0">
              <Donut pct={health.score} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-ui font-semibold leading-none tabular-nums text-vc-accent">
                  {health.score}
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              {/* Reference shows crit/high/med/low. When the last crawl found
                  nothing wrong we say so in words rather than printing four
                  zeroes, which reads as "not measured" rather than "clean". */}
              {/* The reference shows all four severity counts whenever a crawl
                  exists — including zeros ("0 crit · 1 high · 3 med · 3 low").
                  An earlier version here collapsed an all-zero crawl to the
                  words "No issues found", which meant a healthy site rendered
                  a different LAYOUT from an unhealthy one and never matched the
                  reference. A measured zero is a result worth showing; only a
                  site we have never crawled falls back to prose. */}
              <div className="mb-2 flex items-center gap-3">
                {crawl.pagesCrawled !== null ? (
                  <>
                    <Count n={issues.critical} label="crit" />
                    <Count n={issues.high} label="high" />
                    <Count n={issues.medium} label="med" />
                    <Count n={issues.low} label="low" />
                  </>
                ) : (
                  <span className="text-caption text-vc-tertiary">Not crawled yet</span>
                )}
              </div>
              {/* Chips, matching the reference's "53 pages · nextjs · 1d ago"
                  row — three discrete pills rather than one run-on line. */}
              <div className="flex flex-wrap items-center gap-1">
                {meta.length > 0 ? (
                  meta.map((m) => <Chip key={m}>{m}</Chip>)
                ) : (
                  <Chip>{`${crawlers.allowed}/${crawlers.total} crawlers allowed`}</Chip>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Perception ──────────────────────────────────────────────────────────────
// Reference layout: one big score at 24px, then a short list of named
// dimensions with their own scores.
//
// Two states, and which one shows is a statement about the data, not a style
// choice:
//
//   SCORED — the brand has a persisted perception run. Shows `overall` and the
//   three highest-scoring axes of Trust/Quality/Value/Market/Innovation. Axes
//   the judge could not assess from the evidence are null and are skipped
//   entirely rather than shown as a middling number; `overall` averages only
//   what was scorable.
//
//   NOT SCORED — falls back to mention tone, which is measured continuously
//   from real LLM verdicts (fallback/capped placeholder rows are excluded
//   server-side). Tone is a genuinely different, weaker claim than perception,
//   so it is labelled "tone", never presented as a perception score.
//
// Scoring is never triggered by rendering: the panel reads the newest run, and
// POST .../perception/:id/run is rate-limited.

// Same row geometry as the scored-axis rows above, so the panel reads as one
// component whichever state it is in — only the labels and the meaning change.
function ToneRow({ label, n, total }: { label: string; n: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((n / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 flex-shrink-0 truncate text-label text-vc-tertiary">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 bg-vc-muted" aria-hidden>
        <div className="h-full bg-vc-accent/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 flex-shrink-0 text-right text-label tabular-nums text-vc-tertiary">
        {pct}%
      </span>
    </div>
  );
}

/** The reference's 7-bar strip under the perception score: 7px-wide bars whose
 *  height tracks each past run's overall, most recent last. Slots with no run
 *  yet render as faded stubs — the reference does the same before a brand has
 *  history ("Historical trends will appear after your next analysis"), so the
 *  strip shows how much history exists rather than implying a full series. */
const TREND_SLOTS = 7;

function TrendStrip({ history }: { history: number[] }) {
  const recent = history.slice(-TREND_SLOTS);
  const pad = TREND_SLOTS - recent.length;
  // Measured: 3px-wide bars, 12px tall strip.
  return (
    <div className="mt-1.5 flex h-3 items-end gap-px" aria-hidden>
      {Array.from({ length: TREND_SLOTS }).map((_, i) => {
        const v = i < pad ? null : recent[i - pad];
        // Floor at 25% so a genuinely low score is still a visible bar rather
        // than an invisible sliver indistinguishable from an empty slot.
        const h = v === null ? 30 : 25 + (Math.max(0, Math.min(100, v)) / 100) * 75;
        return (
          <div
            key={i}
            className={`w-[3px] ${v === null ? "bg-vc-accent/40" : "bg-vc-accent"}`}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

/** Per-axis values carry one decimal, matching the reference ("66.6").
 *  Values are stored as numeric(4,1), so this prints precision we actually
 *  hold rather than padding a fake .0. */
const fmt1 = (n: number) => n.toFixed(1);

/** The HEADLINE score is an INTEGER. Measured on the reference: its big figure
 *  renders "64", not "64.0", while the axis rows beside it render "66.6". Two
 *  different roles, two different formats — printing "85.0" up there was the
 *  most visible thing making our panel look unlike theirs. */
const fmt0 = (n: number) => String(Math.round(n));

const AXES = [
  ["trust", "Trust"],
  ["quality", "Quality"],
  ["value", "Value"],
  ["market", "Market"],
  ["innovation", "Innovation"],
] as const;

function PerceptionPanel({
  perception,
  perceptionLoading,
  tone,
  loading,
}: {
  perception: Perception | null;
  perceptionLoading: boolean;
  tone: MentionTone | null;
  loading: boolean;
}) {
  // Only axes the judge could actually score. Nulls are dropped, not rendered
  // as zero or as a midpoint — an unassessable axis is not a low-scoring one.
  const scored: { label: string; value: number }[] = perception
    ? AXES.flatMap(([k, label]) => {
        const value = perception[k];
        return value === null ? [] : [{ label: label as string, value }];
      }).sort((a, b) => b.value - a.value)
    : [];

  if (!perceptionLoading && perception && scored.length > 0) {
    return (
      <div className="px-6 py-6">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex h-4 items-center justify-between">
            <PanelLabel>Perception</PanelLabel>
            <PanelLink dest={DEST.mentions}>Details</PanelLink>
          </div>
          <div className="flex flex-1 gap-6">
            <div className="flex flex-shrink-0 flex-col">
              {perception.overall !== null ? (
                <span className="text-metric font-semibold leading-none tabular-nums text-vc-accent">
                  {fmt0(perception.overall)}
                </span>
              ) : (
                <NoValue className="text-metric font-semibold leading-none" />
              )}
              {/* Trend strip, as the reference renders beneath its score. */}
              <TrendStrip history={perception.history ?? []} />
              {/* The sample size is part of the claim, not decoration. */}
              <span className="mt-1 text-label text-vc-label">
                {perception.evidenceCount} cited
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              {/* Measured row: label (10/400) · 6px track on stone-100 with an
                  accent fill at 70% · value (10/400), right-aligned. The
                  reference prints one decimal; ours are stored as integers, so
                  we print integers rather than pad a ".0" that implies
                  precision the column does not have. */}
              {scored.slice(0, 3).map((a) => (
                <div key={a.label} className="flex items-center gap-2">
                  <span className="w-24 flex-shrink-0 truncate text-label text-vc-tertiary">
                    {a.label}
                  </span>
                  <div className="h-1.5 min-w-0 flex-1 bg-vc-muted" aria-hidden>
                    <div
                      className="h-full bg-vc-accent/70"
                      style={{ width: `${Math.max(0, Math.min(100, a.value))}%` }}
                    />
                  </div>
                  <span className="w-8 flex-shrink-0 text-right text-label tabular-nums text-vc-tertiary">
                    {fmt1(a.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex h-4 items-center justify-between">
          <PanelLabel>Perception</PanelLabel>
          <PanelLink dest={DEST.mentions}>Details</PanelLink>
        </div>

        {loading || perceptionLoading ? (
          <div className="flex gap-6">
            <div className="h-8 w-10 rounded-sm bg-vc-muted" />
            <div className="h-8 flex-1 rounded-sm bg-vc-muted" />
          </div>
        ) : !tone || tone.score === null ? (
          <div className="flex flex-1 gap-6">
            <div className="flex flex-col">
              <NoValue className="text-metric font-semibold leading-none" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-data text-vc-tertiary">No mentions judged in the last 7 days.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 gap-6">
            <div className="flex flex-shrink-0 flex-col">
              <span className="text-metric font-semibold leading-none tabular-nums text-vc-accent">
                {tone.score}
              </span>
              <span className="mt-1 text-label text-vc-label">tone</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              <ToneRow label="Positive" n={tone.positive} total={tone.total} />
              <ToneRow label="Neutral" n={tone.neutral} total={tone.total} />
              <ToneRow label="Negative" n={tone.negative} total={tone.total} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PromptsRow({
  prompts,
  loading,
  siteHealth,
  siteHealthLoading,
  tone,
  toneLoading,
  perception,
  perceptionLoading,
}: {
  prompts: PromptRow[];
  loading: boolean;
  siteHealth: SiteHealth | null;
  siteHealthLoading: boolean;
  tone: MentionTone | null;
  toneLoading: boolean;
  perception: Perception | null;
  perceptionLoading: boolean;
}) {
  const top = [...prompts]
    .sort(
      (a, b) =>
        b.platforms.filter((p) => p.isCited).length - a.platforms.filter((p) => p.isCited).length,
    )
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 border-b border-vc-default lg:grid-cols-3">
      {/* Top prompts */}
      <div className="border-b border-vc-default px-8 py-6 lg:col-span-2 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="mb-3 flex h-4 items-center justify-between">
            <PanelLabel>Top Prompts</PanelLabel>
            <PanelLink dest={DEST.prompts}>View all</PanelLink>
          </div>
          <div className="-mx-2 flex-1">
            {loading ? (
              <div className="space-y-3 px-2 pt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-4 rounded-sm bg-vc-muted" />
                ))}
              </div>
            ) : top.length === 0 ? (
              <p className="px-2 pt-2 text-data text-vc-tertiary">
                No prompt results yet. Run a citation check to populate this list.
              </p>
            ) : (
              top.map((r, i) => <PromptLine key={r.promptId} row={r} index={i + 1} />)
            )}
          </div>
        </div>
      </div>

      {/* Site Health + Perception */}
      <div className="flex flex-col">
        <SiteHealthPanel health={siteHealth} loading={siteHealthLoading} />
        <div className="h-px w-full bg-vc-default" />
        <PerceptionPanel
          perception={perception}
          perceptionLoading={perceptionLoading}
          tone={tone}
          loading={toneLoading}
        />
      </div>
    </div>
  );
}
