// Content page (Wave 7 rebuild).
//
// Route-driven, single-article editor. Visiting /content with no id either
// creates a new draft article and redirects, or loads the most recent draft
// (if the user has one). /content/:articleId loads that article directly.
//
// One source of truth: the article row itself. status='draft' shows the
// form; status='generating' shows the streaming preview; status='ready'
// shows the editor. No more content_drafts table, no more 4-way PATCH race.
//
// Generation: SSE stream when the tab is focused (live tokens), poll
// fallback when blurred. The worker writes to articles.content on success,
// so a user who navigates away and back picks up the finished article from
// the article row directly.
//
// AI-detection score is gone (the LLM-graded number was theater). Auto-Improve
// lives on the Articles page (Wave 5) where the diff/restore UI belongs.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { HelpCircle, Loader2, Sparkles, Plus, Target, X, TrendingUp } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import BeginnerTips from "@/components/content/BeginnerTips";
import UsageWidget from "@/components/content/UsageWidget";
import DraftToolbar from "@/components/content/DraftToolbar";
import MarkdownEditor from "@/components/content/MarkdownEditor";
import KeywordChips from "@/components/content/KeywordChips";
import IndustryCombobox from "@/components/content/IndustryCombobox";
import BrandCombobox from "@/components/content/BrandCombobox";
import { apiRequest } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/authStore";
import { useToast } from "@/hooks/use-toast";
import { useArticleAutoSave } from "@/hooks/useArticleAutoSave";
import type { Article, Brand } from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────────

type Job = {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  articleId: string | null;
  errorMessage: string | null;
  errorKind: string | null;
};

type Usage = {
  articlesUsed: number;
  articlesLimit: number;
  articlesRemaining: number;
  brandsUsed: number;
  brandsLimit: number;
  brandsRemaining: number;
  resetDate: string | null;
  tier: string;
};

// Map errorKind from the server into a friendly user-facing message. The
// server's classification is what drives quota refunds, so we mirror it
// rather than re-deriving from errorMessage.
function friendlyErrorMessage(errorKind: string | null, fallback: string | null): string {
  switch (errorKind) {
    case "openai_429":
      return "AI service was busy. Quota was refunded — please try again in a moment.";
    case "openai_5xx":
      return "AI service had a temporary error. Quota was refunded — please try again.";
    case "circuit":
      return "AI service is temporarily unavailable. Quota was refunded — please try again shortly.";
    case "timeout":
      return "Generation timed out. Quota was refunded — please try again.";
    case "budget":
      return "Daily AI spend cap reached. Try again later or contact support.";
    case "invalid_input":
      return "Invalid input — check your keywords and industry, then try again.";
    case "cancelled":
      return "Generation was cancelled.";
    default:
      return fallback || "Generation failed. Please try again.";
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Content() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/content/:articleId");
  const articleIdFromRoute = params?.articleId ?? null;

  // ── Brands / usage / drafts list ──────────────────────────────────────────

  const { data: brandsData } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });
  const brands = brandsData?.data ?? [];

  const { data: usageData, refetch: refetchUsage } = useQuery<{
    success: boolean;
    data: Usage;
  }>({ queryKey: ["/api/usage"] });

  const { data: draftsData, refetch: refetchDrafts } = useQuery<{
    success: boolean;
    data: Article[];
  }>({
    queryKey: ["/api/articles", "drafts"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/articles?status=draft,generating,failed&limit=50");
      return r.json();
    },
    staleTime: 0,
  });
  const drafts = draftsData?.data ?? [];

  // ── First-mount routing: pick or create an article ────────────────────────

  const [bootstrapping, setBootstrapping] = useState(false);
  useEffect(() => {
    if (articleIdFromRoute) return;
    if (!draftsData) return;
    if (brands.length === 0) return;
    if (bootstrapping) return;
    setBootstrapping(true);
    (async () => {
      const recent = drafts[0];
      if (recent) {
        setLocation(`/content/${recent.id}`, { replace: true });
        return;
      }
      const defaultBrandId = brands[0].id;
      try {
        const resp = await apiRequest("POST", "/api/articles/draft", {
          brandId: defaultBrandId,
          contentStyle: "b2c",
          industry: brands[0].industry ?? null,
        });
        const json = await resp.json();
        if (json?.data?.id) {
          await refetchDrafts();
          setLocation(`/content/${json.data.id}`, { replace: true });
        }
      } catch {
        toast({
          title: "Couldn't create a new draft",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setBootstrapping(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleIdFromRoute, draftsData, brands.length]);

  // ── Active article ────────────────────────────────────────────────────────

  const articleQuery = useQuery<{ success: boolean; article: Article; error?: string }>({
    queryKey: ["/api/articles", articleIdFromRoute],
    queryFn: async () => {
      if (!articleIdFromRoute) throw new Error("no id");
      const r = await apiRequest("GET", `/api/articles/${articleIdFromRoute}`);
      // 404 / 403 surface as success:false on this server. Throw so React
      // Query treats them as errors (which we handle below by redirecting).
      const json = await r.json();
      if (!r.ok || !json.success) {
        throw new Error(json.error || `HTTP ${r.status}`);
      }
      return json;
    },
    enabled: !!articleIdFromRoute,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const article = articleQuery.data?.article ?? null;

  // If the active article id can't be loaded (deleted, wrong owner, stale
  // localStorage redirect, …) bounce to /content so the bootstrap can
  // pick or create a fresh draft instead of spinning forever.
  useEffect(() => {
    if (!articleIdFromRoute) return;
    if (!articleQuery.isError) return;
    toast({
      title: "Article not available",
      description: "It may have been deleted. Starting a fresh draft.",
    });
    setLocation("/content", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleIdFromRoute, articleQuery.isError]);

  // ── Form state ────────────────────────────────────────────────────────────

  const [keywords, setKeywords] = useState<string[]>([]);
  const [industry, setIndustry] = useState<string>("");
  const [contentType, setContentType] = useState<string>("article");
  const [contentStyle, setContentStyle] = useState<string>("b2c");
  const [brandId, setBrandId] = useState<string>("");
  const [targetCustomers, setTargetCustomers] = useState<string>("");
  const [geography, setGeography] = useState<string>("");
  const [showTargetingOptions, setShowTargetingOptions] = useState(false);
  const [contentDraft, setContentDraft] = useState<string>("");
  const hydratedForId = useRef<string | null>(null);
  // Tracks whether the user has actually typed in the textarea since the
  // last server hydration. The auto-save effect only fires PATCH `content`
  // when this is true — otherwise we'd PATCH the empty contentDraft right
  // after a hydration race and wipe the article.
  const userEditedContent = useRef<boolean>(false);

  // Hydrate form fields once per article id (typing shouldn't re-fire).
  useEffect(() => {
    if (!article) return;
    if (hydratedForId.current === article.id) return;
    hydratedForId.current = article.id;
    setKeywords(Array.isArray(article.keywords) ? article.keywords : []);
    setIndustry(article.industry ?? "");
    setContentType(article.contentType ?? "article");
    setContentStyle(article.contentStyle ?? "b2c");
    setBrandId(article.brandId ?? "");
    setTargetCustomers(article.targetCustomers ?? "");
    setGeography(article.geography ?? "");
    setContentDraft(article.content ?? "");
    userEditedContent.current = false;
  }, [article]);

  // Re-hydrate `contentDraft` whenever the server-side content changes
  // (e.g. when the worker flips status to 'ready' and writes the content)
  // — but only if the user hasn't started typing yet. This is the fix for
  // the "article appeared as title-only after streaming" bug: hydration
  // used to fire only on first id match, so the empty contentDraft from
  // the draft state stuck around forever.
  useEffect(() => {
    if (!article) return;
    if (hydratedForId.current !== article.id) return;
    if (userEditedContent.current) return;
    if ((article.content ?? "") !== contentDraft) {
      setContentDraft(article.content ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.content, article?.status]);

  const autoSave = useArticleAutoSave(article?.id ?? null, article?.version ?? null, () => {
    articleQuery.refetch();
  });

  useEffect(() => {
    if (!article || hydratedForId.current !== article.id) return;
    if (article.status !== "draft" && article.status !== "failed") return;
    autoSave.queueForm({
      keywords,
      industry,
      contentType,
      contentStyle,
      brandId,
      targetCustomers,
      geography,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywords, industry, contentType, contentStyle, brandId, targetCustomers, geography]);

  useEffect(() => {
    if (!article || hydratedForId.current !== article.id) return;
    if (article.status !== "ready") return;
    if (!userEditedContent.current) return; // Bug-A guard — see ref above.
    if (contentDraft === (article.content ?? "")) return;
    autoSave.queueContent(contentDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentDraft]);

  // ── Job state ─────────────────────────────────────────────────────────────

  const [streamBuffer, setStreamBuffer] = useState<string>("");
  const activeJobId = article?.jobId ?? null;
  const isGenerating = article?.status === "generating";

  useEffect(() => {
    if (!isGenerating || !activeJobId) return;
    if (typeof EventSource === "undefined") return;

    let es: EventSource | null = null;
    let cancelled = false;

    const open = async () => {
      if (cancelled) return;
      // EventSource can't send Authorization headers, so the JWT goes in
      // ?token=. The server's SELF_AUTHED_PREFIXES set lets this route
      // through the global Bearer guard; the SSE handler validates inline.
      const token = await getAccessToken();
      if (!token || cancelled) return;
      const url = `/api/content-jobs/${activeJobId}/stream?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);
      es.addEventListener("delta", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { text?: string };
          if (data.text) setStreamBuffer((prev) => prev + data.text);
        } catch {
          // ignore malformed deltas
        }
      });
      es.addEventListener("end", () => {
        articleQuery.refetch();
        refetchUsage();
        queryClient.invalidateQueries({ queryKey: ["/api/articles", "drafts"] });
        if (es) es.close();
      });
      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) es = null;
      };
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!es) void open();
      } else {
        if (es) {
          es.close();
          es = null;
        }
      }
    };

    if (document.visibilityState === "visible") void open();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (es) es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, activeJobId]);

  useEffect(() => {
    if (!isGenerating || !activeJobId) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible" && typeof EventSource !== "undefined") {
        setTimeout(tick, 4000);
        return;
      }
      try {
        const r = await apiRequest("GET", `/api/content-jobs/${activeJobId}`);
        const json = (await r.json()) as { success: boolean; data: Job };
        if (json.success && json.data.status !== "pending" && json.data.status !== "running") {
          articleQuery.refetch();
          refetchUsage();
          queryClient.invalidateQueries({ queryKey: ["/api/articles", "drafts"] });
          return;
        }
      } catch {
        // tolerate transient failures
      }
      setTimeout(tick, 4000);
    };
    tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, activeJobId]);

  useEffect(() => {
    if (!article) return;
    if (article.status === "ready" || article.status === "draft" || article.status === "failed") {
      setStreamBuffer("");
    }
  }, [article?.status, article?.id]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!article) throw new Error("no article");
      await autoSave.flushNow();
      const resp = await apiRequest("POST", `/api/articles/${article.id}/generate`, {
        keywords: keywords.join(", "),
        industry,
        type: contentType,
        contentStyle,
        targetCustomers: targetCustomers || undefined,
        geography: geography || undefined,
      });
      return resp.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Optimistic flip: server already set status='generating' and jobId,
        // but the cached article is stale. Patch the cache so the streaming
        // UI shows up before the refetch arrives.
        if (article && data.data?.jobId) {
          queryClient.setQueryData<{ success: boolean; article: Article }>(
            ["/api/articles", article.id],
            (old) =>
              old
                ? {
                    ...old,
                    article: { ...old.article, status: "generating", jobId: data.data.jobId },
                  }
                : old,
          );
        }
        setStreamBuffer("");
        articleQuery.refetch();
        refetchDrafts();
        toast({
          title: "Generation started",
          description: "Streaming your article. Cancel any time — quota will be refunded.",
        });
      } else if (data.limitReached) {
        toast({
          title: "Monthly limit reached",
          description: data.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Couldn't start generation",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't start generation",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!activeJobId) return;
      const r = await apiRequest("POST", `/api/content-jobs/${activeJobId}/cancel`);
      return r.json();
    },
    onSuccess: () => {
      articleQuery.refetch();
      refetchUsage();
      refetchDrafts();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/articles/${id}`);
      return r.json();
    },
    onSuccess: (_data, deletedId) => {
      refetchDrafts();
      if (deletedId === article?.id) {
        setLocation("/content");
      }
    },
  });

  const newArticleMutation = useMutation({
    mutationFn: async () => {
      const defaultBrandId = brands[0]?.id;
      if (!defaultBrandId) throw new Error("no brand");
      const r = await apiRequest("POST", "/api/articles/draft", {
        brandId: defaultBrandId,
        contentStyle: "b2c",
        industry: brands[0].industry ?? null,
      });
      return r.json();
    },
    onSuccess: async (data) => {
      if (data?.data?.id) {
        await refetchDrafts();
        setLocation(`/content/${data.data.id}`);
      }
    },
  });

  // ── Keyword suggestions ───────────────────────────────────────────────────

  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsMutation = useMutation({
    mutationFn: async () => {
      const seed = keywords[0] ?? "";
      const r = await apiRequest("POST", "/api/keyword-suggestions", {
        input: seed,
        industry,
      });
      return r.json();
    },
    onSuccess: (data) => {
      setKeywordSuggestions(data?.suggestions ?? []);
      setShowSuggestions(true);
    },
  });

  // ── Popular topics ────────────────────────────────────────────────────────

  const popularTopicsQuery = useQuery({
    queryKey: ["/api/popular-topics", industry],
    queryFn: async () => {
      if (!industry) return { success: false, topics: [] };
      const r = await apiRequest(
        "GET",
        `/api/popular-topics?industry=${encodeURIComponent(industry)}`,
      );
      return r.json();
    },
    enabled: !!industry,
    staleTime: 5 * 60 * 1000,
  });
  const popularTopics: Array<{ topic: string; description?: string; category?: string }> =
    popularTopicsQuery.data?.topics ?? [];

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // ── Render gates ──────────────────────────────────────────────────────────

  if (brandsData && brands.length === 0) {
    return (
      <TooltipProvider>
        <div className="space-y-8">
          <PageHeader
            title="AI Content Generation"
            description="Generate SEO-optimized content for AI search engines"
          />
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="text-lg font-semibold mb-2">Add a brand first</h3>
              <p className="text-muted-foreground mb-4">
                Articles are tied to a brand so AI-citation tracking can attribute the result
                correctly.
              </p>
              <Link href="/brands">
                <Button>Add a brand</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    );
  }

  if (!article) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const usageExhausted = !!(
    usageData?.data &&
    usageData.data.articlesLimit !== -1 &&
    usageData.data.articlesRemaining === 0
  );

  const canGenerate =
    keywords.length > 0 &&
    !!industry &&
    !!brandId &&
    article.status !== "generating" &&
    !generateMutation.isPending &&
    !usageExhausted;

  return (
    <TooltipProvider>
      <div className="space-y-8">
        <PageHeader
          title="AI Content Generation"
          description="Generate SEO-optimized content for AI search engines"
        />

        <DraftToolbar
          drafts={drafts}
          activeDraftId={article.id}
          onNewArticle={() => newArticleMutation.mutate()}
          onLoadDraft={(d) => setLocation(`/content/${d.id}`)}
          onDeleteDraft={(id) => setPendingDeleteId(id)}
        />

        <BeginnerTips />

        {usageData?.success && usageData.data && <UsageWidget data={usageData.data} />}

        {article.status === "ready" ? (
          <ReadyEditor
            article={article}
            content={contentDraft}
            onContentChange={(next) => {
              userEditedContent.current = true;
              setContentDraft(next);
            }}
          />
        ) : article.status === "generating" ? (
          <GeneratingPreview
            streamedContent={streamBuffer}
            onCancel={() => cancelMutation.mutate()}
            cancelling={cancelMutation.isPending}
          />
        ) : (
          <DraftForm
            brands={brands}
            keywords={keywords}
            setKeywords={setKeywords}
            industry={industry}
            setIndustry={setIndustry}
            contentType={contentType}
            setContentType={setContentType}
            contentStyle={contentStyle}
            setContentStyle={setContentStyle}
            brandId={brandId}
            setBrandId={setBrandId}
            targetCustomers={targetCustomers}
            setTargetCustomers={setTargetCustomers}
            geography={geography}
            setGeography={setGeography}
            showTargetingOptions={showTargetingOptions}
            setShowTargetingOptions={setShowTargetingOptions}
            keywordSuggestions={keywordSuggestions}
            showSuggestions={showSuggestions}
            setShowSuggestions={setShowSuggestions}
            suggestionsLoading={suggestionsMutation.isPending}
            onRequestSuggestions={() => suggestionsMutation.mutate()}
            popularTopics={popularTopics}
            popularTopicsLoading={popularTopicsQuery.isLoading}
            onRefreshTopics={() => popularTopicsQuery.refetch()}
            onGenerate={() => generateMutation.mutate()}
            canGenerate={canGenerate}
            generating={generateMutation.isPending}
            errorBanner={
              article.status === "failed"
                ? friendlyErrorMessage(null, "Last generation failed. Edit and try again.")
                : null
            }
            usageExhausted={usageExhausted}
          />
        )}

        <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
              <AlertDialogDescription>
                The draft and its generation history will be permanently removed. This can't be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingDeleteId) deleteMutation.mutate(pendingDeleteId);
                  setPendingDeleteId(null);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ReadyEditor({
  article,
  content,
  onContentChange,
}: {
  article: Article;
  content: string;
  onContentChange: (next: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{article.title || "Untitled"}</span>
          <Link href={`/articles?edit=${article.id}`}>
            <Button variant="outline" size="sm">
              Open in Articles
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownEditor value={content} onChange={onContentChange} />
        <p className="text-xs text-muted-foreground mt-3">
          Edits auto-save. Open in Articles for Auto-Improve, version history, and distribution.
        </p>
      </CardContent>
    </Card>
  );
}

function GeneratingPreview({
  streamedContent,
  onCancel,
  cancelling,
}: {
  streamedContent: string;
  onCancel: () => void;
  cancelling: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
            Generating…
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={cancelling}
            data-testid="button-cancel-generation"
          >
            {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancel"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownEditor
          value={streamedContent || "_Waiting for the model to start writing…_"}
          onChange={() => {
            /* read-only while generating */
          }}
          editable={false}
        />
      </CardContent>
    </Card>
  );
}

interface DraftFormProps {
  brands: Brand[];
  keywords: string[];
  setKeywords: (next: string[]) => void;
  industry: string;
  setIndustry: (s: string) => void;
  contentType: string;
  setContentType: (s: string) => void;
  contentStyle: string;
  setContentStyle: (s: string) => void;
  brandId: string;
  setBrandId: (s: string) => void;
  targetCustomers: string;
  setTargetCustomers: (s: string) => void;
  geography: string;
  setGeography: (s: string) => void;
  showTargetingOptions: boolean;
  setShowTargetingOptions: (b: boolean) => void;
  keywordSuggestions: string[];
  showSuggestions: boolean;
  setShowSuggestions: (b: boolean) => void;
  suggestionsLoading: boolean;
  onRequestSuggestions: () => void;
  popularTopics: Array<{ topic: string; description?: string; category?: string }>;
  popularTopicsLoading: boolean;
  onRefreshTopics: () => void;
  onGenerate: () => void;
  canGenerate: boolean;
  generating: boolean;
  errorBanner: string | null;
  usageExhausted: boolean;
}

function DraftForm(props: DraftFormProps) {
  const {
    brands,
    keywords,
    setKeywords,
    industry,
    setIndustry,
    contentType,
    setContentType,
    contentStyle,
    setContentStyle,
    brandId,
    setBrandId,
    targetCustomers,
    setTargetCustomers,
    geography,
    setGeography,
    showTargetingOptions,
    setShowTargetingOptions,
    keywordSuggestions,
    showSuggestions,
    setShowSuggestions,
    suggestionsLoading,
    onRequestSuggestions,
    popularTopics,
    popularTopicsLoading,
    onRefreshTopics,
    onGenerate,
    canGenerate,
    generating,
    errorBanner,
    usageExhausted,
  } = props;

  const selectedBrand = useMemo(
    () => brands.find((b) => b.id === brandId) ?? null,
    [brands, brandId],
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Content Generator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorBanner && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              {errorBanner}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label>Brand</Label>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">
                    The brand this article belongs to. Required so AI-citation tracking can
                    attribute the result correctly.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <BrandCombobox value={brandId} onChange={setBrandId} brands={brands} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label>Target Industry</Label>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">
                    The industry this <em>article</em> targets — can differ from your brand's home
                    industry. Useful when you want to write for an adjacent vertical.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <IndustryCombobox value={industry} onChange={setIndustry} />
            {selectedBrand && industry && industry !== selectedBrand.industry && (
              <p className="text-xs text-muted-foreground mt-1">
                Different from {selectedBrand.name}'s home industry ({selectedBrand.industry}) —
                that's fine.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label>Keywords</Label>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">
                    Press Enter or comma to add a chip. Backspace on an empty input removes the last
                    chip.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <KeywordChips
              value={keywords}
              onChange={setKeywords}
              placeholder={industry ? "Press Enter or comma to add" : "Pick an industry first"}
              disabled={!industry}
            />
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRequestSuggestions}
                disabled={!industry || suggestionsLoading}
                data-testid="button-suggest-keywords"
              >
                {suggestionsLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-1" />
                    Suggest
                  </>
                )}
              </Button>
              {showSuggestions && keywordSuggestions.length === 0 && !suggestionsLoading && (
                <span className="text-xs text-muted-foreground">No suggestions yet</span>
              )}
            </div>
            {showSuggestions && keywordSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {keywordSuggestions.map((s) => {
                  const already = keywords.some((k) => k.toLowerCase() === s.toLowerCase());
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        if (already) {
                          setKeywords(keywords.filter((k) => k.toLowerCase() !== s.toLowerCase()));
                        } else {
                          setKeywords([...keywords, s]);
                        }
                      }}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        already
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      {already ? (
                        <X className="w-3 h-3 inline mr-1" />
                      ) : (
                        <Plus className="w-3 h-3 inline mr-1" />
                      )}
                      {s}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowSuggestions(false)}
                  className="text-xs text-muted-foreground hover:text-foreground ml-2"
                >
                  Hide
                </button>
              </div>
            )}
          </div>

          <div>
            <Label className="mb-2 block">Content Type</Label>
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="article">Article</SelectItem>
                <SelectItem value="blog post">Blog Post</SelectItem>
                <SelectItem value="product description">Product Description</SelectItem>
                <SelectItem value="social media post">Social Media Post</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label>Content Style</Label>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">
                    B2C is conversational and benefit-first. B2B is professional and data-driven.
                    The brand profile (tone, audience) is layered on top of this choice.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setContentStyle("b2c")}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-left ${
                  contentStyle === "b2c"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-muted hover:border-muted-foreground/30"
                }`}
              >
                <span className="text-sm font-semibold">B2C — Consumer</span>
                <span className="text-xs text-muted-foreground text-center">
                  Conversational, lifestyle-focused, relatable
                </span>
              </button>
              <button
                type="button"
                onClick={() => setContentStyle("b2b")}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-left ${
                  contentStyle === "b2b"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-muted hover:border-muted-foreground/30"
                }`}
              >
                <span className="text-sm font-semibold">B2B — Business</span>
                <span className="text-xs text-muted-foreground text-center">
                  Professional, data-driven, industry authority
                </span>
              </button>
            </div>
          </div>

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => setShowTargetingOptions(!showTargetingOptions)}
            >
              <span className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Target Audience & Geography
              </span>
              <span className="text-xs text-muted-foreground">
                {showTargetingOptions ? "Hide" : "Show"} options
              </span>
            </Button>
            {showTargetingOptions && (
              <div className="mt-3 space-y-3 p-4 border rounded-lg bg-muted/30">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="targetCustomers">Target Customers</Label>
                    {selectedBrand?.targetAudience && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setTargetCustomers(selectedBrand.targetAudience ?? "")}
                      >
                        Pull from brand
                      </button>
                    )}
                  </div>
                  <Textarea
                    id="targetCustomers"
                    placeholder="e.g., CTOs and engineering leaders at mid-size SaaS companies"
                    value={targetCustomers}
                    onChange={(e) => setTargetCustomers(e.target.value)}
                    className="min-h-[60px]"
                  />
                </div>
                <div>
                  <Label htmlFor="geography" className="mb-2 block">
                    Geography
                  </Label>
                  <Input
                    id="geography"
                    placeholder="e.g., United States, North America, Global"
                    value={geography}
                    onChange={(e) => setGeography(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={onGenerate}
            disabled={!canGenerate || usageExhausted}
            className="w-full"
            data-testid="button-generate-content"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting…
              </>
            ) : usageExhausted ? (
              "Monthly limit reached"
            ) : (
              "Generate Article"
            )}
          </Button>
          {!canGenerate && !generating && !usageExhausted && (
            <p className="text-xs text-muted-foreground text-center">
              {!brandId
                ? "Pick a brand first."
                : !industry
                  ? "Pick a target industry."
                  : keywords.length === 0
                    ? "Add at least one keyword."
                    : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {industry && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Popular Topics in {industry}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefreshTopics}
                disabled={popularTopicsLoading}
              >
                {popularTopicsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {popularTopicsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : popularTopics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No popular topics for this industry yet.
              </p>
            ) : (
              <div className="grid gap-2">
                {popularTopics.map((topic, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const exists = keywords.some(
                        (k) => k.toLowerCase() === topic.topic.toLowerCase(),
                      );
                      if (!exists) setKeywords([...keywords, topic.topic]);
                    }}
                    className="flex items-start gap-3 p-3 text-left bg-muted hover:bg-muted/70 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm">{topic.topic}</h4>
                      {topic.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {topic.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
