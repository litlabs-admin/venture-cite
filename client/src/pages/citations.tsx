import { useEffect, useState, useCallback } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import PageHeader from "@/components/PageHeader";
import { Sparkles, Play, RefreshCw, Target, TrendingUp, CheckCircle2, XCircle, Loader2, AlertCircle, ChevronDown, ChevronRight, Calendar } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import ReactMarkdown from "react-markdown";
import { XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import type { Brand } from "@shared/schema";

type BrandPrompt = {
  id: string;
  brandId: string;
  prompt: string;
  rationale: string | null;
  orderIndex: number;
  createdAt: string;
};

type PlatformResult = {
  platform: string;
  isCited: boolean;
  snippet: string | null;
  fullResponse: string | null;
  checkedAt: string;
};

const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  Claude: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  Gemini: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  Perplexity: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  DeepSeek: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
};

// One card per platform result inside the by-prompt accordion. Shows a clear
// status pill, a short snippet, and an expand control to reveal the full
// markdown-rendered AI response.
function PlatformResultCard({ result }: { result: PlatformResult }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = PLATFORM_COLORS[result.platform] || "bg-muted text-muted-foreground border-border";

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`platform-result-${result.platform.toLowerCase()}`}>
      <div className="flex items-center gap-3 p-3 bg-muted/30">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass}`}>
          <span>{result.platform}</span>
        </div>
        {result.isCited ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20">
            <CheckCircle2 className="h-3 w-3" />
            Cited
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            <XCircle className="h-3 w-3" />
            Not cited
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(result.checkedAt), { addSuffix: true })}
        </span>
      </div>

      {result.fullResponse ? (
        <div className="border-t">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
            data-testid={`toggle-response-${result.platform.toLowerCase()}`}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {expanded ? "Hide full response" : "Show full response"}
          </button>
          {expanded && (
            <div className="px-4 py-3 bg-muted/20 border-t max-h-[480px] overflow-y-auto">
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-pre:text-xs">
                <ReactMarkdown>{result.fullResponse}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-2 border-t text-xs text-muted-foreground italic">
          No response captured. Re-run the check to populate.
        </div>
      )}
    </div>
  );
}

type PromptRow = {
  promptId: string;
  prompt: string;
  rationale: string | null;
  platforms: PlatformResult[];
};

type PlatformStat = {
  platform: string;
  cited: number;
  checks: number;
  citationRate: number;
  lastRun: string | null;
};

type ResultsData = {
  byPlatform: PlatformStat[];
  byPrompt: PromptRow[];
  totalChecks: number;
  totalCited: number;
  citationRate: number;
};

export default function Citations() {
  const { toast } = useToast();
  const [selectedBrandId, setSelectedBrandId] = usePersistedState<string>("vc_citations_brandId", "");

  const { data: brandsData, isLoading: brandsLoading } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });
  const brands = brandsData?.data || [];
  const selectedBrand = brands.find((b) => b.id === selectedBrandId);

  // Auto-select a brand: pick the first if no valid selection exists (covers
  // first brand creation, deleted brand, returning users). Multi-brand users
  // keep their last-used brand via usePersistedState.
  useEffect(() => {
    if (brands.length > 0 && (!selectedBrandId || !brands.find(b => b.id === selectedBrandId))) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, selectedBrandId]);

  const { data: promptsData, isLoading: promptsLoading } = useQuery<{ success: boolean; data: BrandPrompt[] }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });
  const prompts = promptsData?.data || [];

  const { data: resultsData, isLoading: resultsLoading } = useQuery<{ success: boolean; data: ResultsData }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}/results`],
    enabled: !!selectedBrandId,
  });
  const results = resultsData?.data;

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
  const { data: historyData } = useQuery<{ success: boolean; data: CitationRunEntry[] }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}/history`],
    enabled: !!selectedBrandId,
  });
  const runHistory = historyData?.data || [];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/brand-prompts/${selectedBrandId}/generate`, {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Instant update: write new prompts directly into cache
        queryClient.setQueryData([`/api/brand-prompts/${selectedBrandId}`], { success: true, data: data.data });
        toast({ title: "Prompts generated!", description: `Created ${data.data.length} citation prompts for ${selectedBrand?.name}.` });
      } else {
        toast({ title: "Couldn't generate prompts", description: data.error || "Please try again.", variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Couldn't generate prompts", description: err.message, variant: "destructive" }),
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/brand-prompts/${selectedBrandId}/run`, {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Invalidate to refetch full results and history — these are complex aggregations
        // that the server computes, so we can't build them client-side from the run response.
        queryClient.invalidateQueries({ queryKey: [`/api/brand-prompts/${selectedBrandId}/results`] });
        queryClient.invalidateQueries({ queryKey: [`/api/brand-prompts/${selectedBrandId}/history`] });
        toast({
          title: "Citation check complete",
          description: `${data.data.totalCited} of ${data.data.totalChecks} checks cited your brand (${data.data.citationRate}%).`,
        });
      } else {
        toast({ title: "Check failed", description: data.error || "Please try again.", variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Check failed", description: err.message, variant: "destructive" }),
  });

  const generateLoadingMessage = useLoadingMessages(generateMutation.isPending, [
    "Analyzing your brand...",
    "Reviewing published articles...",
    "Crafting strategic citation prompts...",
    "Scoring each prompt for AI visibility...",
    "Finalizing your portfolio...",
  ]);

  const runLoadingMessage = useLoadingMessages(runMutation.isPending, [
    "Querying ChatGPT...",
    "Querying Perplexity...",
    "Querying DeepSeek...",
    "Querying Claude...",
    "Querying Gemini...",
    "Analyzing responses for brand mentions...",
  ]);

  const scheduleMutation = useMutation({
    mutationFn: async ({ schedule, day }: { schedule: string; day: number }) => {
      const response = await apiRequest("PATCH", `/api/brands/${selectedBrandId}/citation-schedule`, { schedule, day });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Schedule updated" });
    },
    onError: (err: Error) => toast({ title: "Failed to update schedule", description: err.message, variant: "destructive" }),
  });

  const currentSchedule = selectedBrand?.autoCitationSchedule || "off";
  const currentDay = selectedBrand?.autoCitationDay ?? 0;
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const [activeTab, setActiveTab] = usePersistedState<string>("vc_citations_tab", "prompts");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Drill-down for a specific run
  const { data: runDetailData, isLoading: runDetailLoading } = useQuery<{ success: boolean; data: { byPrompt: Array<{ prompt: string; platforms: PlatformResult[] }> } }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}/run/${expandedRunId}/details`],
    enabled: !!expandedRunId,
  });

  const hasPrompts = prompts.length > 0;
  const promptsAgeLabel = hasPrompts ? formatDistanceToNow(new Date(prompts[0].createdAt), { addSuffix: true }) : null;

  const bestPlatform = results?.byPlatform?.length
    ? [...results.byPlatform].sort((a, b) => b.citationRate - a.citationRate)[0]
    : null;
  const bestPrompt = results?.byPrompt?.length
    ? [...results.byPrompt]
        .map((p) => ({ ...p, citedCount: p.platforms.filter((pl) => pl.isCited).length }))
        .sort((a, b) => b.citedCount - a.citedCount)[0]
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
            <p className="text-muted-foreground text-sm">Create a brand first to start tracking citations.</p>
          ) : (
            <div className="flex items-center gap-3">
              <Target className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger data-testid="select-brand" className="flex-1">
                  <SelectValue placeholder="Choose a brand..." />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasPrompts && (
                <Button
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
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
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!selectedBrandId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Sparkles className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Select a Brand to Get Started</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Choose a brand above to generate strategic citation prompts and track how AI engines mention your brand.
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
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-red-500" />
                      Prompt Portfolio
                    </CardTitle>
                    <CardDescription>
                      10 strategic questions where {selectedBrand?.name} is most likely to be cited by AI engines.
                      {promptsAgeLabel && <span className="ml-2 text-xs">Generated {promptsAgeLabel}.</span>}
                    </CardDescription>
                  </div>
                  {hasPrompts && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("Regenerate will replace your existing 10 prompts. Continue?")) {
                          generateMutation.mutate();
                        }
                      }}
                      disabled={generateMutation.isPending}
                      data-testid="button-regenerate-prompts"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${generateMutation.isPending ? "animate-spin" : ""}`} />
                      Regenerate
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {promptsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : !hasPrompts ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      No prompts yet. Generate 10 citation prompts tailored to your brand profile and published articles.
                    </p>
                    <Button
                      onClick={() => generateMutation.mutate()}
                      disabled={generateMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                      data-testid="button-generate-prompts"
                    >
                      {generateMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {generateLoadingMessage}
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate 10 Citation Prompts
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {prompts.map((p, i) => (
                      <div key={p.id} className="border border-border rounded-lg p-4" data-testid={`prompt-row-${i}`}>
                        <div className="flex items-start gap-3">
                          <Badge variant="outline" className="mt-0.5 shrink-0">{i + 1}</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground">{p.prompt}</p>
                            {p.rationale && (
                              <p className="text-sm text-muted-foreground mt-1 italic">{p.rationale}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* RESULTS TAB */}
          {activeTab === "results" && (
            resultsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : results && results.totalChecks > 0 ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">Overall Citation Rate</p>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-3xl font-bold text-foreground" data-testid="stat-citation-rate">{results.citationRate}%</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {results.totalCited} of {results.totalChecks} checks cited your brand
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">Best Platform</p>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </div>
                      <p className="text-3xl font-bold text-foreground" data-testid="stat-best-platform">
                        {bestPlatform?.platform || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {bestPlatform ? `${bestPlatform.citationRate}% citation rate` : "No data yet"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">Top Prompt</p>
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-base font-semibold text-foreground line-clamp-2" data-testid="stat-top-prompt">
                        {bestPrompt ? `"${bestPrompt.prompt}"` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {bestPrompt ? `Cited on ${bestPrompt.citedCount} platforms` : "No data yet"}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Performance by Platform */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Performance by Platform</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 font-medium text-muted-foreground">Platform</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">Cited</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">Checks</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">Rate</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">Last Run</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.byPlatform.map((p) => (
                            <tr key={p.platform} className="border-b border-border" data-testid={`platform-row-${p.platform}`}>
                              <td className="py-3 font-medium">{p.platform}</td>
                              <td className="text-right py-3">{p.cited}</td>
                              <td className="text-right py-3">{p.checks}</td>
                              <td className="text-right py-3">
                                <Badge variant={p.citationRate >= 50 ? "default" : "outline"}>{p.citationRate}%</Badge>
                              </td>
                              <td className="text-right py-3 text-xs text-muted-foreground">
                                {p.lastRun ? formatDistanceToNow(new Date(p.lastRun), { addSuffix: true }) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Results by Prompt */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Results by Prompt</CardTitle>
                    <CardDescription>Click a prompt to see each AI's full answer and whether your brand was cited.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {results.byPrompt.map((row, i) => {
                        const citedCount = row.platforms.filter((p) => p.isCited).length;
                        return (
                          <AccordionItem key={row.promptId} value={row.promptId} data-testid={`prompt-result-${i}`}>
                            <AccordionTrigger className="hover:no-underline">
                              <div className="flex items-center gap-3 flex-1 text-left">
                                <Badge variant="outline" className="shrink-0">{i + 1}</Badge>
                                <span className="flex-1 truncate">{row.prompt}</span>
                                <Badge variant={citedCount > 0 ? "default" : "outline"} className="shrink-0">
                                  {citedCount}/{row.platforms.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              {row.rationale && (
                                <p className="text-xs text-muted-foreground italic mb-3 px-1">Why this prompt: {row.rationale}</p>
                              )}
                              {row.platforms.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No results yet — run a citation check.</p>
                              ) : (
                                <div className="space-y-3">
                                  {row.platforms.map((plat, j) => (
                                    <PlatformResultCard key={`${plat.platform}-${j}`} result={plat} />
                                  ))}
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Play className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground mb-4">No results yet. Run a citation check to see how AI engines mention your brand.</p>
                  {hasPrompts && (
                    <Button
                      onClick={() => runMutation.mutate()}
                      disabled={runMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
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
                  )}
                </CardContent>
              </Card>
            )
          )}

          {/* HISTORY TAB */}
          {activeTab === "history" && (
            runHistory.length > 0 ? (
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
                        {runHistory.length >= 2 && (() => {
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
                            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} className="text-muted-foreground" />
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0].payload;
                                return (
                                  <div className="bg-popover border border-border rounded-lg shadow-md p-3 text-sm">
                                    <p className="font-medium">{d.fullDate}</p>
                                    <p className="text-foreground mt-1">Citation Rate: <span className="font-bold">{d.citationRate}%</span></p>
                                    <p className="text-muted-foreground">{d.totalCited} / {d.totalChecks} cited</p>
                                    <p className="text-xs text-muted-foreground mt-1 capitalize">{d.triggeredBy} run</p>
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
                              activeDot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--background))" }}
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
                      {runHistory.slice(0, 20).map((run, i) => {
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
                                <span className="font-medium text-sm">{format(new Date(run.startedAt), "MMM d, yyyy")}</span>
                                <span className="text-xs text-muted-foreground ml-2">{format(new Date(run.startedAt), "h:mm a")}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-sm font-medium">{run.citationRate}%</span>
                                {delta !== 0 && (
                                  <span className={`text-xs ${delta > 0 ? "text-green-600" : "text-red-500"}`}>
                                    {delta > 0 ? `+${delta}` : delta}%
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">{run.totalCited}/{run.totalChecks}</span>
                                <Badge variant="outline" className="text-xs capitalize">{run.triggeredBy}</Badge>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t border-border px-4 py-4 bg-muted/20">
                                {runDetailLoading ? (
                                  <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-sm text-muted-foreground">Loading run details...</span>
                                  </div>
                                ) : runDetailData?.data?.byPrompt ? (
                                  <Accordion type="single" collapsible className="w-full">
                                    {runDetailData.data.byPrompt.map((row, j) => {
                                      const citedCount = row.platforms.filter((p) => p.isCited).length;
                                      return (
                                        <AccordionItem key={j} value={String(j)}>
                                          <AccordionTrigger className="hover:no-underline">
                                            <div className="flex items-center gap-3 flex-1 text-left">
                                              <Badge variant="outline" className="shrink-0">{j + 1}</Badge>
                                              <span className="flex-1 truncate text-sm">{row.prompt}</span>
                                              <Badge variant={citedCount > 0 ? "default" : "outline"} className="shrink-0">
                                                {citedCount}/{row.platforms.length}
                                              </Badge>
                                            </div>
                                          </AccordionTrigger>
                                          <AccordionContent>
                                            <div className="space-y-3">
                                              {row.platforms.map((plat, k) => (
                                                <PlatformResultCard key={`${plat.platform}-${k}`} result={plat} />
                                              ))}
                                            </div>
                                          </AccordionContent>
                                        </AccordionItem>
                                      );
                                    })}
                                  </Accordion>
                                ) : (
                                  <p className="text-sm text-muted-foreground text-center py-4">No detail data available for this run.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">No run history yet. Run a citation check to start tracking trends.</p>
                </CardContent>
              </Card>
            )
          )}

          {/* SCHEDULE TAB */}
          {activeTab === "schedule" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-red-500" />
                  Auto-Citation Schedule
                </CardTitle>
                <CardDescription>
                  Automatically regenerate prompts and run citation checks on a schedule. Each run generates 10 fresh prompts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Frequency</label>
                    <Select
                      value={currentSchedule}
                      onValueChange={(val) => scheduleMutation.mutate({ schedule: val, day: currentDay })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="weekly">Every week</SelectItem>
                        <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                        <SelectItem value="monthly">Every month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {currentSchedule !== "off" && (
                    <div className="flex-1">
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Day of week</label>
                      <Select
                        value={String(currentDay)}
                        onValueChange={(val) => scheduleMutation.mutate({ schedule: currentSchedule, day: Number(val) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_NAMES.map((name, i) => (
                            <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {currentSchedule !== "off" && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Runs every {currentSchedule === "weekly" ? "week" : currentSchedule === "biweekly" ? "2 weeks" : "month"} on {DAY_NAMES[currentDay]}. Generates 10 new prompts and checks all 5 platforms automatically.
                    {selectedBrand?.lastAutoCitationAt && (
                      <span className="ml-1">Last run: {formatDistanceToNow(new Date(selectedBrand.lastAutoCitationAt), { addSuffix: true })}.</span>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
