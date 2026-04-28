import { useState, useEffect, useReducer, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { Article, BrandPrompt } from "@shared/schema";
import {
  Sparkles,
  Loader2,
  BarChart3,
  Layers,
  Code,
  Workflow,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Search,
  FileText,
  Zap,
  Target,
  Brain,
  Gauge,
  SplitSquareVertical,
  Database,
  Timer,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Activity,
  Pencil,
  Check,
} from "lucide-react";

interface SignalScore {
  signal: string;
  score: number;
  maxScore: number;
  status: "excellent" | "good" | "needs_improvement" | "poor";
  recommendations: string[];
}

interface ChunkAnalysis {
  chunkNumber: number;
  tokenCount: number;
  wordCount: number;
  hasHeading: boolean;
  hasDirectAnswer: boolean;
  questionBased: boolean;
  extractable: boolean;
  content: string;
  issues: string[];
}

interface SchemaAudit {
  schemaType: string;
  present: boolean;
  searchable: boolean;
  indexable: boolean;
  retrievable: boolean;
  recommendations: string[];
}

interface PipelineStage {
  stage: string;
  status: "pass" | "warning" | "fail";
  score: number;
  details: string[];
}

const STAGE_BLURBS: Record<string, string> = {
  Prepare:
    "Real query-prep quality. We measure how semantically close your first paragraph is to the target query (via embeddings), whether the query has meaningful terms after stopword filtering, and whether the opening paragraph mentions any of them.",
  Retrieve:
    "Real retrieval surface. Combines query-term coverage, the fraction of headings phrased as questions, and the fraction of chunks that are formatted as AI-friendly answer units.",
  Signal:
    "The overall score from Tab 1's scorecard — exactly the same inputs, exactly the same number. If they differ, it's a bug.",
  Serve:
    "Real citability signals: byline detection, outbound citation count, and whether at least one chunk has a heading plus a direct 200+ char answer.",
};

// -----------------------------------------------------------------------------
// Cross-tab state reducer (Wave 1.5). Keyed by `${brandId}|${articleId}`. When
// the user switches articles, the active slice swaps to a fresh empty object,
// so stale results from the previous article don't linger on the stat cards.
// -----------------------------------------------------------------------------
type TabName = "analyze" | "chunks" | "schema" | "pipeline";
type PerArticleState = {
  analyzeResult?: any;
  chunksResult?: any;
  schemaResult?: any;
  pipelineResult?: any;
  computedAt: Partial<Record<TabName, number>>;
};
type ReducerState = Record<string, PerArticleState>;
type ReducerAction =
  | { type: "set"; key: string; tab: TabName; data: any }
  | { type: "reset"; key: string };

function geoReducer(state: ReducerState, action: ReducerAction): ReducerState {
  switch (action.type) {
    case "reset":
      return { ...state, [action.key]: { computedAt: {} } };
    case "set": {
      const slice = state[action.key] ?? { computedAt: {} };
      const tabKey =
        action.tab === "analyze"
          ? "analyzeResult"
          : action.tab === "chunks"
            ? "chunksResult"
            : action.tab === "schema"
              ? "schemaResult"
              : "pipelineResult";
      return {
        ...state,
        [action.key]: {
          ...slice,
          [tabKey]: action.data,
          computedAt: { ...slice.computedAt, [action.tab]: Date.now() },
        },
      };
    }
    default:
      return state;
  }
}

function formatRelativeMinutes(ts?: number): string | null {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
}

// Line-level LCS diff — small enough to inline; no new dep.
function lineDiff(
  oldText: string,
  newText: string,
): Array<{ kind: "equal" | "add" | "del"; text: string }> {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: Array<{ kind: "equal" | "add" | "del"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "del", text: a[i] });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ kind: "del", text: a[i++] });
  while (j < n) out.push({ kind: "add", text: b[j++] });
  return out;
}

export default function GeoSignals() {
  const { toast } = useToast();
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const [selectedArticleId, setSelectedArticleId] = useState<string>("");
  const [, setContentToAnalyze] = useState<string>("");
  const [targetQuery, setTargetQuery] = useState<string>("");
  const [queryPopoverOpen, setQueryPopoverOpen] = useState(false);
  const [url, setUrl] = useState<string>("");
  const [urlTouched, setUrlTouched] = useState(false);

  const [geoState, geoDispatch] = useReducer(geoReducer, {} as ReducerState);
  const articleKey = `${selectedBrandId || "_"}|${selectedArticleId || "_"}`;
  const activeSlice: PerArticleState = geoState[articleKey] ?? { computedAt: {} };

  useEffect(() => {
    // On article switch, ensure a fresh slice exists so stat cards reset.
    if (selectedArticleId && !geoState[articleKey]) {
      geoDispatch({ type: "reset", key: articleKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleKey]);

  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [pendingOptimized, setPendingOptimized] = useState<string>("");

  const { data: articlesData } = useQuery<{ data: Article[] }>({
    queryKey: ["/api/articles", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/articles?brandId=${selectedBrandId}`);
      return res.json();
    },
  });

  const articles = articlesData?.data || [];
  const selectedArticle = articles.find((a) => a.id === selectedArticleId);

  const { data: brandPromptsData } = useQuery<{ data: BrandPrompt[] }>({
    queryKey: ["/api/brand-prompts", selectedBrandId],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brand-prompts/${selectedBrandId}`);
      return res.json();
    },
  });
  const brandPrompts = (brandPromptsData?.data || []).filter(
    (p) => (p as any).status !== "archived",
  );
  const filteredPrompts = useMemo(() => {
    const q = (targetQuery || "").trim().toLowerCase();
    if (!q) return brandPrompts;
    return brandPrompts.filter((p) => ((p as any).prompt as string).toLowerCase().includes(q));
  }, [brandPrompts, targetQuery]);

  useEffect(() => {
    if (!selectedArticle || urlTouched) return;
    if (url) return;
    const site = (selectedBrand as any)?.website as string | undefined;
    const slug = (selectedArticle as any).slug as string | undefined;
    if (site && slug) {
      setUrl(`${site.replace(/\/$/, "")}/articles/${slug}`);
    }
  }, [selectedArticle, selectedBrand, urlTouched, url]);

  const analyzeSignalsMutation = useMutation({
    mutationFn: async (data: {
      content: string;
      targetQuery: string;
      brandId?: string;
      articleUpdatedAt?: string;
    }) => {
      const response = await apiRequest("POST", "/api/geo-signals/analyze", data);
      return response.json();
    },
    onSuccess: (data) => {
      geoDispatch({ type: "set", key: articleKey, tab: "analyze", data: data?.data });
    },
    onError: () => toast({ title: "Analysis failed", variant: "destructive" }),
  });

  const analyzeChunksMutation = useMutation({
    mutationFn: async (data: { content: string }) => {
      const response = await apiRequest("POST", "/api/geo-signals/chunk-analysis", data);
      return response.json();
    },
    onSuccess: (data) => {
      geoDispatch({ type: "set", key: articleKey, tab: "chunks", data: data?.data });
    },
    onError: () => toast({ title: "Chunk analysis failed", variant: "destructive" }),
  });

  const optimizeChunksMutation = useMutation({
    mutationFn: async (data: { content: string; brandId?: string }) => {
      const response = await apiRequest("POST", "/api/geo-signals/optimize-chunks", data);
      return response.json();
    },
    onSuccess: () => toast({ title: "Content optimized into AI-extractable chunks!" }),
    onError: () => toast({ title: "Optimization failed", variant: "destructive" }),
  });

  const applyOptimizedMutation = useMutation({
    mutationFn: async ({
      articleId,
      content,
      expectedVersion,
    }: {
      articleId: string;
      content: string;
      expectedVersion?: number;
    }) => {
      const response = await apiRequest("PUT", `/api/articles/${articleId}`, {
        content,
        expectedVersion,
      });
      if (response.status === 409) {
        const err = new Error("conflict");
        (err as any).status = 409;
        throw err;
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Article updated",
        description: "Optimised content saved back to this article.",
      });
      setDiffDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      if (selectedBrandId) {
        queryClient.invalidateQueries({ queryKey: ["/api/articles", selectedBrandId] });
      }
    },
    onError: (err: any) => {
      if (err?.status === 409) {
        toast({
          title: "Article was modified elsewhere",
          description: "Reload and try again so we don't overwrite newer changes.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to apply optimisation",
          description: "The article couldn't be updated. Try again or open it in the editor.",
          variant: "destructive",
        });
      }
    },
  });

  const auditSchemaMutation = useMutation({
    mutationFn: async (data: { url: string }) => {
      const response = await apiRequest("POST", "/api/geo-signals/schema-audit", data);
      return response.json();
    },
    onSuccess: (data) => {
      geoDispatch({ type: "set", key: articleKey, tab: "schema", data: data?.data });
    },
    onError: () => toast({ title: "Schema audit failed", variant: "destructive" }),
  });

  const simulatePipelineMutation = useMutation({
    mutationFn: async (data: {
      content: string;
      query: string;
      articleUpdatedAt?: string;
      schemaCompleteness?: number;
    }) => {
      const response = await apiRequest("POST", "/api/geo-signals/pipeline-simulation", data);
      return response.json();
    },
    onSuccess: (data) => {
      geoDispatch({ type: "set", key: articleKey, tab: "pipeline", data: data?.data });
    },
    onError: () => toast({ title: "Pipeline simulation failed", variant: "destructive" }),
  });

  const signalScores: SignalScore[] = activeSlice.analyzeResult?.signals || [];
  const overallScore: number | null =
    typeof activeSlice.analyzeResult?.overallScore === "number"
      ? activeSlice.analyzeResult.overallScore
      : null;
  const chunks: ChunkAnalysis[] = activeSlice.chunksResult?.chunks || [];
  const chunkStats = activeSlice.chunksResult?.stats || null;
  const schemaAudits: SchemaAudit[] = activeSlice.schemaResult?.schemas || [];
  const additionalTypes: string[] = activeSlice.schemaResult?.additionalTypes || [];
  const schemaCachedAt: string | undefined = activeSlice.schemaResult?.cachedAt;
  const pipelineStages: PipelineStage[] = activeSlice.pipelineResult?.stages || [];
  const optimizedContent = optimizeChunksMutation.data?.data?.optimizedContent || "";

  const getScoreColor = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return "text-green-500";
    if (percentage >= 60) return "text-yellow-500";
    if (percentage >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "excellent":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "good":
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case "needs_improvement":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "poor":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "pass":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "fail":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const handleAnalyzeArticle = () => {
    if (selectedArticle && selectedArticle.content) {
      setContentToAnalyze(selectedArticle.content);
      analyzeSignalsMutation.mutate({
        content: selectedArticle.content,
        targetQuery: targetQuery || selectedArticle.title || "",
        brandId: selectedBrandId,
        articleUpdatedAt: selectedArticle.updatedAt
          ? new Date(selectedArticle.updatedAt).toISOString()
          : undefined,
      });
    }
  };

  const brandName = selectedBrand?.companyName || "this brand";

  return (
    <>
      <Helmet>
        <title>GEO Signal Optimization Suite | VentureCite</title>
        <meta
          name="description"
          content="Optimize your content for AI search with honest 6-signal scoring, chunk engineering, schema auditing, and pipeline simulation."
        />
      </Helmet>

      <div className="space-y-8">
        <PageHeader
          title="GEO Signals"
          description="Honest GEO scoring: 6 content signals + freshness, chunk engineering, schema audit, pipeline simulation"
          actions={<BrandSelector className="w-[160px]" />}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Overall Score
                </span>
                <Gauge className="w-4 h-4 text-muted-foreground" />
              </div>
              <p
                className="text-3xl font-semibold text-foreground tracking-tight"
                data-testid="stat-overall"
              >
                {overallScore === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    {overallScore}
                    <span className="text-lg text-muted-foreground">/100</span>
                  </>
                )}
              </p>
              <Progress value={overallScore ?? 0} className="mt-3 h-1.5" />
              {activeSlice.computedAt.analyze &&
                Date.now() - (activeSlice.computedAt.analyze ?? 0) > 5 * 60 * 1000 && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    computed {formatRelativeMinutes(activeSlice.computedAt.analyze)}
                  </p>
                )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Extractable Chunks
                </span>
                <SplitSquareVertical className="w-4 h-4 text-muted-foreground" />
              </div>
              <p
                className="text-3xl font-semibold text-foreground tracking-tight"
                data-testid="stat-chunks"
              >
                {chunkStats ? (
                  <>
                    {chunkStats.extractableChunks}
                    <span className="text-lg text-muted-foreground">/{chunkStats.totalChunks}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </p>
              {activeSlice.computedAt.chunks &&
                Date.now() - (activeSlice.computedAt.chunks ?? 0) > 5 * 60 * 1000 && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    computed {formatRelativeMinutes(activeSlice.computedAt.chunks)}
                  </p>
                )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Schema Coverage
                </span>
                <Code className="w-4 h-4 text-muted-foreground" />
              </div>
              <p
                className="text-3xl font-semibold text-foreground tracking-tight"
                data-testid="stat-schema"
              >
                {schemaAudits.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    {schemaAudits.filter((s) => s.present).length}
                    <span className="text-lg text-muted-foreground">/{schemaAudits.length}</span>
                  </>
                )}
              </p>
              {activeSlice.computedAt.schema &&
                Date.now() - (activeSlice.computedAt.schema ?? 0) > 5 * 60 * 1000 && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    computed {formatRelativeMinutes(activeSlice.computedAt.schema)}
                  </p>
                )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Pipeline Status
                </span>
                <Workflow className="w-4 h-4 text-muted-foreground" />
              </div>
              <p
                className="text-3xl font-semibold text-foreground tracking-tight"
                data-testid="stat-pipeline"
              >
                {pipelineStages.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    {pipelineStages.filter((s) => s.status === "pass").length}
                    <span className="text-lg text-muted-foreground">/{pipelineStages.length}</span>
                  </>
                )}
              </p>
              {activeSlice.computedAt.pipeline &&
                Date.now() - (activeSlice.computedAt.pipeline ?? 0) > 5 * 60 * 1000 && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    computed {formatRelativeMinutes(activeSlice.computedAt.pipeline)}
                  </p>
                )}
            </CardContent>
          </Card>
        </div>

        {/* Sticky article toolbar — visible next to whichever analyze button is on screen. */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-2 -mx-2 px-2 border-b">
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">Article:</Label>
            {selectedBrandId && articles.length > 0 && (
              <Select value={selectedArticleId} onValueChange={setSelectedArticleId}>
                <SelectTrigger className="w-[320px]" data-testid="select-article">
                  <SelectValue placeholder="Select article" />
                </SelectTrigger>
                <SelectContent>
                  {articles.map((article) => (
                    <SelectItem key={article.id} value={article.id}>
                      {article.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedBrandId && articles.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>No articles yet for {brandName}.</span>
                <Link href="/articles">
                  <Button variant="outline" size="sm" data-testid="button-create-article">
                    Create an article →
                  </Button>
                </Link>
              </div>
            )}
            {!selectedBrandId && (
              <span className="text-sm text-muted-foreground">Select a brand first.</span>
            )}
          </div>
        </div>

        <Tabs defaultValue="signals" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="signals" data-testid="tab-signals">
              <BarChart3 className="w-4 h-4 mr-2" /> Signal Scorecard
            </TabsTrigger>
            <TabsTrigger value="chunks" data-testid="tab-chunks">
              <SplitSquareVertical className="w-4 h-4 mr-2" /> Chunk Engineer
            </TabsTrigger>
            <TabsTrigger value="schema" data-testid="tab-schema">
              <Code className="w-4 h-4 mr-2" /> Schema Lab
            </TabsTrigger>
            <TabsTrigger value="pipeline" data-testid="tab-pipeline">
              <Workflow className="w-4 h-4 mr-2" /> Pipeline Sim
            </TabsTrigger>
            <TabsTrigger value="freshness" data-testid="tab-freshness">
              <Clock className="w-4 h-4 mr-2" /> Freshness
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">GEO Signal Scorecard</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Six honest content signals + freshness. Each signal's label matches its actual
                  formula.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-foreground">Target Query</Label>
                    <Popover open={queryPopoverOpen} onOpenChange={setQueryPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                          data-testid="input-target-query"
                        >
                          <span className={targetQuery ? "" : "text-muted-foreground"}>
                            {targetQuery || "Pick a tracked prompt or type a query"}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[--radix-popover-trigger-width] p-0"
                        align="start"
                      >
                        <Command>
                          <CommandInput
                            placeholder="Type a query or pick one..."
                            value={targetQuery}
                            onValueChange={setTargetQuery}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setQueryPopoverOpen(false);
                              }
                            }}
                          />
                          <CommandList>
                            {brandPrompts.length === 0 && (
                              <CommandEmpty>
                                No tracked prompts — type a freeform query above.
                              </CommandEmpty>
                            )}
                            {filteredPrompts.length > 0 && (
                              <CommandGroup heading="Tracked prompts">
                                {filteredPrompts.slice(0, 50).map((p) => {
                                  const text = (p as any).prompt as string;
                                  return (
                                    <CommandItem
                                      key={p.id}
                                      value={text}
                                      onSelect={() => {
                                        setTargetQuery(text);
                                        setQueryPopoverOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${
                                          targetQuery === text ? "opacity-100" : "opacity-0"
                                        }`}
                                      />
                                      <span className="truncate">{text}</span>
                                    </CommandItem>
                                  );
                                })}
                                {filteredPrompts.length > 50 && (
                                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    Showing 50 of {filteredPrompts.length} — refine your search
                                  </div>
                                )}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAnalyzeArticle}
                      disabled={!selectedArticle || analyzeSignalsMutation.isPending}
                      className="bg-primary hover:bg-primary/90"
                      data-testid="button-analyze-signals"
                    >
                      {analyzeSignalsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <BarChart3 className="w-4 h-4 mr-2" />
                      )}
                      Analyze Signals
                    </Button>
                  </div>
                </div>

                {signalScores.length > 0 && (
                  <div className="space-y-4">
                    {signalScores.map((signal, idx) => (
                      <div key={idx} className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(signal.status)}
                            <span className="font-medium text-foreground">{signal.signal}</span>
                          </div>
                          <span
                            className={`font-bold ${getScoreColor(signal.score, signal.maxScore)}`}
                          >
                            {signal.score}/{signal.maxScore}
                          </span>
                        </div>
                        <Progress
                          value={(signal.score / signal.maxScore) * 100}
                          className="h-2 mb-2"
                        />
                        {signal.recommendations.length > 0 && (
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {signal.recommendations.map((rec, rIdx) => (
                              <li key={rIdx} className="flex items-start gap-2">
                                <ChevronRight className="w-3 h-3 mt-1 text-primary" />
                                {rec}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {signalScores.length === 0 && !analyzeSignalsMutation.isPending && (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">Select an article and run analysis</p>
                    <p className="text-sm">Get scores for the 6 content signals plus freshness</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Collapsible defaultOpen={false}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover-elevate">
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      How these signals are scored
                      <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Each label below matches what we actually compute. No fiction.
                    </CardDescription>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="space-y-4 text-sm">
                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-5 h-5 text-primary" />
                          <span className="font-semibold text-foreground text-base">
                            1. Content depth
                          </span>
                        </div>
                        <p className="text-foreground mb-3">
                          The length + heading structure of your article. AI search prefers
                          comprehensive pages with clear H2/H3 hierarchy.
                        </p>
                        <div className="space-y-2 text-muted-foreground">
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>1500+ words across clear sections</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>Use both H2 for top sections and H3 for sub-points</span>
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain className="w-5 h-5 text-blue-500" />
                          <span className="font-semibold text-foreground text-base">
                            2. Semantic similarity to query
                          </span>
                        </div>
                        <p className="text-foreground mb-3">
                          How closely the ideas in your article match the target query. We compute
                          this with real text embeddings — not keyword matching.
                        </p>
                        <div className="space-y-2 text-muted-foreground">
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>Answer the question directly in the first paragraph</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>Use the query's concepts and related terminology naturally</span>
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Search className="w-5 h-5 text-green-500" />
                          <span className="font-semibold text-foreground text-base">
                            3. Query-term coverage
                          </span>
                        </div>
                        <p className="text-foreground mb-3">
                          How many meaningful words from your target query appear in the article.
                          Stopwords like "the" and "is" are filtered out — only content words count.
                        </p>
                        <div className="space-y-2 text-muted-foreground">
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>
                              If the query is "best CRM for startups", the article should cover
                              "CRM" and "startups" explicitly
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="w-5 h-5 text-yellow-500" />
                          <span className="font-semibold text-foreground text-base">
                            4. Exact-phrase match
                          </span>
                        </div>
                        <p className="text-foreground mb-3">
                          Whether your article contains the target query verbatim at least once. A
                          small boost, but worth ensuring.
                        </p>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <SplitSquareVertical className="w-5 h-5 text-primary" />
                          <span className="font-semibold text-foreground text-base">
                            5. Structure extractability
                          </span>
                        </div>
                        <p className="text-foreground mb-3">
                          How many of your article's chunks are formatted as AI-friendly answer
                          units (clear heading + direct opening answer + under 500 tokens).
                        </p>
                        <div className="space-y-2 text-muted-foreground">
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>Start each section with a question-style H2</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>
                              Follow each heading with a 2-3 sentence direct answer before adding
                              detail
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-5 h-5 text-orange-500" />
                          <span className="font-semibold text-foreground text-base">
                            6. Authority signals
                          </span>
                        </div>
                        <p className="text-foreground mb-3">
                          Real E-E-A-T markers: visible byline, outbound citations to authoritative
                          sources, factual claims with attribution, and valid schema markup.
                          Fiction-free.
                        </p>
                        <div className="space-y-2 text-muted-foreground">
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>Include a visible byline</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>Cite ≥3 authoritative sources with outbound links</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>
                              Run Schema Lab audit on this article's URL to contribute to this
                              signal
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-5 h-5 text-cyan-500" />
                          <span className="font-semibold text-foreground text-base">
                            7. Freshness
                          </span>
                        </div>
                        <p className="text-foreground mb-3">
                          How recently this article was updated. ≤30 days = fresh, 30-90 = aging,
                          90+ = stale.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </TabsContent>

          <TabsContent value="chunks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">500-Token Chunk Engineer</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Restructure content into AI-extractable ~375 word chunks with question-based
                  headings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Button
                    onClick={() => {
                      if (selectedArticle && selectedArticle.content) {
                        setContentToAnalyze(selectedArticle.content);
                        analyzeChunksMutation.mutate({ content: selectedArticle.content });
                      }
                    }}
                    disabled={
                      !selectedArticle ||
                      !selectedArticle.content ||
                      analyzeChunksMutation.isPending
                    }
                    variant="outline"
                    data-testid="button-analyze-chunks"
                  >
                    {analyzeChunksMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <SplitSquareVertical className="w-4 h-4 mr-2" />
                    )}
                    Analyze Chunks
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedArticle && selectedArticle.content) {
                        optimizeChunksMutation.mutate({
                          content: selectedArticle.content,
                          brandId: selectedBrandId,
                        });
                      }
                    }}
                    disabled={
                      !selectedArticle ||
                      !selectedArticle.content ||
                      optimizeChunksMutation.isPending
                    }
                    className="bg-primary hover:bg-primary/90"
                    data-testid="button-optimize-chunks"
                  >
                    {optimizeChunksMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Auto-Optimize Chunks
                  </Button>
                </div>

                {chunks.length > 0 && chunkStats && (
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-4 bg-muted/30 rounded-lg text-center">
                      <p className="text-2xl font-bold text-foreground">{chunkStats.totalChunks}</p>
                      <p className="text-sm text-muted-foreground">Total Chunks</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-500">
                        {chunkStats.extractableChunks}
                      </p>
                      <p className="text-sm text-muted-foreground">Extractable</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg text-center">
                      <p className="text-2xl font-bold text-foreground">{chunkStats.avgTokens}</p>
                      <p className="text-sm text-muted-foreground">Avg Tokens</p>
                    </div>
                  </div>
                )}

                {chunks.length > 0 && (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {chunks.map((chunk, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-lg border ${chunk.extractable ? "bg-emerald-500/10 border-emerald-500/30" : "bg-destructive/10 border-destructive/30"}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={chunk.extractable ? "default" : "destructive"}>
                                Chunk {chunk.chunkNumber}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {chunk.tokenCount} tokens / {chunk.wordCount} words
                              </span>
                            </div>
                            <div className="flex gap-2">
                              {chunk.hasHeading && (
                                <Badge
                                  variant="outline"
                                  className="text-emerald-600 border-emerald-500/50"
                                >
                                  Has Heading
                                </Badge>
                              )}
                              {chunk.questionBased && (
                                <Badge variant="outline" className="text-sky-600 border-sky-500/50">
                                  Question H2
                                </Badge>
                              )}
                              {chunk.hasDirectAnswer && (
                                <Badge variant="outline" className="text-primary border-primary">
                                  Direct Answer
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-foreground line-clamp-3 mb-2">
                            {chunk.content}
                          </p>
                          {chunk.issues.length > 0 && (
                            <div className="text-sm text-red-500">
                              {chunk.issues.map((issue, iIdx) => (
                                <p key={iIdx}>⚠️ {issue}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {optimizedContent && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-foreground">Optimized Content</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(optimizedContent);
                            toast({ title: "Copied to clipboard" });
                          }}
                          data-testid="button-copy-optimized"
                        >
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          disabled={!selectedArticle || applyOptimizedMutation.isPending}
                          onClick={() => {
                            if (!selectedArticle) return;
                            setPendingOptimized(optimizedContent);
                            setDiffDialogOpen(true);
                          }}
                          data-testid="button-apply-optimized"
                        >
                          Apply to Article
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={optimizedContent}
                      readOnly
                      className=" text-foreground min-h-[300px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      "Apply to Article" overwrites the selected article's content with this
                      optimised version. Open it in the Articles page afterwards to review.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schema" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Schema Impact Lab</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Audit structured data for Searchable, Indexable, and Retrievable functions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label className="text-foreground">URL to Audit</Label>
                    <Input
                      value={url}
                      onChange={(e) => {
                        setUrlTouched(true);
                        setUrl(e.target.value);
                      }}
                      placeholder="https://example.com/page"
                      className=" text-foreground"
                      data-testid="input-url"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      This guesses your URL pattern. Edit if your article is hosted at a different
                      path.
                    </p>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => auditSchemaMutation.mutate({ url })}
                      disabled={!url || auditSchemaMutation.isPending}
                      className="bg-primary hover:bg-primary/90"
                      data-testid="button-audit-schema"
                    >
                      {auditSchemaMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Code className="w-4 h-4 mr-2" />
                      )}
                      Audit Schema
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <Search className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                    <p className="font-medium text-foreground">Searchable</p>
                    <p className="text-xs text-muted-foreground">
                      Affects recall - whether AI can find you
                    </p>
                  </div>
                  <div className="text-center">
                    <Database className="w-8 h-8 mx-auto text-green-500 mb-2" />
                    <p className="font-medium text-foreground">Indexable</p>
                    <p className="text-xs text-muted-foreground">Affects filtering and ordering</p>
                  </div>
                  <div className="text-center">
                    <FileText className="w-8 h-8 mx-auto text-primary mb-2" />
                    <p className="font-medium text-foreground">Retrievable</p>
                    <p className="text-xs text-muted-foreground">Affects what gets cited</p>
                  </div>
                </div>

                {schemaAudits.length > 0 ? (
                  <div className="space-y-4">
                    {schemaCachedAt && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        Last audited{" "}
                        {Math.max(
                          0,
                          Math.floor(
                            (Date.now() - new Date(schemaCachedAt).getTime()) /
                              (1000 * 60 * 60 * 24),
                          ),
                        )}{" "}
                        days ago —{" "}
                        <button
                          type="button"
                          className="underline hover:text-foreground"
                          onClick={() => auditSchemaMutation.mutate({ url })}
                        >
                          Re-audit
                        </button>
                      </div>
                    )}
                    {schemaAudits.map((schema, idx) => (
                      <div key={idx} className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {schema.present ? (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-500" />
                            )}
                            <span className="font-medium text-foreground">{schema.schemaType}</span>
                          </div>
                          <Badge variant={schema.present ? "default" : "secondary"}>
                            {schema.present ? "Present" : "Missing"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div
                            className={`p-2 rounded text-center ${schema.searchable ? "bg-sky-500/10" : ""}`}
                          >
                            <p className="text-xs text-muted-foreground">Searchable</p>
                            <p
                              className={
                                schema.searchable ? "text-blue-500" : "text-muted-foreground"
                              }
                            >
                              {schema.searchable ? "✓" : "—"}
                            </p>
                          </div>
                          <div
                            className={`p-2 rounded text-center ${schema.indexable ? "bg-emerald-500/10" : ""}`}
                          >
                            <p className="text-xs text-muted-foreground">Indexable</p>
                            <p
                              className={
                                schema.indexable ? "text-green-500" : "text-muted-foreground"
                              }
                            >
                              {schema.indexable ? "✓" : "—"}
                            </p>
                          </div>
                          <div
                            className={`p-2 rounded text-center ${schema.retrievable ? "bg-primary/10" : ""}`}
                          >
                            <p className="text-xs text-muted-foreground">Retrievable</p>
                            <p
                              className={
                                schema.retrievable ? "text-primary" : "text-muted-foreground"
                              }
                            >
                              {schema.retrievable ? "✓" : "—"}
                            </p>
                          </div>
                        </div>
                        {schema.recommendations.length > 0 && (
                          <div className="text-sm text-muted-foreground">
                            {schema.recommendations.map((rec, rIdx) => (
                              <p key={rIdx} className="flex items-start gap-2">
                                <ChevronRight className="w-3 h-3 mt-1 text-primary" />
                                {rec}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {additionalTypes.length > 0 && (
                      <div className="p-4 bg-muted/20 rounded-lg border">
                        <p className="text-sm font-medium text-foreground mb-2">
                          Other schema types found on this page:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {additionalTypes.map((t) => (
                            <Badge key={t} variant="outline" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">Enter a URL to audit schema markup</p>
                    <p className="text-sm">Analyze how structured data affects AI visibility</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Pipeline Simulation Tool</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Map your content through Google's 4-stage AI pipeline: Prepare → Retrieve → Signal
                  → Serve
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Button
                    onClick={() => {
                      if (selectedArticle && selectedArticle.content) {
                        simulatePipelineMutation.mutate({
                          content: selectedArticle.content,
                          query: targetQuery || selectedArticle.title || "",
                          articleUpdatedAt: selectedArticle.updatedAt
                            ? new Date(selectedArticle.updatedAt).toISOString()
                            : undefined,
                        });
                      }
                    }}
                    disabled={!selectedArticle || simulatePipelineMutation.isPending}
                    className="bg-primary hover:bg-primary/90"
                    data-testid="button-simulate-pipeline"
                  >
                    {simulatePipelineMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Workflow className="w-4 h-4 mr-2" />
                    )}
                    Simulate Pipeline
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                  {["Prepare", "Retrieve", "Signal", "Serve"].map((stage, idx) => (
                    <div key={stage} className="flex items-center">
                      <div className="text-center">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                            pipelineStages[idx]?.status === "pass"
                              ? "bg-green-600"
                              : pipelineStages[idx]?.status === "warning"
                                ? "bg-yellow-600"
                                : pipelineStages[idx]?.status === "fail"
                                  ? "bg-red-500"
                                  : "bg-muted"
                          }`}
                        >
                          {stage === "Prepare" && <Brain className="w-6 h-6 text-white" />}
                          {stage === "Retrieve" && (
                            <SplitSquareVertical className="w-6 h-6 text-white" />
                          )}
                          {stage === "Signal" && <Activity className="w-6 h-6 text-white" />}
                          {stage === "Serve" && <Sparkles className="w-6 h-6 text-white" />}
                        </div>
                        <p className="text-sm font-medium text-foreground">{stage}</p>
                        {pipelineStages[idx] && (
                          <p className="text-xs text-muted-foreground">
                            {pipelineStages[idx].score}/100
                          </p>
                        )}
                      </div>
                      {idx < 3 && <ArrowRight className="w-6 h-6 text-muted-foreground mx-4" />}
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  {["Prepare", "Retrieve", "Signal", "Serve"].map((stageName, idx) => {
                    const stage = pipelineStages[idx];
                    return (
                      <div
                        key={stageName}
                        className="bg-muted/30 rounded-lg border overflow-hidden"
                      >
                        <div className="p-4 text-sm text-muted-foreground border-b bg-muted/20">
                          <span className="font-medium text-foreground">{stageName}.</span>{" "}
                          {STAGE_BLURBS[stageName]}
                        </div>
                        {stage ? (
                          <div className="p-4 border-t border-dashed">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(stage.status)}
                                <span className="font-medium text-foreground">
                                  Computed diagnostic
                                </span>
                              </div>
                              <Badge
                                variant={
                                  stage.status === "pass"
                                    ? "default"
                                    : stage.status === "warning"
                                      ? "outline"
                                      : "destructive"
                                }
                              >
                                {stage.score}/100
                              </Badge>
                            </div>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {stage.details.map((detail, dIdx) => (
                                <li key={dIdx} className="flex items-start gap-2">
                                  <ChevronRight className="w-3 h-3 mt-1 text-primary" />
                                  {detail}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div className="p-4 text-sm text-muted-foreground italic">
                            Run Simulate Pipeline to see this stage's diagnostic.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="freshness" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Freshness Automation</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Track content age decay and schedule updates before freshness score drops
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg text-center">
                    <Timer className="w-8 h-8 mx-auto text-green-500 mb-2" />
                    <p className="text-2xl font-bold text-foreground">
                      {
                        articles.filter((a) => {
                          if (!a.updatedAt) return false;
                          const age =
                            (Date.now() - new Date(a.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
                          return age < 30;
                        }).length
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">Fresh (&lt;30 days)</p>
                  </div>
                  <div className="p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg text-center">
                    <Clock className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
                    <p className="text-2xl font-bold text-foreground">
                      {
                        articles.filter((a) => {
                          if (!a.updatedAt) return false;
                          const age =
                            (Date.now() - new Date(a.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
                          return age >= 30 && age < 90;
                        }).length
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">Aging (30-90 days)</p>
                  </div>
                  <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto text-red-500 mb-2" />
                    <p className="text-2xl font-bold text-foreground">
                      {
                        articles.filter((a) => {
                          if (!a.updatedAt) return false;
                          const age =
                            (Date.now() - new Date(a.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
                          return age >= 90;
                        }).length
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">Stale (&gt;90 days)</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">
                    Content Freshness Timeline
                  </h3>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {articles
                        .slice()
                        .sort((a, b) => {
                          const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                          const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                          return at - bt;
                        })
                        .map((article) => {
                          const hasTs = !!article.updatedAt;
                          const age = hasTs
                            ? Math.floor(
                                (Date.now() - new Date(article.updatedAt).getTime()) /
                                  (1000 * 60 * 60 * 24),
                              )
                            : null;
                          const freshness = age === null ? 0 : Math.max(0, 100 - age);
                          const status =
                            age === null
                              ? "unknown"
                              : age < 30
                                ? "fresh"
                                : age < 90
                                  ? "aging"
                                  : "stale";

                          return (
                            <div key={article.id} className="p-4 bg-muted/30 rounded-lg border">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-foreground truncate max-w-md">
                                  {article.title}
                                </span>
                                <Badge
                                  variant={
                                    status === "fresh"
                                      ? "default"
                                      : status === "aging"
                                        ? "outline"
                                        : status === "stale"
                                          ? "destructive"
                                          : "secondary"
                                  }
                                >
                                  {age === null ? "No update timestamp" : `${age} days old`}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4">
                                <Progress value={freshness} className="flex-1 h-2" />
                                <span
                                  className={`text-sm font-medium ${
                                    status === "fresh"
                                      ? "text-green-500"
                                      : status === "aging"
                                        ? "text-yellow-500"
                                        : status === "stale"
                                          ? "text-red-500"
                                          : "text-muted-foreground"
                                  }`}
                                >
                                  {age === null ? "—" : `${freshness}%`}
                                </span>
                                {status !== "fresh" && status !== "unknown" && (
                                  <Link href={`/articles?edit=${article.id}`}>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      data-testid={`button-open-editor-${article.id}`}
                                    >
                                      <Pencil className="w-3 h-3 mr-1" />
                                      Open in editor
                                    </Button>
                                  </Link>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Apply optimized content?</DialogTitle>
              <DialogDescription>
                Review the diff. Overwriting replaces the article's current content.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto border rounded-md bg-muted/20 font-mono text-xs p-3">
              {selectedArticle
                ? lineDiff(selectedArticle.content || "", pendingOptimized).map((row, i) => (
                    <div
                      key={i}
                      className={
                        row.kind === "add"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : row.kind === "del"
                            ? "bg-red-500/15 text-red-700 dark:text-red-300 line-through"
                            : "text-muted-foreground"
                      }
                    >
                      <span className="inline-block w-4 text-center opacity-60">
                        {row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "}
                      </span>
                      {row.text || " "}
                    </div>
                  ))
                : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDiffDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!selectedArticle || applyOptimizedMutation.isPending}
                onClick={() => {
                  if (!selectedArticle) return;
                  applyOptimizedMutation.mutate({
                    articleId: selectedArticle.id,
                    content: pendingOptimized,
                    expectedVersion: (selectedArticle as any).version,
                  });
                }}
                data-testid="button-confirm-apply"
              >
                {applyOptimizedMutation.isPending ? "Overwriting…" : "Overwrite article"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
