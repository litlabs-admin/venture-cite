import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { formatRelativeTime } from "@/lib/formatRelativeTime";

// ─── Report ──────────────────────────────────────────────────────────────────
// The "prove the impact" surface. Opens with one plain-language conclusion
// and the single canonical number, then the trend and the per-engine proof.
// Every figure is measured (real /api/dashboard/* + geo-analytics data);
// there is deliberately NO revenue / traffic / ROI / attribution here
// (PRODUCT.md anti-reference). Print-clean: window.print() yields a tidy
// one-pager (AppShell chrome is print:hidden; index.css forces light).

interface Hero {
  visibilityScore: number;
  visibilityDelta: number | null;
  citedChecks: number;
  totalChecks: number;
  citationRate: number;
  lastScanAt: string | null;
}
interface Week {
  weekStart: string;
  cited: number;
  total: number;
  citationRate: number;
}
interface PlatformRow {
  mentions: number;
  citations: number;
  avgRank: number | null;
  visibilityScore: number;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 480;
  const h = 64;
  const max = Math.max(100, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastX = w;
  const lastY = h - ((values[values.length - 1] - min) / span) * h;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-16 w-full"
      role="img"
      aria-label="Weekly citation-rate trend"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--brand-accent)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={3.5} fill="var(--brand-accent)" />
    </svg>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const cls =
    delta > 0
      ? "bg-chart-4/10 text-chart-4"
      : delta < 0
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon className="h-3 w-3" />
      <span className="tnum">
        {delta > 0 ? "+" : ""}
        {delta}
      </span>{" "}
      pts
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export default function Report() {
  const { brands, selectedBrand, selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const enabled = !!selectedBrandId;

  const heroQ = useQuery<{ success: boolean; data: Hero }>({
    queryKey: [`/api/dashboard/hero/${selectedBrandId}`],
    enabled,
  });
  const trendQ = useQuery<{ success: boolean; data: { weeks: Week[] } }>({
    queryKey: [`/api/dashboard/citation-trend/${selectedBrandId}`],
    enabled,
  });
  const geoQ = useQuery<{
    success: boolean;
    data: { platformBreakdown: Record<string, PlatformRow> };
  }>({
    queryKey: [`/api/geo-analytics/${selectedBrandId}`],
    enabled,
  });

  const h = heroQ.data?.data;
  const weeks = useMemo(
    () => (trendQ.data?.data?.weeks ?? []).filter((w) => w.total > 0),
    [trendQ.data],
  );
  const engines = useMemo(
    () => Object.entries(geoQ.data?.data?.platformBreakdown ?? {}),
    [geoQ.data],
  );
  const enoughTrend = weeks.length >= 2;
  const brandName = selectedBrand?.name ?? "This brand";

  if (brandsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <EmptyState
        title="No brand to report on yet"
        description="Create a brand and run a citation check, then this report shows your measured AI-visibility proof."
        action={{ label: "Create your first brand", href: "/setup?tab=brands", onClick: () => {} }}
      />
    );
  }

  const anyLoading = heroQ.isLoading || trendQ.isLoading || geoQ.isLoading;
  const anyError = heroQ.isError || trendQ.isError || geoQ.isError;

  if (anyError) {
    return (
      <ErrorState
        title="Couldn't load the report"
        onRetry={() => {
          heroQ.refetch();
          trendQ.refetch();
          geoQ.refetch();
        }}
        isRetrying={heroQ.isRefetching || trendQ.isRefetching || geoQ.isRefetching}
      />
    );
  }

  const score = h?.visibilityScore ?? 0;
  const delta = h?.visibilityDelta ?? null;
  const scanned = !!h && h.totalChecks > 0;

  const conclusion = !scanned
    ? `${brandName} hasn't completed a citation scan yet. Run a check and this report fills in with measured proof.`
    : delta === null || !enoughTrend
      ? `${brandName}'s AI-visibility score is ${score} out of 100. A change figure appears after the second weekly scan.`
      : delta === 0
        ? `${brandName}'s AI-visibility score is ${score} out of 100, unchanged since the last scan.`
        : `${brandName}'s AI-visibility score is ${score} out of 100, ${
            delta > 0 ? "up" : "down"
          } ${Math.abs(delta)} point${Math.abs(delta) === 1 ? "" : "s"} since the last scan.`;

  return (
    <div className="reveal in-view mx-auto max-w-3xl space-y-10 py-2">
      {/* Print action — not part of the printed page. */}
      <div className="flex justify-end print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      {/* 1. Conclusion + the one number. */}
      <section>
        <p className="max-w-[60ch] text-lg leading-snug text-foreground">{conclusion}</p>
        {scanned && (
          <div className="mt-5 flex items-end gap-4">
            <span className="tnum text-5xl font-semibold leading-none text-foreground">
              {score}
            </span>
            <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
            {delta !== null && enoughTrend ? (
              <span className="pb-1.5">{<DeltaChip delta={delta} />}</span>
            ) : null}
          </div>
        )}
        {h?.lastScanAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            Last scan {formatRelativeTime(h.lastScanAt)}.
            {scanned ? ` ${h.citedChecks}/${h.totalChecks} checks cited (${h.citationRate}%).` : ""}
          </p>
        )}
      </section>

      {/* 2. Citation-rate trend. */}
      <section>
        <SectionLabel>Citation-rate trend</SectionLabel>
        {anyLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : enoughTrend ? (
          <div className="space-y-3">
            <Sparkline values={weeks.map((w) => w.citationRate)} />
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-4">
              {weeks.slice(-8).map((w) => (
                <div key={w.weekStart} className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(w.weekStart).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="tnum text-sm text-foreground">{w.citationRate}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not enough scan history yet. The trend appears once there are at least two weekly scans
            with checks.
          </p>
        )}
      </section>

      {/* 3. By engine. */}
      <section>
        <SectionLabel>By engine</SectionLabel>
        {anyLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : engines.length > 0 ? (
          <div>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Engine</span>
              <span className="text-right">Cited</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Score</span>
            </div>
            {engines.map(([name, p]) => {
              const rate = p.mentions > 0 ? Math.round((p.citations / p.mentions) * 100) : 0;
              return (
                <div
                  key={name}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-6 border-b border-border/60 py-2 text-sm last:border-0"
                >
                  <span className="text-foreground">{name}</span>
                  <span className="tnum text-right text-foreground">
                    {p.citations}/{p.mentions}
                  </span>
                  <span className="tnum text-right text-foreground">{rate}%</span>
                  <span className="tnum text-right text-foreground">{p.visibilityScore}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No per-engine data yet. It appears after the first completed citation check.
          </p>
        )}
      </section>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        VentureCite, generated{" "}
        {new Date().toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        . Every figure here is measured from real AI-engine citation checks; no estimates.
      </p>
    </div>
  );
}
