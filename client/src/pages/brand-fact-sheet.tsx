import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2, AlertTriangle, Plus } from "lucide-react";

import { apiRequest, ApiError } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

import { useBrandSelection } from "@/hooks/use-brand-selection";
import { EmptyState } from "@/components/foundations/EmptyState";
import { ErrorState } from "@/components/ui/error-state";

// Plan 2.3 hook — consume only.
import { useScrapeRunStream } from "@/hooks/useScrapeRunStream";

import { ManualPasteCard } from "@/components/fact-sheet/ManualPasteCard";

// Plan 2.4 components.
import { ConflictPair, type ConflictPairData } from "@/components/fact-sheet/ConflictPair";
import { FactRow, type ResolvedFact } from "@/components/fact-sheet/FactRow";
import { DomainGroupHeader } from "@/components/fact-sheet/DomainGroupHeader";
import { DOMAINS, DOMAIN_LABELS, type Domain } from "@/components/fact-sheet/domainIcons";
import { formatRelativeTime, daysSince } from "@/lib/formatRelativeTime";

// Plan 2.5 components.
import { PauseToggle } from "@/components/fact-sheet/PauseToggle";
import { ScrapePagesPanel } from "@/components/fact-sheet/ScrapePagesPanel";
import {
  ScrapeFailureState,
  type ScrapeFailureKind,
} from "@/components/fact-sheet/ScrapeFailureState";
import type { BrandFactScrapePage } from "@shared/schema";

// Response shape from Plan 2.3 GET /api/brand-fact-sheet/diff
type DiffResponse = {
  conflicts: Partial<Record<Domain, ConflictPairData[]>>;
  resolved: ResolvedFact[];
};

// Response shape from Plan 2.3 GET /api/brand-fact-sheet/runs?brandId=…
type ScrapeRun = {
  id: string;
  brandId: string;
  status:
    | "pending"
    | "planning"
    | "fetching"
    | "extracting"
    | "completed"
    | "failed"
    | "timeout"
    | "slice_pending"
    | "cancelled";
  startedAt: string;
  completedAt: string | null;
  pagesFetched: number;
  pagesPlanned: number;
  factsExtracted: number;
  triggeredBy: string;
  errorKind: string | null;
  errorMessage?: string | null;
};

// Response shape from Plan 2.3 GET /api/brand-fact-sheet/runs/:runId
type ScrapeRunDetailResponse = {
  success: boolean;
  run: ScrapeRun & { errorMessage?: string | null };
  pages: BrandFactScrapePage[];
};

const TERMINAL_FAILURE_STATUSES: ReadonlyArray<ScrapeRun["status"]> = ["failed", "timeout"];

const ACTIVE_STATUSES: ReadonlyArray<ScrapeRun["status"]> = [
  "pending",
  "planning",
  "fetching",
  "extracting",
  "slice_pending",
];

function diffHasNoConflicts(d: DiffResponse): boolean {
  return Object.values(d.conflicts).every((pairs) => !pairs || pairs.length === 0);
}

function groupByDomain(facts: ResolvedFact[]): Record<Domain, ResolvedFact[]> {
  const out = {} as Record<Domain, ResolvedFact[]>;
  for (const d of DOMAINS) out[d] = [];
  for (const f of facts) {
    const key = (DOMAINS as readonly string[]).includes(f.domain as string)
      ? (f.domain as Domain)
      : ("identity" as Domain);
    out[key].push(f);
  }
  return out;
}

export default function BrandFactSheet() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const [editingFact, setEditingFact] = useState<ResolvedFact | null>(null);

  /* ---------- manual "Add fact" ---------- */
  type NewFactDraft = {
    domain: Domain;
    factKey: string;
    factValue: string;
    sourceUrl: string;
  };
  const emptyDraft: NewFactDraft = {
    domain: "identity",
    factKey: "",
    factValue: "",
    sourceUrl: "",
  };
  const [newFact, setNewFact] = useState<NewFactDraft | null>(null);

  /* ---------- server-driven re-scrape ----------
   * The browser no longer orchestrates the scrape (no /plan + scrape-one
   * fan-out that orphans on tab close). It POSTs /full-rescrape, the
   * server runs the SAME pipeline onboarding uses, and progress is
   * observed through the existing run-status query + SSE stream below.
   */
  const [rescrapeError, setRescrapeError] = useState<string | null>(null);
  // True between kicking a re-scrape and the server-side run row
  // appearing in runsQuery — keeps the runs poll hot so the freshly
  // created run is discovered within a tick.
  const [expectingRun, setExpectingRun] = useState(false);

  const rescrapeMutation = useMutation({
    mutationFn: async (brandId: string) => {
      const res = await apiRequest("POST", "/api/brand-fact-sheet/full-rescrape", { brandId });
      return res.json();
    },
    onMutate: () => setRescrapeError(null),
    onSuccess: () => {
      setExpectingRun(true);
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/runs", { brandId: selectedBrandId }],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/runs/latest-completed", { brandId: selectedBrandId }],
      });
    },
    onError: (err: unknown) => {
      // /full-rescrape returns the same structured 409 shape as /plan
      // (cooldown / already_running / cost cap). For already_running just
      // let the runs poll surface the existing run; otherwise show why.
      const body =
        err instanceof ApiError ? ((err.body ?? {}) as { code?: string; error?: string }) : null;
      if (body?.code === "already_running") {
        setExpectingRun(true);
        queryClient.invalidateQueries({
          queryKey: ["/api/brand-fact-sheet/runs", { brandId: selectedBrandId }],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/brand-fact-sheet/runs/latest-completed", { brandId: selectedBrandId }],
        });
        return;
      }
      setRescrapeError(
        body?.error ?? (err instanceof Error ? err.message : "Couldn't start re-scrape."),
      );
    },
  });

  const startRescrape = () => {
    if (!selectedBrandId) return;
    rescrapeMutation.mutate(selectedBrandId);
  };

  // Auto-fire when redirected from a brand-create flow:
  // /brands → /brand-fact-sheet?autoScrape=<newBrandId>.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedBrandId) return;
    const params = new URLSearchParams(window.location.search);
    const autoScrapeId = params.get("autoScrape");
    if (autoScrapeId && autoScrapeId === selectedBrandId) {
      startRescrape();
      // Strip the param so a refresh doesn't re-trigger.
      params.delete("autoScrape");
      const newSearch = params.toString();
      const newUrl =
        window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrandId]);

  /* ---------- queries ---------- */
  const runsQuery = useQuery<{ runs: ScrapeRun[] }>({
    queryKey: ["/api/brand-fact-sheet/runs", { brandId: selectedBrandId }],
    enabled: !!selectedBrandId,
    // Poll while a run is active OR we just kicked one (server creates the
    // row a beat after /full-rescrape returns). Stops once terminal.
    refetchInterval: (q) => {
      const data = q.state.data as { runs?: ScrapeRun[] } | undefined;
      const hasActive = (data?.runs ?? []).some((r) => ACTIVE_STATUSES.includes(r.status));
      return hasActive || expectingRun ? 2500 : false;
    },
  });

  const diffQuery = useQuery<DiffResponse>({
    queryKey: ["/api/brand-fact-sheet/diff", { brandId: selectedBrandId }],
    enabled: !!selectedBrandId,
  });

  const resolvedQuery = useQuery<{ data: ResolvedFact[] }>({
    queryKey: ["/api/brand-facts", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const runs = runsQuery.data?.runs ?? [];
  const activeRun = runs.find((r) => ACTIVE_STATUSES.includes(r.status)) ?? null;
  const latestRun = runs[0] ?? null;

  // "Last scraped" (and the manual-paste / bulk-accept run target) must not
  // be derived from `runs` above: that list is capped at the 10 most recent
  // runs, so several consecutive failed/cancelled runs push every completed
  // run off the page and the UI would wrongly claim no scrape ever
  // succeeded. Query the latest completed run directly instead — see UI
  // audit #10 and server/routes/factSheet.ts's `/runs/latest-completed`.
  const latestCompletedQuery = useQuery<{ success: boolean; run: ScrapeRun | null }>({
    queryKey: ["/api/brand-fact-sheet/runs/latest-completed", { brandId: selectedBrandId }],
    enabled: !!selectedBrandId,
  });
  const latestCompleted = latestCompletedQuery.data?.run ?? null;

  /* ---------- SSE: live progress for active run ----------
   * Plan 2.3 hook is parameter-less; call .start(runId) when an active run
   * appears and .stop() on cleanup / when the run changes. Derive progress
   * fields from the event stream.
   */
  const stream = useScrapeRunStream();
  const activeRunId = activeRun?.id ?? null;

  useEffect(() => {
    if (!activeRunId) return;
    stream.start(activeRunId);
    return () => {
      stream.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId]);

  const liveProgress = useMemo(() => {
    let pagesDone: number | null = null;
    let pagesTotal: number | null = null;
    let currentPage: string | null = null;
    let lastEvent: string | null = null;
    let sawDone = false;
    for (const evt of stream.events) {
      lastEvent = evt.type;
      if (evt.type === "page") {
        currentPage = evt.url;
      } else if (evt.type === "progress") {
        pagesDone = evt.pagesDone;
        pagesTotal = evt.pagesTotal;
      } else if (evt.type === "done") {
        sawDone = true;
      }
    }
    return { pagesDone, pagesTotal, currentPage, lastEvent, sawDone };
  }, [stream.events]);

  // Invalidate queries when the stream signals new data or completion.
  useEffect(() => {
    if (!activeRunId) return;
    if (liveProgress.lastEvent === "fact" || liveProgress.lastEvent === "done") {
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/diff", { brandId: selectedBrandId }],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-facts", selectedBrandId],
      });
    }
    if (liveProgress.sawDone) {
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/runs", { brandId: selectedBrandId }],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/runs/latest-completed", { brandId: selectedBrandId }],
      });
    }
  }, [liveProgress.lastEvent, liveProgress.sawDone, activeRunId, selectedBrandId]);

  // Once the server-side run row materialises, stop forcing the runs poll.
  useEffect(() => {
    if (activeRun && expectingRun) setExpectingRun(false);
  }, [activeRun, expectingRun]);

  // Safety: if a kicked run never shows (silent server failure) don't poll
  // forever — give up the hot poll after 20s.
  useEffect(() => {
    if (!expectingRun) return;
    const t = setTimeout(() => setExpectingRun(false), 20_000);
    return () => clearTimeout(t);
  }, [expectingRun]);

  /* ---------- mutations ---------- */
  const acceptFactMutation = useMutation({
    mutationFn: async (input: { factId: string; dismissOtherSide: boolean }) =>
      apiRequest("POST", `/api/brand-fact-sheet/facts/${input.factId}/accept`, {
        dismissOtherSide: input.dismissOtherSide,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/diff", { brandId: selectedBrandId }],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-facts", selectedBrandId],
      });
    },
  });

  const dismissFactMutation = useMutation({
    mutationFn: async (factId: string) =>
      apiRequest("POST", `/api/brand-fact-sheet/facts/${factId}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/diff", { brandId: selectedBrandId }],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-facts", selectedBrandId],
      });
    },
  });

  const bulkAcceptMutation = useMutation({
    mutationFn: async (body: { side: "user" | "scraped"; domain?: Domain }) => {
      const runId = activeRun?.id ?? latestCompleted?.id ?? null;
      return apiRequest("POST", "/api/brand-fact-sheet/facts/bulk-accept", {
        brandId: selectedBrandId,
        runId,
        ...body,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-fact-sheet/diff", { brandId: selectedBrandId }],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-facts", selectedBrandId],
      });
    },
  });

  const updateFactMutation = useMutation({
    mutationFn: async (fact: ResolvedFact) =>
      apiRequest("PATCH", `/api/brand-facts/${fact.id}`, {
        subcategory: fact.subcategory,
        factKey: fact.factKey,
        factValue: fact.factValue,
        sourceUrl: fact.sourceUrl,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-facts", selectedBrandId],
      });
      setEditingFact(null);
      toast({ title: "Fact updated", description: "Brand fact has been updated." });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update fact.",
        variant: "destructive",
      });
    },
  });

  const createFactMutation = useMutation({
    mutationFn: async (draft: NewFactDraft) => {
      const factKey = draft.factKey.trim();
      const factValue = draft.factValue.trim();
      const res = await apiRequest("POST", "/api/brand-facts", {
        brandId: selectedBrandId,
        domain: draft.domain,
        // Manual facts use the field name for both the controlled-vocab key
        // and the human subcategory label (the server requires subcategory).
        subcategory: factKey,
        factKey,
        factValue,
        sourceUrl: draft.sourceUrl.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-facts", selectedBrandId] });
      setNewFact(null);
      toast({ title: "Fact added", description: "Your fact was added to the sheet." });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add fact. Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSaveNewFact =
    !!newFact && newFact.factKey.trim().length > 0 && newFact.factValue.trim().length > 0;

  /* ---------- diff handlers ---------- */
  const handleUseMine = (pair: ConflictPairData) =>
    acceptFactMutation.mutate({ factId: pair.userFact.id, dismissOtherSide: true });
  const handleUseAI = (pair: ConflictPairData) =>
    acceptFactMutation.mutate({ factId: pair.scrapedFact.id, dismissOtherSide: true });
  const handleKeepBoth = (pair: ConflictPairData) => {
    acceptFactMutation.mutate({ factId: pair.userFact.id, dismissOtherSide: false });
    acceptFactMutation.mutate({ factId: pair.scrapedFact.id, dismissOtherSide: false });
  };

  /* ---------- "last scraped" subline ---------- */
  const lastScrapedAt = latestCompleted?.completedAt ?? null;

  // Second legitimate path (UI audit #10): legacy v1-scraped facts have no
  // run row at all — `POST /api/brand-facts/scrape/:brandId` was removed in
  // favor of the run-based pipeline (see server/routes/publications.ts) —
  // but the facts themselves still carry a `lastVerified` timestamp. When
  // there's no completed run on record, fall back to the most recent
  // `lastVerified` across resolved facts so the page doesn't claim "Never"
  // when it actually has verification history, just not a run row for it.
  const legacyVerifiedAt = useMemo(() => {
    if (lastScrapedAt) return null;
    const facts = resolvedQuery.data?.data ?? [];
    let latest: string | null = null;
    for (const f of facts) {
      if (f.lastVerified && (!latest || f.lastVerified > latest)) latest = f.lastVerified;
    }
    return latest;
  }, [lastScrapedAt, resolvedQuery.data]);

  const lastScrapedDays = daysSince(lastScrapedAt);
  const lastScrapedColor =
    lastScrapedDays === null
      ? "text-muted-foreground"
      : lastScrapedDays > 90
        ? "text-chart-3"
        : lastScrapedDays > 7
          ? "text-muted-foreground"
          : "text-foreground";

  /* ---------- pause state (Plan 2.5 Task 6) ---------- */
  const brandFactScrapeEnabled = selectedBrand?.factScrapeEnabled ?? true;
  const [scrapeEnabled, setScrapeEnabled] = useState(true);
  useEffect(() => {
    setScrapeEnabled(brandFactScrapeEnabled);
  }, [brandFactScrapeEnabled]);

  /* ---------- per-page panel data (Plan 2.5 Task 8) ----------
   * While streaming: derive from SSE `page` events (latest-by-url wins).
   * After completion: pull from the run-detail endpoint.
   */
  const runDetailQuery = useQuery<ScrapeRunDetailResponse>({
    queryKey: ["/api/brand-fact-sheet/runs", activeRunId],
    enabled: !!activeRunId && !stream.isStreaming,
  });

  const streamPages: BrandFactScrapePage[] = useMemo(() => {
    const byUrl = new Map<string, BrandFactScrapePage>();
    for (const evt of stream.events) {
      if (evt.type !== "page") continue;
      // Stream `page` events carry a subset of BrandFactScrapePage fields; the
      // remaining columns are filled with safe defaults so the panel can render.
      const prev = byUrl.get(evt.url);
      byUrl.set(evt.url, {
        id: evt.id,
        runId: activeRunId ?? "",
        url: evt.url,
        canonicalUrl: prev?.canonicalUrl ?? evt.url,
        status: evt.status,
        fetchedAt: prev?.fetchedAt ?? null,
        bytes: evt.bytes ?? prev?.bytes ?? null,
        statusCode: prev?.statusCode ?? null,
        contentType: prev?.contentType ?? null,
        lang: evt.lang ?? prev?.lang ?? null,
        factCount: evt.factCount ?? prev?.factCount ?? 0,
        llmCostCents: prev?.llmCostCents ?? 0,
        errorKind: evt.errorKind ?? prev?.errorKind ?? null,
        errorMessage: prev?.errorMessage ?? null,
        excerpt: prev?.excerpt ?? null,
      });
    }
    return Array.from(byUrl.values());
  }, [stream.events, activeRunId]);

  const displayPages: BrandFactScrapePage[] = stream.isStreaming
    ? streamPages
    : (runDetailQuery.data?.pages ?? []);

  /* ---------- re-scrape disabled state ---------- */
  // Server truth (an active run row) is authoritative; the local
  // pending/expecting flags just cover the moment before it appears.
  const rescrapeInFlight = !!activeRun || rescrapeMutation.isPending || expectingRun;
  const rescrapeDisabledReason = rescrapeInFlight
    ? "A scrape is already running."
    : !scrapeEnabled
      ? "Auto-scraping paused."
      : null;

  /* ---------- terminal-failure detection (Plan 2.5 Task 9) ----------
   * Mixed-success (some pages done, some failed) does NOT render the failure
   * banner — only `failed`/`timeout` runs with an explicit error_kind do.
   */
  const isTerminalFailure =
    !!latestRun && TERMINAL_FAILURE_STATUSES.includes(latestRun.status) && !!latestRun.errorKind;

  const failureErrorMessage =
    latestRun?.errorMessage ?? runDetailQuery.data?.run?.errorMessage ?? null;

  /* ---------- render ---------- */
  return (
    // This component is only ever rendered client-side, as a lazy tab
    // inside client/src/pages/setup.tsx (no route of its own to attach
    // `head()` to) — see this task's report. Title/meta removed per this
    // task's blanket "metadata belongs to the route" rule; /setup falls
    // back to the root's site-wide defaults.
    <div className="space-y-8">
      {selectedBrand && (
        <>
          {/* HEADER SECTION — Task 8 */}
          <Card data-tour-id="fact-sheet.header">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5 text-primary" />
                Scrape status
              </CardTitle>
              <CardDescription>
                We re-scrape monthly. Re-scrape on demand — duplicates are skipped.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <div className="text-xs text-muted-foreground">Last scraped</div>
                  <div className={lastScrapedColor} data-testid="text-last-scraped">
                    {lastScrapedAt
                      ? formatRelativeTime(lastScrapedAt)
                      : legacyVerifiedAt
                        ? `No scrape run on record — facts verified ${formatRelativeTime(legacyVerifiedAt)}`
                        : "Never"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-3">
                    {selectedBrandId ? (
                      <PauseToggle
                        brandId={selectedBrandId}
                        enabled={brandFactScrapeEnabled}
                        onChange={setScrapeEnabled}
                      />
                    ) : null}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            onClick={startRescrape}
                            disabled={!selectedBrandId || rescrapeInFlight || !scrapeEnabled}
                            data-testid="btn-rescrape"
                          >
                            {rescrapeInFlight ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Scraping…
                              </>
                            ) : (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Re-scrape
                              </>
                            )}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {rescrapeDisabledReason ? (
                        <TooltipContent>{rescrapeDisabledReason}</TooltipContent>
                      ) : null}
                    </Tooltip>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* MANUAL PASTE FALLBACK — latest completed run found zero facts */}
          {latestCompleted && latestCompleted.factsExtracted === 0 && (
            <ManualPasteCard
              runId={latestCompleted.id}
              onSubmit={async (text) => {
                try {
                  await apiRequest(
                    "POST",
                    `/api/brand-fact-sheet/runs/${latestCompleted.id}/paste`,
                    { text },
                  );
                  await queryClient.invalidateQueries({
                    queryKey: ["/api/brand-facts", selectedBrandId],
                  });
                } catch {
                  // Paste failed — error already logged by apiRequest. UI shows the
                  // unchanged "0 facts" state; user can retry.
                }
              }}
              onManualFill={() => {
                // For MVP, just close/dismiss — the existing FactRow edit button
                // and EditFactDialog are already on the page.
              }}
            />
          )}

          {/* RE-SCRAPE BLOCKED ALERT — cooldown / cost cap from /full-rescrape */}
          {rescrapeError && (
            <Alert variant="default" data-testid="rescrape-error-alert">
              <AlertDescription>{rescrapeError}</AlertDescription>
            </Alert>
          )}

          {/* PER-PAGE PANEL — Plan 2.5 Task 8 */}
          {(stream.isStreaming || displayPages.length > 0) && activeRunId ? (
            <ScrapePagesPanel
              pages={displayPages}
              runId={activeRunId}
              isStreaming={stream.isStreaming}
              runStartedAt={runDetailQuery.data?.run?.startedAt ?? activeRun?.startedAt ?? null}
            />
          ) : null}

          {/* TERMINAL FAILURE STATE — Plan 2.5 Task 9 */}
          {isTerminalFailure && latestRun ? (
            <ScrapeFailureState
              errorKind={latestRun.errorKind as ScrapeFailureKind | string}
              errorMessage={failureErrorMessage}
              runId={latestRun.id}
              brandId={selectedBrandId}
              brandWebsite={selectedBrand?.website ?? null}
            />
          ) : null}

          {/* DIFF SECTION — Task 9 */}
          <Card data-tour-id="fact-sheet.diff">
            <CardHeader>
              <CardTitle className="text-lg">Conflicts to resolve</CardTitle>
              <CardDescription>
                Pairs where what you entered and what we found differ. Pick one, keep both, or
                merge.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {diffQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : diffQuery.isError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Couldn&apos;t load conflicts</AlertTitle>
                  <AlertDescription>
                    <Button
                      variant="link"
                      className="px-0"
                      onClick={() => diffQuery.refetch()}
                      data-testid="btn-retry-diff"
                    >
                      Try again
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : !diffQuery.data || diffHasNoConflicts(diffQuery.data) ? (
                <EmptyState
                  title="No conflicts"
                  body="Everything you've entered matches (or has been resolved against) what AI found."
                />
              ) : (
                <div className="space-y-6">
                  {DOMAINS.map((domain) => {
                    const pairs = diffQuery.data!.conflicts[domain] ?? [];
                    if (pairs.length === 0) return null;
                    return (
                      <div key={domain} className="overflow-hidden rounded-md border border-border">
                        <DomainGroupHeader
                          domain={domain}
                          conflictCount={pairs.length}
                          onAcceptAllAI={() =>
                            bulkAcceptMutation.mutate({ side: "scraped", domain })
                          }
                          onKeepAllMine={() => bulkAcceptMutation.mutate({ side: "user", domain })}
                          disabled={bulkAcceptMutation.isPending}
                        />
                        <div className="space-y-3 p-3">
                          {pairs.map((pair) => (
                            <ConflictPair
                              key={pair.userFact.id}
                              pair={pair}
                              onUseMine={handleUseMine}
                              onUseAI={handleUseAI}
                              onKeepBoth={handleKeepBoth}
                              disabled={acceptFactMutation.isPending}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Page-level bulk actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => bulkAcceptMutation.mutate({ side: "user" })}
                      disabled={bulkAcceptMutation.isPending}
                      data-testid="btn-keep-all-mine-global"
                    >
                      Keep all mine
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => bulkAcceptMutation.mutate({ side: "scraped" })}
                      disabled={bulkAcceptMutation.isPending}
                      data-testid="btn-accept-all-ai-global"
                    >
                      Accept all AI
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* RESOLVED FACTS — Task 10 */}
          {/* TODO(spec-2 Plan 2.5): delta indicators (new / changed / removed) — needs prior-run comparison query */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Resolved facts</CardTitle>
                  <CardDescription>Verified facts about {selectedBrand.name}.</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNewFact(emptyDraft)}
                  data-testid="button-add-fact"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add fact
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {resolvedQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : resolvedQuery.isError ? (
                <ErrorState
                  title="Couldn't load facts"
                  onRetry={() => resolvedQuery.refetch()}
                  isRetrying={resolvedQuery.isRefetching}
                />
              ) : !resolvedQuery.data?.data.length ? (
                <EmptyState
                  title="No facts yet"
                  body="Run a scrape or add facts manually to start building this brand's fact sheet."
                  cta={
                    <Button variant="outline" size="sm" onClick={() => setNewFact(emptyDraft)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add fact manually
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupByDomain(resolvedQuery.data.data.filter((f) => !!f))).map(
                    ([domain, facts]) => {
                      if (facts.length === 0) return null;
                      return (
                        <div
                          key={domain}
                          className="overflow-hidden rounded-md border border-border"
                        >
                          <DomainGroupHeader domain={domain as Domain} conflictCount={0} />
                          <div className="space-y-2 p-3">
                            {facts.map((fact) => (
                              <FactRow
                                key={fact.id}
                                fact={fact}
                                onEdit={(f) => setEditingFact(f)}
                                onDismiss={(f) => dismissFactMutation.mutate(f.id)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Add fact dialog — manual user-authoritative entry. */}
      <Dialog open={!!newFact} onOpenChange={(open) => !open && setNewFact(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a fact</DialogTitle>
            <DialogDescription>
              Manually add a fact about {selectedBrand?.name ?? "this brand"}. Manual facts are
              treated as authoritative and won&apos;t be overwritten by scrapes.
            </DialogDescription>
          </DialogHeader>
          {newFact && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={newFact.domain}
                  onValueChange={(v) => setNewFact({ ...newFact, domain: v as Domain })}
                >
                  <SelectTrigger data-testid="select-fact-domain">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOMAINS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {DOMAIN_LABELS[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Field name</Label>
                <Input
                  value={newFact.factKey}
                  placeholder="e.g. CEO, Headquarters, Founded"
                  onChange={(e) => setNewFact({ ...newFact, factKey: e.target.value })}
                  data-testid="input-fact-key"
                />
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  value={newFact.factValue}
                  placeholder="e.g. Jane Doe"
                  onChange={(e) => setNewFact({ ...newFact, factValue: e.target.value })}
                  data-testid="input-fact-value"
                />
              </div>
              <div className="space-y-2">
                <Label>Source URL (optional)</Label>
                <Input
                  value={newFact.sourceUrl}
                  placeholder="https://…"
                  onChange={(e) => setNewFact({ ...newFact, sourceUrl: e.target.value })}
                  data-testid="input-fact-source"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFact(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => newFact && createFactMutation.mutate(newFact)}
              disabled={!canSaveNewFact || createFactMutation.isPending}
              data-testid="button-save-fact"
            >
              {createFactMutation.isPending ? "Adding…" : "Add fact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (carried over from prior implementation; valueType editor is Plan 2.5) */}
      <Dialog open={!!editingFact} onOpenChange={(open) => !open && setEditingFact(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Fact</DialogTitle>
            <DialogDescription>Update this verified fact</DialogDescription>
          </DialogHeader>
          {editingFact && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Subcategory</Label>
                <Input
                  value={editingFact.subcategory}
                  onChange={(e) => setEditingFact({ ...editingFact, subcategory: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fact Key</Label>
                <Input
                  value={editingFact.factKey}
                  onChange={(e) => setEditingFact({ ...editingFact, factKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  value={editingFact.factValue}
                  onChange={(e) => setEditingFact({ ...editingFact, factValue: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Source URL</Label>
                <Input
                  value={editingFact.sourceUrl || ""}
                  onChange={(e) => setEditingFact({ ...editingFact, sourceUrl: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFact(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => editingFact && updateFactMutation.mutate(editingFact)}
              disabled={updateFactMutation.isPending}
            >
              {updateFactMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
