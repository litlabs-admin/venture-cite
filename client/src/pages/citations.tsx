import { useEffect, useState } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import PageHeader from "@/components/PageHeader";
import { pageExplainers } from "@/lib/pageExplainers";
import {
  Sparkles,
  Play,
  RefreshCw,
  Target,
  Loader2,
  Calendar,
  MoreVertical,
  ArrowRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import PromptsTab, { type BrandPrompt } from "@/components/citations/PromptsTab";
import ResultsTab from "@/components/citations/ResultsTab";
import HistoryTab from "@/components/citations/HistoryTab";
import ScheduleTab from "@/components/citations/ScheduleTab";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import { useCitationLiveRefresh } from "@/hooks/useCitationLiveRefresh";

export default function Citations() {
  const { toast } = useToast();
  const { selectedBrandId, brands, selectedBrand, isLoading: brandsLoading } = useBrandSelection();

  const { data: promptsData, isLoading: promptsLoading } = useQuery<{
    success: boolean;
    data: BrandPrompt[];
  }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });
  const prompts = promptsData?.data || [];

  // Wave 9: POST /run is now async (returns ~100ms with runId). Completion
  // arrives via the polling /citation-runs/state channel + active-runs gate;
  // the mutation toast just confirms the run started. Two-tab races receive
  // 409 with the existing runId — surfaced as an "already running" toast
  // rather than an error.
  const runMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/brand-prompts/${selectedBrandId}/run`, {});
      const json = await response.json();
      return { status: response.status, body: json };
    },
    onSuccess: ({ status, body }) => {
      if (status === 409 && body?.error === "already_running") {
        toast({
          title: "Run already in progress",
          description: "Watching live progress for the existing run.",
        });
        // Make sure the active-runs gate ticks immediately so the banner shows.
        queryClient.invalidateQueries({
          queryKey: ["/api/brands", selectedBrandId, "citation-runs/active"],
        });
        // Wave 9.2: also seed pendingRunId from the existing run so the
        // banner appears instantly rather than waiting up to 8s for the
        // gate to confirm.
        if (body?.data?.runId) setPendingRunId(body.data.runId);
        return;
      }
      if (body?.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding-status"] });
        // Trigger the active-runs gate to refresh now so the live banner
        // appears in <1s instead of waiting on the 8s polling cadence.
        queryClient.invalidateQueries({
          queryKey: ["/api/brands", selectedBrandId, "citation-runs/active"],
        });
        // Wave 9.2: optimistic banner. The polling gate still has up to
        // 8s of latency before it sees the new run; pendingRunId fills
        // the gap so the banner shows in ~200ms. Cleared by the effect
        // below once the gate confirms.
        if (body?.data?.runId) setPendingRunId(body.data.runId);
        toast({
          title: "Run started",
          description: "Watch live progress on this page.",
        });
      } else {
        toast({
          title: "Couldn't start run",
          description: body?.error || "Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't start run", description: err.message, variant: "destructive" }),
  });

  // Re-score stored responses with the current detector. Free (no AI calls).
  const backfillMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/brand-prompts/${selectedBrandId}/re-detect-all`,
        {},
      );
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({
          queryKey: [`/api/brand-prompts/${selectedBrandId}/results`],
        });
        queryClient.invalidateQueries({
          queryKey: [`/api/brand-prompts/${selectedBrandId}/history`],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/listicles"] });
        queryClient.invalidateQueries({ queryKey: ["/api/wikipedia-mentions"] });
        const { counts, durationMs } = data.data as {
          counts: { rankings: number; listicles: number; wikipedia: number; newlyCited: number };
          durationMs: number;
        };
        const total = counts.rankings + counts.listicles + counts.wikipedia;
        const description =
          total === 0
            ? "No changes — everything already matches the current variant list."
            : `Updated ${counts.rankings} ranking${counts.rankings === 1 ? "" : "s"}, ${counts.listicles} listicle${counts.listicles === 1 ? "" : "s"}, ${counts.wikipedia} wiki mention${counts.wikipedia === 1 ? "" : "s"}. ${counts.newlyCited} newly re-detected. (${Math.round(durationMs / 100) / 10}s)`;
        toast({ title: "Re-check complete", description });
      } else {
        toast({
          title: "Re-check failed",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) =>
      toast({ title: "Re-check failed", description: err.message, variant: "destructive" }),
  });

  // Wave 8/9: live-update lifecycle. The status-gate hook tells us whether
  // any citation run is in flight; useCitationLiveRefresh fires a one-shot
  // invalidate when the gate flips active→idle so the page picks up final
  // numbers. Per-query polling (refetchInterval) is wired inside ResultsTab
  // and HistoryTab themselves now (they each call useActiveCitationRuns).
  const { hasActive, runs: activeRuns } = useActiveCitationRuns(selectedBrandId);
  useCitationLiveRefresh(selectedBrandId, [
    [`/api/brand-prompts/${selectedBrandId}/results`],
    [`/api/brand-prompts/${selectedBrandId}/history`],
  ]);

  // Wave 9: keep the rotating loading messages cycling for the entire run,
  // not just the (now ~100ms) kickoff request. Run is async — once the
  // mutation resolves the UI relies entirely on `hasActive` for in-flight
  // state, so the messages should follow the same signal.
  const runLoadingMessage = useLoadingMessages(runMutation.isPending || hasActive, [
    "Querying ChatGPT...",
    "Querying Perplexity...",
    "Querying DeepSeek...",
    "Querying Claude...",
    "Querying Gemini...",
    "Analyzing responses for brand mentions...",
  ]);

  // Live progress state, fed by /citation-runs/state polling. Falls back to
  // the active-runs gate query if the run completes between polls so the
  // page just shows whatever it has.
  const [liveProgress, setLiveProgress] = useState<{
    runId: string;
    progressPct: number;
    totalChecks: number;
    totalCited: number;
  } | null>(null);

  // Wave 9.2: optimistic banner. The active-runs gate polls every 8s, so
  // the first ~8s after clicking Run had no banner — looked like nothing
  // happened. `pendingRunId` is seeded from the kickoff response and
  // displayed alongside `hasActive`. Cleared the moment the gate query
  // confirms the run, OR after 30s if the gate never sees it (run
  // failed before registering, network issue, etc.) — bounded so a
  // stuck pendingRunId can't keep the banner up forever.
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);

  // Reset live state on brand switch — both polled liveProgress and the
  // optimistic pendingRunId. Without the second, switching brand mid-run
  // would keep showing the old brand's optimistic banner until 30s timed
  // out.
  useEffect(() => {
    setLiveProgress(null);
    setPendingRunId(null);
  }, [selectedBrandId]);

  // Wave 9.2: clear pendingRunId once the active-runs gate confirms it
  // OR after a 30s safety timeout (run never registered).
  useEffect(() => {
    if (!pendingRunId) return;
    if (activeRuns.some((r) => r.id === pendingRunId)) {
      setPendingRunId(null);
      return;
    }
    const t = setTimeout(() => setPendingRunId(null), 30_000);
    return () => clearTimeout(t);
  }, [pendingRunId, activeRuns]);

  // Vercel migration: SSE replaced by polling /citation-runs/state every
  // ~1s while a run is active. The `since` cursor is a unix-ms timestamp
  // tracked locally so the server only returns rankings created since the
  // last poll. We invalidate the results query whenever new rankings
  // arrive so the per-prompt accordion catches up.
  useEffect(() => {
    if (!selectedBrandId || !hasActive) return;
    let cancelled = false;
    let cursor = 0;
    let activeRunId: string | null = null;
    let advanceInFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        // /state polls every tick to refresh the UI. /advance drives the
        // run forward server-side and is gated to a single in-flight call
        // per run — without that gate, a 25s slice + 1s tick produces ~25
        // concurrent /advance lambdas all racing to claim the same pairs,
        // causing duplicate geo_rankings rows and inflated totalChecks.
        const stateResp = apiRequest(
          "GET",
          `/api/brands/${selectedBrandId}/citation-runs/state?since=${cursor}`,
        );

        if (activeRunId && !advanceInFlight) {
          advanceInFlight = true;
          apiRequest(
            "POST",
            `/api/brands/${selectedBrandId}/citation-runs/${activeRunId}/advance`,
            {},
          )
            .catch(() => {})
            .finally(() => {
              advanceInFlight = false;
            });
        }

        const r = await stateResp;
        const json = (await r.json()) as {
          success: boolean;
          data: {
            runs: Array<{
              runId: string;
              status: string;
              progressPct: number;
              totalChecks: number;
              totalCited: number;
              citationRate: number;
              rankings: Array<{
                id: string;
                aiPlatform: string;
                isCited: boolean;
                checkedAt: string;
              }>;
              done: boolean;
            }>;
            since: number;
            hasActive: boolean;
          };
        };
        if (json.success) {
          cursor = json.data.since || cursor;
          const headline = json.data.runs[0];
          if (headline) {
            activeRunId = headline.done ? null : headline.runId;
            setLiveProgress({
              runId: headline.runId,
              progressPct: headline.progressPct,
              totalChecks: headline.totalChecks,
              totalCited: headline.totalCited,
            });
            const newRankings = json.data.runs.some((rn) => rn.rankings.length > 0);
            if (newRankings && selectedBrandId) {
              queryClient.invalidateQueries({
                queryKey: [`/api/brand-prompts/${selectedBrandId}/results`],
              });
            }
            if (headline.done) {
              setLiveProgress(null);
            }
          }
          if (!json.data.hasActive) {
            setLiveProgress(null);
            return; // stop polling
          }
        }
      } catch {
        // tolerate transient network errors
      }
      timer = setTimeout(tick, 1000);
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedBrandId, hasActive]);

  // Pick the most recent in-flight run as the one we surface on screen.
  // active-runs is sorted desc by startedAt server-side.
  // Wave 9: progressPct comes from the active-runs gate when the
  // /citation-runs/state poll hasn't delivered an update yet, but
  // totalChecks/totalCited stay unset (we hide the count line below
  // until the state poll fills them in, instead of showing a misleading
  // "0 cited / 0 checks so far").
  // Wave 9.2: when pendingRunId is set but the gate hasn't seen the
  // run yet (the ~8s window between kickoff and the next gate poll),
  // synthesize a 0% headline so the banner shows immediately.
  const headlineRun = activeRuns[0];
  const headlineProgress =
    liveProgress?.runId === headlineRun?.id
      ? liveProgress
      : headlineRun
        ? {
            runId: headlineRun.id,
            progressPct: headlineRun.progressPct,
            totalChecks: -1,
            totalCited: 0,
          }
        : pendingRunId
          ? {
              runId: pendingRunId,
              progressPct: 0,
              totalChecks: -1,
              totalCited: 0,
            }
          : null;
  // Wave 9.2: banner gating needs to include pendingRunId so the
  // optimistic banner appears in the gap between kickoff and the gate
  // confirming. `hasActive` lags up to 8s.
  const showBanner = hasActive || !!pendingRunId;

  const [activeTab, setActiveTab] = usePersistedState<string>("vc_citations_tab", "prompts");

  const hasPrompts = prompts.length > 0;
  const promptsAgeLabel = hasPrompts
    ? formatDistanceToNow(new Date(prompts[0].createdAt), { addSuffix: true })
    : null;

  const TABS = [
    { id: "prompts", label: "Prompts", icon: Sparkles },
    { id: "results", label: "Latest Results", icon: Target },
    { id: "history", label: "History", icon: Calendar },
    { id: "schedule", label: "Schedule", icon: RefreshCw },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Citations"
        description="Track how often AI engines cite your brand when users ask them strategic questions."
        explainer={pageExplainers.citations}
      />

      {/* Brand selector + Run Check button */}
      <Card>
        <CardContent className="pt-6">
          {brandsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : brands.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Create a brand first to start tracking citations.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Target className="h-4 w-4 text-muted-foreground shrink-0" />
              <BrandSelector className="flex-1" />
              {hasPrompts && (
                <>
                  <Button
                    onClick={() => {
                      if (runMutation.isPending || showBanner || !selectedBrandId) return;
                      runMutation.mutate();
                    }}
                    disabled={runMutation.isPending || showBanner || !selectedBrandId}
                    className="bg-red-600 hover:bg-red-700 shrink-0"
                    data-testid="button-run-check"
                  >
                    {showBanner ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Run in progress…
                      </>
                    ) : runMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {runLoadingMessage}
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run Check
                      </>
                    )}
                  </Button>
                  {/* Wave 9: secondary actions in an overflow menu so the
                      primary Run Check button has clear visual hierarchy.
                      Re-check stored is read-mostly and rarely needed. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        data-testid="button-citations-overflow"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuItem
                        disabled={backfillMutation.isPending}
                        onSelect={(e) => {
                          e.preventDefault();
                          if (!backfillMutation.isPending) backfillMutation.mutate();
                        }}
                        data-testid="button-backfill-detection"
                      >
                        {backfillMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Re-checking stored responses…
                          </>
                        ) : (
                          <div>
                            <div className="font-medium">Re-check stored responses</div>
                            <div className="text-xs text-muted-foreground">
                              Re-apply detection to old runs after adding name variations. Free — no
                              AI calls.
                            </div>
                          </div>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live progress banner — shown only while a citation run is in
          flight for this brand. /citation-runs/state polling feeds the
          progress %; the active-runs gate provides the gating boolean. */}
      {showBanner && headlineProgress && (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
                <span className="text-sm font-medium truncate">
                  Citation run in progress — {headlineProgress.progressPct}%
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* Wave 9: hide the count line until /citation-runs/state
                    fills in real numbers (initial state is totalChecks=-1
                    from the active-runs fallback). Avoids the misleading
                    "0 cited / 0 checks so far" flash for ~8s after Run. */}
                {headlineProgress.totalChecks > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {headlineProgress.totalCited} cited / {headlineProgress.totalChecks} checks
                  </span>
                )}
                {/* Wave 9: deep-link to the tab where live data actually
                    appears. Banner is page-level but per-row updates land
                    on Latest Results. */}
                {activeTab !== "results" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setActiveTab("results")}
                    data-testid="button-banner-view-live"
                  >
                    View live results
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
            <Progress value={headlineProgress.progressPct} className="h-2" />
          </CardContent>
        </Card>
      )}

      {!selectedBrandId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Select a Brand to Get Started
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Choose a brand above to generate strategic citation prompts and track how AI engines
              mention your brand.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-border">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    isActive
                      ? "border-red-500 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* PROMPTS TAB */}
          {activeTab === "prompts" && (
            <PromptsTab
              selectedBrandId={selectedBrandId}
              selectedBrand={selectedBrand}
              prompts={prompts}
              promptsLoading={promptsLoading}
              hasPrompts={hasPrompts}
              promptsAgeLabel={promptsAgeLabel}
            />
          )}

          {/* RESULTS TAB */}
          {activeTab === "results" && (
            <ResultsTab
              selectedBrandId={selectedBrandId}
              hasPrompts={hasPrompts}
              runMutation={runMutation}
            />
          )}

          {/* HISTORY TAB */}
          {activeTab === "history" && <HistoryTab selectedBrandId={selectedBrandId} />}

          {/* SCHEDULE TAB */}
          {activeTab === "schedule" && (
            <ScheduleTab selectedBrandId={selectedBrandId} selectedBrand={selectedBrand} />
          )}
        </>
      )}
    </div>
  );
}
