// Admin recent-runs landing page. Lists the 50 most recent fact-sheet
// scrape runs across all brands with one-click links into the
// inspector. Gated to admin via server-side isAdmin middleware.

import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { CheckCircle, ChevronRight, Loader2, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type RunSummary = {
  id: string;
  brandId: string;
  status: string;
  triggeredBy: string | null;
  errorKind: string | null;
  startedAt: string;
  completedAt: string | null;
  pagesFetched: number | null;
  factsExtracted: number | null;
};

function statusToVariant(status: string): "ok" | "warn" | "fail" {
  if (status === "completed") return "ok";
  if (status === "failed" || status === "timeout" || status === "cancelled") return "fail";
  return "warn";
}

function fmtDur(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtAgo(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86_400)}d ago`;
}

export default function AdminScrapeRuns() {
  const { data, isLoading, isError } = useQuery<{ success: boolean; data: RunSummary[] }>({
    queryKey: ["/api/admin/scrape/runs/recent"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/scrape/runs/recent");
      return res.json();
    },
    refetchInterval: 15_000, // auto-refresh — operators usually leave this open
  });

  return (
    <div className="container mx-auto max-w-5xl py-8 space-y-6">
      <Helmet>
        <title>Recent scrapes — admin</title>
      </Helmet>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Recent fact-sheet scrapes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Last 50 runs across all brands. Auto-refreshes every 15 seconds.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">Could not load runs.</p>
          ) : (
            <div className="space-y-1">
              {(data?.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : null}
              {(data?.data ?? []).map((run) => {
                const tone = statusToVariant(run.status);
                return (
                  <Link key={run.id} href={`/admin/scrape/${run.id}`}>
                    <div
                      className="flex items-center gap-3 rounded-md border border-border bg-card p-3 hover:bg-(--bg-surface-2) focus-within:ring-2 focus-within:ring-ring transition-colors cursor-pointer"
                      data-testid={`run-row-${run.id}`}
                    >
                      <div className="shrink-0">
                        {tone === "ok" ? (
                          <CheckCircle className="h-4 w-4 text-chart-4" />
                        ) : tone === "fail" ? (
                          <XCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <Loader2 className="h-4 w-4 text-(--warning) animate-spin" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {run.id.slice(0, 8)}
                          </span>
                          <Badge
                            className={cn(
                              "text-[10px] uppercase tracking-wider",
                              tone === "ok"
                                ? "bg-chart-4/10 text-chart-4"
                                : tone === "fail"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-(--warning)/10 text-(--warning)",
                            )}
                          >
                            {run.status}
                          </Badge>
                          {run.errorKind && (
                            <span className="text-[10px] text-destructive truncate">
                              {run.errorKind}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {run.triggeredBy ?? "—"}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0 text-xs text-muted-foreground tnum">
                          <span>{fmtAgo(run.startedAt)}</span>
                          <span>duration {fmtDur(run.startedAt, run.completedAt)}</span>
                          <span>{run.pagesFetched ?? 0} pages</span>
                          <span>{run.factsExtracted ?? 0} facts</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
