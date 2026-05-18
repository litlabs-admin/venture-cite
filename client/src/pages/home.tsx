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
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useInspector } from "@/components/AppShell";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import VisibilityGauge from "@/components/dashboard/VisibilityGauge";
import Pulse from "@/components/dashboard/Pulse";

// ─── Command Center ──────────────────────────────────────────────────────────
// The single pane that answers: where do I stand, what changed, what's wrong,
// what do I do, where's my proof. It is a *router*, not a report — every
// widget links into one spine stage. The full analytics report lives at
// /monitor?tab=overview (monitor-overview.tsx). Only real /api/dashboard/*
// data is shown here; no revenue/traffic/industry-average guesswork.

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

function Widget({
  title,
  to,
  icon: Icon,
  children,
}: {
  title: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link href={to}>
      <Card className="group h-full cursor-pointer border-border/60 transition-colors hover:border-primary/40 hover:bg-accent/30">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {title}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <div className="flex-1">{children}</div>
        </CardContent>
      </Card>
    </Link>
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

// Inspector body for the AI Visibility Score. Real, measured signals only
// (the same data the hero already fetched) — honest by construction, no
// estimates.
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
    <div className="space-y-4">
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
        href="/monitor?tab=overview"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Open full breakdown in Monitor
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
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
        out.push(`${competitorsAhead.length} competitor(s) outranking you`);
    }
    return out;
  }, [h, competitorsAhead]);

  if (brandsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
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
    <div className="space-y-4 animate-fade-in-up motion-reduce:animate-none">
      {/* 1. Visibility (hero stat) — selecting it opens the inspector. */}
      <div className="grid gap-4 md:grid-cols-3" data-tour-id="dashboard.stats">
        <button
          type="button"
          onClick={() =>
            inspector.open({ title: "Visibility drivers", body: <VisibilityDrivers h={h} /> })
          }
          className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:col-span-1"
        >
          <Card className="group h-full cursor-pointer border-border/60 transition-colors hover:border-primary/40">
            <CardContent className="flex h-full flex-col items-center justify-center gap-2 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                AI Visibility Score
              </p>
              {hero.isLoading ? (
                <Skeleton className="h-[120px] w-[120px] rounded-full" />
              ) : (
                <VisibilityGauge score={h?.visibilityScore ?? 0} size={120} />
              )}
              {h && h.visibilityDelta !== null && h.visibilityDelta !== 0 ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    h.visibilityDelta > 0
                      ? "bg-chart-4/10 text-chart-4"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {h.visibilityDelta > 0 ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {h.visibilityDelta > 0 ? "+" : ""}
                  <span className="tnum">{h.visibilityDelta}</span> pts
                </span>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Last scan: {formatRelativeTime(h?.lastScanAt ?? null)}
              </p>
              <span className="mt-1 text-[11px] font-medium text-primary">View drivers</span>
            </CardContent>
          </Card>
        </button>

        {/* 2. What changed this week */}
        <Widget title="What changed this week" to="/monitor?tab=citations" icon={Activity}>
          {trend.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : weekDelta ? (
            <div>
              <div
                className={`text-3xl font-bold ${
                  weekDelta.delta > 0
                    ? "text-chart-4"
                    : weekDelta.delta < 0
                      ? "text-destructive"
                      : "text-foreground"
                }`}
              >
                {weekDelta.delta > 0 ? "+" : ""}
                {weekDelta.delta}%
              </div>
              <p className="text-xs text-muted-foreground">
                citation rate vs. the prior week ({weekDelta.last.cited}/{weekDelta.last.total}{" "}
                cited)
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough run history yet — check back after your next weekly scan.
            </p>
          )}
        </Widget>

        {/* 4. Cited / Total */}
        <Widget title="Cited / Total Checks" to="/monitor?tab=citations" icon={Activity}>
          {hero.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div>
              <div className="text-3xl font-bold text-foreground">
                {h?.citedChecks ?? 0}
                <span className="text-lg font-semibold text-muted-foreground">
                  {" "}
                  / {h?.totalChecks ?? 0}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{h?.citationRate ?? 0}% citation rate</p>
            </div>
          )}
        </Widget>
      </div>

      {/* 3. Worklist — the ranked, action-first Pulse. Replaces the old
          recommendations panel here; that panel stays the deep view at
          /diagnose?tab=issues. The data-tour-id is a build-gate tour target
          (scripts/verify-tour-targets.ts) and must stay this literal string. */}
      <div data-tour-id="dashboard.recommendations">
        <Pulse />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* 5. Open issues → Diagnose */}
        <Widget title="Open Issues" to="/diagnose" icon={Stethoscope}>
          {hero.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : issues.length > 0 ? (
            <ul className="space-y-1">
              {issues.map((i) => (
                <li key={i} className="text-sm text-destructive">
                  • {i}
                </li>
              ))}
              <li className="pt-1 text-xs text-muted-foreground">
                Open Diagnose for hallucinations, signals & crawler checks →
              </li>
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {h && h.totalChecks > 0
                ? "No blocking issues flagged. Open Diagnose for the full check."
                : "Run a citation check, then issues surface here."}
            </p>
          )}
        </Widget>

        {/* 6. Competitor pressure → Monitor competitors */}
        <Widget title="Competitor Pressure" to="/monitor?tab=competitors" icon={Swords}>
          {leaderboard.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : competitorsAhead.length > 0 ? (
            <ul className="space-y-1">
              {competitorsAhead.map((c) => (
                <li key={c.domain || c.name} className="flex items-center justify-between text-sm">
                  <span className="truncate text-foreground">{c.name}</span>
                  <span className="font-medium text-muted-foreground">
                    {Math.round(c.shareOfVoice)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No competitor is outranking you{rows.length === 0 ? " — none tracked yet" : ""}.
            </p>
          )}
        </Widget>
      </div>

      {/* Run / cadence strip */}
      <Link href="/monitor?tab=citations">
        <Card className="cursor-pointer border-border/60 transition-colors hover:border-primary/40">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            {scanRunning ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                <span className="flex-1 text-foreground">
                  Citation scan running across AI platforms…
                </span>
              </>
            ) : (
              <>
                <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-muted-foreground">
                  Citations run automatically every week.{" "}
                  {h?.lastScanAt
                    ? `Last scan ${formatRelativeTime(h.lastScanAt)}.`
                    : "No scan yet for this brand."}
                </span>
              </>
            )}
            <span className="shrink-0 font-medium text-primary">Open Citations →</span>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
