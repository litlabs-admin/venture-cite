import { useState, useEffect, useReducer, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { StatusDot } from "@/components/foundations/StatusDot";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { safeExternalHref } from "@/lib/urlSafety";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { Article } from "@shared/schema";
import { usePrompts } from "@/hooks/usePrompts";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sparkles,
  Loader2,
  BarChart3,
  Code,
  Workflow,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Brain,
  SplitSquareVertical,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Activity,
  Check,
  HelpCircle,
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
  // 0-100 share of required+recommended fields populated on the best
  // instance of this schema type on the page.
  completenessPercent: number;
  populatedFields: string[];
  missingFields: string[];
  // The catalogue of fields the auditor measured against - used to split
  // `missingFields` into required vs recommended buckets in the UI.
  required: string[];
  recommended: string[];
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
    "Your overall scorecard score, decomposed into the pipeline stage it represents. The number above is the same as the headline % on the Signal Scorecard - both routes feed off computeSignals().",
  Serve:
    "Real citability signals: byline detection, outbound citation count, and whether at least one chunk has a heading plus a direct 200+ char answer.",
};

// -----------------------------------------------------------------------------
// Cross-tab state reducer. It uses `${brandId}|${articleId}` as its key. When
// the user switches articles, the active slice swaps to a fresh empty object,
// so stale results from the previous article don't linger on the stat cards.
// -----------------------------------------------------------------------------
type TabName = "analyze" | "chunks" | "schema" | "pipeline" | "optimize";
type PerArticleState = {
  analyzeResult?: any;
  chunksResult?: any;
  schemaResult?: any;
  pipelineResult?: any;
  // 2026-05-28 fix: optimize result MUST be keyed per-article. Previously
  // the page read optimizeChunksMutation.data?.data?.optimizedContent
  // which is mutation-scoped (page-level). Switch articles, the prior
  // article's optimised text stayed rendered, and "Apply to Article"
  // would write Article A's content over Article B's body. Now the
  // reducer key isolates per (brandId, articleId).
  optimizeResult?: { optimizedContent: string };
  computedAt: Partial<Record<TabName, number>>;
};
type ReducerState = Record<string, PerArticleState>;
type ReducerAction =
  { type: "set"; key: string; tab: TabName; data: any } | { type: "reset"; key: string };

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
              : action.tab === "optimize"
                ? "optimizeResult"
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

// (formatRelativeMinutes lived here pre-2026-05-28 cleanup. It powered
// the "computed N minutes ago" sub-labels on the four KPI cards that
// were removed when the IA collapsed. With those cards gone there are
// no remaining callers, so the helper was deleted to keep this file
// honest. If the active scorecard later needs a freshness label, lean
// on date-fns formatDistanceToNow instead.)

// Line-level LCS diff - small enough to inline; no new dep.
//
// 2026-05-28 perf cap: this is O(m·n). Two 1500-line articles produce a
// 2.25M cell DP table that took 5-10s to render and froze the dialog
// open animation. We now bail out early on inputs above MAX_DIFF_LINES
// (per side) and render a simpler before/after summary instead. The
// LCS-with-bail covers ~99% of real article edits; the bail covers the
// pathological "pasted a different 8000-line draft" case.
const MAX_DIFF_LINES = 800;
function lineDiff(
  oldText: string,
  newText: string,
): Array<{ kind: "equal" | "add" | "del"; text: string }> {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    // Fallback: show a coarse delta the user can still reason about
    // (line counts, length delta) without the LCS quadratic cost.
    const delta = b.length - a.length;
    return [
      {
        kind: "equal",
        text: `(Article is ${a.length} lines / ${oldText.length.toLocaleString()} chars; optimised is ${b.length} lines / ${newText.length.toLocaleString()} chars - ${delta >= 0 ? "+" : ""}${delta.toLocaleString()} lines.)`,
      },
      {
        kind: "equal",
        text: `(Line-by-line diff skipped for performance above ${MAX_DIFF_LINES} lines/side. Compare the two panels manually or apply with caution.)`,
      },
    ];
  }
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

// The article picker, extracted so it can sit inline beside the Target query
// on the Signal Scorecard AND in the top bar on the other two tabs, without
// duplicating the option-rendering markup. Module-level (stable identity) so
// it never remounts the underlying Select on parent re-render.
function ArticleSelect({
  articles,
  selectedArticleId,
  onChange,
  brandName,
  selectedBrandId,
}: {
  articles: Article[];
  selectedArticleId: string;
  onChange: (v: string) => void;
  brandName: string;
  selectedBrandId: string | undefined;
}) {
  if (!selectedBrandId) {
    return (
      <div className="flex h-10 items-center text-caption text-muted-foreground">
        Select a brand first.
      </div>
    );
  }
  if (articles.length === 0) {
    return (
      <div className="flex h-10 items-center gap-2 text-caption text-muted-foreground">
        <span>No articles yet for {brandName}.</span>
        <Link to="/articles">
          <Button variant="outline" size="sm" data-testid="button-create-article">
            Create an article →
          </Button>
        </Link>
      </div>
    );
  }
  return (
    <Select value={selectedArticleId} onValueChange={onChange}>
      {/* `w-[320px]` was a hard floor: on a 360-375px phone viewport minus
          this page's horizontal padding, 320px of available width is
          already gone before the border/padding, so the control clipped or
          forced the row to scroll. `w-full max-w-[320px]` keeps the same
          320px cap on desktop but lets it shrink to fit on narrow screens. */}
      <SelectTrigger className="w-full max-w-[320px]" data-testid="select-article">
        <SelectValue placeholder="Select article" />
      </SelectTrigger>
      <SelectContent>
        {articles.map((article) => {
          // Status pill on non-ready articles so the user understands why a
          // just-started article might be empty (status=all in the query).
          const status = (article as any).status as string | undefined;
          const showPill = status && status !== "ready";
          return (
            <SelectItem key={article.id} value={article.id}>
              <span className="flex items-center gap-2">
                <span className="max-w-xs truncate">{article.title}</span>
                {showPill && (
                  <Badge
                    variant={status === "failed" ? "destructive" : "neutral"}
                    className="text-label uppercase tracking-wider"
                  >
                    {status}
                  </Badge>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export default function GeoSignals() {
  const { toast } = useToast();
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const [activeTab, setActiveTab] = useState<string>("signals");
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
  // AbortControllers per long-running mutation. Each Analyze / Pipeline
  // / Auto-Optimize call can take 10-30s; without a cancel handle the
  // user is stuck waiting (or has to reload the tab). Each ref holds
  // the controller for the IN-FLIGHT call so the Cancel button can
  // abort it. We re-create on each invocation; React Query's
  // mutationFn closes over the right one.
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const chunkAbortRef = useRef<AbortController | null>(null);
  const optimizeAbortRef = useRef<AbortController | null>(null);
  const pipelineAbortRef = useRef<AbortController | null>(null);
  const auditAbortRef = useRef<AbortController | null>(null);
  // Schema Lab can render up to 14 catalogued types; for a typical
  // blog article most are irrelevant (Recipe / Event / LocalBusiness).
  // Default to showing only types that are PRESENT on the page or
  // belong to a small "core" set most articles care about. The toggle
  // reveals the full 14 for power users.
  const [showAllSchemaTypes, setShowAllSchemaTypes] = useState(false);
  const CORE_SCHEMA_TYPES = useMemo(
    () =>
      new Set([
        "Article",
        "BlogPosting",
        "NewsArticle",
        "FAQPage",
        "Organization",
        "BreadcrumbList",
        "WebPage",
        "Product",
      ]),
    [],
  );

  // Per-signal "what does this measure" map - replaces the 171-line
  // inline "How signals are scored" Collapsible. Surfaced as a
  // hoverable info icon on each scorecard row so the documentation
  // sits next to the result instead of taking over the page.
  const SIGNAL_BLURBS: Record<string, string> = useMemo(
    () => ({
      "Content Depth":
        "Word count plus H2/H3 hierarchy. 2000+ words and both heading levels score full marks. <500 words caps the score.",
      "Semantic Similarity":
        "Cosine similarity between embeddings of your first 8000 chars and the target query. Real text-embedding-3-small embeddings, not keyword matching.",
      "Query-Term Coverage":
        "Fraction of meaningful (non-stopword) query terms that appear anywhere in the article body.",
      "Exact-Phrase Match":
        "Whether the verbatim target query appears at least once in the body. Pass/fail.",
      "Structure Extractability":
        "Fraction of paragraph-chunks that are AI-extractable: ≤500 tokens, have a heading, and start with a direct answer.",
      "Authority Signals":
        "Byline detection + external citation count + factual claim markers + JSON-LD schema completeness (from Schema Lab).",
      Freshness:
        "Days since the article's updatedAt. ≤30d = excellent, ≤90d = good, >90d = stale. Requires a timestamp.",
    }),
    [],
  );

  // Legend explanations for the schema cards - replace the three
  // standalone "Completeness / Required / Recommended" cards with a
  // single tooltip on the section header.
  const SCHEMA_LEGEND_BLURB =
    "Completeness % = (populated required + recommended fields) / (total catalogued fields) on the best instance of that schema type on the page. Missing 'Required' fields fail Google's Rich Results test; missing 'Recommended' fields just leave score on the table.";

  const { data: articlesData } = useQuery<{ data: Article[] }>({
    // Pass status=all so drafts / generating / failed articles also
    // appear in the picker. The default server filter is status=ready
    // which silently hid in-progress work - the user wondered why an
    // article they JUST clicked Generate on didn't show up in Diagnose.
    queryKey: ["/api/articles", selectedBrandId, "all"],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/articles?brandId=${selectedBrandId}&status=all`);
      return res.json();
    },
  });

  const articles = articlesData?.data || [];
  const selectedArticle = articles.find((a) => a.id === selectedArticleId);

  // Shared with citations.tsx via client/src/hooks/usePrompts.ts - this used
  // to be its own independently-shaped query (`["/api/brand-prompts",
  // selectedBrandId]`, an array key) for the exact same
  // `/api/brand-prompts/:brandId` endpoint citations.tsx fetches under a
  // different key, so the two never shared a cache entry and the page
  // double-fetched. `usePrompts` now gives both callers identical keys.
  const { data: brandPromptsData } = usePrompts(selectedBrandId);
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
    // Use the article's own `externalUrl` - where the user told us it
    // actually lives on their site. The previous code synthesised
    // `${brand.website}/articles/${slug}`, but `slug` was removed from
    // the articles table during its unification. The column comment
    // in shared/schema.ts says "Replaces the old slug-based fake URL").
    // Every auto-fill became `…/articles/undefined`, which then audited
    // a 404, then cached "no schemas found" under the wrong hash key -
    // breaking the Schema Lab → Authority signal loop end-to-end.
    const externalUrl = (selectedArticle as any).externalUrl as string | undefined;
    if (externalUrl && externalUrl.trim().length > 0) {
      setUrl(externalUrl);
    }
  }, [selectedArticle, urlTouched, url]);

  const analyzeSignalsMutation = useMutation({
    mutationFn: async (data: {
      content: string;
      targetQuery: string;
      brandId?: string;
      articleId?: string;
      articleUpdatedAt?: string;
    }) => {
      analyzeAbortRef.current?.abort(); // cancel any previous in-flight call
      const controller = new AbortController();
      analyzeAbortRef.current = controller;
      const response = await apiRequest("POST", "/api/geo-signals/analyze", data, {
        signal: controller.signal,
      });
      return response.json();
    },
    onSuccess: (data) => {
      geoDispatch({ type: "set", key: articleKey, tab: "analyze", data: data?.data });
    },
    onError: (err: Error) => {
      // Aborts are intentional - don't toast on those, the user clicked Cancel.
      if (/abort/i.test(err.message ?? "") || err.name === "AbortError") return;
      toast({
        title: "Analysis failed",
        description: err.message || "Try again or shorten the article.",
        variant: "destructive",
      });
    },
  });

  const analyzeChunksMutation = useMutation({
    mutationFn: async (data: { content: string }) => {
      chunkAbortRef.current?.abort();
      const controller = new AbortController();
      chunkAbortRef.current = controller;
      const response = await apiRequest("POST", "/api/geo-signals/chunk-analysis", data, {
        signal: controller.signal,
      });
      return response.json();
    },
    onSuccess: (data) => {
      geoDispatch({ type: "set", key: articleKey, tab: "chunks", data: data?.data });
    },
    onError: (err: Error) => {
      if (/abort/i.test(err.message ?? "") || err.name === "AbortError") return;
      toast({
        title: "Chunk analysis failed",
        description: err.message || "Try again.",
        variant: "destructive",
      });
    },
  });

  const optimizeChunksMutation = useMutation({
    mutationFn: async (data: { content: string; brandId?: string }) => {
      optimizeAbortRef.current?.abort();
      const controller = new AbortController();
      optimizeAbortRef.current = controller;
      const response = await apiRequest("POST", "/api/geo-signals/optimize-chunks", data, {
        signal: controller.signal,
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Persist into the per-article slice so optimizedContent doesn't
      // bleed across article switches. The page reads from the slice,
      // not from this mutation's data.
      const optimized = (data?.data?.optimizedContent ?? "") as string;
      geoDispatch({
        type: "set",
        key: articleKey,
        tab: "optimize",
        data: { optimizedContent: optimized },
      });
      toast({ title: "Content optimized into AI-extractable chunks!" });
    },
    onError: (err: Error) => {
      if (/abort/i.test(err.message ?? "") || err.name === "AbortError") return;
      toast({
        title: "Optimization failed",
        description: err.message || "Try again or shorten the article.",
        variant: "destructive",
      });
    },
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
    mutationFn: async (data: { url: string; force?: boolean }) => {
      auditAbortRef.current?.abort();
      const controller = new AbortController();
      auditAbortRef.current = controller;
      // `force: true` bypasses the server's 7-day cache so the Re-audit
      // button actually re-audits. Without this, hitting Re-audit just
      // re-rendered the cached result for up to 7 days.
      const response = await apiRequest("POST", "/api/geo-signals/schema-audit", data, {
        signal: controller.signal,
      });
      return response.json();
    },
    onSuccess: (data) => {
      geoDispatch({ type: "set", key: articleKey, tab: "schema", data: data?.data });
    },
    onError: (err: Error) => {
      if (/abort/i.test(err.message ?? "") || err.name === "AbortError") return;
      toast({
        title: "Schema audit failed",
        description: err.message || "Try a different URL or check your connection.",
        variant: "destructive",
      });
    },
  });

  const simulatePipelineMutation = useMutation({
    mutationFn: async (data: {
      content: string;
      query: string;
      articleUpdatedAt?: string;
      schemaCompleteness?: number;
    }) => {
      pipelineAbortRef.current?.abort();
      const controller = new AbortController();
      pipelineAbortRef.current = controller;
      const response = await apiRequest("POST", "/api/geo-signals/pipeline-simulation", data, {
        signal: controller.signal,
      });
      return response.json();
    },
    onSuccess: (data) => {
      geoDispatch({ type: "set", key: articleKey, tab: "pipeline", data: data?.data });
    },
    onError: (err: Error) => {
      if (/abort/i.test(err.message ?? "") || err.name === "AbortError") return;
      toast({
        title: "Pipeline simulation failed",
        description: err.message || "Try again.",
        variant: "destructive",
      });
    },
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
  // Diagnostic fields surfaced from the server so users can verify the
  // audit actually fetched their page (not "mimicking"). totalSchemasFound
  // counts EVERY JSON-LD `@type` seen on the page (including types not in
  // our catalogue); fetched/fetchError tell the user if SSRF/timeout
  // blocked the fetch; auditedUrl echoes the normalised URL the server
  // actually requested (after schema/redirect cleanup).
  const totalSchemasFound: number = activeSlice.schemaResult?.totalSchemasFound ?? 0;
  const schemaFetched: boolean = activeSlice.schemaResult?.fetched ?? false;
  const schemaFetchError: string | null = activeSlice.schemaResult?.fetchError ?? null;
  const auditedUrl: string | undefined = activeSlice.schemaResult?.url;
  const pipelineStages: PipelineStage[] = activeSlice.pipelineResult?.stages || [];
  // 2026-05-28 fix: read from the per-article slice, not the mutation
  // data, so switching articles doesn't carry over the prior article's
  // optimised output.
  const optimizedContent: string = activeSlice.optimizeResult?.optimizedContent ?? "";

  // Single source of truth - mirrors the server's bucketize() thresholds
  // exactly (excellent ≥0.8, good ≥0.6, needs_improvement ≥0.4, poor <0.4).
  // The previous version had a 60% AND 40% case both returning chart-3
  // which collapsed two buckets into one colour; now the 4 buckets get
  // 4 distinct treatments and the client agrees with the server's
  // status label so the colour and the icon never contradict.
  const getScoreColor = (score: number, max: number) => {
    const ratio = max > 0 ? score / max : 0;
    // Top tier: neutral text, not green/chart-4 - the CheckCircle rendered
    // by getStatusIcon alongside it is what signals "excellent", not colour.
    if (ratio >= 0.8) return "text-foreground";
    if (ratio >= 0.6) return "text-chart-1";
    if (ratio >= 0.4) return "text-warning";
    return "text-destructive";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "excellent":
        return <CheckCircle className="w-4 h-4 text-foreground" />;
      case "good":
        return <CheckCircle className="w-4 h-4 text-chart-1" />;
      case "needs_improvement":
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      case "poor":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "pass":
        return <CheckCircle className="w-4 h-4 text-foreground" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      case "fail":
        return <XCircle className="w-4 h-4 text-destructive" />;
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
        articleId: selectedArticle.id,
        articleUpdatedAt: selectedArticle.updatedAt
          ? new Date(selectedArticle.updatedAt).toISOString()
          : undefined,
      });
    }
  };

  const brandName = selectedBrand?.companyName || "this brand";

  return (
    // Only ever rendered client-side, as a lazy tab inside
    // client/src/pages/diagnose.tsx (no route of its own) - title/meta
    // removed per this task's blanket rule; /diagnose falls back to root
    // defaults.
    <PanelPage>
      {/* The four KPI cards (Overall / Chunks / Schema / Pipeline)
            that used to sit above the tabs were removed - every number
            was already shown one click below inside its respective tab,
            so the strip was pure redundancy. The active scorecard
            inside the Signals tab is now the canonical headline. */}

      {/* Sticky article toolbar - anchored below the SpineShell stage
            tablist (which is also sticky at z-20). top-14 keeps
            this strip directly underneath the stage tabs so they stack
            cleanly without overlap. The previous top-0 made this float
            up to viewport top while the stage tabs were scrolled away
            → audit flag "sticks under nothing". z-10 < z-20 keeps the
            layering correct. */}
      {/* Top article bar - only on the tabs WITHOUT a target query. On the
            Signal Scorecard the article picker sits inline next to the query
            (one line, no duplicate picker). */}
      {activeTab !== "signals" && (
        <div className="sticky top-14 z-10 border-b border-vc-default bg-vc-page/95 px-8 py-3 backdrop-blur">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="whitespace-nowrap text-caption font-medium text-foreground">
                Article to analyze
              </Label>
              <ArticleSelect
                articles={articles}
                selectedArticleId={selectedArticleId}
                onChange={setSelectedArticleId}
                brandName={brandName}
                selectedBrandId={selectedBrandId}
              />
            </div>
          </div>
        </div>
      )}

      {/* IA collapse (2026-05-28): 5 sub-tabs → 3.
            - "Pipeline Sim" was a self-reference. Its Signal stage was
              literally the Scorecard's overall number echoed back (see
              STAGE_BLURBS.Signal above). The remaining 3 stages now
              render as a collapsible "Pipeline breakdown" panel inside
              the Scorecard tab - same data, no separate tab.
            - "Freshness" was a per-article-list view: it iterated over
              every article in the brand and color-coded the
              `updatedAt` age. The per-article freshness already shows
              up as signal #7 inside the Scorecard, and the list view
              is fundamentally an article-list pivot that belongs on
              /act?tab=library, not in Diagnose. Tab removed entirely. */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b border-vc-default px-8 pt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="signals" data-testid="tab-signals">
              <BarChart3 className="w-4 h-4 mr-2" /> Signal Scorecard
            </TabsTrigger>
            <TabsTrigger
              value="chunks"
              data-testid="tab-chunks"
              title="Chunk Engineer: AI engines read your article in ~500-token pieces, not all at once. This shows those pieces and flags which ones aren't answer-ready."
            >
              <SplitSquareVertical className="w-4 h-4 mr-2" /> Chunk Engineer
            </TabsTrigger>
            <TabsTrigger
              value="schema"
              data-testid="tab-schema"
              title="Schema Lab: checks the structured-data labels (Schema.org markup) in your page's code that tell Google and AI engines what your content is."
            >
              <Code className="w-4 h-4 mr-2" /> Schema Lab
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="signals">
          <PanelRow cols={1}>
            <Panel label="GEO Signal Scorecard" width="wide" border="last">
              <p className="mb-4 text-data text-vc-tertiary">
                Six honest content signals + freshness. Each signal's label matches its actual
                formula.
              </p>
              {/* Article + Target query on one line, with Analyze. The
                    article picker lives here (not the top bar) on this tab so
                    the two selectors read as a single setup row. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="space-y-1">
                  <Label className="text-foreground">Article to analyze</Label>
                  <ArticleSelect
                    articles={articles}
                    selectedArticleId={selectedArticleId}
                    onChange={setSelectedArticleId}
                    brandName={brandName}
                    selectedBrandId={selectedBrandId}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1 sm:min-w-[240px]">
                  <Label className="text-foreground">Target query</Label>
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
                    <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
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
                              No tracked prompts - type a freeform query above.
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
                                    <span className="line-clamp-2">{text}</span>
                                  </CommandItem>
                                );
                              })}
                              {filteredPrompts.length > 50 && (
                                <div className="px-2 py-1.5 text-caption text-muted-foreground">
                                  Showing 50 of {filteredPrompts.length} - refine your search
                                </div>
                              )}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    onClick={handleAnalyzeArticle}
                    disabled={!selectedArticle || analyzeSignalsMutation.isPending}
                    data-testid="button-analyze-signals"
                  >
                    {analyzeSignalsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <BarChart3 className="w-4 h-4 mr-2" />
                    )}
                    Analyze Signals
                  </Button>
                  {/* Cancel button - appears while the request is in
                        flight. Aborts via the AbortController stored in
                        analyzeAbortRef so the user isn't stuck waiting
                        on a 30-second call they regret. */}
                  {analyzeSignalsMutation.isPending && (
                    <Button
                      variant="outline"
                      onClick={() => analyzeAbortRef.current?.abort()}
                      data-testid="button-analyze-cancel"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
              {signalScores.length > 0 && (
                <div className="space-y-4">
                  {/* Honest headline score. The denominator is the
                        sum of applicable maxScores (Freshness drops out
                        when the article has no updatedAt; Authority's
                        schema sub-score drops out when no schema audit
                        is on file). So 100% is reachable when every
                        input was measurable - the previous "X / 100"
                        could never reach 100 because the underlying
                        sum capped at 90 (and 86 in production with the
                        Schema chain broken). */}
                  {overallScore !== null && (
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="text-label uppercase tracking-wider text-muted-foreground font-medium">
                          Overall score
                        </p>
                        <p
                          className="text-stat font-semibold text-foreground tracking-tight"
                          data-testid="stat-overall"
                        >
                          {overallScore}
                          <span className="text-caption text-muted-foreground">%</span>
                        </p>
                      </div>
                      <Progress value={overallScore} className="w-1/2 h-2" />
                    </div>
                  )}
                  {signalScores
                    .filter((signal) => signal.maxScore > 0)
                    .map((signal, idx) => (
                      <div key={idx} className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(signal.status)}
                            <span className="font-medium text-foreground">{signal.signal}</span>
                            {SIGNAL_BLURBS[signal.signal] && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground"
                                    aria-label={`How "${signal.signal}" is measured`}
                                  >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="text-caption" align="start">
                                  <p className="font-medium text-foreground mb-1">
                                    How this signal is measured
                                  </p>
                                  <p className="text-muted-foreground">
                                    {SIGNAL_BLURBS[signal.signal]}
                                  </p>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          <span
                            className={`text-data font-mono font-semibold tabular-nums ${getScoreColor(signal.score, signal.maxScore)}`}
                          >
                            {signal.score}/{signal.maxScore}
                          </span>
                        </div>
                        <Progress
                          value={(signal.score / signal.maxScore) * 100}
                          className="h-2 mb-2"
                        />
                        {signal.recommendations.length > 0 && (
                          <ul className="text-caption text-muted-foreground space-y-1">
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
                  {/* Surface signals we couldn't score (maxScore=0)
                        so the user knows WHY they couldn't, instead of
                        a silent omission. */}
                  {signalScores
                    .filter((signal) => signal.maxScore === 0)
                    .map((signal, idx) => (
                      <div
                        key={`na-${idx}`}
                        className="p-3 bg-muted/20 rounded-lg border border-dashed text-caption text-muted-foreground flex items-center gap-2"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>
                          <span className="font-medium text-foreground">{signal.signal}</span> -{" "}
                          {signal.recommendations[0] ?? "Not applicable for this article."}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {signalScores.length === 0 && !analyzeSignalsMutation.isPending && (
                <EmptyState
                  icon={BarChart3}
                  title={
                    selectedArticle
                      ? "Pick a target query and run analysis"
                      : "Select an article above to begin"
                  }
                  description="Scores across all 7 signals - six content signals plus freshness. Only what's measurable counts toward the headline %."
                />
              )}
            </Panel>
          </PanelRow>

          {/* 2026-05-28: the 171-line "How signals are scored" inline
                Collapsible was replaced by per-signal `?` tooltips
                rendered next to each signal name in the scorecard.
                Documentation now sits beside the data it explains
                instead of taking over the page. See SIGNAL_BLURBS above. */}

          {/* Pipeline breakdown - was a separate sub-tab; now an
                inline collapsible because its "Signal" stage is the
                same number as the Scorecard above and the other 3
                stages are just derived views of the same content+query.
                Hidden by default to keep the page calm; only opens
                when the user wants the 4-stage decomposition. */}
          <PanelRow cols={1} last>
            <Panel width="wide" border="last">
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-left hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Workflow className="w-4 h-4 text-muted-foreground" />
                    <span className="text-caption font-medium text-foreground">
                      Pipeline breakdown
                    </span>
                    <span className="text-caption text-muted-foreground">
                      Prepare → Retrieve → Signal → Serve
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="flex items-center gap-2 px-1">
                    <Button
                      size="sm"
                      variant="outline"
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
                      data-testid="button-simulate-pipeline"
                    >
                      {simulatePipelineMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Workflow className="w-4 h-4 mr-2" />
                      )}
                      {pipelineStages.length > 0 ? "Re-run breakdown" : "Run breakdown"}
                    </Button>
                    {simulatePipelineMutation.isPending && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pipelineAbortRef.current?.abort()}
                      >
                        Cancel
                      </Button>
                    )}
                    {pipelineStages.length === 0 && !simulatePipelineMutation.isPending && (
                      <span className="text-caption text-muted-foreground">
                        Maps your content through the 4-stage AI-search pipeline.
                      </span>
                    )}
                  </div>

                  {pipelineStages.length > 0 && (
                    <>
                      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                        {pipelineStages.map((stage, idx) => (
                          <div key={stage.stage} className="flex items-center">
                            <div className="text-center">
                              <div
                                className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                                  stage.status === "pass"
                                    ? "bg-secondary"
                                    : stage.status === "warning"
                                      ? "bg-warning"
                                      : "bg-destructive"
                                }`}
                              >
                                {(() => {
                                  // "pass" is neutral (secondary-foreground on
                                  // secondary), not green/chart-4 - the stage
                                  // status is carried by the check icon + label
                                  // in the detail row below, not this glyph's
                                  // colour alone.
                                  // Not a literal white: `bg-warning` resolves to
                                  // --brand-accent, which in dark is a light blue
                                  // - a white glyph on it disappears. Each fill
                                  // carries its own designed label token instead.
                                  const iconColor =
                                    stage.status === "pass"
                                      ? "text-secondary-foreground"
                                      : stage.status === "warning"
                                        ? "text-primary-foreground"
                                        : "text-destructive-foreground";
                                  return (
                                    <>
                                      {stage.stage === "Prepare" && (
                                        <Brain className={`w-6 h-6 ${iconColor}`} />
                                      )}
                                      {stage.stage === "Retrieve" && (
                                        <SplitSquareVertical className={`w-6 h-6 ${iconColor}`} />
                                      )}
                                      {stage.stage === "Signal" && (
                                        <Activity className={`w-6 h-6 ${iconColor}`} />
                                      )}
                                      {stage.stage === "Serve" && (
                                        <Sparkles className={`w-6 h-6 ${iconColor}`} />
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                              <p className="text-caption font-medium text-foreground">
                                {stage.stage}
                              </p>
                              <p className="text-data font-mono tabular-nums text-muted-foreground">
                                {stage.score}/100
                              </p>
                            </div>
                            {idx < pipelineStages.length - 1 && (
                              <ArrowRight className="w-6 h-6 text-muted-foreground mx-4" />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3">
                        {pipelineStages.map((stage) => (
                          <div key={stage.stage} className="bg-muted/30 rounded-lg border p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <StatusDot
                                  tone={
                                    stage.status === "pass"
                                      ? "success"
                                      : stage.status === "warning"
                                        ? "warn"
                                        : "fail"
                                  }
                                />
                                <span className="font-medium text-foreground">{stage.stage}</span>
                              </div>
                              <span className="text-data font-mono tabular-nums text-muted-foreground">
                                {stage.score}/100
                              </span>
                            </div>
                            <p className="text-caption text-muted-foreground mb-2">
                              {STAGE_BLURBS[stage.stage]}
                            </p>
                            <ul className="text-caption text-muted-foreground space-y-1">
                              {stage.details.map((detail, dIdx) => (
                                <li key={dIdx} className="flex items-start gap-2">
                                  <ChevronRight className="w-3 h-3 mt-1 text-primary" />
                                  {detail}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </Panel>
          </PanelRow>
        </TabsContent>

        <TabsContent value="chunks">
          <PanelRow cols={1} last>
            <Panel
              label="500-Token Chunk Engineer"
              width="wide"
              border="last"
              action={
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="What is chunking?"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="max-w-md text-caption" align="start">
                    <p className="mb-1 font-medium text-foreground">
                      What is &quot;chunking&quot;?
                    </p>
                    <p className="text-muted-foreground">
                      AI engines don&apos;t read your whole article at once. They pull it into
                      roughly 500-token pieces (about 375 words) and quote individual pieces in
                      their answers. A piece is &quot;extractable&quot; when it has a clear heading
                      and opens with a direct answer. This tool shows your article&apos;s pieces and
                      flags the ones AI can&apos;t easily quote.
                    </p>
                  </PopoverContent>
                </Popover>
              }
            >
              <p className="mb-4 text-data text-vc-tertiary">
                Restructure content into AI-extractable ~375 word chunks with question-based
                headings
              </p>
              <div className="space-y-4">
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
                    data-testid="button-optimize-chunks"
                  >
                    {optimizeChunksMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Auto-Optimize Chunks
                  </Button>
                  {optimizeChunksMutation.isPending && (
                    <Button
                      variant="outline"
                      onClick={() => optimizeAbortRef.current?.abort()}
                      data-testid="button-optimize-cancel"
                    >
                      Cancel
                    </Button>
                  )}
                </div>

                {chunks.length > 0 && chunkStats && (
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-4 bg-muted/30 rounded-lg text-center">
                      <p className="text-metric font-semibold text-foreground tabular-nums">
                        {chunkStats.totalChunks}
                      </p>
                      <p className="text-caption text-muted-foreground">Total Chunks</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg text-center">
                      <p className="text-metric font-semibold text-foreground tabular-nums">
                        {chunkStats.extractableChunks}
                      </p>
                      <p className="text-caption text-muted-foreground">Extractable</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg text-center">
                      <p className="text-metric font-semibold text-foreground tabular-nums">
                        {chunkStats.avgTokens}
                      </p>
                      <p className="text-caption text-muted-foreground">Avg Tokens</p>
                    </div>
                  </div>
                )}

                {chunks.length > 0 && (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {chunks.map((chunk, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-lg border ${chunk.extractable ? "bg-positive-subtle" : "bg-destructive-subtle"}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={chunk.extractable ? "positive" : "destructive"}>
                                Chunk {chunk.chunkNumber}
                              </Badge>
                              <span className="text-caption text-muted-foreground">
                                {chunk.tokenCount} tokens / {chunk.wordCount} words
                              </span>
                            </div>
                            <div className="flex gap-2">
                              {chunk.hasHeading && <Badge variant="positive">Has Heading</Badge>}
                              {chunk.questionBased && <Badge variant="neutral">Question H2</Badge>}
                              {chunk.hasDirectAnswer && (
                                <Badge variant="positive">Direct Answer</Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-caption text-foreground line-clamp-3 mb-2">
                            {chunk.content}
                          </p>
                          {chunk.issues.length > 0 && (
                            <div className="text-caption text-warning">
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
                      className=" text-foreground min-h-[300px] font-mono text-caption"
                    />
                    <p className="text-caption text-muted-foreground mt-2">
                      "Apply to Article" overwrites the selected article's content with this
                      optimised version. Open it in the Articles page afterwards to review.
                    </p>
                  </div>
                )}
              </div>
            </Panel>
          </PanelRow>
        </TabsContent>

        <TabsContent value="schema">
          <PanelRow cols={1} last>
            <Panel
              label="Schema Impact Lab"
              width="wide"
              border="last"
              action={
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="How completeness is measured"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="max-w-md text-caption" align="start">
                    <p className="mb-1 font-medium text-foreground">What is &quot;schema&quot;?</p>
                    <p className="mb-3 text-muted-foreground">
                      Schema (structured data) is hidden labels in your page&apos;s code that spell
                      out what the content is, an article, an FAQ, your company name and contact
                      info, so Google and AI engines don&apos;t have to guess.
                    </p>
                    <p className="mb-1 font-medium text-foreground">How completeness is measured</p>
                    <p className="text-muted-foreground">{SCHEMA_LEGEND_BLURB}</p>
                  </PopoverContent>
                </Popover>
              }
            >
              <p className="mb-4 text-data text-vc-tertiary">
                Audit structured data completeness - required and recommended fields per schema
                type. Feeds the Authority signal automatically when audited URL matches the
                article's external URL.
              </p>
              <div className="space-y-4">
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
                    <p className="mt-1 text-caption text-muted-foreground">
                      {selectedArticle &&
                      !((selectedArticle as any).externalUrl as string | undefined)?.trim()
                        ? // Help users connect Schema Lab → Authority signal.
                          // Without externalUrl on the article, the cache key
                          // is wrong and the Authority signal can't pick up
                          // the audit. Tell them how to fix it.
                          "This article has no published URL set. Add an 'External URL' on the article editor to auto-fill - or paste any URL to audit it."
                        : "Auto-filled from this article's external URL. Edit if you want to audit a different page."}
                    </p>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      onClick={() => auditSchemaMutation.mutate({ url })}
                      disabled={!url || auditSchemaMutation.isPending}
                      data-testid="button-audit-schema"
                    >
                      {auditSchemaMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Code className="w-4 h-4 mr-2" />
                      )}
                      Audit Schema
                    </Button>
                    {auditSchemaMutation.isPending && (
                      <Button
                        variant="outline"
                        onClick={() => auditAbortRef.current?.abort()}
                        data-testid="button-audit-cancel"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* 2026-05-28: the three glossary cards (Completeness /
                    Required / Recommended) used to render here before any
                    audit data - pure docs, ate vertical space. Replaced
                    with one inline help icon on the section header below;
                    SCHEMA_LEGEND_BLURB holds the same explanation. */}

                {schemaAudits.length > 0 ? (
                  <div className="space-y-4">
                    {/* Diagnostic strip: prove to the user that the audit
                        is REAL by surfacing the URL we fetched + the total
                        number of JSON-LD `@type` blocks we found on the
                        page. The previous UI showed every catalogued type
                        as "Missing" for any page with no JSON-LD, which
                        looked indistinguishable from a stub. */}
                    {!schemaFetched ? (
                      // Fetch FAILED - surface this prominently as an
                      // error banner instead of letting the "all 14 types
                      // missing" body render as if it were a real audit
                      // result. Without this, a WAF-blocked fetch is
                      // visually identical to "page has no schema."
                      <div
                        className="rounded-md border border-destructive/30 bg-destructive/5 p-4"
                        data-testid="schema-fetch-failed"
                      >
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-1">
                            <p className="font-medium text-foreground">
                              Audit couldn't fetch this page
                            </p>
                            <p className="text-caption text-muted-foreground">
                              {schemaFetchError ?? "Unknown fetch error."}
                            </p>
                            {auditedUrl && (
                              <a
                                href={safeExternalHref(auditedUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block text-caption text-primary hover:underline"
                                data-testid="schema-audit-url"
                              >
                                Open {auditedUrl} ↗
                              </a>
                            )}
                            <p className="text-caption text-muted-foreground pt-1">
                              Common causes: Cloudflare/WAF bot detection, the URL requires
                              authentication, or the target site is offline. Try a public-facing
                              article URL.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="text-caption text-muted-foreground underline hover:text-foreground shrink-0"
                            onClick={() => auditSchemaMutation.mutate({ url })}
                          >
                            Retry
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="rounded-md border bg-card p-3 text-caption"
                        data-testid="schema-audit-summary"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-3.5 w-3.5 text-foreground" />
                              <span className="font-medium text-foreground">Fetched live</span>
                              {auditedUrl && (
                                <a
                                  href={safeExternalHref(auditedUrl)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="truncate text-primary hover:underline max-w-[260px]"
                                  data-testid="schema-audit-url"
                                >
                                  {auditedUrl}
                                </a>
                              )}
                            </div>
                            <div className="text-muted-foreground">
                              Found{" "}
                              <span
                                className="tabular-nums font-medium text-foreground"
                                data-testid="schema-total-found"
                              >
                                {totalSchemasFound}
                              </span>{" "}
                              JSON-LD schema {totalSchemasFound === 1 ? "block" : "blocks"} on this
                              page
                              {totalSchemasFound === 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  - page is reachable but has no structured data
                                </span>
                              )}
                            </div>
                          </div>
                          {schemaCachedAt && (
                            <button
                              type="button"
                              className="text-muted-foreground underline hover:text-foreground shrink-0"
                              onClick={() => auditSchemaMutation.mutate({ url, force: true })}
                              disabled={auditSchemaMutation.isPending}
                            >
                              <Clock className="w-3 h-3 inline mr-1" />
                              Re-audit
                            </button>
                          )}
                        </div>
                        {schemaCachedAt && (
                          <p className="mt-1 text-caption text-muted-foreground">
                            Cached{" "}
                            {Math.max(
                              0,
                              Math.floor(
                                (Date.now() - new Date(schemaCachedAt).getTime()) /
                                  (1000 * 60 * 60 * 24),
                              ),
                            )}{" "}
                            day(s) ago - Re-audit forces a fresh fetch.
                          </p>
                        )}
                      </div>
                    )}
                    {/* Render only the relevant schema cards by default:
                        types that are PRESENT on the audited page, plus a
                        small "core" set most articles care about (Article,
                        BlogPosting, NewsArticle, FAQPage, Organization,
                        BreadcrumbList, WebPage, Product). The "Show all
                        14" toggle reveals the full catalogue including
                        Recipe / Event / LocalBusiness which were the bulk
                        of the "it's just mimicking" noise. The original
                        filter (.filter(s => s.present || s.required.length > 0))
                        was a no-op because EVERY catalogued type has at
                        least one required field. */}
                    {schemaFetched && (
                      <div className="flex items-center justify-end -mb-2">
                        <button
                          type="button"
                          onClick={() => setShowAllSchemaTypes((v) => !v)}
                          className="text-caption text-muted-foreground underline hover:text-foreground"
                        >
                          {showAllSchemaTypes
                            ? `Hide irrelevant schema types`
                            : `Show all 14 schema types`}
                        </button>
                      </div>
                    )}
                    {schemaFetched &&
                      schemaAudits
                        .filter(
                          (schema) =>
                            showAllSchemaTypes ||
                            schema.present ||
                            CORE_SCHEMA_TYPES.has(schema.schemaType),
                        )
                        .map((schema, idx) => {
                          const requiredSet = new Set(schema.required);
                          const recommendedSet = new Set(schema.recommended);
                          const missingRequired = schema.missingFields.filter((f) =>
                            requiredSet.has(f),
                          );
                          const missingRecommended = schema.missingFields.filter((f) =>
                            recommendedSet.has(f),
                          );
                          const pct = Math.max(0, Math.min(100, schema.completenessPercent ?? 0));
                          return (
                            <div
                              key={`${schema.schemaType}-${idx}`}
                              className="p-4 bg-muted/30 rounded-lg border"
                              data-testid={`schema-card-${schema.schemaType}`}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  {schema.present ? (
                                    <CheckCircle className="w-5 h-5 text-foreground" />
                                  ) : (
                                    <XCircle className="w-5 h-5 text-destructive" />
                                  )}
                                  <span className="font-medium text-foreground">
                                    {schema.schemaType}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {schema.present && (
                                    <span
                                      className="tabular-nums text-data font-medium text-foreground"
                                      data-testid={`schema-pct-${schema.schemaType}`}
                                    >
                                      {pct}%
                                    </span>
                                  )}
                                  {/* "default" here was bg-primary - the action
                                    accent - marking an outcome. Present/Missing
                                    is a status, so it reads neutral and the
                                    check glyph carries the meaning. */}
                                  <Badge variant={schema.present ? "secondary" : "outline"}>
                                    {schema.present && (
                                      <CheckCircle className="mr-1 h-3 w-3" aria-hidden="true" />
                                    )}
                                    {schema.present ? "Present" : "Missing"}
                                  </Badge>
                                </div>
                              </div>

                              {schema.present && <Progress value={pct} className="mb-3 h-1.5" />}

                              {schema.populatedFields.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-label font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Populated ({schema.populatedFields.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {schema.populatedFields.map((f) => (
                                      <Badge
                                        key={f}
                                        variant="positive"
                                        className="text-caption font-normal"
                                      >
                                        <Check className="w-2.5 h-2.5 mr-1" />
                                        {f}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {missingRequired.length > 0 && (
                                <div className="mb-2">
                                  <p className="text-label font-medium uppercase tracking-wider text-destructive mb-1.5">
                                    Missing required ({missingRequired.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {missingRequired.map((f) => (
                                      <Badge
                                        key={f}
                                        variant="destructive"
                                        className="text-caption font-normal"
                                      >
                                        {f}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {missingRecommended.length > 0 && (
                                <div>
                                  <p className="text-label font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Missing recommended ({missingRecommended.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {missingRecommended.map((f) => (
                                      <Badge
                                        key={f}
                                        variant="warning"
                                        className="text-caption font-normal"
                                      >
                                        {f}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                    {additionalTypes.length > 0 && (
                      <div className="p-4 bg-muted/20 rounded-lg border">
                        <p className="text-caption font-medium text-foreground mb-2">
                          Other schema types found on this page:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {additionalTypes.map((t) => (
                            <Badge key={t} variant="neutral" className="text-caption">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={Code}
                    title="Enter a URL to audit schema markup"
                    description="See which required and recommended fields are populated for each schema type."
                  />
                )}
              </div>
            </Panel>
          </PanelRow>
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
          <div className="flex-1 overflow-auto border rounded-md bg-muted/20 font-mono text-caption p-3">
            {selectedArticle
              ? lineDiff(selectedArticle.content || "", pendingOptimized).map((row, i) => (
                  <div
                    key={i}
                    className={
                      row.kind === "add"
                        ? "bg-secondary text-secondary-foreground"
                        : row.kind === "del"
                          ? "bg-destructive/15 text-destructive line-through"
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
    </PanelPage>
  );
}
