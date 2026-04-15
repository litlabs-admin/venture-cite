import { useEffect, useState } from "react";
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
import { TestModeBadge } from "@/components/TestModeBadge";
import { Sparkles, Play, RefreshCw, Target, TrendingUp, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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
  context: string | null;
  checkedAt: string;
};

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
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");

  const { data: brandsData, isLoading: brandsLoading } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });
  const brands = brandsData?.data || [];
  const selectedBrand = brands.find((b) => b.id === selectedBrandId);

  // Auto-select the single brand the user owns — common case right after
  // creating their first brand. Multi-brand users still get the placeholder
  // so we don't pick the wrong one for them.
  useEffect(() => {
    if (!selectedBrandId && brands.length === 1) {
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

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/brand-prompts/${selectedBrandId}/generate`, {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: [`/api/brand-prompts/${selectedBrandId}`] });
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
        queryClient.invalidateQueries({ queryKey: [`/api/brand-prompts/${selectedBrandId}/results`] });
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

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Citations"
        description="Track how often AI engines cite your brand when users ask them strategic questions."
      />

      {/* Brand selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <Target className="h-4 w-4" />
            Select Brand
          </CardTitle>
        </CardHeader>
        <CardContent>
          {brandsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : brands.length === 0 ? (
            <p className="text-muted-foreground text-sm">Create a brand first to start tracking citations.</p>
          ) : (
            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
              <SelectTrigger data-testid="select-brand">
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
          {/* Prompt portfolio card */}
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
                <div className="flex items-center gap-2">
                  <TestModeBadge />
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

          {/* Run citation check */}
          {hasPrompts && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-red-500" />
                  Run Citation Check
                </CardTitle>
                <CardDescription>
                  Ask each of your 10 prompts to ChatGPT, Perplexity, DeepSeek, Claude, and Gemini. Records which ones cite your brand.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
                  className="w-full bg-red-600 hover:bg-red-700"
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
                      Run 10 Prompts × 5 Platforms (50 checks)
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Each run makes ~50 AI API calls — takes 1-3 minutes.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Results dashboard */}
          {hasPrompts && (
            resultsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : results && results.totalChecks > 0 ? (
              <>
                {/* Top summary cards */}
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

                {/* By-platform table */}
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

                {/* By-prompt accordion */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Results by Prompt</CardTitle>
                    <CardDescription>Click a prompt to see which platforms cited your brand and the context.</CardDescription>
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
                              {row.platforms.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No results yet — run a citation check.</p>
                              ) : (
                                <div className="space-y-2">
                                  {row.platforms.map((plat, j) => (
                                    <div key={j} className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
                                      {plat.isCited ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm">{plat.platform}</p>
                                        {plat.context && (
                                          <p className="text-xs text-muted-foreground mt-1 italic">{plat.context}</p>
                                        )}
                                      </div>
                                    </div>
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
                  <p className="text-muted-foreground">No results yet. Click "Run Citation Check" to start.</p>
                </CardContent>
              </Card>
            )
          )}
        </>
      )}
    </div>
  );
}
