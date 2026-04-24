import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TrendingUp, Loader2, ChevronDown, ChevronRight, Calendar } from "lucide-react";
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
};

type HistoryTabProps = {
  selectedBrandId: string;
};

export default function HistoryTab({ selectedBrandId }: HistoryTabProps) {
  const { data: historyData } = useQuery<{ success: boolean; data: CitationRunEntry[] }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}/history`],
    enabled: !!selectedBrandId,
  });
  const runHistory = historyData?.data || [];

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  // Wave 6.7: pagination state. Server already returns the full list, so we
  // paginate client-side — 20 is a readable first page; "Load more" reveals
  // the next batch rather than dropping the user into an overwhelming wall
  // of rows on brands with years of history.
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleRuns = runHistory.slice(0, visibleCount);
  const hasMore = runHistory.length > visibleCount;

  // Drill-down for a specific run
  const { data: runDetailData, isLoading: runDetailLoading } = useQuery<{
    success: boolean;
    data: { byPrompt: Array<{ prompt: string; platforms: PlatformResult[] }> };
  }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}/run/${expandedRunId}/details`],
    enabled: !!expandedRunId,
  });

  return runHistory.length > 0 ? (
    <>
      {/* Citation rate trend chart */}
      {runHistory.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Citation Rate Over Time
            </CardTitle>
            <CardDescription>
              {runHistory.length} runs tracked.
              {runHistory.length >= 2 &&
                (() => {
                  const newest = runHistory[0];
                  const oldest = runHistory[runHistory.length - 1];
                  const delta = newest.citationRate - oldest.citationRate;
                  if (delta > 0) return ` Up ${delta}% since first check.`;
                  if (delta < 0) return ` Down ${Math.abs(delta)}% since first check.`;
                  return " Stable since first check.";
                })()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={[...runHistory]
                    .filter((r) => r.completedAt)
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
                          <p className="text-xs text-muted-foreground mt-1 capitalize">
                            {d.triggeredBy} run
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
          <div className="space-y-2">
            {visibleRuns.map((run, i) => {
              const prev = runHistory[i + 1];
              const delta = prev ? run.citationRate - prev.citationRate : 0;
              const isExpanded = expandedRunId === run.id;

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
                      <Badge variant="outline" className="text-xs capitalize">
                        {run.triggeredBy}
                      </Badge>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 py-4 bg-muted/20">
                      {runDetailLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <span className="ml-2 text-sm text-muted-foreground">
                            Loading run details...
                          </span>
                        </div>
                      ) : runDetailData?.data?.byPrompt ? (
                        <Accordion type="single" collapsible className="w-full">
                          {runDetailData.data.byPrompt.map((row, j) => {
                            const citedCount = row.platforms.filter((p) => p.isCited).length;
                            return (
                              <AccordionItem key={j} value={String(j)}>
                                <AccordionTrigger className="hover:no-underline">
                                  <div className="flex items-center gap-3 flex-1 text-left">
                                    <Badge variant="outline" className="shrink-0">
                                      {j + 1}
                                    </Badge>
                                    <span className="flex-1 truncate text-sm">{row.prompt}</span>
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
                                      />
                                    ))}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No detail data available for this run.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="text-sm text-primary hover:underline"
                data-testid="button-load-more-runs"
              >
                Load {Math.min(PAGE_SIZE, runHistory.length - visibleCount)} more
                {" · "}
                <span className="text-muted-foreground">
                  showing {visibleCount} of {runHistory.length}
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
