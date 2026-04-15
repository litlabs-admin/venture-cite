import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet";
import PageHeader from "@/components/PageHeader";
import { TestModeBadge } from "@/components/TestModeBadge";
import { useLocation } from "wouter";
import type { Brand, KeywordResearch } from "@shared/schema";
import {
  Search,
  Sparkles,
  Target,
  TrendingUp,
  FileText,
  Loader2,
  Trash2,
  ExternalLink,
  Zap,
  BarChart3,
  Filter,
  RefreshCw
} from "lucide-react";

const intentColors: Record<string, string> = {
  informational: "bg-muted text-muted-foreground border-border",
  commercial: "bg-muted text-muted-foreground border-border",
  transactional: "bg-muted text-muted-foreground border-border",
  navigational: "bg-muted text-muted-foreground border-border",
};

const contentTypeLabels: Record<string, string> = {
  article: "Article",
  guide: "Guide",
  comparison: "Comparison",
  "how-to": "How-To",
  listicle: "Listicle",
};

export default function KeywordResearchPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: brandsData, isLoading: brandsLoading } = useQuery<{ data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsData?.data || [];
  const selectedBrand = brands.find(b => b.id === selectedBrandId);

  // Auto-select the only brand the user owns — common case right after
  // creating their first brand. Multi-brand users still see the placeholder.
  useEffect(() => {
    if (!selectedBrandId && brands.length === 1) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, selectedBrandId]);

  const { data: keywordsData, isLoading: keywordsLoading } = useQuery<{ success: boolean; data: KeywordResearch[] }>({
    queryKey: [`/api/keyword-research/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const keywords = keywordsData?.data || [];
  const filteredKeywords = statusFilter === "all" 
    ? keywords 
    : keywords.filter(k => k.status === statusFilter);

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/keyword-research/discover", { brandId: selectedBrandId });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: `Discovered ${data.count} keywords!` });
        queryClient.invalidateQueries({ queryKey: [`/api/keyword-research/${selectedBrandId}`] });
      } else {
        toast({ title: data.error || "Failed to discover keywords", variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Failed to discover keywords", variant: "destructive" }),
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
    onSuccess: () => {
      toast({ title: "Keyword deleted" });
      queryClient.invalidateQueries({ queryKey: [`/api/keyword-research/${selectedBrandId}`] });
    },
    onError: () => toast({ title: "Failed to delete keyword", variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/keyword-research/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/keyword-research/${selectedBrandId}`] });
    },
  });

  const handleGenerateContent = (keyword: KeywordResearch) => {
    const params = new URLSearchParams({
      keyword: keyword.keyword,
      industry: selectedBrand?.industry || "",
      type: keyword.suggestedContentType || "article",
      brandId: selectedBrandId,
    });
    setLocation(`/content?${params.toString()}`);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    if (score >= 40) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-8">
      <Helmet>
        <title>AI Keyword Research | VentureCite</title>
        <meta name="description" content="Discover high-opportunity keywords for AI search optimization with intelligent research powered by GPT-4." />
      </Helmet>

      <PageHeader
        title="AI Keyword Research"
        description="Discover keywords that will get your brand cited by AI search engines"
      />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" />
                Select Brand
              </CardTitle>
            </CardHeader>
            <CardContent>
              {brandsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                  <SelectTrigger data-testid="select-brand">
                    <SelectValue placeholder="Choose a brand..." />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id} data-testid={`select-brand-${brand.id}`}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
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
                  <SelectItem value="all" data-testid="filter-all">All Keywords</SelectItem>
                  <SelectItem value="discovered" data-testid="filter-discovered">Discovered</SelectItem>
                  <SelectItem value="targeted" data-testid="filter-targeted">Targeted</SelectItem>
                  <SelectItem value="content_created" data-testid="filter-content-created">Content Created</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Discovery
                </span>
                <TestModeBadge />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => discoverMutation.mutate()}
                disabled={!selectedBrandId || discoverMutation.isPending}
                className="w-full bg-red-600 hover:bg-red-700"
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
              <p className="text-xs text-muted-foreground mt-2">
                AI analyzes your brand, industry, and competitors to find high-opportunity keywords
              </p>
            </CardContent>
          </Card>
        </div>

        {!selectedBrandId ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Search className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Select a Brand to Start</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Choose a brand above to discover AI-optimized keywords and generate content that gets cited.
              </p>
            </CardContent>
          </Card>
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
          <Card>
            <CardContent className="py-16 text-center">
              <Sparkles className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No Keywords Found</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-4">
                Click "Discover Keywords with AI" to find high-opportunity keywords for {selectedBrand?.name}.
              </p>
              <Button
                onClick={() => discoverMutation.mutate()}
                disabled={discoverMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-discover-empty-state"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Discover Keywords
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
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
                <RefreshCw className={`h-4 w-4 mr-2 ${discoverMutation.isPending ? "animate-spin" : ""}`} />
                Find More
              </Button>
            </div>

            {filteredKeywords.map((keyword) => (
              <Card key={keyword.id} className="hover:shadow-md transition-shadow" data-testid={`keyword-card-${keyword.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-foreground" data-testid={`text-keyword-${keyword.id}`}>{keyword.keyword}</h3>
                        <Badge className={intentColors[keyword.intent || "informational"]} data-testid={`badge-intent-${keyword.id}`}>
                          {keyword.intent}
                        </Badge>
                        {keyword.category && (
                          <Badge variant="outline" className="text-muted-foreground">
                            {keyword.category}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Opportunity Score</p>
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${getScoreColor(keyword.opportunityScore)}`} data-testid={`score-opportunity-${keyword.id}`}>
                              {keyword.opportunityScore}
                            </span>
                            <Progress value={keyword.opportunityScore} className="h-2 flex-1" />
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground mb-1">AI Citation Potential</p>
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${getScoreColor(keyword.aiCitationPotential)}`} data-testid={`score-citation-${keyword.id}`}>
                              {keyword.aiCitationPotential}
                            </span>
                            <Progress value={keyword.aiCitationPotential} className="h-2 flex-1" />
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Search Volume</p>
                          <span className="text-lg font-bold text-foreground">
                            {keyword.searchVolume ? keyword.searchVolume.toLocaleString() : "—"}
                          </span>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Difficulty</p>
                          <span className="text-lg font-bold text-foreground">
                            {keyword.difficulty || "—"}
                          </span>
                        </div>
                      </div>

                      {keyword.relatedKeywords && keyword.relatedKeywords.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs text-muted-foreground mb-2">Related Keywords</p>
                          <div className="flex flex-wrap gap-2">
                            {keyword.relatedKeywords.map((related, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
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
                        className="bg-red-600 hover:bg-red-700"
                        data-testid={`button-generate-content-${keyword.id}`}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Generate Content
                      </Button>

                      <Badge 
                        variant="outline" 
                        className="justify-center text-xs"
                      >
                        {contentTypeLabels[keyword.suggestedContentType || "article"] || keyword.suggestedContentType}
                      </Badge>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(keyword.id)}
                        className="text-muted-foreground hover:text-red-600"
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
