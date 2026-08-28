import { useEffect, useState } from "react";
import { useSearch, useNavigate, useRouterState } from "@tanstack/react-router";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { CITATIONS_TAB_STORAGE_KEY } from "@/lib/clientStorageKeys";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import { ErrorState } from "@/components/ui/error-state";
import { Sparkles, Play, Target, Loader2, Calendar, MoreVertical, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import PromptsTab from "@/components/citations/PromptsTab";
import ResultsTab from "@/components/citations/ResultsTab";
import HistoryTab from "@/components/citations/HistoryTab";
import { useActiveCitationRuns } from "@/hooks/useActiveCitationRuns";
import { useCitationLiveRefresh } from "@/hooks/useCitationLiveRefresh";
import { usePrompts, useRunPrompts, useBackfillPrompts, promptKeys } from "@/hooks/usePrompts";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";

// Inner tab bar. Module scope so TAB_IDS can gate the `?ptab=` value read
// further down, and so the two can never drift apart.
//
// Tour engine targets (literal data-tour-id strings included so the
// verify-tour-targets script can statically discover them):
//   data-tour-id="citations.tab.prompts"
//   data-tour-id="citations.tab.results"
//   data-tour-id="citations.tab.history"
const TABS = [
  { id: "prompts", label: "Prompts", icon: Sparkles, tourId: "citations.tab.prompts" },
  { id: "results", label: "Latest Results", icon: Target, tourId: "citations.tab.results" },
  { id: "history", label: "History", icon: Calendar, tourId: "citations.tab.history" },
];
const TAB_IDS = TABS.map((t) => t.id);

export default function Citations() {
  const { toast } = useToast();
  const { selectedBrandId, brands, selectedBrand, isLoading: brandsLoading } = useBrandSelection();

  const {
    data: promptsData,
    isLoading: promptsLoading,
    isError: promptsIsError,
    isRefetching: promptsIsRefetching,
    refetch: refetchPrompts,
  } = usePrompts(selectedBrandId);
  const prompts = promptsData?.data || [];

  // POST /run is asynchronous and returns a runId. Completion
  // arrives via the polling /citation-runs/state channel + active-runs gate;
  // the mutation toast just confirms the run started. Two-tab races receive
  // 409 with the existing runId - surfaced as an "already running" toast
  // rather than an error.
  const runMutationImpl = useRunPrompts(selectedBrandId);
  // The shared hook only knows the request/response shape; page-specific UI
  // reactions (toasts, optimistic banner state) live here since they touch
  // this component's state. `runCheck` wraps `.mutate` so both call sites
  // (the button below and the one passed down into ResultsTab) get the same
  // behavior - matching the pre-refactor mutation, whose onSuccess/onError
  // were baked in at creation and therefore fired for every caller.
  const runCheck = () => {
    runMutationImpl.mutate(undefined, {
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
          // Also seed pendingRunId from the existing run so the
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
          // Show an optimistic banner. The polling gate still has up to
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
  };
  const runMutation = { ...runMutationImpl, mutate: runCheck };

  // Re-score stored responses with the current detector. Free (no AI calls).
  const backfillMutationImpl = useBackfillPrompts(selectedBrandId);
  const runBackfill = () => {
    backfillMutationImpl.mutate(undefined, {
      onSuccess: (data: any) => {
        if (data.success) {
          const { counts, durationMs } = data.data as {
            counts: { rankings: number; listicles: number; wikipedia: number; newlyCited: number };
            durationMs: number;
          };
          const total = counts.rankings + counts.listicles + counts.wikipedia;
          const description =
            total === 0
              ? "No changes - everything already matches the current variant list."
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
  };
  const backfillMutation = { ...backfillMutationImpl, mutate: runBackfill };

  // The live-update lifecycle uses the status-gate hook to tell us whether
  // any citation run is in flight; useCitationLiveRefresh fires a one-shot
  // invalidate when the gate flips active→idle so the page picks up final
  // numbers. Per-query polling (refetchInterval) is wired inside ResultsTab
  // and HistoryTab themselves now (they each call useActiveCitationRuns).
  const { hasActive, runs: activeRuns } = useActiveCitationRuns(selectedBrandId);
  useCitationLiveRefresh(selectedBrandId, [
    [...promptKeys.results(selectedBrandId)],
    [...promptKeys.history(selectedBrandId)],
  ]);

  // Keep the rotating loading messages cycling for the entire run,
  // not just the (now ~100ms) kickoff request. Run is async - once the
  // mutation resolves the UI relies entirely on `hasActive` for in-flight
  // state, so the messages should follow the same signal.
  const runLoadingMessage = useLoadingMessages(runMutation.isPending || hasActive, [
    "Querying ChatGPT...",
    "Querying Perplexity...",
    "Querying DeepSeek...",
    "Querying Claude...",
    "Querying Gemini...",
    "Querying Grok...",
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

  // Show an optimistic banner. The active-runs gate polls every eight seconds, so
  // the first ~8s after clicking Run had no banner - looked like nothing
  // happened. `pendingRunId` is seeded from the kickoff response and
  // displayed alongside `hasActive`. Cleared the moment the gate query
  // confirms the run, OR after 30s if the gate never sees it (run
  // failed before registering, network issue, etc.) - bounded so a
  // stuck pendingRunId can't keep the banner up forever.
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);

  // Reset live state on brand switch - both polled liveProgress and the
  // optimistic pendingRunId. Without the second, switching brand mid-run
  // would keep showing the old brand's optimistic banner until 30s timed
  // out.
  useEffect(() => {
    setLiveProgress(null);
    setPendingRunId(null);
  }, [selectedBrandId]);

  // Clear pendingRunId once the active-runs gate confirms it
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
        // per run - without that gate, a 25s slice + 1s tick produces ~25
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
                queryKey: promptKeys.results(selectedBrandId),
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
  // progressPct comes from the active-runs gate when the
  // /citation-runs/state poll hasn't delivered an update yet, but
  // totalChecks/totalCited stay unset (we hide the count line below
  // until the state poll fills them in, instead of showing a misleading
  // "0 cited / 0 checks so far").
  // When pendingRunId is set but the gate has not seen the
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
  // Banner gating includes pendingRunId so the
  // optimistic banner appears in the gap between kickoff and the gate
  // confirming. `hasActive` lags up to 8s.
  const showBanner = hasActive || !!pendingRunId;

  // URL-addressable inner tab bar (`?ptab=`). citations.tsx renders inside
  // whichever spine stage route mounted it (/monitor), which has no single
  // typed `Route.useSearch()` here - same loose-read pattern AppShell.tsx
  // and SpineShell use for `tab` (see native-api-contract.md rule 3).
  // `ptab` is declared on monitorSearchSchema in
  // src/routes/-shared/searchSchemas.ts.
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const search = useSearch({ strict: false });
  const [lastUsedTab, setLastUsedTab] = usePersistedState<string>(
    CITATIONS_TAB_STORAGE_KEY,
    "prompts",
  );
  const ptabFromUrl = typeof search.ptab === "string" ? search.ptab : undefined;
  // Falls back to "prompts" for any tab id this page no longer renders. Both
  // sources are untyped strings that outlive a deploy: `?ptab=` can be a stale
  // bookmark, and `vc_citations_tab` persists in localStorage - so a user whose
  // last-used tab was the removed "schedule" would otherwise get the tab bar
  // with nothing beneath it.
  const requestedTab = ptabFromUrl ?? lastUsedTab;
  const activeTab = TAB_IDS.includes(requestedTab) ? requestedTab : "prompts";
  const setActiveTab = (value: string) => {
    setLastUsedTab(value);
    navigate({
      to: location,
      search: (prev: Record<string, unknown>) => ({ ...prev, ptab: value }),
      replace: true,
    });
  };

  const hasPrompts = prompts.length > 0;
  const promptsAgeLabel = hasPrompts
    ? formatDistanceToNow(new Date(prompts[0].createdAt), { addSuffix: true })
    : null;

  return (
    <PanelPage>
      {/* Live progress banner - shown only while a citation run is in
          flight for this brand. /citation-runs/state polling feeds the
          progress %; the active-runs gate provides the gating boolean. */}
      {showBanner && headlineProgress && (
        <PanelRow cols={1}>
          <Panel width="wide" border="last">
            <div className="flex items-center justify-between mb-2 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="text-caption font-medium truncate">
                  Citation run in progress - {headlineProgress.progressPct}%
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {headlineProgress.totalChecks > 0 && (
                  <span className="text-caption text-vc-tertiary">
                    {headlineProgress.totalCited} cited / {headlineProgress.totalChecks} checks
                  </span>
                )}
                {activeTab !== "results" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-caption"
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
          </Panel>
        </PanelRow>
      )}

      {brandsLoading ? (
        <div className="px-8 py-6">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : brands.length === 0 ? (
        <div className="px-8 py-6">
          <p className="text-vc-tertiary text-caption">
            Create a brand first to start tracking citations.
          </p>
        </div>
      ) : !selectedBrandId ? (
        <PanelRow cols={1} last>
          <Panel width="wide" border="last">
            <div className="py-16 text-center">
              <Sparkles className="h-16 w-16 mx-auto text-vc-hover mb-4" />
              <h3 className="text-page font-semibold text-vc-primary mb-2">
                Select a Brand to Get Started
              </h3>
              <p className="text-vc-tertiary max-w-md mx-auto">
                Choose a brand above to generate strategic citation prompts and track how AI engines
                mention your brand.
              </p>
            </div>
          </Panel>
        </PanelRow>
      ) : (
        <>
          {/* Tab bar + Run Check on the same row. Tab strip is a
              non-panel content surface - flagged per the conversion task's
              own rule that tab strips don't fit the panel grammar. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-vc-default px-8 pt-6">
            <div className="flex gap-1" role="tablist" aria-label="Citations">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    data-tour-id={tab.tourId}
                    className={`flex items-center gap-2 px-4 py-2.5 text-caption font-medium transition-colors border-b-2 -mb-px ${
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-vc-tertiary hover:text-foreground hover:border-vc-default"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            {hasPrompts && (
              <div className="flex items-center gap-2 pb-2">
                <Button
                  onClick={() => {
                    if (runMutation.isPending || showBanner || !selectedBrandId) return;
                    runMutation.mutate();
                  }}
                  disabled={runMutation.isPending || showBanner || !selectedBrandId}
                  className="shrink-0"
                  data-testid="button-run-check"
                  data-tour-id="prompts.runButton"
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
                {/* Secondary actions use an overflow menu so the
                    primary Run Check button has clear visual hierarchy.
                    Re-check stored is read-mostly and rarely needed. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      data-testid="button-citations-overflow"
                      aria-label="More actions"
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
                          <div className="text-caption text-vc-tertiary">
                            Re-apply detection to old runs after adding name variations. Free - no
                            AI calls.
                          </div>
                        </div>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* PROMPTS TAB */}
          {activeTab === "prompts" &&
            (promptsIsError ? (
              <div className="px-8 py-6">
                <ErrorState
                  title="Couldn't load prompts"
                  description="We hit an error fetching this brand's citation prompts."
                  onRetry={() => refetchPrompts()}
                  isRetrying={promptsIsRefetching}
                />
              </div>
            ) : (
              <div className="px-8 py-6">
                <PromptsTab
                  selectedBrandId={selectedBrandId}
                  selectedBrand={selectedBrand}
                  prompts={prompts}
                  promptsLoading={promptsLoading}
                  hasPrompts={hasPrompts}
                  promptsAgeLabel={promptsAgeLabel}
                />
              </div>
            ))}

          {/* RESULTS TAB */}
          {activeTab === "results" && (
            <div className="px-8 py-6">
              <ResultsTab
                selectedBrandId={selectedBrandId}
                hasPrompts={hasPrompts}
                runMutation={runMutation}
              />
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === "history" && (
            <div className="px-8 py-6">
              <HistoryTab selectedBrandId={selectedBrandId} />
            </div>
          )}
        </>
      )}
    </PanelPage>
  );
}
