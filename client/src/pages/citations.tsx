import { usePersistedState } from "@/hooks/use-persisted-state";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import PageHeader from "@/components/PageHeader";
import { Sparkles, Play, RefreshCw, Target, Loader2, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import PromptsTab, { type BrandPrompt } from "@/components/citations/PromptsTab";
import ResultsTab from "@/components/citations/ResultsTab";
import HistoryTab from "@/components/citations/HistoryTab";
import ScheduleTab from "@/components/citations/ScheduleTab";

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

  const runMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/brand-prompts/${selectedBrandId}/run`, {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Invalidate to refetch full results and history — these are complex aggregations
        // that the server computes, so we can't build them client-side from the run response.
        queryClient.invalidateQueries({
          queryKey: [`/api/brand-prompts/${selectedBrandId}/results`],
        });
        queryClient.invalidateQueries({
          queryKey: [`/api/brand-prompts/${selectedBrandId}/history`],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding-status"] });
        toast({
          title: "Citation check complete",
          description: `${data.data.totalCited} of ${data.data.totalChecks} checks cited your brand (${data.data.citationRate}%).`,
        });
      } else {
        toast({
          title: "Check failed",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) =>
      toast({ title: "Check failed", description: err.message, variant: "destructive" }),
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

  const runLoadingMessage = useLoadingMessages(runMutation.isPending, [
    "Querying ChatGPT...",
    "Querying Perplexity...",
    "Querying DeepSeek...",
    "Querying Claude...",
    "Querying Gemini...",
    "Analyzing responses for brand mentions...",
  ]);

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
                      if (runMutation.isPending || !selectedBrandId) return;
                      runMutation.mutate();
                    }}
                    disabled={runMutation.isPending || !selectedBrandId}
                    className="bg-red-600 hover:bg-red-700 shrink-0"
                    data-testid="button-run-check"
                  >
                    {runMutation.isPending ? (
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
                  <Button
                    variant="outline"
                    onClick={() => backfillMutation.mutate()}
                    disabled={backfillMutation.isPending}
                    className="shrink-0"
                    title="Re-apply the current brand-detection logic to stored responses. Free — no AI calls."
                    data-testid="button-backfill-detection"
                  >
                    {backfillMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Re-checking…
                      </>
                    ) : (
                      "Re-check stored"
                    )}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
              runLoadingMessage={runLoadingMessage}
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
