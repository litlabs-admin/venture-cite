import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Helmet } from "react-helmet";
import { 
  TrendingUp, 
  TrendingDown,
  Eye, 
  PieChart, 
  MessageSquare, 
  Target,
  BarChart3,
  Calendar,
  Download,
  Share2,
  FileText,
  CheckCircle2,
  ArrowUpRight,
  Zap
} from "lucide-react";
import { SiOpenai, SiGoogle } from "react-icons/si";
import type { Brand } from "@shared/schema";

const AI_PLATFORMS = [
  { name: 'ChatGPT', icon: <SiOpenai className="h-4 w-4" />, color: 'bg-green-500' },
  { name: 'Claude', icon: <span className="text-xs font-bold">C</span>, color: 'bg-orange-500' },
  { name: 'Perplexity', icon: <span className="text-xs font-bold">P</span>, color: 'bg-blue-500' },
  { name: 'Gemini', icon: <SiGoogle className="h-4 w-4" />, color: 'bg-purple-500' },
  { name: 'Copilot', icon: <span className="text-xs font-bold">M</span>, color: 'bg-cyan-500' },
];

interface ReportMetrics {
  brandMentionFrequency: number;
  previousBMF: number;
  shareOfVoice: number;
  previousSOV: number;
  citationRate: number;
  previousCitationRate: number;
  promptCoverage: number;
  previousPromptCoverage: number;
  platformBreakdown: { platform: string; citations: number; mentions: number; trend: number }[];
  topPerformingContent: { title: string; citations: number; platform: string }[];
  recommendations: string[];
}

export default function ClientReports() {
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [reportPeriod, setReportPeriod] = useState<string>("30");

  const { data: brandsResponse, isLoading: brandsLoading } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsResponse?.data || [];

  const { data: metricsResponse, isLoading: metricsLoading } = useQuery<{ success: boolean; data: ReportMetrics }>({
    queryKey: ["/api/client-reports", selectedBrandId, { period: reportPeriod }],
    queryFn: async () => {
      const res = await fetch(`/api/client-reports/${selectedBrandId}?period=${reportPeriod}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
  });

  const metrics = metricsResponse?.data;

  const calcGrowth = (current: number, previous: number): string => {
    if (previous === 0) return "—"; // No historical data available
    const growth = ((current - previous) / previous) * 100;
    const prefix = growth >= 0 ? "+" : "";
    return `${prefix}${growth.toFixed(1)}%`;
  };

  const hasHistoricalData = metrics?.previousBMF !== 0 || metrics?.previousSOV !== 0;

  return (
    <div className="min-h-screen bg-slate-950">
      <Helmet>
        <title>Client Reports - VentureCite</title>
        <meta name="description" content="Client-facing GEO performance reports with key metrics and insights" />
      </Helmet>

      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2" data-testid="page-title">
              GEO Performance Report
            </h1>
            <p className="text-slate-400">
              AI visibility metrics and citation analytics
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="gap-2" data-testid="button-download-report">
              <Download className="h-4 w-4" />
              Export PDF
            </Button>
            <Button variant="outline" className="gap-2" data-testid="button-share-report">
              <Share2 className="h-4 w-4" />
              Share Report
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-400">Select Brand</CardTitle>
            </CardHeader>
            <CardContent>
              {brandsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : brands.length === 0 ? (
                <p className="text-slate-500">No brands found. Create a brand first.</p>
              ) : (
                <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                  <SelectTrigger className="bg-slate-800 border-slate-700" data-testid="select-brand">
                    <SelectValue placeholder="Select a brand..." />
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

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Report Period
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={reportPeriod} onValueChange={setReportPeriod}>
                <SelectTrigger className="bg-slate-800 border-slate-700" data-testid="select-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        {!selectedBrandId ? (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="py-16 text-center">
              <FileText className="h-16 w-16 mx-auto text-slate-600 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Select a Brand to Generate Report</h3>
              <p className="text-slate-400 max-w-md mx-auto">
                Choose a brand above to see AI visibility metrics, citation tracking, and performance insights.
              </p>
            </CardContent>
          </Card>
        ) : metricsLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="bg-slate-900 border-slate-800">
                  <CardContent className="pt-6">
                    <Skeleton className="h-8 w-8 rounded-lg mb-4" />
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : !metrics ? (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="py-16 text-center">
              <BarChart3 className="h-16 w-16 mx-auto text-slate-600 mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Data Available</h3>
              <p className="text-slate-400 max-w-md mx-auto">
                Start tracking your brand across AI platforms to generate reports.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-violet-900/50 to-violet-800/30 border-violet-700/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-2">
                    <div className="p-2 bg-violet-500/20 rounded-lg">
                      <MessageSquare className="h-5 w-5 text-violet-400" />
                    </div>
                    <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                      {calcGrowth(metrics.brandMentionFrequency, metrics.previousBMF)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-400 mb-1">Brand Mention Frequency</p>
                  <p className="text-3xl font-bold text-white" data-testid="metric-bmf">
                    {metrics.brandMentionFrequency}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">mentions across AI platforms</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 border-blue-700/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-2">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <PieChart className="h-5 w-5 text-blue-400" />
                    </div>
                    <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                      {calcGrowth(metrics.shareOfVoice, metrics.previousSOV)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-400 mb-1">Share of Voice</p>
                  <p className="text-3xl font-bold text-white" data-testid="metric-sov">
                    {metrics.shareOfVoice}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">vs competitors in your category</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-900/50 to-green-800/30 border-green-700/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-2">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <Zap className="h-5 w-5 text-green-400" />
                    </div>
                    <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                      {calcGrowth(metrics.citationRate, metrics.previousCitationRate)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-400 mb-1">Citation Rate</p>
                  <p className="text-3xl font-bold text-white" data-testid="metric-citation-rate">
                    {metrics.citationRate}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">of AI answers cite your URLs</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-900/50 to-orange-800/30 border-orange-700/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-2">
                    <div className="p-2 bg-orange-500/20 rounded-lg">
                      <Target className="h-5 w-5 text-orange-400" />
                    </div>
                    <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                      {calcGrowth(metrics.promptCoverage, metrics.previousPromptCoverage)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-400 mb-1">Prompt Coverage</p>
                  <p className="text-3xl font-bold text-white" data-testid="metric-prompt-coverage">
                    {metrics.promptCoverage}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">relevant queries where you appear</p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <BarChart3 className="h-5 w-5 text-violet-400" />
                  Performance by AI Platform
                </CardTitle>
                <CardDescription>Citations and mentions breakdown by platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {metrics.platformBreakdown.map((platform, i) => {
                    const platformInfo = AI_PLATFORMS.find(p => p.name === platform.platform);
                    const maxCitations = Math.max(...metrics.platformBreakdown.map(p => p.citations));
                    const percentage = (platform.citations / maxCitations) * 100;
                    
                    return (
                      <div key={platform.platform} className="p-4 bg-slate-800/50 rounded-lg" data-testid={`platform-row-${i}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 ${platformInfo?.color || 'bg-slate-600'} rounded-lg flex items-center justify-center text-white`}>
                              {platformInfo?.icon}
                            </div>
                            <span className="font-medium text-white">{platform.platform}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-lg font-bold text-white">{platform.citations}</p>
                              <p className="text-xs text-slate-500">citations</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-slate-300">{platform.mentions}</p>
                              <p className="text-xs text-slate-500">mentions</p>
                            </div>
                            <Badge className={platform.trend >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                              {platform.trend >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                              {platform.trend >= 0 ? '+' : ''}{platform.trend}%
                            </Badge>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <FileText className="h-5 w-5 text-blue-400" />
                    Top Performing Content
                  </CardTitle>
                  <CardDescription>Content pieces generating the most AI citations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {metrics.topPerformingContent.map((content, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg" data-testid={`content-row-${i}`}>
                        <div className="flex-1">
                          <p className="font-medium text-white text-sm">{content.title}</p>
                          <p className="text-xs text-slate-500">Top platform: {content.platform}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-violet-400">{content.citations}</p>
                          <p className="text-xs text-slate-500">citations</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                    Recommendations
                  </CardTitle>
                  <CardDescription>Actions to improve AI visibility</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {metrics.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg" data-testid={`recommendation-${i}`}>
                        <div className="p-1 bg-green-500/20 rounded">
                          <ArrowUpRight className="h-4 w-4 text-green-400" />
                        </div>
                        <p className="text-sm text-slate-300">{rec}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-gradient-to-r from-violet-900/30 to-indigo-900/30 border-violet-500/30">
              <CardContent className="py-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      Report Generated: {new Date().toLocaleDateString()}
                    </h3>
                    <p className="text-slate-400 text-sm">
                      Data reflects {reportPeriod}-day period. Next update in 24 hours.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button className="bg-violet-600 hover:bg-violet-700" data-testid="button-schedule-report">
                      Schedule Weekly Report
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
