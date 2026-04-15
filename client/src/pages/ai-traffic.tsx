import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Helmet } from "react-helmet";
import { Link } from "wouter";
import type { Brand, AiTrafficSession, AiSource } from "@shared/schema";
import {
  BarChart3,
  ArrowLeft,
  TrendingUp,
  Users,
  MousePointerClick,
  Target,
  Globe,
  Clock,
  ExternalLink,
  Activity,
  Zap,
  Loader2
} from "lucide-react";
import { SiOpenai, SiGoogle } from "react-icons/si";

export default function AiTraffic() {
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const { data: brandsData } = useQuery<{ data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsData?.data || [];

  const { data: trafficData, isLoading: trafficLoading } = useQuery<{ data: AiTrafficSession[] }>({
    queryKey: ["/api/ai-traffic", selectedBrandId, platformFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (platformFilter !== "all") params.set("aiPlatform", platformFilter);
      const url = `/api/ai-traffic/${selectedBrandId}${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch traffic data");
      return res.json();
    },
    enabled: !!selectedBrandId,
  });

  const { data: statsData } = useQuery<{ data: { totalSessions: number; totalPageViews: number; conversions: number; conversionRate: number; byPlatform: Record<string, { sessions: number; conversions: number }>; avgSessionDuration: number } }>({
    queryKey: ["/api/ai-traffic/stats", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const { data: sourcesData, isLoading: sourcesLoading } = useQuery<{ data: AiSource[] }>({
    queryKey: ["/api/ai-sources/top", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const sessions = trafficData?.data || [];
  const stats = statsData?.data;
  const topSources = sourcesData?.data || [];

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "chatgpt": return <SiOpenai className="w-4 h-4" />;
      case "gemini": return <SiGoogle className="w-4 h-4" />;
      case "perplexity": return <Zap className="w-4 h-4" />;
      case "claude": return <Activity className="w-4 h-4" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0s";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const platformColors: Record<string, string> = {
    chatgpt: "bg-green-500",
    perplexity: "bg-purple-500",
    claude: "bg-orange-500",
    gemini: "bg-blue-500",
    copilot: "bg-cyan-500",
  };

  return (
    <>
      <Helmet>
        <title>AI Traffic Analytics | GEO Platform</title>
        <meta name="description" content="Track referral traffic from AI platforms like ChatGPT, Perplexity, and Claude." />
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
                  <BarChart3 className="w-8 h-8 text-blue-600" />
                  AI Traffic Analytics
                </h1>
                <p className="text-muted-foreground mt-1">Track referral traffic from AI platforms</p>
              </div>
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger className="w-64" data-testid="select-brand">
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!selectedBrandId ? (
            <Card className="text-center py-12">
              <CardContent>
                <BarChart3 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Brand</h3>
                <p className="text-muted-foreground">Choose a brand to view AI traffic analytics</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-blue-100 text-sm">Total Sessions</p>
                        <p className="text-3xl font-bold" data-testid="stat-sessions">{stats?.totalSessions || 0}</p>
                      </div>
                      <Users className="w-8 h-8 text-blue-200" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-500 to-violet-500 text-white">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-purple-100 text-sm">Page Views</p>
                        <p className="text-3xl font-bold" data-testid="stat-pageviews">{stats?.totalPageViews || 0}</p>
                      </div>
                      <MousePointerClick className="w-8 h-8 text-purple-200" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-500 to-emerald-500 text-white">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-green-100 text-sm">Conversions</p>
                        <p className="text-3xl font-bold" data-testid="stat-conversions">{stats?.conversions || 0}</p>
                      </div>
                      <Target className="w-8 h-8 text-green-200" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-orange-500 to-amber-500 text-white">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-orange-100 text-sm">Conversion Rate</p>
                        <p className="text-3xl font-bold" data-testid="stat-rate">{((stats?.conversionRate || 0) * 100).toFixed(1)}%</p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-orange-200" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Traffic by Platform</CardTitle>
                    <CardDescription>Sessions and conversions from each AI platform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {stats?.byPlatform && Object.keys(stats.byPlatform).length > 0 ? (
                      <div className="space-y-4">
                        {Object.entries(stats.byPlatform).map(([platform, data]) => (
                          <div key={platform} className="space-y-2" data-testid={`platform-${platform}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {getPlatformIcon(platform)}
                                <span className="font-medium capitalize">{platform}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {data.sessions} sessions • {data.conversions} conversions
                              </div>
                            </div>
                            <Progress 
                              value={(data.sessions / (stats?.totalSessions || 1)) * 100} 
                              className={`h-2 ${platformColors[platform.toLowerCase()] || "bg-gray-500"}`}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No traffic data yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Citation Sources</CardTitle>
                    <CardDescription>Where AI platforms find your brand information</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {sourcesLoading ? (
                      <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                      </div>
                    ) : topSources.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Globe className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No sources discovered yet</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-3">
                          {topSources.map((source, idx) => (
                            <div key={source.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`source-${source.id}`}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                  {idx + 1}
                                </div>
                                <div>
                                  <p className="font-medium">{source.sourceName || source.sourceDomain}</p>
                                  <p className="text-sm text-muted-foreground">{source.sourceDomain}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{source.occurrenceCount}x</Badge>
                                <Badge className={platformColors[source.aiPlatform.toLowerCase()] || "bg-gray-500"}>
                                  {source.aiPlatform}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="mt-6">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Recent Traffic Sessions</CardTitle>
                      <CardDescription>Individual visits from AI platform referrals</CardDescription>
                    </div>
                    <Select value={platformFilter} onValueChange={setPlatformFilter}>
                      <SelectTrigger className="w-40" data-testid="select-platform-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Platforms</SelectItem>
                        <SelectItem value="chatgpt">ChatGPT</SelectItem>
                        <SelectItem value="perplexity">Perplexity</SelectItem>
                        <SelectItem value="claude">Claude</SelectItem>
                        <SelectItem value="gemini">Gemini</SelectItem>
                        <SelectItem value="copilot">Copilot</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {trafficLoading ? (
                    <div className="text-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="font-medium">No traffic sessions yet</p>
                      <p className="text-sm">Traffic will appear when visitors come from AI platforms</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {sessions.map(session => (
                          <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`session-${session.id}`}>
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-lg ${platformColors[session.aiPlatform.toLowerCase()] || "bg-gray-100"}`}>
                                {getPlatformIcon(session.aiPlatform)}
                              </div>
                              <div>
                                <p className="font-medium">{session.landingPage}</p>
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <MousePointerClick className="w-3 h-3" />
                                    {session.pageViews} pages
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(session.sessionDuration)}
                                  </span>
                                  {session.country && (
                                    <span className="flex items-center gap-1">
                                      <Globe className="w-3 h-3" />
                                      {session.country}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {session.converted === 1 && (
                                <Badge className="bg-green-500">
                                  <Target className="w-3 h-3 mr-1" />
                                  Converted
                                </Badge>
                              )}
                              {session.bounced === 1 && (
                                <Badge variant="outline" className="text-red-600">Bounced</Badge>
                              )}
                              <Badge variant="outline" className="capitalize">{session.aiPlatform}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
