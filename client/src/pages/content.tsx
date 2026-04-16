import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import PageHeader from "@/components/PageHeader";
import {
  Loader2, FileText, HelpCircle, Lightbulb, Target, BookOpen, Star, Search,
  Plus, TrendingUp, Clock, Save, Check, Shield, RefreshCw, CheckCircle,
  AlertCircle, Copy, Sparkles, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Link, useSearch } from "wouter";
import { Progress } from "@/components/ui/progress";

// ── Types ──────────────────────────────────────────────────────────────────────

type ContentDraft = {
  id: string;
  userId: string;
  title: string | null;
  keywords: string;
  industry: string;
  type: string;
  brandId: string | null;
  targetCustomers: string | null;
  geography: string | null;
  contentStyle: string | null;
  generatedContent: string | null;
  articleId: string | null;
  jobId: string | null;
  humanScore: number | null;
  passesAiDetection: number | null; // 0=fails, 1=passes, null=unchecked
  createdAt: string;
  updatedAt: string;
};

// ── Static data ────────────────────────────────────────────────────────────────

const industries = [
  { value: "Technology", group: "Technology & Digital" },
  { value: "Software & SaaS", group: "Technology & Digital" },
  { value: "Artificial Intelligence & Machine Learning", group: "Technology & Digital" },
  { value: "Cybersecurity", group: "Technology & Digital" },
  { value: "Telecommunications", group: "Technology & Digital" },
  { value: "E-commerce", group: "Technology & Digital" },
  { value: "Gaming & Esports", group: "Technology & Digital" },
  { value: "Healthcare", group: "Healthcare & Life Sciences" },
  { value: "Pharmaceuticals", group: "Healthcare & Life Sciences" },
  { value: "Biotechnology", group: "Healthcare & Life Sciences" },
  { value: "Medical Devices", group: "Healthcare & Life Sciences" },
  { value: "Mental Health & Wellness", group: "Healthcare & Life Sciences" },
  { value: "Finance & Banking", group: "Finance & Business" },
  { value: "Insurance", group: "Finance & Business" },
  { value: "Fintech", group: "Finance & Business" },
  { value: "Accounting & Tax", group: "Finance & Business" },
  { value: "Real Estate", group: "Finance & Business" },
  { value: "Venture Capital & Private Equity", group: "Finance & Business" },
  { value: "Consulting & Professional Services", group: "Finance & Business" },
  { value: "Legal Services", group: "Finance & Business" },
  { value: "Marketing & Advertising", group: "Marketing & Media" },
  { value: "Public Relations", group: "Marketing & Media" },
  { value: "Media & Entertainment", group: "Marketing & Media" },
  { value: "Publishing", group: "Marketing & Media" },
  { value: "Social Media & Influencer", group: "Marketing & Media" },
  { value: "Education & EdTech", group: "Education & Nonprofit" },
  { value: "Higher Education", group: "Education & Nonprofit" },
  { value: "Nonprofit & NGO", group: "Education & Nonprofit" },
  { value: "Government & Public Sector", group: "Education & Nonprofit" },
  { value: "Manufacturing", group: "Industrial & Engineering" },
  { value: "Construction & Engineering", group: "Industrial & Engineering" },
  { value: "Automotive", group: "Industrial & Engineering" },
  { value: "Aerospace & Defense", group: "Industrial & Engineering" },
  { value: "Energy & Utilities", group: "Industrial & Engineering" },
  { value: "Oil & Gas", group: "Industrial & Engineering" },
  { value: "Renewable Energy & CleanTech", group: "Industrial & Engineering" },
  { value: "Retail", group: "Consumer & Lifestyle" },
  { value: "Consumer Goods (CPG)", group: "Consumer & Lifestyle" },
  { value: "Food & Beverage", group: "Consumer & Lifestyle" },
  { value: "Hospitality & Tourism", group: "Consumer & Lifestyle" },
  { value: "Fashion & Apparel", group: "Consumer & Lifestyle" },
  { value: "Beauty & Personal Care", group: "Consumer & Lifestyle" },
  { value: "Fitness & Sports", group: "Consumer & Lifestyle" },
  { value: "Home & Interior Design", group: "Consumer & Lifestyle" },
  { value: "Pets & Animal Care", group: "Consumer & Lifestyle" },
  { value: "Agriculture & AgTech", group: "Specialized" },
  { value: "Logistics & Supply Chain", group: "Specialized" },
  { value: "Transportation", group: "Specialized" },
  { value: "Human Resources & Recruiting", group: "Specialized" },
  { value: "Environmental & Sustainability", group: "Specialized" },
  { value: "Cannabis & Hemp", group: "Specialized" },
  { value: "Crypto & Blockchain", group: "Specialized" },
  { value: "Other", group: "Specialized" },
];

const industryGroups = Array.from(new Set(industries.map(i => i.group)));

const getIndustryTemplate = (industry: string, type: string) => {
  const baseTemplates: Record<string, { structure: string; examples: string[] }> = {
    article: {
      structure: "Introduction → Problem/Opportunity → Solution → Benefits → Case Studies → Future Outlook → Conclusion",
      examples: ["industry trends", "best practices", "expert analysis"]
    },
    "blog post": {
      structure: "Hook → Problem → Solution → How-to Steps → Results → Call-to-Action",
      examples: ["practical tips", "how-to guides", "industry updates"]
    },
    "product description": {
      structure: "Headline → Key Benefits → Features → Use Cases → Social Proof → Clear CTA",
      examples: ["product overview", "feature highlights", "comparison guides"]
    },
    "social media post": {
      structure: "Hook → Key Point → Value/Benefit → Call-to-Action → Relevant Hashtags",
      examples: ["quick tips", "industry insights", "engagement posts"]
    }
  };
  const template = baseTemplates[type] || baseTemplates.article;
  return {
    title: `${industry} ${type.charAt(0).toUpperCase() + type.slice(1)}`,
    description: `${type.charAt(0).toUpperCase() + type.slice(1)} content tailored for the ${industry} industry`,
    ...template
  };
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function draftStatus(draft: ContentDraft): "generating" | "done" | "draft" {
  if (draft.jobId) return "generating";
  if (draft.generatedContent) return "done";
  return "draft";
}

function draftLabel(draft: ContentDraft): string {
  return draft.title || draft.keywords.split(",")[0]?.trim() || "Untitled";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Content() {
  const searchString = useSearch();
  const { toast } = useToast();
  const initialParams = new URLSearchParams(searchString);

  // ── Active draft ID — persisted in localStorage for fast mount ─────────────
  const [activeDraftId, setActiveDraftId] = useState<string | null>(() =>
    localStorage.getItem("venturecite-active-draft-id")
  );
  // Flag: has the draft list been loaded and the active draft applied once?
  const [draftLoaded, setDraftLoaded] = useState(false);

  // ── Form fields ────────────────────────────────────────────────────────────
  const [keywords, setKeywords] = useState(initialParams.get("keyword") || "");
  const [industry, setIndustry] = useState(initialParams.get("industry") || "");
  const [type, setType] = useState(initialParams.get("type") || "article");
  const [brandId, setBrandId] = useState(initialParams.get("brandId") || "none");
  const [targetCustomers, setTargetCustomers] = useState("");
  const [geography, setGeography] = useState("");
  const [contentStyle, setContentStyle] = useState("b2c");
  const [showTargetingOptions, setShowTargetingOptions] = useState(false);

  // ── Generated content + scores ─────────────────────────────────────────────
  const [generatedContent, setGeneratedContent] = useState("");
  const [savedArticleId, setSavedArticleId] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [humanScore, setHumanScore] = useState<number | null>(null);
  const [scoreBeforeImprove, setScoreBeforeImprove] = useState<number | null>(null);
  const [passesAiDetection, setPassesAiDetection] = useState<boolean | null>(null);
  const [aiIssues, setAiIssues] = useState<string[]>([]);
  const [aiStrengths, setAiStrengths] = useState<string[]>([]);
  const [aiRecommendation, setAiRecommendation] = useState<string>("");
  const [aiVocabularyFound, setAiVocabularyFound] = useState<string[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [popularTopics, setPopularTopics] = useState<any[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const draftPanelRef = useRef<HTMLDivElement>(null);

  // Close draft dropdown when clicking outside
  useEffect(() => {
    if (!showDraftPanel) return;
    const handler = (e: MouseEvent) => {
      if (draftPanelRef.current && !draftPanelRef.current.contains(e.target as Node)) {
        setShowDraftPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDraftPanel]);

  // ── Auto-save refs ─────────────────────────────────────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftCreating = useRef(false);
  // Track whether the last auto-save was triggered by loading (not typing)
  const suppressAutoSave = useRef(false);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: brandsData } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ['/api/brands'],
  });

  const { data: usageData, refetch: refetchUsage } = useQuery<{
    success: boolean;
    data: {
      articlesUsed: number; articlesLimit: number; articlesRemaining: number;
      brandsUsed: number; brandsLimit: number; brandsRemaining: number;
      resetDate: string | null; tier: string;
    };
  }>({ queryKey: ['/api/usage'] });

  const { data: draftsData, refetch: refetchDrafts } = useQuery<{ success: boolean; data: ContentDraft[] }>({
    queryKey: ['/api/content-drafts'],
    staleTime: 0,
  });
  const drafts: ContentDraft[] = draftsData?.data ?? [];

  const popularTopicsQuery = useQuery({
    queryKey: ['/api/popular-topics', industry],
    queryFn: async () => {
      if (!industry) return { success: false, topics: [] };
      const response = await apiRequest('GET', `/api/popular-topics?industry=${encodeURIComponent(industry)}`);
      return response.json();
    },
    enabled: !!industry,
    staleTime: 5 * 60 * 1000,
  });

  // ── Load draft into form ───────────────────────────────────────────────────

  const loadDraft = useCallback((draft: ContentDraft) => {
    suppressAutoSave.current = true;
    setKeywords(draft.keywords || "");
    setIndustry(draft.industry || "");
    setType(draft.type || "article");
    setBrandId(draft.brandId || "none");
    setTargetCustomers(draft.targetCustomers || "");
    setGeography(draft.geography || "");
    setContentStyle((draft.contentStyle as any) || "b2c");
    setGeneratedContent(draft.generatedContent || "");
    setSavedArticleId(draft.articleId || null);
    setHumanScore(typeof draft.humanScore === "number" ? draft.humanScore : null);
    setPassesAiDetection(
      draft.passesAiDetection === 1 ? true :
      draft.passesAiDetection === 0 ? false :
      null
    );
    setAiIssues([]); setAiStrengths([]); setAiRecommendation(""); setAiVocabularyFound([]);
    setCurrentJobId(draft.jobId || null);
    setActiveDraftId(draft.id);
    localStorage.setItem("venturecite-active-draft-id", draft.id);
    // Allow auto-save again after React has re-rendered with new values
    requestAnimationFrame(() => { suppressAutoSave.current = false; });
  }, []);

  // On first draft list load, restore the active draft
  useEffect(() => {
    if (draftLoaded || !draftsData) return;
    setDraftLoaded(true);
    if (!drafts.length) return;

    if (activeDraftId) {
      const match = drafts.find(d => d.id === activeDraftId);
      if (match) { loadDraft(match); return; }
    }
    // Fallback: load the most recently updated draft
    loadDraft(drafts[0]);
  }, [draftsData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save (debounced 1.5s on any form field change) ───────────────────

  const triggerAutoSave = useCallback(() => {
    if (suppressAutoSave.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const payload = {
        keywords,
        industry,
        type,
        brandId: brandId !== "none" ? brandId : null,
        targetCustomers: targetCustomers || null,
        geography: geography || null,
        contentStyle,
        title: keywords.split(",")[0]?.trim() || null,
      };

      // Check if any field has a non-default value (so we don't create blank drafts on mount)
      const hasContent = keywords || industry || type !== "article" || contentStyle !== "b2c"
        || (brandId && brandId !== "none") || targetCustomers || geography;

      try {
        if (activeDraftId) {
          await apiRequest('PATCH', `/api/content-drafts/${activeDraftId}`, payload);
          refetchDrafts();
        } else if (!draftCreating.current && hasContent) {
          draftCreating.current = true;
          const resp = await apiRequest('POST', '/api/content-drafts', payload);
          const json = await resp.json();
          if (json.data?.id) {
            setActiveDraftId(json.data.id);
            localStorage.setItem("venturecite-active-draft-id", json.data.id);
            refetchDrafts();
          }
          draftCreating.current = false;
        }
      } catch {
        draftCreating.current = false;
      }
    }, 1_500);
  }, [keywords, industry, type, brandId, targetCustomers, geography, contentStyle, activeDraftId]);

  useEffect(() => { triggerAutoSave(); }, [keywords, industry, type, brandId, targetCustomers, geography, contentStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── New Article ────────────────────────────────────────────────────────────

  const handleNewArticle = async () => {
    try {
      const resp = await apiRequest('POST', '/api/content-drafts', {
        keywords: "", industry: "", type: "article", contentStyle: "b2c",
      });
      const json = await resp.json();
      if (json.data?.id) {
        suppressAutoSave.current = true;
        setActiveDraftId(json.data.id);
        localStorage.setItem("venturecite-active-draft-id", json.data.id);
        setKeywords(""); setIndustry(""); setType("article"); setBrandId("none");
        setTargetCustomers(""); setGeography(""); setContentStyle("b2c");
        setGeneratedContent(""); setSavedArticleId(null); setCurrentJobId(null);
        setHumanScore(null); setPassesAiDetection(null); setScoreBeforeImprove(null);
        setAiIssues([]); setAiStrengths([]); setAiRecommendation(""); setAiVocabularyFound([]);
        setShowTargetingOptions(false);
        await refetchDrafts();
        requestAnimationFrame(() => { suppressAutoSave.current = false; });
      }
    } catch {
      toast({ title: "Could not create new draft", variant: "destructive" });
    }
  };

  // ── Delete draft ───────────────────────────────────────────────────────────

  const handleDeleteDraft = async (draftId: string) => {
    await apiRequest('DELETE', `/api/content-drafts/${draftId}`);
    const { data: freshData } = await refetchDrafts();
    const remaining = (freshData?.data ?? []).filter(d => d.id !== draftId);
    if (draftId === activeDraftId) {
      if (remaining.length > 0) {
        loadDraft(remaining[0]);
      } else {
        suppressAutoSave.current = true;
        setActiveDraftId(null);
        localStorage.removeItem("venturecite-active-draft-id");
        setKeywords(""); setIndustry(""); setType("article"); setBrandId("none");
        setGeneratedContent(""); setSavedArticleId(null); setCurrentJobId(null);
        setHumanScore(null); setPassesAiDetection(null);
        setAiIssues([]); setAiStrengths([]); setAiRecommendation(""); setAiVocabularyFound([]);
        requestAnimationFrame(() => { suppressAutoSave.current = false; });
      }
    }
  };

  // ── Job polling ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentJobId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const resp = await apiRequest('GET', `/api/content-jobs/${currentJobId}`);
        const data = await resp.json();
        if (cancelled) return;
        if (!data.success) { setCurrentJobId(null); return; }

        const job = data.data;
        if (job.status === "succeeded" && job.articleId) {
          setCurrentJobId(null);
          try {
            const articleResp = await apiRequest('GET', `/api/articles/${job.articleId}`);
            const articleJson = await articleResp.json();
            const article = articleJson.data || articleJson.article;
            if (article) {
              setGeneratedContent(article.content || "");
              setSavedArticleId(article.id);
              const meta = article.seoData || {};
              if (typeof meta.humanScore === "number") setHumanScore(meta.humanScore);
              if (typeof meta.passesAiDetection === "boolean") setPassesAiDetection(meta.passesAiDetection);
              // Sync scores to draft
              if (activeDraftId) {
                apiRequest('PATCH', `/api/content-drafts/${activeDraftId}`, {
                  generatedContent: article.content,
                  articleId: article.id,
                  jobId: null,
                  humanScore: meta.humanScore ?? null,
                  passesAiDetection: meta.passesAiDetection ? 1 : 0,
                }).catch(() => {});
                refetchDrafts();
              }
            }
          } catch {}
          refetchUsage();
          queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
          toast({ title: "Article generated", description: "Saved to your Articles page." });
        } else if (job.status === "failed") {
          setCurrentJobId(null);
          // Clear jobId on draft
          if (activeDraftId) {
            apiRequest('PATCH', `/api/content-drafts/${activeDraftId}`, { jobId: null }).catch(() => {});
            refetchDrafts();
          }
          toast({
            title: "Generation failed",
            description: job.errorMessage || "The background worker couldn't finish this job.",
            variant: "destructive",
          });
        }
      } catch { /* transient — retry next tick */ }
    };

    poll();
    const interval = setInterval(poll, 3_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentJobId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────────────────

  const generateContentMutation = useMutation({
    mutationFn: async (data: {
      keywords: string; industry: string; type: string; brandId?: string;
      targetCustomers?: string; geography?: string; contentStyle?: string; draftId?: string;
    }) => {
      const response = await apiRequest('POST', '/api/generate-content', { ...data, humanize: true });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data?.jobId) {
        setCurrentJobId(data.data.jobId);
        // Optimistically update the draft's jobId in the list
        if (activeDraftId) refetchDrafts();
        toast({
          title: "Generation started",
          description: "Writing your article in the background. You can leave this page — it will save automatically.",
        });
      } else if (data.limitReached) {
        toast({
          title: "Usage Limit Reached",
          description: data.error || "You've reached your monthly article limit. Upgrade your plan for more.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Generation Failed",
          description: data.error || data.message || "Unable to start content generation. Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start content generation. Please try again.", variant: "destructive" });
    },
  });

  const rewriteContentMutation = useMutation({
    mutationFn: async (data: { content: string; industry: string; articleId?: string; currentScore?: number | null }) => {
      const response = await apiRequest('POST', '/api/rewrite-content', data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        if (data.improved === false) {
          setScoreBeforeImprove(null);
          toast({
            title: "Content already well-optimized",
            description: `Score: ${data.humanScore}% — the AI couldn't improve it further. Try editing the content manually, then click Auto-Improve again.`,
          });
          return;
        }

        const newScore: number | null = typeof data.humanScore === "number" ? data.humanScore : null;
        setGeneratedContent(data.content);
        setHumanScore(newScore);
        setPassesAiDetection(data.passesAiDetection || false);
        setAiIssues(data.aiIssues || []);
        setAiStrengths(data.aiStrengths || []);

        // Persist improved content back to the draft
        if (activeDraftId) {
          apiRequest('PATCH', `/api/content-drafts/${activeDraftId}`, {
            generatedContent: data.content,
            humanScore: newScore,
            passesAiDetection: data.passesAiDetection ? 1 : 0,
          }).catch(() => {});
        }

        let description = "";
        if (newScore !== null && scoreBeforeImprove !== null) {
          const delta = newScore - scoreBeforeImprove;
          if (delta > 0) {
            description = `Score: ${scoreBeforeImprove}% → ${newScore}% (+${delta}) — ${data.passesAiDetection ? 'Now passes AI detection!' : 'Keep improving for best results.'}`;
          } else if (delta === 0) {
            description = `Score unchanged at ${newScore}%. Try editing the content manually before improving again.`;
          } else {
            description = `Score: ${scoreBeforeImprove}% → ${newScore}%. Content returned to best version seen.`;
          }
        } else {
          description = data.passesAiDetection
            ? `Score: ${newScore}% — passes AI detection!`
            : `Score: ${newScore}% after ${data.attempts} passes.`;
        }

        if (data.improvedArticleId) {
          queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
          description += " Improved version saved to your Articles page.";
        }

        toast({ title: "Content Improved", description });
        setScoreBeforeImprove(null);
      } else {
        setScoreBeforeImprove(null);
        toast({ title: "Rewrite Failed", description: data.message || "Could not rewrite content.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to rewrite content. Please try again.", variant: "destructive" });
    }
  });

  const analyzeContentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest('POST', '/api/analyze-content', { content });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setHumanScore(data.score || null);
        setPassesAiDetection(data.passesAiDetection || false);
        setAiIssues(data.issues || []);
        setAiStrengths(data.strengths || []);
        setAiRecommendation(data.recommendation || "");
        setAiVocabularyFound(data.ai_vocabulary_found || []);
        // Save score to draft
        if (activeDraftId) {
          apiRequest('PATCH', `/api/content-drafts/${activeDraftId}`, {
            humanScore: data.score,
            passesAiDetection: data.passesAiDetection ? 1 : 0,
          }).catch(() => {});
        }
        toast({
          title: "Analysis Complete",
          description: `Human score: ${data.score}% — ${data.passesAiDetection ? 'Likely to pass AI detection' : 'May be flagged as AI-generated'}`
        });
      }
    }
  });

  const keywordSuggestionsMutation = useMutation({
    mutationFn: async (data: { input: string; industry: string }) => {
      const response = await apiRequest('POST', '/api/keyword-suggestions', data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        const suggestions = data.suggestions || [];
        setKeywordSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
        if (suggestions.length > 0) toast({ title: `${suggestions.length} keyword suggestions ready` });
      }
      setSuggestionsLoading(false);
    },
    onError: () => {
      setSuggestionsLoading(false);
      setKeywordSuggestions([]);
      setShowSuggestions(false);
    }
  });

  const saveArticleMutation = useMutation({
    mutationFn: async (articleData: any) => {
      const response = await apiRequest('POST', '/api/articles', articleData);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setSavedArticleId(data.article.id);
        queryClient.setQueryData<{ success: boolean; data: any[] }>(['/api/articles'], (old) => {
          if (!old) return { success: true, data: [data.article] };
          return { ...old, data: [data.article, ...old.data] };
        });
        if (activeDraftId) {
          apiRequest('PATCH', `/api/content-drafts/${activeDraftId}`, { articleId: data.article.id }).catch(() => {});
          refetchDrafts();
        }
        toast({ title: "Article Saved", description: "Your article has been saved to your Articles list." });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save article. Please try again.", variant: "destructive" });
    }
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleRewriteContent = () => {
    if (!generatedContent) {
      toast({ title: "No content to improve", variant: "destructive" });
      return;
    }
    if (!industry) {
      toast({ title: "Select an industry first", description: "Industry is needed for the AI to improve your content.", variant: "destructive" });
      return;
    }
    setScoreBeforeImprove(humanScore);
    rewriteContentMutation.mutate({
      content: generatedContent,
      industry,
      articleId: savedArticleId || undefined,
      currentScore: humanScore,
    });
  };

  const handleGetSuggestions = () => {
    if (!industry) {
      toast({ title: "Select an industry first", description: "Pick an industry so suggestions are relevant to your field.", variant: "destructive" });
      return;
    }
    setSuggestionsLoading(true);
    keywordSuggestionsMutation.mutate({ input: keywords.trim(), industry });
  };

  const handleGenerateContent = () => {
    if (!keywords.trim()) {
      toast({ title: "Keywords Required", description: "Please enter keywords for content generation.", variant: "destructive" });
      return;
    }
    if (!industry) {
      toast({ title: "Industry Required", description: "Please select an industry.", variant: "destructive" });
      return;
    }
    setSavedArticleId(null);
    generateContentMutation.mutate({
      keywords: keywords.trim(),
      industry,
      type,
      brandId: brandId && brandId !== "none" ? brandId : undefined,
      targetCustomers: targetCustomers.trim() || undefined,
      geography: geography.trim() || undefined,
      contentStyle,
      draftId: activeDraftId || undefined,
    });
  };

  const handleSaveArticle = () => {
    if (!generatedContent) return;
    const lines = generatedContent.split('\n').filter(Boolean);
    const title = lines[0]?.replace(/^#+ /, '').trim() || keywords;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const firstParagraph = lines.find(line => !line.startsWith('#') && line.trim().length > 50);
    const excerpt = firstParagraph ? `${firstParagraph.slice(0, 150)}…` : '';
    saveArticleMutation.mutate({
      title, slug, content: generatedContent, excerpt,
      metaDescription: excerpt.slice(0, 160),
      keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      industry, contentType: type,
      brandId: brandId && brandId !== "none" ? brandId : undefined,
    });
  };

  const contentLoadingMessage = useLoadingMessages(generateContentMutation.isPending, [
    "Analyzing your brand...", "Researching your industry...", "Structuring the content outline...",
    "Applying your brand voice...", "Writing the first draft...", "Optimizing for AI search engines...",
    "Humanizing the writing...", "Running AI detection checks...", "Finalizing your article...",
  ]);

  // Update template when industry/type changes
  useEffect(() => {
    if (industry && type) {
      setSelectedTemplate(getIndustryTemplate(industry, type));
    } else {
      setSelectedTemplate(null);
    }
  }, [industry, type]);

  useEffect(() => {
    if (popularTopicsQuery.data?.success) {
      setPopularTopics(popularTopicsQuery.data.topics || []);
    } else {
      setPopularTopics([]);
    }
    setTopicsLoading(popularTopicsQuery.isLoading);
  }, [popularTopicsQuery.data, popularTopicsQuery.isLoading]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-8">
        <PageHeader
          title="AI Content Generation"
          description="Generate SEO-optimized content for AI search engines"
        />

        {/* ── Draft toolbar ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleNewArticle} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Article
          </Button>

          {/* Drafts dropdown — only shows when drafts exist */}
          {drafts.length > 0 && (
            <div className="relative" ref={draftPanelRef}>
              <Button
                size="sm" variant="ghost"
                onClick={() => setShowDraftPanel(p => !p)}
                className="gap-1.5 text-muted-foreground"
              >
                <FileText className="h-4 w-4" />
                {drafts.length} draft{drafts.length !== 1 ? "s" : ""}
                {showDraftPanel ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
              </Button>

              {showDraftPanel && (
                <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-popover border border-border rounded-lg shadow-lg">
                  <div className="max-h-64 overflow-y-auto p-1">
                    {drafts.map(draft => {
                      const status = draftStatus(draft);
                      const isActive = draft.id === activeDraftId;
                      return (
                        <div
                          key={draft.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors group ${
                            isActive ? "bg-primary/10 text-foreground" : "hover:bg-accent"
                          }`}
                          onClick={() => { if (!isActive) loadDraft(draft); setShowDraftPanel(false); }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{draftLabel(draft)}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] px-1.5 py-0 h-4 ${
                                  status === "generating" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                  status === "done" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                  "bg-muted text-muted-foreground"
                                }`}
                              >
                                {status === "generating" && <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin inline" />}
                                {status === "generating" ? "Generating" : status === "done" ? "Done" : "Draft"}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{relativeTime(draft.updatedAt)}</span>
                            </div>
                          </div>
                          <button
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            onClick={e => { e.stopPropagation(); handleDeleteDraft(draft.id); }}
                            title="Delete draft"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active draft indicator */}
          {activeDraftId && drafts.find(d => d.id === activeDraftId) && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Editing: <span className="font-medium text-foreground">{draftLabel(drafts.find(d => d.id === activeDraftId)!)}</span>
            </span>
          )}
        </div>

        {/* Beginner Tips */}
        <div className="mt-4 p-4 bg-muted border border-border rounded-lg">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground text-sm">💡 Content Tips for Beginners</h3>
              <ul className="text-muted-foreground text-sm mt-2 space-y-1 list-disc list-inside">
                <li>Use specific keywords your customers search for</li>
                <li>Choose your industry to get targeted content</li>
                <li>Articles work best for building authority and getting citations</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Usage Widget */}
        {usageData?.success && usageData.data && (
          <Card className="mt-4 bg-card border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    usageData.data.articlesRemaining === 0 ? 'bg-red-500' :
                    usageData.data.articlesRemaining <= 5 ? 'bg-yellow-500' : 'bg-green-500'
                  }`} />
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{usageData.data.articlesUsed}</span>
                    {" / "}
                    <span>{usageData.data.articlesLimit === -1 ? 'Unlimited' : usageData.data.articlesLimit}</span>
                    {" articles this month"}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize px-2 py-0.5 bg-muted rounded">
                    {usageData.data.tier} Plan
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {usageData.data.articlesLimit !== -1 && (
                    <div className="w-32">
                      <Progress value={(usageData.data.articlesUsed / usageData.data.articlesLimit) * 100} className="h-2" />
                    </div>
                  )}
                  {usageData.data.articlesRemaining === 0 && (
                    <Link href="/pricing">
                      <Button size="sm" variant="default" className="bg-primary hover:bg-primary/90">Upgrade Plan</Button>
                    </Link>
                  )}
                  {usageData.data.articlesRemaining > 0 && usageData.data.articlesRemaining <= 5 && usageData.data.articlesLimit !== -1 && (
                    <span className="text-xs text-yellow-500 font-medium">{usageData.data.articlesRemaining} remaining</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* ── Content Generator Form ─────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Content Generator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Industry */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Industry</Label>
                  <Tooltip>
                    <TooltipTrigger><HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs"><p className="text-sm">Choose the industry that best describes your business.</p></TooltipContent>
                  </Tooltip>
                </div>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger data-testid="select-industry">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {industryGroups.map((group) => (
                      <div key={group}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</div>
                        {industries.filter(i => i.group === group).map((ind) => (
                          <SelectItem key={ind.value} value={ind.value}>{ind.value}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Keywords */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Keywords</Label>
                  <Tooltip>
                    <TooltipTrigger><HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs"><p className="text-sm">Enter words and phrases your customers search for. Use 3-5 keywords.</p></TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={industry ? "Enter keywords (e.g., artificial intelligence, machine learning)" : "Select an industry first"}
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    disabled={!industry}
                    data-testid="input-keywords"
                  />
                  <Button type="button" variant="outline" onClick={handleGetSuggestions} disabled={!industry || suggestionsLoading} data-testid="button-suggest-keywords">
                    {suggestionsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4 mr-1" />Suggest</>}
                  </Button>
                </div>
                {industry && (suggestionsLoading || showSuggestions) && (
                  <div className="mt-2">
                    {suggestionsLoading ? (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />Finding keyword suggestions...
                      </div>
                    ) : (
                      <div className="border rounded-md bg-background shadow-sm divide-y">
                        {keywordSuggestions.map((s, i) => (
                          <button key={i} type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left"
                            onClick={() => {
                              const parts = keywords.split(',').map(p => p.trim()).filter(Boolean);
                              if (!parts.includes(s)) parts.push(s);
                              setKeywords(parts.join(', '));
                              setShowSuggestions(false);
                            }}>
                            <Search className="w-4 h-4 text-muted-foreground" />
                            <span>{s}</span>
                            <Plus className="w-4 h-4 ml-auto text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Content Type */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Content Type</Label>
                  <Tooltip>
                    <TooltipTrigger><HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs"><p className="text-sm">Articles build authority, blog posts work for regular updates.</p></TooltipContent>
                  </Tooltip>
                </div>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="article">Article</SelectItem>
                    <SelectItem value="blog post">Blog Post</SelectItem>
                    <SelectItem value="product description">Product Description</SelectItem>
                    <SelectItem value="social media post">Social Media Post</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Content Style */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Content Style</Label>
                  <Tooltip>
                    <TooltipTrigger><HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs"><p className="text-sm">B2C is conversational; B2B is professional and data-driven.</p></TooltipContent>
                  </Tooltip>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setContentStyle("b2c")}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-left ${contentStyle === "b2c" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-muted hover:border-muted-foreground/30"}`}
                    data-testid="button-style-b2c">
                    <span className="text-sm font-semibold">B2C — Consumer</span>
                    <span className="text-xs text-muted-foreground text-center">Conversational, lifestyle-focused, relatable</span>
                  </button>
                  <button type="button" onClick={() => setContentStyle("b2b")}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-left ${contentStyle === "b2b" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-muted hover:border-muted-foreground/30"}`}
                    data-testid="button-style-b2b">
                    <span className="text-sm font-semibold">B2B — Business</span>
                    <span className="text-xs text-muted-foreground text-center">Professional, data-driven, industry authority</span>
                  </button>
                </div>
              </div>

              {/* Brand */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Brand (Optional)</Label>
                  <Tooltip>
                    <TooltipTrigger><HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs"><p className="text-sm">Select a brand profile to personalize the content with your company's voice.</p></TooltipContent>
                  </Tooltip>
                </div>
                <Select value={brandId} onValueChange={setBrandId}>
                  <SelectTrigger data-testid="select-brand">
                    <SelectValue placeholder="No brand (generic content)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No brand (generic content)</SelectItem>
                    {brandsData?.data?.map((brand: any) => (
                      <SelectItem key={brand.id} value={brand.id}>{brand.name} ({brand.companyName})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Targeting options */}
              <div>
                <Button type="button" variant="outline" size="sm" className="w-full justify-between"
                  onClick={() => setShowTargetingOptions(!showTargetingOptions)}
                  data-testid="button-toggle-targeting">
                  <span className="flex items-center gap-2"><Target className="w-4 h-4" />Target Audience & Geography</span>
                  <span className="text-xs text-muted-foreground">{showTargetingOptions ? "Hide" : "Show"} options</span>
                </Button>
                {showTargetingOptions && (
                  <div className="mt-3 space-y-3 p-4 border rounded-lg bg-muted/30">
                    <div>
                      <Label htmlFor="targetCustomers" className="mb-2 block">Target Customers / Demographics</Label>
                      <Textarea id="targetCustomers"
                        placeholder="e.g., CTOs and engineering leaders at mid-size SaaS companies"
                        value={targetCustomers} onChange={(e) => setTargetCustomers(e.target.value)}
                        className="min-h-[60px]" data-testid="input-target-customers" />
                    </div>
                    <div>
                      <Label htmlFor="geography" className="mb-2 block">Geography / Region</Label>
                      <Input id="geography" placeholder="e.g., United States, North America, Global"
                        value={geography} onChange={(e) => setGeography(e.target.value)}
                        data-testid="input-geography" />
                    </div>
                  </div>
                )}
              </div>

              {/* Template preview */}
              {selectedTemplate && (
                <div className="p-4 bg-muted border border-border rounded-lg">
                  <div className="flex items-start gap-3">
                    <BookOpen className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground text-sm mb-1">📝 Template: {selectedTemplate.title}</h4>
                      <p className="text-muted-foreground text-sm mb-2">{selectedTemplate.description}</p>
                      <div className="mb-3">
                        <p className="text-xs font-medium text-foreground mb-1">Structure:</p>
                        <p className="text-xs text-muted-foreground bg-background p-2 rounded border border-border">{selectedTemplate.structure}</p>
                      </div>
                      {selectedTemplate.examples && (
                        <div>
                          <p className="text-xs font-medium text-foreground mb-1">Example keywords (click to use):</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedTemplate.examples.map((example: string, index: number) => (
                              <span key={index}
                                className="text-xs bg-background text-muted-foreground border border-border px-2 py-1 rounded cursor-pointer hover:bg-muted transition-colors"
                                onClick={() => setKeywords(example)}>
                                {example}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <Button onClick={handleGenerateContent}
                disabled={
                  generateContentMutation.isPending || !!currentJobId ||
                  (usageData?.data && usageData.data.articlesLimit !== -1 && usageData.data.articlesRemaining === 0)
                }
                className="w-full" data-testid="button-generate-content">
                {(generateContentMutation.isPending || currentJobId) ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{contentLoadingMessage}</>
                ) : usageData?.data && usageData.data.articlesLimit !== -1 && usageData.data.articlesRemaining === 0 ? (
                  "Monthly limit reached"
                ) : (
                  selectedTemplate ? `Generate ${selectedTemplate.title}` : "Generate Content"
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Popular Topics */}
          {industry && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Popular Topics in {industry}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topicsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /><span>Loading trending topics...</span>
                  </div>
                ) : popularTopics.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">💡 Click any topic below to use it as keywords</p>
                    <div className="grid gap-2">
                      {popularTopics.map((topic, index) => (
                        <button key={index}
                          onClick={() => { setKeywords(topic.topic); toast({ title: "Topic Selected", description: `Using "${topic.topic}" as your keywords.` }); }}
                          className="flex items-start gap-3 p-3 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors group">
                          <Clock className="w-4 h-4 text-muted-foreground mt-0.5 group-hover:text-foreground transition-colors" />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{topic.topic}</h4>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{topic.description}</p>
                            {topic.category && <span className="inline-block mt-2 px-2 py-1 text-xs bg-muted text-muted-foreground rounded">{topic.category}</span>}
                          </div>
                          <Plus className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors opacity-0 group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No popular topics available for this industry yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Generated Content — full width */}
        <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Generated Content</span>
                <div className="flex items-center gap-2">
                  {generatedContent && (
                    <>
                      <Button onClick={() => { navigator.clipboard.writeText(generatedContent); toast({ title: "Copied", description: "Content copied to clipboard" }); }}
                        variant="ghost" size="sm" className="gap-1.5" data-testid="button-copy-content">
                        <Copy className="w-4 h-4" />Copy
                      </Button>
                      <Button onClick={handleSaveArticle} disabled={saveArticleMutation.isPending || !!savedArticleId}
                        size="sm" variant={savedArticleId ? "outline" : "default"} data-testid="button-save-article">
                        {saveArticleMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                        ) : savedArticleId ? (
                          <><Check className="w-4 h-4 mr-2" />Saved</>
                        ) : (
                          <><Save className="w-4 h-4 mr-2" />Save Article</>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {generatedContent ? (
                <div className="space-y-4">
                  <Textarea
                    value={generatedContent}
                    onChange={(e) => {
                      setGeneratedContent(e.target.value);
                      setHumanScore(null);
                      setPassesAiDetection(null);
                      // Auto-save content changes to draft (debounced)
                      if (activeDraftId) {
                        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
                        autoSaveTimer.current = setTimeout(() => {
                          apiRequest('PATCH', `/api/content-drafts/${activeDraftId}`, {
                            generatedContent: e.target.value,
                            humanScore: null,
                            passesAiDetection: null,
                          }).catch(() => {});
                        }, 2_000);
                      }
                    }}
                    className="min-h-[400px] font-mono text-sm leading-relaxed"
                    data-testid="textarea-generated-content"
                  />
                  <p className="text-xs text-muted-foreground">
                    You can edit the content directly above. Make changes then re-check the AI score below.
                  </p>

                  {/* AI Detection Score */}
                  <div className={`p-4 rounded-lg border ${
                    humanScore === null ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                    : passesAiDetection ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : humanScore >= 50 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  }`} data-testid="ai-detection-score">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          humanScore === null ? 'bg-slate-100 dark:bg-slate-800'
                          : passesAiDetection ? 'bg-green-100 dark:bg-green-800'
                          : 'bg-amber-100 dark:bg-amber-800'
                        }`}>
                          {humanScore === null
                            ? <Shield className="w-5 h-5 text-slate-500" />
                            : passesAiDetection
                              ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                              : <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                          }
                        </div>
                        <div>
                          <span className="font-medium text-sm">AI Detection Score</span>
                          {humanScore !== null ? (
                            <>
                              <div className="flex items-center gap-3 mt-1">
                                <Progress value={humanScore} className="w-32 h-2" />
                                <span className={`text-sm font-bold ${passesAiDetection ? 'text-green-700 dark:text-green-300' : humanScore >= 50 ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'}`}>
                                  {humanScore}%
                                </span>
                                {scoreBeforeImprove !== null && scoreBeforeImprove !== humanScore && (
                                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    humanScore > scoreBeforeImprove ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                  }`}>
                                    {humanScore > scoreBeforeImprove ? `+${humanScore - scoreBeforeImprove}` : `${humanScore - scoreBeforeImprove}`}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {passesAiDetection ? 'Looking good! Content should pass most AI detection tools.' : 'Content may be flagged as AI-generated. Edit below and re-check.'}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-1">
                              Check how human your content sounds. Edit it, then re-check to see the score improve.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!passesAiDetection && humanScore !== null && (
                          <Button onClick={handleRewriteContent} disabled={rewriteContentMutation.isPending}
                            variant="outline" size="sm" className="gap-2" data-testid="button-rewrite-content">
                            {rewriteContentMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 animate-spin" />Auto-Improving...</>
                            ) : (
                              <><RefreshCw className="w-4 h-4" />Auto-Improve</>
                            )}
                          </Button>
                        )}
                        <Button onClick={() => analyzeContentMutation.mutate(generatedContent)}
                          disabled={analyzeContentMutation.isPending} size="sm"
                          className={`gap-2 ${humanScore === null ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : ''}`}
                          variant={humanScore === null ? "default" : "outline"}
                          data-testid="button-check-ai-score">
                          {analyzeContentMutation.isPending ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />Checking...</>
                          ) : (
                            <><Shield className="w-4 h-4" />{humanScore === null ? "Check AI Score" : "Re-Check Score"}</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {!passesAiDetection && (aiIssues.length > 0 || aiVocabularyFound.length > 0 || aiRecommendation) && (
                    <div className="p-4 rounded-lg border border-border bg-muted" data-testid="humanization-tips">
                      <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-muted-foreground" />How to Improve Your Score
                      </h4>
                      {aiRecommendation && (
                        <p className="text-sm text-foreground mb-3 p-2 bg-background rounded border border-border">{aiRecommendation}</p>
                      )}
                      {aiVocabularyFound.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5">AI buzzwords to replace:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {aiVocabularyFound.map((word, idx) => (
                              <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-700">"{word}"</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p className="text-xs font-medium text-foreground mb-1">Quick editing tips:</p>
                        <ul className="space-y-1.5">
                          {[
                            'Use contractions: "do not" → "don\'t", "it is" → "it\'s"',
                            'Add personal voice: "I\'ve seen...", "In my experience..."',
                            'Break uniform sentences: mix very short with longer ones',
                            'Replace formal words: "utilize" → "use", "leverage" → "take advantage of"',
                            'Start some sentences with "But", "And", "So", "Look,"',
                          ].map((tip, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-blue-500 mt-0.5 flex-shrink-0">{i + 1}.</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-3 font-medium">
                        Make a few edits above, then click "Re-Check Score" to see your improvement.
                      </p>
                    </div>
                  )}

                  {(aiIssues.length > 0 || aiStrengths.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border bg-slate-50 dark:bg-slate-900/50">
                      {aiIssues.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />Patterns that may trigger AI detection:
                          </h4>
                          <ul className="space-y-1">
                            {aiIssues.map((issue, idx) => (
                              <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                <span className="text-amber-500 mt-1">•</span><span>{issue}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiStrengths.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />Human-like qualities detected:
                          </h4>
                          <ul className="space-y-1">
                            {aiStrengths.map((strength, idx) => (
                              <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                <span className="text-green-500 mt-1">•</span><span>{strength}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {savedArticleId && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg" data-testid="status-article-saved">
                      <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-900 dark:text-green-100">Article saved successfully!</p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">View and manage your articles in the Articles page.</p>
                      </div>
                      <Link href="/articles">
                        <Button variant="outline" size="sm" data-testid="link-view-articles">View Articles</Button>
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Generated content will appear here</p>
                    {currentJobId && (
                      <div className="flex items-center justify-center gap-2 mt-3 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating your article…</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </TooltipProvider>
  );
}
