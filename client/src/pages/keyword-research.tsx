import { usePersistedState } from "@/hooks/use-persisted-state";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { runLlmJob } from "@/lib/llmJobs";
import { useNavigate } from "@tanstack/react-router";
import type { KeywordResearch } from "@shared/schema";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  Search,
  Sparkles,
  FileText,
  Loader2,
  Trash2,
  Filter,
  RefreshCw,
  CheckCircle,
} from "lucide-react";

const intentColors: Record<string, string> = {
  informational: "bg-muted text-muted-foreground border-border",
  commercial: "bg-muted text-muted-foreground border-border",
  transactional: "bg-muted text-muted-foreground border-border",
  navigational: "bg-muted text-muted-foreground border-border",
};

// Banner copy differs (mentions "planned"); this constant only deduplicates
// the per-metric tooltip copy that appears verbatim on four tooltips.
const AI_ESTIMATED_TOOLTIP =
  "AI-estimated, not measured. We don't yet integrate a real search-volume source.";

const contentTypeLabels: Record<string, string> = {
  article: "Article",
  guide: "Guide",
  comparison: "Comparison",
  "how-to": "How-To",
  listicle: "Listicle",
};

export default function KeywordResearchPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const [statusFilter, setStatusFilter] = usePersistedState<string>("vc_keywords_filter", "all");

  const {
    data: keywordsData,
    isLoading: keywordsLoading,
    isError: keywordsIsError,
    isRefetching: keywordsIsRefetching,
    refetch: refetchKeywords,
  } = useQuery<{
    success: boolean;
    data: KeywordResearch[];
  }>({
    queryKey: [`/api/keyword-research/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const keywords = keywordsData?.data || [];
  const filteredKeywords =
    statusFilter === "all" ? keywords : keywords.filter((k) => k.status === statusFilter);

  const discoverMutation = useMutation({
    mutationFn: async () => {
      // Server (post-2026-05-28): enqueues an OpenAI Responses
      // background job and returns 202 + { jobId }. runLlmJob() polls
      // /api/llm-jobs/:jobId until the kind-handler finalizes (parses
      // the AI output, dedups against existing rows, persists the new
      // brand_keywords). The polling resolves with the same shape the
      // route used to return inline: { data: [...], count, message? }.
      // Works equally well on Hobby and Pro because the LLM runs on
      // OpenAI's infra rather than inside our 10s function ceiling.
      return await runLlmJob<
        { brandId: string },
        {
          data: KeywordResearch[];
          count: number;
          message?: string;
        }
      >("/api/keyword-research/discover", { brandId: selectedBrandId! });
    },
    onSuccess: (data) => {
      if (data.count === 0) {
        // Soft "no new keywords" case — not a failure, just informational.
        // Handler returns { data: [], count: 0, message } when all
        // discovered keywords already existed for this brand.
        toast({
          title: "No new keywords",
          description: data.message || "All discovered keywords already exist for this brand.",
        });
        return;
      }
      toast({ title: `Discovered ${data.count} keywords!` });
      // Instant update: append new keywords to cache
      const qk = [`/api/keyword-research/${selectedBrandId}`];
      queryClient.setQueryData<{ success: boolean; data: KeywordResearch[] }>(qk, (old) => {
        if (!old) return { success: true, data: data.data };
        return { ...old, data: [...old.data, ...data.data] };
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Failed to discover keywords",
        description: err.message || "Unknown error",
        variant: "destructive",
      }),
  });

  const keywordLoadingMessage = useLoadingMessages(discoverMutation.isPending, [
    "Analyzing your brand profile...",
    "Identifying competitor keywords...",
    "Scanning AI search patterns...",
    "Scoring citation potential...",
    "Filtering high-opportunity terms...",
  ]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/keyword-research/${id}`);
      return response.json();
    },
    onSuccess: (_data, deletedId) => {
      toast({ title: "Keyword deleted" });
      // Instant update: remove keyword from cache
      const qk = [`/api/keyword-research/${selectedBrandId}`];
      queryClient.setQueryData<{ success: boolean; data: KeywordResearch[] }>(qk, (old) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((k) => k.id !== deletedId) };
      });
    },
    onError: () => toast({ title: "Failed to delete keyword", variant: "destructive" }),
  });

  // (updateStatusMutation lived here pre-2026-05-28. It targeted
  // PATCH /api/keyword-research/:id but no UI control ever called it.
  // The PATCH endpoint stays available for future use; the unused
  // mutation hook is removed to keep the page lean.)

  const handleGenerateContent = (keyword: KeywordResearch) => {
    navigate({
      to: "/content",
      search: {
        keyword: keyword.keyword,
        industry: selectedBrand?.industry || "",
        type: keyword.suggestedContentType || "article",
        brandId: selectedBrandId,
      },
    });
  };

  const getScoreColor = (score: number) => {
    // Zero (including cold-start, no data yet) is a neutral "no data" state,
    // not a failing one — colour only arrives once there's a real score.
    if (score <= 0) return "text-foreground";
    // High score: neutral text, not green/chart-4. The check icon rendered
    // alongside the value is what signals "good", not colour.
    if (score >= 80) return "text-foreground";
    if (score >= 60) return "text-warning";
    if (score >= 40) return "text-warning";
    return "text-destructive";
  };

  return (
    <div className="space-y-8">
      {/* Title/description moved to src/routes/_app/keyword-research.tsx's
          `head()` — metadata belongs to the route, not this component. */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-caption text-muted-foreground flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="filter-all">
                  All Keywords
                </SelectItem>
                <SelectItem value="discovered" data-testid="filter-discovered">
                  Discovered
                </SelectItem>
                <SelectItem value="targeted" data-testid="filter-targeted">
                  Targeted
                </SelectItem>
                <SelectItem value="content_created" data-testid="filter-content-created">
                  Content Created
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-caption text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Discovery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => discoverMutation.mutate()}
              disabled={!selectedBrandId || discoverMutation.isPending}
              className="w-full"
              data-testid="button-discover-keywords"
            >
              {discoverMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {keywordLoadingMessage}
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Discover Keywords with AI
                </>
              )}
            </Button>
            <p className="text-caption text-muted-foreground mt-2">
              AI analyzes your brand, industry, and competitors to find high-opportunity keywords
            </p>
          </CardContent>
        </Card>
      </div>

      {!selectedBrandId ? (
        <EmptyState
          icon={Search}
          title="Select a Brand to Start"
          description="Choose a brand above to discover AI-optimized keywords and generate content that gets cited."
        />
      ) : keywordsIsError ? (
        <ErrorState
          title="Couldn't load keywords"
          onRetry={() => refetchKeywords()}
          isRetrying={keywordsIsRefetching}
        />
      ) : keywordsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-48 mb-2" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredKeywords.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No Keywords Found"
          description={
            <>
              Click "Discover Keywords with AI" to find high-opportunity keywords for{" "}
              {selectedBrand?.name}.
            </>
          }
          action={{
            label: "Discover Keywords",
            onClick: () => discoverMutation.mutate(),
          }}
        />
      ) : (
        <div className="space-y-4">
          <Alert className="mb-4" data-testid="alert-ai-estimated">
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              These figures are AI-estimated, not measured. Real search-volume integration is
              planned.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground">
              Showing {filteredKeywords.length} keyword{filteredKeywords.length !== 1 ? "s" : ""}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => discoverMutation.mutate()}
              disabled={discoverMutation.isPending}
              data-testid="button-refresh-keywords"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${discoverMutation.isPending ? "animate-spin" : ""}`}
              />
              Find More
            </Button>
          </div>

          {filteredKeywords.map((keyword) => (
            <Card
              key={keyword.id}
              className="transition-colors"
              data-testid={`keyword-card-${keyword.id}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3
                        className="text-ui font-semibold text-foreground"
                        data-testid={`text-keyword-${keyword.id}`}
                      >
                        {keyword.keyword}
                      </h3>
                      <Badge
                        className={intentColors[keyword.intent || "informational"]}
                        data-testid={`badge-intent-${keyword.id}`}
                      >
                        {keyword.intent}
                      </Badge>
                      {keyword.category && (
                        <Badge variant="outline" className="text-muted-foreground">
                          {keyword.category}
                        </Badge>
                      )}
                    </div>

                    <TooltipProvider delayDuration={200}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-caption text-muted-foreground mb-1">
                            Opportunity Score
                          </p>
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`text-ui font-semibold inline-flex items-center gap-1 ${getScoreColor(keyword.opportunityScore)}`}
                                  data-testid={`score-opportunity-${keyword.id}`}
                                >
                                  {keyword.opportunityScore}
                                  {keyword.opportunityScore >= 80 && (
                                    <CheckCircle className="h-3 w-3" aria-hidden="true" />
                                  )}
                                  <Sparkles className="h-3 w-3 text-muted-foreground" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{AI_ESTIMATED_TOOLTIP}</TooltipContent>
                            </Tooltip>
                            <Progress value={keyword.opportunityScore} className="h-2 flex-1" />
                          </div>
                        </div>

                        <div>
                          <p className="text-caption text-muted-foreground mb-1">
                            AI Citation Potential
                          </p>
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`text-ui font-semibold inline-flex items-center gap-1 ${getScoreColor(keyword.aiCitationPotential)}`}
                                  data-testid={`score-citation-${keyword.id}`}
                                >
                                  {keyword.aiCitationPotential}
                                  {keyword.aiCitationPotential >= 80 && (
                                    <CheckCircle className="h-3 w-3" aria-hidden="true" />
                                  )}
                                  <Sparkles className="h-3 w-3 text-muted-foreground" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{AI_ESTIMATED_TOOLTIP}</TooltipContent>
                            </Tooltip>
                            <Progress value={keyword.aiCitationPotential} className="h-2 flex-1" />
                          </div>
                        </div>

                        <div>
                          <p className="text-caption text-muted-foreground mb-1">Search Volume</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-ui font-semibold text-foreground inline-flex items-center gap-1">
                                {keyword.searchVolume ? keyword.searchVolume.toLocaleString() : "—"}
                                <Sparkles className="h-3 w-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{AI_ESTIMATED_TOOLTIP}</TooltipContent>
                          </Tooltip>
                        </div>

                        <div>
                          <p className="text-caption text-muted-foreground mb-1">Difficulty</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-ui font-semibold text-foreground inline-flex items-center gap-1">
                                {keyword.difficulty || "—"}
                                <Sparkles className="h-3 w-3 text-muted-foreground" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{AI_ESTIMATED_TOOLTIP}</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </TooltipProvider>

                    {keyword.relatedKeywords && keyword.relatedKeywords.length > 0 && (
                      <div className="mt-4">
                        <p className="text-caption text-muted-foreground mb-2">Related Keywords</p>
                        <div className="flex flex-wrap gap-2">
                          {keyword.relatedKeywords.map((related, i) => (
                            <Badge key={i} variant="secondary" className="text-caption">
                              {related}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleGenerateContent(keyword)}
                      className=""
                      data-testid={`button-generate-content-${keyword.id}`}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Generate Content
                    </Button>

                    <Badge variant="outline" className="justify-center text-caption">
                      {contentTypeLabels[keyword.suggestedContentType || "article"] ||
                        keyword.suggestedContentType}
                    </Badge>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(keyword.id)}
                      className="text-muted-foreground hover:text-destructive"
                      data-testid={`button-delete-keyword-${keyword.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
