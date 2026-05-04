import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp,
  Loader2,
  ChevronDown,
  ChevronRight,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { PlatformResultCard, type PlatformResult } from "./PlatformResultCard";
import { useBrandSelection } from "@/hooks/use-brand-selection";

type CitationRunEntry = {
  id: string;
  brandId: string;
  totalChecks: number;
  totalCited: number;
  citationRate: number;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  platformBreakdown: Record<string, { cited: number; checks: number; rate: number }> | null;
  // Wave 8/9: lifecycle + observability columns added by migrations
  // 0034 + 0036. Older rows (pre-migration) come back without them.
  status?: "pending" | "running" | "succeeded" | "failed" | "partial" | "cancelled";
  errorMessage?: string | null;
  disagreementCount?: number;
};

type ChartFilter = "auto" | "manual" | "re-detect" | "all";
type DateFilter = "7" | "30" | "90" | "all";

// Wave 9.2: trigger label map. Replaces a `capitalize` className that
// rendered "auto_onboarding" as "Auto_onboarding" and similar awkward
// transforms. Unknown triggers fall back to title-case for forward
// compatibility.
const TRIGGER_LABEL: Record<string, string> = {
  manual: "Manual",
  cron: "Auto",
  auto_onboarding: "Onboarding",
  // Pre-Wave-9.1 deployments may still have re-detect rows in DB; the
  // route that wrote them was removed but old rows remain.
  "re-detect": "Re-detect",
};

function triggerLabel(value: string): string {
  if (TRIGGER_LABEL[value]) return TRIGGER_LABEL[value];
  // Title-case the unknown value: "foo_bar" → "Foo Bar".
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_BADGE_VARIANT: Record<string, { className: string; label: string }> = {
  succeeded: {
    className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    label: "Succeeded",
  },
  partial: {
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    label: "Partial",
  },
  failed: {
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    label: "Failed",
  },
  cancelled: { className: "bg-muted text-muted-foreground border-border", label: "Cancelled" },
  running: {
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    label: "Running",
  },
  pending: {
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    label: "Pending",
  },
};

type HistoryTabProps = {
  selectedBrandId: string;
};

export default function HistoryTab({ selectedBrandId }: HistoryTabProps) {
  // Wave 9: poll history every 6s while a citation run is live so a new
  // row appears as soon as it's created, and progress reflects in real time.
  const { hasActive } = useActiveCitationRuns(selectedBrandId);
  const { data: historyData } = useQuery<{ success: boolean; data: CitationRunEntry[] }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}/history`],
    enabled: !!selectedBrandId,
    refetchInterval: hasActive ? 6_000 : false,
  });
  const runHistory = historyData?.data || [];

  // Phase 3: derive highlight terms from the selected brand so the
  // PlatformResultCard inside each expanded run highlights brand mentions.
  const { selectedBrand } = useBrandSelection();
  const highlightTerms = selectedBrand
    ? [selectedBrand.name, ...(selectedBrand.nameVariations ?? [])].filter(Boolean)
    : [];

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  // Wave 9: filter dropdowns. Default chart view is "auto" so the trend
  // line reflects scheduled runs (apples-to-apples) rather than ad-hoc
  // manual debug runs. Date filter trims the visible window.
  const [chartFilter, setChartFilter] = useState<ChartFilter>("auto");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  // Apply date filter first — affects both the chart and the row list.
  const filteredHistory = useMemo(() => {
    if (dateFilter === "all") return runHistory;
    const days = Number(dateFilter);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return runHistory.filter((r) => new Date(r.startedAt).getTime() >= cutoff);
  }, [runHistory, dateFilter]);

  // Wave 6.7: pagination state. Server already returns the full list, so we
  // paginate client-side — 20 is a readable first page; "Load more" reveals
  // the next batch rather than dropping the user into an overwhelming wall
  // of rows on brands with years of history.
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleRuns = filteredHistory.slice(0, visibleCount);
  const hasMore = filteredHistory.length > visibleCount;

  // Wave 9: drill-down cache. Previously every accordion-open re-fetched
  // run details even after closing/reopening. We cache per runId in
  // component state — TanStack already caches the latest fetch, but
  // switching between runs on the same panel was thrashing the cache key.
  // Wave 9.2: LRU-capped at 10 entries. Detail blobs can be ~100KB each
  // (full LLM responses across 50 platform calls); a long History
  // session would otherwise tie up tens of MB of stale data until brand
  // switch unmounts the component. Object.keys preserves insertion
  // order in modern JS, so the first key is always the oldest.
  const DRILLDOWN_CACHE_MAX = 10;
  const [drilldownCache, setDrilldownCache] = useState<
    Record<string, { byPrompt: Array<{ prompt: string; platforms: PlatformResult[] }> }>
  >({});

  // Drill-down for a specific run. Cache hit short-circuits the fetch.
  const { data: runDetailData, isLoading: runDetailLoading } = useQuery<{
    success: boolean;
    data: { byPrompt: Array<{ prompt: string; platforms: PlatformResult[] }> };
  }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}/run/${expandedRunId}/details`],
    enabled: !!expandedRunId && !drilldownCache[expandedRunId ?? ""],
  });
  // Populate cache once a fetched detail arrives so subsequent re-opens
  // are instant. Eviction: drop oldest key(s) when over the cap.
  if (expandedRunId && runDetailData?.data && !drilldownCache[expandedRunId]) {
    setDrilldownCache((prev) => {
      const next = { ...prev, [expandedRunId]: runDetailData.data };
      const keys = Object.keys(next);
      if (keys.length > DRILLDOWN_CACHE_MAX) {
        for (const k of keys.slice(0, keys.length - DRILLDOWN_CACHE_MAX)) {
          delete next[k];
        }
      }
      return next;
    });
  }

  return runHistory.length > 0 ? (
    <>
      {/* Citation rate trend chart */}
      {filteredHistory.length >= 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Citation Rate Over Time
                </CardTitle>
                <CardDescription>
                  {filteredHistory.length} runs in window. Failed and re-detect runs are excluded
                  from the line. Times shown in your local timezone.
                </CardDescription>
              </div>
              {/* Wave 9: filter dropdowns. Default = "auto" (scheduled
                  runs only) so the trend is apples-to-apples. */}
              <div className="flex gap-2 shrink-0">
                <Select value={chartFilter} onValueChange={(v) => setChartFilter(v as ChartFilter)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Scheduled only</SelectItem>
                    <SelectItem value="manual">Manual only</SelectItem>
                    <SelectItem value="re-detect">Re-detect only</SelectItem>
                    <SelectItem value="all">All triggers</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                  <SelectTrigger className="w-[110px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  // Wave 9: chart only successful runs (status filter) AND
                  // matching the trigger filter. Failed runs distort the
                  // line; re-detect runs are noisy because they don't
                  // represent fresh AI calls. Pre-Wave-8 rows have no
                  // status — treat them as succeeded (the previous
                  // behavior).
                  data={filteredHistory
                    .filter((r) => r.completedAt)
                    .filter((r) => (r.status ? r.status === "succeeded" : true))
                    .filter((r) => {
                      if (chartFilter === "all") return true;
                      if (chartFilter === "auto")
                        return r.triggeredBy === "cron" || r.triggeredBy === "auto_onboarding";
                      if (chartFilter === "manual") return r.triggeredBy === "manual";
                      if (chartFilter === "re-detect") return r.triggeredBy === "re-detect";
                      return true;
                    })
                    .slice()
                    .reverse()
                    .map((r) => ({
                      date: format(new Date(r.startedAt), "MMM d"),
                      fullDate: format(new Date(r.startedAt), "MMM d, yyyy h:mm a"),
                      citationRate: r.citationRate,
                      totalCited: r.totalCited,
                      totalChecks: r.totalChecks,
                      triggeredBy: r.triggeredBy,
                    }))}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="citationGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                    className="text-muted-foreground"
                  />
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg shadow-md p-3 text-sm">
                          <p className="font-medium">{d.fullDate}</p>
                          <p className="text-foreground mt-1">
                            Citation Rate: <span className="font-bold">{d.citationRate}%</span>
                          </p>
                          <p className="text-muted-foreground">
                            {d.totalCited} / {d.totalChecks} cited
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {triggerLabel(d.triggeredBy)} run
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="citationRate"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#citationGradient)"
                    dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                    activeDot={{
                      r: 6,
                      fill: "hsl(var(--primary))",
                      strokeWidth: 2,
                      stroke: "hsl(var(--background))",
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Run history as expandable rows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Run History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider delayDuration={150}>
            <div className="space-y-2">
              {visibleRuns.map((run, i) => {
                const prev = filteredHistory[i + 1];
                const delta = prev ? run.citationRate - prev.citationRate : 0;
                const isExpanded = expandedRunId === run.id;
                // Wave 9: derive status. Pre-Wave-8 rows (no status field)
                // are treated as succeeded so we don't visually punish
                // historical runs.
                const status = run.status ?? "succeeded";
                const statusMeta = STATUS_BADGE_VARIANT[status] ?? STATUS_BADGE_VARIANT.succeeded;

                return (
                  <div key={run.id} className="border border-border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">
                          {format(new Date(run.startedAt), "MMM d, yyyy")}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {format(new Date(run.startedAt), "h:mm a")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-medium">{run.citationRate}%</span>
                        {delta !== 0 && (
                          <span
                            className={`text-xs ${delta > 0 ? "text-green-600" : "text-red-500"}`}
                          >
                            {delta > 0 ? `+${delta}` : delta}%
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {run.totalCited}/{run.totalChecks}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {triggerLabel(run.triggeredBy)}
                        </Badge>
                        {/* Wave 9: status badge — succeeded/partial/failed/cancelled.
                          Failed shows error_message in tooltip. */}
                        {(status !== "succeeded" || run.errorMessage) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                className={`text-xs border ${statusMeta.className}`}
                                variant="outline"
                                data-testid={`status-badge-${run.id}`}
                              >
                                {statusMeta.label}
                              </Badge>
                            </TooltipTrigger>
                            {run.errorMessage && (
                              <TooltipContent className="max-w-xs">
                                {run.errorMessage}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        )}
                        {/* Wave 9: disagreement badge — surface when matcher
                          and analyzer LLM disagreed on >5% of checks. Above
                          5% suggests the brand needs more name variations. */}
                        {(run.disagreementCount ?? 0) > 0 &&
                          run.totalChecks > 0 &&
                          run.disagreementCount! / run.totalChecks >= 0.05 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex items-center text-amber-600 dark:text-amber-500"
                                  data-testid={`disagreement-${run.id}`}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                Matcher and analyzer disagreed on {run.disagreementCount} of{" "}
                                {run.totalChecks} checks. Add the missing surface forms to your
                                brand&apos;s name variations.
                              </TooltipContent>
                            </Tooltip>
                          )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border px-4 py-4 bg-muted/20">
                        {(() => {
                          // Wave 9: cache-first render — re-opening a
                          // previously-fetched run is instant.
                          const cached = drilldownCache[run.id];
                          const detail = cached ?? runDetailData?.data;
                          if (!cached && runDetailLoading) {
                            return (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">
                                  Loading run details...
                                </span>
                              </div>
                            );
                          }
                          if (!detail?.byPrompt) {
                            return (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No detail data available for this run.
                              </p>
                            );
                          }
                          return (
                            <Accordion type="single" collapsible className="w-full">
                              {detail.byPrompt.map((row, j) => {
                                const citedCount = row.platforms.filter((p) => p.isCited).length;
                                return (
                                  <AccordionItem key={j} value={String(j)}>
                                    <AccordionTrigger className="hover:no-underline">
                                      <div className="flex items-center gap-3 flex-1 text-left">
                                        <Badge variant="outline" className="shrink-0">
                                          {j + 1}
                                        </Badge>
                                        <span className="flex-1 truncate text-sm">
                                          {row.prompt}
                                        </span>
                                        <Badge
                                          variant={citedCount > 0 ? "default" : "outline"}
                                          className="shrink-0"
                                        >
                                          {citedCount}/{row.platforms.length}
                                        </Badge>
                                      </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                      <div className="space-y-3">
                                        {row.platforms.map((plat, k) => (
                                          <PlatformResultCard
                                            key={`${plat.platform}-${k}`}
                                            result={plat}
                                            highlightTerms={highlightTerms}
                                          />
                                        ))}
                                      </div>
                                    </AccordionContent>
                                  </AccordionItem>
                                );
                              })}
                            </Accordion>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="text-sm text-primary hover:underline"
                data-testid="button-load-more-runs"
              >
                Load {Math.min(PAGE_SIZE, filteredHistory.length - visibleCount)} more
                {" · "}
                <span className="text-muted-foreground">
                  showing {visibleCount} of {filteredHistory.length}
                </span>
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  ) : (
    <Card>
      <CardContent className="py-12 text-center">
        <Calendar className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground">
          No run history yet. Run a citation check to start tracking trends.
        </p>
      </CardContent>
    </Card>
  );
}
