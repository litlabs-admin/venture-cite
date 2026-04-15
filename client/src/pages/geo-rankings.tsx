import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, TrendingUp, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

interface GeoRanking {
  id: string;
  articleId: string;
  aiPlatform: string;
  prompt: string;
  rank: number | null;
  isCited: number;
  citationContext: string | null;
  checkedAt: string;
}

interface Article {
  id: string;
  title: string;
  slug: string;
}

export default function GeoRankingsPage() {
  const { data: rankingsData, isLoading: rankingsLoading } = useQuery<{data: GeoRanking[]}>({
    queryKey: ['/api/geo-rankings'],
  });

  const { data: articlesData, isLoading: articlesLoading } = useQuery<{data: Article[]}>({
    queryKey: ['/api/articles'],
  });

  const rankings = (rankingsData?.data || []) as GeoRanking[];
  const articles = (articlesData?.data || []) as Article[];

  // Group rankings by article
  const articleMap = new Map(articles.map((a: Article) => [a.id, a]));
  
  const platformColors: Record<string, string> = {
    "ChatGPT": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "Claude": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "Grok": "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
    "Perplexity": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    "Google AI": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    "Gemini": "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    "Microsoft Copilot": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    "Meta AI": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    "DeepSeek": "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  };

  // Calculate platform stats
  const platformStats = rankings.reduce((acc: any, ranking: GeoRanking) => {
    if (!acc[ranking.aiPlatform]) {
      acc[ranking.aiPlatform] = { total: 0, cited: 0, avgRank: [] };
    }
    acc[ranking.aiPlatform].total++;
    if (ranking.isCited) {
      acc[ranking.aiPlatform].cited++;
      if (ranking.rank) {
        acc[ranking.aiPlatform].avgRank.push(ranking.rank);
      }
    }
    return acc;
  }, {});

  // Calculate citation rate
  const totalRankings = rankings.length;
  const totalCitations = rankings.filter((r: GeoRanking) => r.isCited).length;
  const citationRate = totalRankings > 0 ? ((totalCitations / totalRankings) * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-blue-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            GEO Rankings
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Track your content performance across AI platforms
          </p>
        </div>

        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6" data-testid="banner-live-mode">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200" data-testid="text-live-title">Live Citation Monitoring</p>
              <p className="text-green-700 dark:text-green-300 text-sm mt-1">
                Citation checks query real AI engines (ChatGPT, Perplexity, and others) to detect if your brand and content are being referenced. Run checks from the Articles page to track your visibility.
              </p>
              <p className="text-green-600 dark:text-green-400 text-xs mt-2">
                Tip: Use the AI Visibility Guide to optimize your content for better AI engine citations.
              </p>
            </div>
          </div>
        </div>

        {/* Platform Stats Overview */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Total Checks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalRankings}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Citations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{totalCitations}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Citation Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{citationRate}%</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Platforms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{Object.keys(platformStats).length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Platform Performance */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Platform Performance
            </CardTitle>
            <CardDescription>
              Citation rates across different AI platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.entries(platformStats).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(platformStats).map(([platform, stats]: [string, any]) => {
                  const avgRank = stats.avgRank.length > 0 
                    ? (stats.avgRank.reduce((a: number, b: number) => a + b, 0) / stats.avgRank.length).toFixed(1) 
                    : 'N/A';
                  const citationRate = ((stats.cited / stats.total) * 100).toFixed(0);
                  
                  return (
                    <div key={platform} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <Badge className={platformColors[platform] || "bg-slate-100 text-slate-800"}>
                          {platform}
                        </Badge>
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                          {stats.cited} / {stats.total} citations ({citationRate}%)
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Avg Rank: </span>
                          <span className="font-semibold">{avgRank}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-8 text-slate-500 dark:text-slate-400">
                No platform data yet. Check rankings to start tracking performance.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Rankings List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Recent Rankings
            </CardTitle>
            <CardDescription>
              Latest GEO ranking checks across all articles
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rankingsLoading || articlesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : rankings.length > 0 ? (
              <div className="space-y-4">
                {rankings.map((ranking: GeoRanking) => {
                  const article = articleMap.get(ranking.articleId);
                  return (
                    <div 
                      key={ranking.id} 
                      className="flex items-start justify-between p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      data-testid={`ranking-${ranking.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {ranking.isCited ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-slate-400" />
                          )}
                          <Badge className={platformColors[ranking.aiPlatform] || "bg-slate-100 text-slate-800"}>
                            {ranking.aiPlatform}
                          </Badge>
                          {ranking.rank && (
                            <Badge variant="outline">Rank #{ranking.rank}</Badge>
                          )}
                        </div>
                        <h3 className="font-medium mb-1">{article?.title || 'Unknown Article'}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                          Prompt: "{ranking.prompt}"
                        </p>
                        {ranking.citationContext && (
                          <p className="text-sm text-slate-500 dark:text-slate-500 italic">
                            {ranking.citationContext}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 dark:text-slate-600 mt-2">
                          Checked: {new Date(ranking.checkedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {article && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/articles/${article.slug}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Bot className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                <p className="text-slate-600 dark:text-slate-400 mb-2">No rankings yet</p>
                <p className="text-sm text-slate-500 dark:text-slate-500">
                  Rankings will appear here when you check your articles for AI platform citations
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
