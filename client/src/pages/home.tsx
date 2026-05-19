import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Brain,
  Loader2,
  Stethoscope,
  Swords,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useInspector } from "@/components/AppShell";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import VisibilityGauge from "@/components/dashboard/VisibilityGauge";
import Pulse from "@/components/dashboard/Pulse";

// ─── Command Center ──────────────────────────────────────────────────────────
// One pane, five questions: where do I stand, what changed, what's wrong, what
// do I do, where's the proof. A router (not a report) — every tile links into
// one spine stage. Real /api/dashboard/* data only; no fabricated metrics.
//
// Visual system (DESIGN.md):
//   - One card chrome across the page: rounded-lg border border-border bg-card.
//     Pulse already uses this; the KPI tiles + supplementary widgets + the
//     run-strip all adopt it so the page reads as one instrument.
//   - Numerics are mono tnum (no shimmy on refetch). Weights 500/600 only.
//   - Color encodes importance, not category: --positive / --negative semantic
//     tokens for delta direction; the accent is reserved for one CTA per view.
//   - Answer-first: the page opens with one plain-sans verdict sentence and
//     the one number that matters, then the supporting tiles.

interface HeroData {
  visibilityScore: number;
  visibilityDelta: number | null;
  citedChecks: number;
  totalChecks: number;
  citationRate: number;
  lastScanAt: string | null;
}
type TrendWeek = { weekStart: string; cited: number; total: number; citationRate: number };
type LeaderRow = {
  name: string;
  domain: string;
  isOwn: boolean;
  totalCitations: number;
  shareOfVoice: number;
};

// One card chrome for the whole page. Matches Pulse's <section>. No shadow —
// elevation in this register is surface + border, not shadow. Hover is a tinted
// surface step (not the brand accent, per DESIGN.md "accent encodes
// importance, not state").
const TILE_BASE =
  "group block rounded-lg border border-border bg-card p-5 transition-colors " +
  "hover:bg-accent/40 hover:border-[var(--border-strong)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function TileLabel({
  icon: Icon,
  children,
  showArrow = true,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  showArrow?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
        {children}
      </span>
      {showArrow && (
        <ArrowRight
          className="h-3.5 w-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden
        />
      )}
    </div>
  );
}

function DeltaPill({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        up
          ? "bg-[var(--positive)]/10 text-[var(--positive)]"
          : "bg-[var(--negative)]/10 text-[var(--negative)]"
      }`}
    >
      {up ? (
        <ArrowUp className="h-3 w-3" aria-hidden />
      ) : (
        <ArrowDown className="h-3 w-3" aria-hidden />
      )}
      <span className="tnum">
        {up ? "+" : ""}
        {value}
      </span>
      pts
    </span>
  );
}

function DriverRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function VisibilityDrivers({ h }: { h?: HeroData }) {
  if (!h) {
    return (
      <p className="text-sm text-muted-foreground">
        No scan data yet. Run a citation check and the drivers appear here.
      </p>
    );
  }
  const deltaText =
    h.visibilityDelta === null || h.visibilityDelta === 0
      ? "No change"
      : `${h.visibilityDelta > 0 ? "+" : ""}${h.visibilityDelta} pts vs. last scan`;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center pb-1">
        <VisibilityGauge score={h.visibilityScore} size={140} />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The score blends three measured signals: how often AI engines cite you, the average rank of
        those citations, and the authority of the citing sources. Everything below is from your
        latest scan only.
      </p>
      <div>
        <DriverRow label="Citation rate" value={<span className="tnum">{h.citationRate}%</span>} />
        <DriverRow
          label="Checks cited"
          value={
            <span className="tnum">
              {h.citedChecks} / {h.totalChecks}
            </span>
          }
        />
        <DriverRow label="Change" value={deltaText} />
        <DriverRow label="Last scan" value={formatRelativeTime(h.lastScanAt)} />
      </div>
      <Link
        href="/monitor"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Open full breakdown in Monitor
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

// Plain-language verdict shown above the tiles. One sentence + one number,
// answer-first. Honest when there's no measurement yet.
function Verdict({
  h,
  isLoading,
  hasMeasured,
}: {
  h?: HeroData;
  isLoading: boolean;
  hasMeasured: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-baseline gap-4">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-9 w-16" />
      </div>
    );
  }

  if (!hasMeasured || !h) {
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="max-w-[55ch] text-lg font-medium leading-snug text-foreground">
          Not yet measured. Run a citation check and your AI visibility appears here.
        </p>
      </div>
    );
  }

  const score = h.visibilityScore;
  const delta = h.visibilityDelta ?? 0;
  // Plain-language verdict, derived from real signals only. No copy that
  // implies precision the math doesn't have.
  let phrase = "is steady.";
  if (delta > 0) phrase = `is up ${delta} pts since the last scan.`;
  else if (delta < 0) phrase = `is down ${Math.abs(delta)} pts since the last scan.`;

  let band = "Coverage is thin";
  if (score >= 70) band = "Coverage is strong";
  else if (score >= 40) band = "Coverage is moderate";

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <p className="max-w-[55ch] text-lg font-medium leading-snug text-foreground">
        {band}, and {phrase}
      </p>
      <div className="flex items-baseline gap-3">
        <span className="tnum text-3xl font-semibold leading-none text-foreground">{score}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { brands, selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const inspector = useInspector();
  const enabled = !!selectedBrandId;

  const hero = useQuery<{ success: boolean; data: HeroData }>({
    queryKey: [`/api/dashboard/hero/${selectedBrandId}`],
    enabled,
  });
  const trend = useQuery<{ success: boolean; data: { weeks: TrendWeek[] } }>({
    queryKey: [`/api/dashboard/citation-trend/${selectedBrandId}`],
    enabled,
  });
  const leaderboard = useQuery<{ success: boolean; data: LeaderRow[] }>({
    queryKey: [`/api/competitors/leaderboard?brandId=${selectedBrandId}`],
    enabled,
  });
  const { runs: activeRuns } = useActiveCitationRuns(selectedBrandId);

  const h = hero.data?.data;
  const weeks = trend.data?.data?.weeks ?? [];
  const rows = leaderboard.data?.data ?? [];

  const hasMeasured = !!h && (h.totalChecks ?? 0) > 0;

  const weekDelta = useMemo(() => {
    const withData = weeks.filter((w) => w.total > 0);
    if (withData.length < 2) return null;
    const last = withData[withData.length - 1];
    const prev = withData[withData.length - 2];
    return { delta: last.citationRate - prev.citationRate, last, prev };
  }, [weeks]);

  const competitorsAhead = useMemo(() => {
    const own = rows.find((r) => r.isOwn);
    return rows
      .filter((r) => !r.isOwn && (!own || r.shareOfVoice > own.shareOfVoice))
      .sort((a, b) => b.shareOfVoice - a.shareOfVoice)
      .slice(0, 3);
  }, [rows]);

  const issues = useMemo(() => {
    const out: string[] = [];
    if (h && h.totalChecks > 0) {
      if (h.citationRate < 20) out.push("Citation rate below 20%");
      if (competitorsAhead.length > 0)
        out.push(
          `${competitorsAhead.length} competitor${competitorsAhead.length === 1 ? "" : "s"} outranking you`,
        );
    }
    return out;
  }, [h, competitorsAhead]);

  if (brandsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-7 w-3/4" />
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="Create a brand to get started"
        description={
          <>
            Set up your first brand and we&apos;ll build a live AI-visibility operating system:
            monitor where ChatGPT, Claude, Perplexity, and Gemini cite you, diagnose the gaps, and
            act on them.
          </>
        }
        action={{
          label: "Create your first brand",
          href: "/setup?tab=brands",
          onClick: () => {},
        }}
      />
    );
  }

  const scanRunning = activeRuns.length > 0;

  return (
    <div className="animate-fade-in-up motion-reduce:animate-none">
      {/* 1. Verdict — answer-first conclusion sentence + the one number. */}
      <Verdict h={h} isLoading={hero.isLoading} hasMeasured={hasMeasured} />

      {/* 2. Hero KPI tiles — three tiles, one internal layout.
          Label (top) → value row (middle, baseline-aligned) → descriptor (bottom).
          Same vertical rhythm, same baseline grid, same hover. The gauge moved
          into the Visibility Inspector (drill-down); the verdict line above
          already carries the score's headline number, so the tile shows the
          raw number aligned with its siblings instead of a horizontal gauge
          layout that broke parity. */}
      <div className="mt-6 grid gap-3 md:grid-cols-3" data-tour-id="dashboard.stats">
        {/* Visibility Score — opens Inspector. */}
        <button
          type="button"
          onClick={() =>
            inspector.open({ title: "Visibility drivers", body: <VisibilityDrivers h={h} /> })
          }
          className={`${TILE_BASE} flex flex-col text-left`}
        >
          <TileLabel icon={Brain}>AI Visibility</TileLabel>
          <div className="mt-4 flex h-9 items-baseline gap-1">
            {hero.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <span className="tnum text-3xl font-semibold leading-none text-foreground">
                  {h?.visibilityScore ?? 0}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  / <span className="tnum">100</span>
                </span>
              </>
            )}
          </div>
          <div className="mt-1.5 flex h-5 items-center gap-2 text-xs text-muted-foreground">
            {h && h.visibilityDelta !== null && h.visibilityDelta !== 0 ? (
              <DeltaPill value={h.visibilityDelta} />
            ) : null}
            <span className="truncate">
              {h?.lastScanAt ? `Last scan ${formatRelativeTime(h.lastScanAt)}` : "No scan yet"}
            </span>
          </div>
        </button>

        {/* Week-over-week change. */}
        <Link href="/monitor" className={`${TILE_BASE} flex flex-col text-left`}>
          <TileLabel icon={Activity}>This week</TileLabel>
          <div className="mt-4 flex h-9 items-baseline gap-1">
            {trend.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : weekDelta ? (
              <>
                <span
                  className={`tnum text-3xl font-semibold leading-none ${
                    weekDelta.delta > 0
                      ? "text-[var(--positive)]"
                      : weekDelta.delta < 0
                        ? "text-[var(--negative)]"
                        : "text-foreground"
                  }`}
                >
                  {weekDelta.delta > 0 ? "+" : ""}
                  {weekDelta.delta}
                </span>
                <span className="text-sm font-medium text-muted-foreground">%</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Not yet</span>
            )}
          </div>
          <div className="mt-1.5 flex h-5 items-center text-xs text-muted-foreground">
            {weekDelta ? (
              <span className="truncate">
                vs. prior week (<span className="tnum">{weekDelta.last.cited}</span> /{" "}
                <span className="tnum">{weekDelta.last.total}</span> cited)
              </span>
            ) : (
              <span className="truncate">Need ≥2 weekly scans to compare</span>
            )}
          </div>
        </Link>

        {/* Cited / total — the raw count. */}
        <Link href="/monitor" className={`${TILE_BASE} flex flex-col text-left`}>
          <TileLabel icon={Activity}>Cited checks</TileLabel>
          <div className="mt-4 flex h-9 items-baseline gap-1">
            {hero.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <span className="tnum text-3xl font-semibold leading-none text-foreground">
                  {h?.citedChecks ?? 0}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  / <span className="tnum">{h?.totalChecks ?? 0}</span>
                </span>
              </>
            )}
          </div>
          <div className="mt-1.5 flex h-5 items-center text-xs text-muted-foreground">
            <span className="truncate">
              <span className="tnum">{h?.citationRate ?? 0}</span>% citation rate
            </span>
          </div>
        </Link>
      </div>

      {/* 3. Worklist — the ranked, action-first Pulse. Replaces the old
          recommendations panel here; that panel stays the deep view at
          /diagnose. data-tour-id is a build-gate tour target and must
          stay this literal string. */}
      <div className="mt-6" data-tour-id="dashboard.recommendations">
        <Pulse />
      </div>

      {/* 4. Supplementary signals — two equal columns. */}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {/* Open issues → Diagnose. */}
        <Link href="/diagnose" className={TILE_BASE}>
          <TileLabel icon={Stethoscope}>Open issues</TileLabel>
          <div className="mt-3">
            {hero.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : issues.length > 0 ? (
              <ul className="space-y-1.5">
                {issues.map((i) => (
                  <li key={i} className="flex items-baseline gap-2 text-sm text-foreground">
                    <span className="text-[var(--negative)]" aria-hidden>
                      •
                    </span>
                    <span>{i}</span>
                  </li>
                ))}
                <li className="pt-1 text-xs text-muted-foreground">
                  Open Diagnose for hallucinations, signals &amp; crawler checks
                </li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {hasMeasured
                  ? "No blocking issues flagged. Open Diagnose for the full check."
                  : "Run a citation check, then issues surface here."}
              </p>
            )}
          </div>
        </Link>

        {/* Competitor pressure → Monitor competitors. */}
        <Link href="/monitor" className={TILE_BASE}>
          <TileLabel icon={Swords}>Competitor pressure</TileLabel>
          <div className="mt-3">
            {leaderboard.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : competitorsAhead.length > 0 ? (
              <ul className="space-y-1.5">
                {competitorsAhead.map((c) => (
                  <li
                    key={c.domain || c.name}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-foreground">{c.name}</span>
                    <span className="tnum text-muted-foreground">
                      {Math.round(c.shareOfVoice)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No competitor outranking you{rows.length === 0 ? " — none tracked yet" : ""}.
              </p>
            )}
          </div>
        </Link>
      </div>

      {/* 5. Cadence ribbon — slimmer chrome to signal "ambient", not a tile. */}
      <Link
        href="/monitor"
        className="group mt-3 flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-3 text-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {scanRunning ? (
          <>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
            <span className="flex-1 text-foreground">
              Citation scan running across AI platforms…
            </span>
          </>
        ) : (
          <>
            <Activity className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1 text-muted-foreground">
              Citations run automatically every week.
              {h?.lastScanAt
                ? ` Last scan ${formatRelativeTime(h.lastScanAt)}.`
                : " No scan yet for this brand."}
            </span>
          </>
        )}
        <span className="shrink-0 text-xs font-medium text-primary transition-colors group-hover:text-primary">
          Open Citations
        </span>
        <ArrowRight
          className="h-3.5 w-3.5 shrink-0 text-primary/70 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </div>
  );
}
