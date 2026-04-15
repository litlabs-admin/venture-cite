import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Eye, 
  PieChart, 
  MessageSquare, 
  Users,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Trophy,
  Target,
  BarChart3,
  Zap
} from "lucide-react";
import { SiOpenai, SiGoogle } from "react-icons/si";
import type { Brand } from "@shared/schema";

interface PlatformMetrics {
  mentions: number;
  citations: number;
  avgRank: number;
  sentiment: { positive: number; neutral: number; negative: number };
  visibilityScore: number;
}

interface LeaderboardEntry {
  name: string;
  domain: string;
  isOwn: boolean;
  totalCitations: number;
  platformBreakdown: Record<string, number>;
}

interface GeoAnalyticsData {
  brand: {
    id: string;
    name: string;
    industry: string;
  };
  overview: {
    aiVisibilityScore: number;
    shareOfVoice: number;
    totalCitations: number;
    totalMentions: number;
    marketSize: number;
    competitorCount: number;
  };
  sentiment: {
    score: number;
    label: string;
    breakdown: { positive: number; neutral: number; negative: number };
    percentages: { positive: number; neutral: number; negative: number };
  };
  platformBreakdown: Record<string, PlatformMetrics>;
  leaderboard: LeaderboardEntry[];
}

const AI_PLATFORM_ICONS: Record<string, JSX.Element> = {
  'ChatGPT': <SiOpenai className="h-4 w-4" />,
  'Claude': <span className="text-sm font-bold">C</span>,
  'Grok': <span className="text-sm font-bold">X</span>,
  'Gemini': <SiGoogle className="h-4 w-4" />,
  'Perplexity': <span className="text-sm font-bold">P</span>,
  'Microsoft Copilot': <span className="text-sm font-bold">M</span>,
  'Meta AI': <span className="text-sm font-bold">M</span>,
  'DeepSeek': <span className="text-sm font-bold">D</span>,
  'Bing AI': <span className="text-sm font-bold">B</span>,
};

function getVisibilityColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

function getVisibilityLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Poor';
  return 'Very Low';
}

function getSentimentIcon(label: string) {
  if (label === 'Positive') return <ThumbsUp className="h-5 w-5 text-green-500" />;
  if (label === 'Negative') return <ThumbsDown className="h-5 w-5 text-red-500" />;
  return <Meh className="h-5 w-5 text-gray-500" />;
}

export default function GeoAnalytics() {
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");

  const { data: brandsResponse, isLoading: brandsLoading } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsResponse?.data || [];

  const { data: analyticsResponse, isLoading: analyticsLoading, error } = useQuery<{ success: boolean; data: GeoAnalyticsData }>({
    queryKey: ["/api/geo-analytics", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const analytics = analyticsResponse?.data;

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="page-title">GEO Analytics Dashboard</h1>
        <p className="text-muted-foreground">
          AI Visibility Score, Share of Voice, and Sentiment Analysis
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Select Brand to Analyze
          </CardTitle>
        </CardHeader>
        <CardContent>
          {brandsLoading ? (
            <Skeleton className="h-10 w-[300px]" />
          ) : brands.length === 0 ? (
            <p className="text-muted-foreground">No brands found. Create a brand first to see analytics.</p>
          ) : (
            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
              <SelectTrigger className="w-full md:w-[300px]" data-testid="select-brand">
                <SelectValue placeholder="Select a brand..." />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name} - {brand.industry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {!selectedBrandId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a Brand to View Analytics</h3>
            <p className="text-muted-foreground">
              Choose a brand above to see AI Visibility Score, Share of Voice, and Sentiment Analysis
            </p>
          </CardContent>
        </Card>
      ) : analyticsLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      ) : error || !analytics ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-500">Failed to load analytics. Please try again.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-bl-full" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  AI Visibility Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3">
                  <span className={`text-5xl font-bold ${getVisibilityColor(analytics.overview.aiVisibilityScore)}`} data-testid="visibility-score">
                    {analytics.overview.aiVisibilityScore}
                  </span>
                  <span className="text-2xl text-muted-foreground mb-1">/100</span>
                </div>
                <Badge variant="outline" className="mt-2">
                  {getVisibilityLabel(analytics.overview.aiVisibilityScore)}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  Based on citations, mentions, and ranking across 9 AI platforms
                </p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-500/20 to-teal-500/20 rounded-bl-full" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <PieChart className="h-4 w-4" />
                  Share of Voice
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-bold text-green-600" data-testid="share-of-voice">
                    {analytics.overview.shareOfVoice}%
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">
                    vs {analytics.overview.competitorCount} competitors
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Your share of total AI citations in your market
                </p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-bl-full" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Sentiment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  {getSentimentIcon(analytics.sentiment.label)}
                  <span className="text-3xl font-bold" data-testid="sentiment-label">
                    {analytics.sentiment.label}
                  </span>
                </div>
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="text-green-600">
                    <ThumbsUp className="h-3 w-3 inline mr-1" />
                    {analytics.sentiment.percentages.positive}%
                  </span>
                  <span className="text-gray-500">
                    <Meh className="h-3 w-3 inline mr-1" />
                    {analytics.sentiment.percentages.neutral}%
                  </span>
                  <span className="text-red-500">
                    <ThumbsDown className="h-3 w-3 inline mr-1" />
                    {analytics.sentiment.percentages.negative}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  How AI platforms describe your brand
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Citations</p>
                    <p className="text-2xl font-bold" data-testid="total-citations">{analytics.overview.totalCitations}</p>
                  </div>
                  <Zap className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Mentions</p>
                    <p className="text-2xl font-bold" data-testid="total-mentions">{analytics.overview.totalMentions}</p>
                  </div>
                  <MessageSquare className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Market Size</p>
                    <p className="text-2xl font-bold" data-testid="market-size">{analytics.overview.marketSize}</p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Competitors Tracked</p>
                    <p className="text-2xl font-bold" data-testid="competitor-count">{analytics.overview.competitorCount}</p>
                  </div>
                  <Users className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="platforms" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="platforms">Platform Breakdown</TabsTrigger>
              <TabsTrigger value="leaderboard">Competitor Leaderboard</TabsTrigger>
            </TabsList>

            <TabsContent value="platforms" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Visibility by AI Platform
                  </CardTitle>
                  <CardDescription>
                    Performance metrics across all 9 AI platforms
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(analytics.platformBreakdown)
                      .sort(([, a], [, b]) => b.visibilityScore - a.visibilityScore)
                      .map(([platform, metrics]) => (
                        <div key={platform} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                                {AI_PLATFORM_ICONS[platform] || <span className="text-xs">{platform[0]}</span>}
                              </div>
                              <span className="font-semibold">{platform}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-lg font-bold ${getVisibilityColor(metrics.visibilityScore)}`}>
                                {metrics.visibilityScore}
                              </span>
                              <span className="text-sm text-muted-foreground">/100</span>
                            </div>
                          </div>
                          <Progress value={metrics.visibilityScore} className="h-2 mb-3" />
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Citations</p>
                              <p className="font-semibold">{metrics.citations}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Mentions</p>
                              <p className="font-semibold">{metrics.mentions}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Avg Rank</p>
                              <p className="font-semibold">{metrics.avgRank || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Sentiment</p>
                              <div className="flex gap-1 text-xs">
                                <span className="text-green-600">+{metrics.sentiment.positive}</span>
                                <span className="text-gray-400">/{metrics.sentiment.neutral}</span>
                                <span className="text-red-500">-{metrics.sentiment.negative}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="leaderboard" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Share of Voice Leaderboard
                  </CardTitle>
                  <CardDescription>
                    Your brand vs competitors by total AI citations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics.leaderboard.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No competitor data available. Add competitors to see the leaderboard.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analytics.leaderboard.map((entry, index) => {
                        const totalMarket = analytics.overview.marketSize || 1;
                        const sovPercent = Math.round((entry.totalCitations / totalMarket) * 100);
                        
                        return (
                          <div 
                            key={entry.domain} 
                            className={`flex items-center gap-4 p-3 rounded-lg ${
                              entry.isOwn 
                                ? 'bg-primary/10 border-2 border-primary' 
                                : 'bg-muted/50'
                            }`}
                          >
                            <span className={`text-2xl font-bold w-8 ${
                              index === 0 ? 'text-yellow-500' : 
                              index === 1 ? 'text-gray-400' : 
                              index === 2 ? 'text-amber-600' : 'text-muted-foreground'
                            }`}>
                              #{index + 1}
                            </span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{entry.name}</span>
                                {entry.isOwn && <Badge>Your Brand</Badge>}
                              </div>
                              <span className="text-sm text-muted-foreground">{entry.domain}</span>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold">{entry.totalCitations}</p>
                              <p className="text-sm text-muted-foreground">{sovPercent}% SoV</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                What These Metrics Mean
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-500" />
                    AI Visibility Score
                  </h4>
                  <p className="text-muted-foreground">
                    A 0-100 score measuring how visible your brand is across AI platforms. 
                    Based on citations (40%), mentions (30%), and average ranking position (30%).
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-green-500" />
                    Share of Voice
                  </h4>
                  <p className="text-muted-foreground">
                    Your percentage of total AI citations compared to your competitors. 
                    Higher is better - it means AI systems recommend you more often.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-amber-500" />
                    Sentiment Analysis
                  </h4>
                  <p className="text-muted-foreground">
                    How positively or negatively AI platforms describe your brand. 
                    Positive mentions correlate with higher recommendation rates.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
