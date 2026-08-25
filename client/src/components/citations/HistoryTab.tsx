import { useMemo, useState } from "react";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import { usePromptHistory, usePromptRunDetails, type CitationRunEntry } from "@/hooks/usePrompts";
import { useInspector } from "@/components/AppShell";
import PromptDetail from "./PromptDetail";
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
import { StatusDot, type StatusDotTone } from "@/components/foundations";
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
import { chartTheme } from "@/lib/chartTheme";
import { PanelLabel } from "@/components/dashboard-panels/primitives";

type ChartFilter = "auto" | "manual" | "re-detect" | "all";
type DateFilter = "7" | "30" | "90" | "all";

// Trigger label map. It replaces a `capitalize` className that
// rendered "auto_onboarding" as "Auto_onboarding" and similar awkward
// transforms. Unknown triggers fall back to title-case for forward
// compatibility.
const TRIGGER_LABEL: Record<string, string> = {
  manual: "Manual",
  cron: "Auto",
  auto_onboarding: "Onboarding",
  // Earlier deployments may still have re-detect rows in the database. The
  // route that wrote them was removed but old rows remain.
  "re-detect": "Re-detect",
};

function triggerLabel(value: string): string {
  if (TRIGGER_LABEL[value]) return TRIGGER_LABEL[value];
  // Title-case the unknown value: "foo_bar" → "Foo Bar".
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Status is a run outcome, not a badge category.
// per the app's rule (see foundations/StatusDot.tsx), status renders as a
// dot + plain text, never a filled/tinted chip. Green is reserved for
// actions, so "succeeded" uses the neutral check glyph, not a green fill.
const STATUS_META: Record<string, { tone: StatusDotTone; label: string }> = {
  succeeded: { tone: "success", label: "Succeeded" },
  partial: { tone: "warn", label: "Partial" },
  failed: { tone: "fail", label: "Failed" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  running: { tone: "pending", label: "Running" },
  pending: { tone: "pending", label: "Pending" },
};

type HistoryTabProps = {
  selectedBrandId: string;
};

export default function HistoryTab({ selectedBrandId }: HistoryTabProps) {
  // Poll history every six seconds while a citation run is live so a new
  // row appears as soon as it's created, and progress reflects in real time.
  const { hasActive } = useActiveCitationRuns(selectedBrandId);
  const { data: historyData } = usePromptHistory(selectedBrandId, {
    refetchInterval: hasActive ? 6_000 : false,
  });
  const runHistory = historyData?.data || [];

  // Phase 3: derive highlight terms from the selected brand so the
  // PlatformResultCard inside each expanded run highlights brand mentions.
  const { selectedBrand } = useBrandSelection();
  const inspector = useInspector();
  const highlightTerms = selectedBrand
    ? [selectedBrand.name, ...(selectedBrand.nameVariations ?? [])].filter(Boolean)
    : [];

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  // Filter dropdowns use "auto" as the default chart view so the trend
  // line reflects scheduled runs (apples-to-apples) rather than ad-hoc
  // manual debug runs. Date filter trims the visible window.
  const [chartFilter, setChartFilter] = useState<ChartFilter>("auto");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  // Apply date filter first - affects both the chart and the row list.
  const filteredHistory = useMemo(() => {
    if (dateFilter === "all") return runHistory;
    const days = Number(dateFilter);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return runHistory.filter((r) => new Date(r.startedAt).getTime() >= cutoff);
  }, [runHistory, dateFilter]);

  // The server returns the full list, so the client stores pagination state.
  // paginate client-side - 20 is a readable first page; "Load more" reveals
  // the next batch rather than dropping the user into an overwhelming wall
  // of rows on brands with years of history.
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleRuns = filteredHistory.slice(0, visibleCount);
  const hasMore = filteredHistory.length > visibleCount;

  // Cache drill-down data. Previously each accordion open fetched
  // run details even after closing/reopening. We cache per runId in
  // component state - TanStack already caches the latest fetch, but
  // switching between runs on the same panel was thrashing the cache key.
  // Limit the LRU cache to ten entries. Detail blobs can be about 100KB each.
  // (full LLM responses across 50 platform calls); a long History
  // session would otherwise tie up tens of MB of stale data until brand
  // switch unmounts the component. Object.keys preserves insertion
  // order in modern JS, so the first key is always the oldest.
  const DRILLDOWN_CACHE_MAX = 10;
  const [drilldownCache, setDrilldownCache] = useState<
    Record<string, { byPrompt: Array<{ prompt: string; platforms: PlatformResult[] }> }>
  >({});

  // Drill-down for a specific run. Cache hit short-circuits the fetch.
  const { data: runDetailData, isLoading: runDetailLoading } = usePromptRunDetails(
    selectedBrandId,
    expandedRunId,
    { enabled: !!expandedRunId && !drilldownCache[expandedRunId ?? ""] },
  );
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
        <div className="border-b border-vc-default pb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PanelLabel>
                <span className="inline-flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Citation Rate Over Time
                </span>
              </PanelLabel>
              <p className="mt-1 text-caption text-vc-tertiary">
                {filteredHistory.length} runs in window. Failed and re-detect runs are excluded from
                the line. Times shown in your local timezone.
              </p>
            </div>
            {/* Filter dropdowns use "auto" as the default, for scheduled
                runs only) so the trend is apples-to-apples. */}
            <div className="flex gap-2 shrink-0">
              <Select value={chartFilter} onValueChange={(v) => setChartFilter(v as ChartFilter)}>
                <SelectTrigger className="w-[130px] h-8 text-caption">
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
                <SelectTrigger className="w-[110px] h-8 text-caption">
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
          <div className="mt-3">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  // Chart only successful runs and
                  // matching the trigger filter. Failed runs distort the
                  // line; re-detect runs are noisy because they don't
                  // represent fresh AI calls. Earlier rows have no
                  // status - treat them as succeeded (the previous
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
                      <stop
                        offset="5%"
                        stopColor={chartTheme.series.visibility}
                        stopOpacity={0.2}
                      />
                      <stop offset="95%" stopColor={chartTheme.series.visibility} stopOpacity={0} />
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
                        <div className="bg-popover border border-border rounded-lg shadow-md p-3 text-caption">
                          <p className="font-medium">{d.fullDate}</p>
                          <p className="text-foreground mt-1">
                            Citation Rate: <span className="font-semibold">{d.citationRate}%</span>
                          </p>
                          <p className="text-muted-foreground">
                            {d.totalCited} / {d.totalChecks} cited
                          </p>
                          <p className="text-caption text-muted-foreground mt-1">
                            {triggerLabel(d.triggeredBy)} run
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="citationRate"
                    stroke={chartTheme.series.visibility}
                    strokeWidth={2}
                    fill="url(#citationGradient)"
                    dot={{ r: 4, fill: chartTheme.series.visibility, strokeWidth: 0 }}
                    activeDot={{
                      r: 6,
                      fill: chartTheme.series.visibility,
                      strokeWidth: 2,
                      stroke: "var(--background)",
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Run history as expandable rows */}
      <div>
        <PanelLabel>
          <span className="inline-flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Run History
          </span>
        </PanelLabel>
        <div className="mt-3">
          <TooltipProvider delayDuration={150}>
            <div>
              {/* List rows: hairline separation, no radius, hover highlight -
                  replaces the previous space-y-2 rounded-card rows. */}
              {visibleRuns.map((run, i) => {
                const prev = filteredHistory[i + 1];
                const delta = prev ? run.citationRate - prev.citationRate : 0;
                const isExpanded = expandedRunId === run.id;
                // Derive status. Earlier rows without a status field
                // are treated as succeeded so we don't visually punish
                // historical runs.
                const status = run.status ?? "succeeded";
                const statusMeta = STATUS_META[status] ?? STATUS_META.succeeded;

                return (
                  <div key={run.id} className="border-b border-vc-default last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                      className="w-full flex items-center gap-3 px-2 py-2.5 text-left hover:bg-vc-muted/50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-vc-hover shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-vc-hover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-caption">
                          {format(new Date(run.startedAt), "MMM d, yyyy")}
                        </span>
                        <span className="text-caption text-vc-tertiary ml-2">
                          {format(new Date(run.startedAt), "h:mm a")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-caption font-medium tabular-nums">
                          {run.citationRate}%
                        </span>
                        {delta !== 0 && (
                          <span
                            className={`text-data font-mono tabular-nums ${delta > 0 ? "text-positive" : "text-destructive"}`}
                          >
                            {delta > 0 ? `+${delta}` : delta}%
                          </span>
                        )}
                        <span className="text-caption text-vc-tertiary tabular-nums">
                          {run.totalCited}/{run.totalChecks}
                        </span>
                        <Badge variant="outline" className="text-caption">
                          {triggerLabel(run.triggeredBy)}
                        </Badge>
                        {/* The status badge shows succeeded, partial, failed, or cancelled.
                          Failed shows error_message in tooltip. */}
                        {(status !== "succeeded" || run.errorMessage) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex items-center gap-1.5 text-caption text-vc-tertiary"
                                data-testid={`status-badge-${run.id}`}
                              >
                                <StatusDot tone={statusMeta.tone} aria-label={statusMeta.label} />
                                {statusMeta.label}
                              </span>
                            </TooltipTrigger>
                            {run.errorMessage && (
                              <TooltipContent className="max-w-xs">
                                {run.errorMessage}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        )}
                        {/* The disagreement badge appears when the matcher
                          and analyzer LLM disagreed on >5% of checks. Above
                          5% suggests the brand needs more name variations. */}
                        {(run.disagreementCount ?? 0) > 0 &&
                          run.totalChecks > 0 &&
                          run.disagreementCount! / run.totalChecks >= 0.05 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex items-center text-warning"
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
                      <div className="border-t border-vc-default px-2 py-4 bg-vc-muted/20">
                        {(() => {
                          // Render cached data first. Reopening a
                          // previously-fetched run is instant.
                          const cached = drilldownCache[run.id];
                          const detail = cached ?? runDetailData?.data;
                          if (!cached && runDetailLoading) {
                            return (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-vc-hover" />
                                <span className="ml-2 text-caption text-vc-tertiary">
                                  Loading run details...
                                </span>
                              </div>
                            );
                          }
                          if (!detail?.byPrompt) {
                            return (
                              <p className="text-caption text-vc-tertiary text-center py-4">
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
                                        <span className="flex-1 truncate text-caption">
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
                                      <div className="flex justify-end mb-2">
                                        <button
                                          type="button"
                                          className="text-caption text-primary hover:underline"
                                          onClick={() =>
                                            inspector.open({
                                              title: row.prompt,
                                              body: (
                                                <PromptDetail
                                                  promptText={row.prompt}
                                                  brandId={selectedBrandId}
                                                />
                                              ),
                                            })
                                          }
                                          data-testid={`button-open-prompt-history-run-${run.id}-${j}`}
                                        >
                                          View full history
                                        </button>
                                      </div>
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
                className="text-caption text-primary hover:underline"
                data-testid="button-load-more-runs"
              >
                Load {Math.min(PAGE_SIZE, filteredHistory.length - visibleCount)} more
                {" · "}
                <span className="text-vc-tertiary">
                  showing {visibleCount} of {filteredHistory.length}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  ) : (
    <div className="py-12 text-center">
      <Calendar className="h-12 w-12 mx-auto text-vc-hover mb-3" />
      <p className="text-vc-tertiary">
        No run history yet. Run a citation check to start tracking trends.
      </p>
    </div>
  );
}
