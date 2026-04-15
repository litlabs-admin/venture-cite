import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { 
  Target, TrendingUp, AlertTriangle, CheckCircle, Shield, 
  BarChart3, PieChart, Zap, Brain, Eye, MessageSquare,
  Plus, RefreshCw, FileText, Award, AlertCircle, Users, History, Calendar,
  Bell, Mail, Trash2, Send
} from "lucide-react";
import type { Brand, Competitor, PromptPortfolio, CitationQuality, BrandHallucination, BrandFactSheet, MetricsHistory, AlertSettings, AlertHistory } from "@shared/schema";

export default function AIIntelligence() {
  const { toast } = useToast();
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("share-of-answer");

  const { data: brandsData } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsData?.data || [];
  const selectedBrand = brands.find(b => b.id === selectedBrandId);

  const { data: shareOfAnswerStats, isLoading: soaLoading } = useQuery<{ success: boolean; data: any }>({
    queryKey: [`/api/prompt-portfolio/stats/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: promptsData, isLoading: promptsLoading } = useQuery<{ success: boolean; data: PromptPortfolio[] }>({
    queryKey: [`/api/prompt-portfolio?brandId=${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: citationQualityStats } = useQuery<{ success: boolean; data: any }>({
    queryKey: [`/api/citation-quality/stats/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: citationsData } = useQuery<{ success: boolean; data: CitationQuality[] }>({
    queryKey: [`/api/citation-quality?brandId=${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: hallucinationStats } = useQuery<{ success: boolean; data: any }>({
    queryKey: [`/api/hallucinations/stats/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: hallucinationsData } = useQuery<{ success: boolean; data: BrandHallucination[] }>({
    queryKey: [`/api/hallucinations?brandId=${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: factsData } = useQuery<{ success: boolean; data: BrandFactSheet[] }>({
    queryKey: [`/api/brand-facts/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const [trendDays, setTrendDays] = useState(30);
  const { data: metricsHistoryData, isLoading: trendsLoading } = useQuery<{ success: boolean; data: MetricsHistory[] }>({
    queryKey: [`/api/metrics-history/${selectedBrandId}?days=${trendDays}`],
    enabled: !!selectedBrandId,
  });

  const metricsHistory = metricsHistoryData?.data || [];

  const { data: alertSettingsData, isLoading: alertsLoading } = useQuery<{ success: boolean; data: AlertSettings[] }>({
    queryKey: [`/api/alert-settings/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: alertHistoryData } = useQuery<{ success: boolean; data: AlertHistory[] }>({
    queryKey: [`/api/alert-history/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const alertSettings = alertSettingsData?.data || [];
  const alertHistoryList = alertHistoryData?.data || [];

  const { data: competitorsData, isLoading: competitorsLoading } = useQuery<{ success: boolean; data: Competitor[] }>({
    queryKey: ["/api/competitors"],
  });

  interface LeaderboardEntry {
    name: string;
    domain: string;
    isOwn: boolean;
    totalCitations: number;
    platformBreakdown: Record<string, number>;
  }

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{ success: boolean; data: LeaderboardEntry[] }>({
    queryKey: ["/api/competitors/leaderboard"],
  });

  const competitorsList = competitorsData?.data || [];
  const leaderboard = leaderboardData?.data || [];

  const [isCompetitorDialogOpen, setIsCompetitorDialogOpen] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState({ name: "", domain: "", industry: "", description: "" });

  const createCompetitorMutation = useMutation({
    mutationFn: async (data: typeof newCompetitor) => {
      return apiRequest("POST", "/api/competitors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/leaderboard"] });
      setIsCompetitorDialogOpen(false);
      setNewCompetitor({ name: "", domain: "", industry: "", description: "" });
      toast({ title: "Competitor Added", description: "You can now track and compare their AI citations." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add competitor", variant: "destructive" });
    },
  });

  const deleteCompetitorMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/competitors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/leaderboard"] });
      toast({ title: "Competitor Removed", description: "Competitor has been removed from tracking." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove competitor", variant: "destructive" });
    },
  });

  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({
    alertType: "hallucination_detected",
    threshold: 10,
    emailEnabled: false,
    emailAddress: "",
    slackEnabled: false,
    slackWebhookUrl: "",
  });

  const createAlertMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/alert-settings", {
        ...data,
        brandId: selectedBrandId,
        emailEnabled: data.emailEnabled ? 1 : 0,
        slackEnabled: data.slackEnabled ? 1 : 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alert-settings/${selectedBrandId}`] });
      setIsAlertDialogOpen(false);
      toast({ title: "Alert created", description: "You'll be notified when this event occurs" });
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/alert-settings/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alert-settings/${selectedBrandId}`] });
      toast({ title: "Alert deleted" });
    },
  });

  const testAlertMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/alerts/test/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alert-history/${selectedBrandId}`] });
      toast({ title: "Test alert sent", description: "Check your configured channels" });
    },
  });

  const alertTypes = [
    { value: "hallucination_detected", label: "Hallucination Detected", description: "When AI makes an inaccurate claim about your brand" },
    { value: "soa_drop", label: "Share-of-Answer Drop", description: "When your SOA drops by threshold %" },
    { value: "soa_increase", label: "Share-of-Answer Increase", description: "When your SOA increases by threshold %" },
    { value: "quality_drop", label: "Citation Quality Drop", description: "When citation quality drops below threshold" },
    { value: "competitor_surge", label: "Competitor Surge", description: "When a competitor gains significant visibility" },
  ];
  
  const recordMetricsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/metrics-history/record/${selectedBrandId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/metrics-history/${selectedBrandId}`] });
      toast({ title: "Metrics snapshot recorded", description: "Historical data has been captured" });
    },
    onError: () => {
      toast({ title: "Failed to record metrics", variant: "destructive" });
    }
  });

  const getTrendChartData = () => {
    const soaData = metricsHistory.filter(m => m.metricType === 'share_of_answer');
    const cqData = metricsHistory.filter(m => m.metricType === 'citation_quality');
    const halData = metricsHistory.filter(m => m.metricType === 'hallucinations');
    
    const allMetrics = [...soaData, ...cqData, ...halData];
    const dateSet = new Set(allMetrics.map(m => new Date(m.snapshotDate).toLocaleDateString()));
    const allDates = Array.from(dateSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    return allDates.map(date => {
      const soa = soaData.find(m => new Date(m.snapshotDate).toLocaleDateString() === date);
      const cq = cqData.find(m => new Date(m.snapshotDate).toLocaleDateString() === date);
      const hal = halData.find(m => new Date(m.snapshotDate).toLocaleDateString() === date);
      return {
        date,
        shareOfAnswer: soa ? parseFloat(soa.metricValue) : null,
        citationQuality: cq ? parseFloat(cq.metricValue) : null,
        hallucinations: hal ? parseFloat(hal.metricValue) : null,
      };
    });
  };

  const prompts = promptsData?.data || [];
  const citations = citationsData?.data || [];
  const hallucinations = hallucinationsData?.data || [];
  const facts = factsData?.data || [];
  const soaStats = shareOfAnswerStats?.data || { 
    totalPrompts: 0, 
    citedPrompts: 0, 
    shareOfAnswer: 0, 
    byCategory: {}, 
    byFunnel: {},
    byCompetitor: {},
    avgVolatility: 0,
    avgConsensus: 0,
    volatilityDistribution: { stable: 0, moderate: 0, volatile: 0 }
  };
  const cqStats = citationQualityStats?.data || { avgQualityScore: 0, primaryCitations: 0, secondaryCitations: 0, bySourceType: {} };
  const halStats = hallucinationStats?.data || { total: 0, resolved: 0, bySeverity: {}, byType: {} };

  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState({
    prompt: "",
    category: "informational",
    funnelStage: "tofu",
    aiPlatform: "chatgpt",
    isBrandCited: 0,
    shareOfAnswer: 0,
    competitorSet: "",
    answerVolatility: 25,
    consensusScore: 75,
  });

  const createPromptMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        brandId: selectedBrandId,
        competitorSet: data.competitorSet ? data.competitorSet.split(",").map((c: string) => c.trim()).filter((c: string) => c) : [],
        isBrandCited: data.isBrandCited ? 1 : 0,
      };
      console.log("Sending prompt payload:", payload);
      return apiRequest("POST", "/api/prompt-portfolio", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-portfolio"] });
      queryClient.invalidateQueries({ queryKey: [`/api/prompt-portfolio/stats/${selectedBrandId}`] });
      setIsPromptDialogOpen(false);
      setNewPrompt({
        prompt: "",
        category: "informational",
        funnelStage: "tofu",
        aiPlatform: "chatgpt",
        isBrandCited: 0,
        shareOfAnswer: 0,
        competitorSet: "",
        answerVolatility: 25,
        consensusScore: 75,
      });
      toast({ title: "Prompt added successfully" });
    },
    onError: (error: any) => {
      console.error("Prompt creation error:", error);
      toast({ title: "Failed to create prompt", description: error.message || "Unknown error", variant: "destructive" });
    },
  });

  const resolveHallucinationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/hallucinations/${id}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hallucinations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/hallucinations/stats/${selectedBrandId}`] });
      toast({ title: "Hallucination marked as resolved" });
    },
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-500 text-white";
      case "high": return "bg-orange-500 text-white";
      case "medium": return "bg-yellow-500 text-white";
      case "low": return "bg-blue-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    if (score >= 40) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="page-title">
              <Brain className="w-8 h-8 text-primary" />
              AI Intelligence
            </h1>
            <p className="text-muted-foreground mt-1">
              Advanced analytics for Share-of-Answer, Citation Quality, and Hallucination Detection
            </p>
          </div>
        </div>

        <div className="mb-6">
          <Label htmlFor="brand-select">Select Brand</Label>
          <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
            <SelectTrigger className="w-[300px] mt-1" data-testid="select-brand">
              <SelectValue placeholder="Choose a brand to analyze" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedBrandId ? (
          <Card className="p-12 text-center">
            <Brain className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Select a Brand to Get Started</h2>
            <p className="text-muted-foreground">
              Choose a brand above to view AI intelligence metrics and insights
            </p>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6 mb-6">
              <TabsTrigger value="share-of-answer" data-testid="tab-share-of-answer">
                <Target className="w-4 h-4 mr-2" />
                Share-of-Answer
              </TabsTrigger>
              <TabsTrigger value="competitors" data-testid="tab-competitors">
                <Users className="w-4 h-4 mr-2" />
                Competitors
              </TabsTrigger>
              <TabsTrigger value="citation-quality" data-testid="tab-citation-quality">
                <Award className="w-4 h-4 mr-2" />
                Citation Quality
              </TabsTrigger>
              <TabsTrigger value="hallucinations" data-testid="tab-hallucinations">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Hallucinations
              </TabsTrigger>
              <TabsTrigger value="trends" data-testid="tab-trends">
                <History className="w-4 h-4 mr-2" />
                Trends
              </TabsTrigger>
              <TabsTrigger value="alerts" data-testid="tab-alerts">
                <MessageSquare className="w-4 h-4 mr-2" />
                Alerts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="share-of-answer">
              <div className="grid gap-6 md:grid-cols-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Share of Answer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary" data-testid="stat-share-of-answer">
                      {soaStats.shareOfAnswer.toFixed(1)}%
                    </div>
                    <Progress value={soaStats.shareOfAnswer} className="mt-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Prompts Tracked
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold" data-testid="stat-total-prompts">
                      {soaStats.totalPrompts}
                    </div>
                    <p className="text-sm text-muted-foreground">across all categories</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Cited Prompts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600" data-testid="stat-cited-prompts">
                      {soaStats.citedPrompts}
                    </div>
                    <p className="text-sm text-muted-foreground">brand mentioned in answer</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Categories Tracked
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {Object.keys(soaStats.byCategory).length}
                    </div>
                    <p className="text-sm text-muted-foreground">prompt categories</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChart className="w-5 h-5" />
                      By Prompt Category
                    </CardTitle>
                    <CardDescription>
                      Share-of-answer breakdown by intent type
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(soaStats.byCategory).length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        No prompts tracked yet. Add prompts to see category breakdown.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(soaStats.byCategory).map(([category, data]: [string, any]) => (
                          <div key={category} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium capitalize">{category}</span>
                              <span className="text-muted-foreground">
                                {data.cited}/{data.total} ({((data.cited / data.total) * 100).toFixed(0)}%)
                              </span>
                            </div>
                            <Progress value={(data.cited / data.total) * 100} />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      By Funnel Stage
                    </CardTitle>
                    <CardDescription>
                      Performance across the buyer's journey
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(soaStats.byFunnel).length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        No prompts tracked yet. Add prompts to see funnel breakdown.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(soaStats.byFunnel).map(([stage, data]: [string, any]) => (
                          <div key={stage} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium capitalize">{stage}</span>
                              <span className="text-muted-foreground">
                                {data.cited}/{data.total} ({((data.cited / data.total) * 100).toFixed(0)}%)
                              </span>
                            </div>
                            <Progress value={(data.cited / data.total) * 100} />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Competitor Comparison
                    </CardTitle>
                    <CardDescription>
                      Your share-of-answer vs competitors in shared prompts
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Object.keys(soaStats.byCompetitor).length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        No competitor data yet. Add prompts with competitor sets to see comparison.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(soaStats.byCompetitor).map(([competitor, data]: [string, any]) => (
                          <div key={competitor} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{competitor}</span>
                              <span className={data.shareAgainst >= 50 ? "text-green-600" : "text-orange-600"}>
                                {data.shareAgainst.toFixed(0)}% win rate ({data.cited}/{data.total})
                              </span>
                            </div>
                            <Progress 
                              value={data.shareAgainst} 
                              className={data.shareAgainst >= 50 ? "bg-green-100" : "bg-orange-100"} 
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5" />
                      Answer Stability
                    </CardTitle>
                    <CardDescription>
                      How often AI answers change and cross-platform consistency
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-2xl font-bold" data-testid="stat-volatility">
                          {soaStats.avgVolatility.toFixed(0)}
                        </div>
                        <p className="text-xs text-muted-foreground">Avg Volatility</p>
                        <p className="text-xs mt-1">
                          {soaStats.avgVolatility <= 30 ? "🟢 Stable" : soaStats.avgVolatility <= 60 ? "🟡 Moderate" : "🔴 Volatile"}
                        </p>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-2xl font-bold" data-testid="stat-consensus">
                          {soaStats.avgConsensus.toFixed(0)}%
                        </div>
                        <p className="text-xs text-muted-foreground">Avg Consensus</p>
                        <p className="text-xs mt-1">
                          {soaStats.avgConsensus >= 70 ? "🟢 High" : soaStats.avgConsensus >= 40 ? "🟡 Medium" : "🔴 Low"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Stable (≤30)</span>
                        <span>{soaStats.volatilityDistribution.stable} prompts</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Moderate (31-60)</span>
                        <span>{soaStats.volatilityDistribution.moderate} prompts</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Volatile (61+)</span>
                        <span>{soaStats.volatilityDistribution.volatile} prompts</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="mt-6">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      Tracked Prompts
                    </CardTitle>
                    <CardDescription>
                      All prompts being monitored for your brand
                    </CardDescription>
                  </div>
                  {prompts.length > 0 && (
                    <Dialog open={isPromptDialogOpen} onOpenChange={setIsPromptDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" data-testid="button-add-more-prompts">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Prompt
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Track New Prompt</DialogTitle>
                          <DialogDescription>
                            Add a prompt to monitor across AI platforms
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="prompt-text-2">Prompt Text</Label>
                            <Textarea
                              id="prompt-text-2"
                              placeholder="e.g., What is the best CRM software for small businesses?"
                              value={newPrompt.prompt}
                              onChange={(e) => setNewPrompt({ ...newPrompt, prompt: e.target.value })}
                              data-testid="input-prompt-text-2"
                            />
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Category</Label>
                              <Select value={newPrompt.category} onValueChange={(v) => setNewPrompt({ ...newPrompt, category: v })}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="informational">Informational</SelectItem>
                                  <SelectItem value="comparison">Comparison</SelectItem>
                                  <SelectItem value="transactional">Transactional</SelectItem>
                                  <SelectItem value="navigational">Navigational</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Funnel Stage</Label>
                              <Select value={newPrompt.funnelStage} onValueChange={(v) => setNewPrompt({ ...newPrompt, funnelStage: v })}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="tofu">TOFU (Awareness)</SelectItem>
                                  <SelectItem value="mofu">MOFU (Consideration)</SelectItem>
                                  <SelectItem value="bofu">BOFU (Decision)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>AI Platform</Label>
                              <Select value={newPrompt.aiPlatform} onValueChange={(v) => setNewPrompt({ ...newPrompt, aiPlatform: v })}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="chatgpt">ChatGPT</SelectItem>
                                  <SelectItem value="claude">Claude</SelectItem>
                                  <SelectItem value="perplexity">Perplexity</SelectItem>
                                  <SelectItem value="gemini">Gemini</SelectItem>
                                  <SelectItem value="google-ai">Google AI</SelectItem>
                                  <SelectItem value="copilot">Microsoft Copilot</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <Label>Brand Cited in Answer</Label>
                              <p className="text-sm text-muted-foreground">Was your brand mentioned in the AI response?</p>
                            </div>
                            <Switch
                              checked={newPrompt.isBrandCited === 1}
                              onCheckedChange={(checked) => setNewPrompt({ ...newPrompt, isBrandCited: checked ? 1 : 0 })}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Share of Answer (%)</Label>
                            <div className="flex items-center gap-4">
                              <Slider
                                value={[newPrompt.shareOfAnswer]}
                                onValueChange={([v]) => setNewPrompt({ ...newPrompt, shareOfAnswer: v })}
                                max={100}
                                step={5}
                                className="flex-1"
                              />
                              <span className="w-12 text-right font-medium">{newPrompt.shareOfAnswer}%</span>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Competitor Set
                            </Label>
                            <Input
                              placeholder="e.g., Salesforce, HubSpot, Zoho (comma-separated)"
                              value={newPrompt.competitorSet}
                              onChange={(e) => setNewPrompt({ ...newPrompt, competitorSet: e.target.value })}
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Answer Volatility (0-100)</Label>
                              <div className="flex items-center gap-4">
                                <Slider
                                  value={[newPrompt.answerVolatility]}
                                  onValueChange={([v]) => setNewPrompt({ ...newPrompt, answerVolatility: v })}
                                  max={100}
                                  step={5}
                                  className="flex-1"
                                />
                                <span className="w-12 text-right font-medium">{newPrompt.answerVolatility}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {newPrompt.answerVolatility <= 30 ? "🟢 Stable" : newPrompt.answerVolatility <= 60 ? "🟡 Moderate" : "🔴 Volatile"}
                              </p>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Consensus Score (0-100%)</Label>
                              <div className="flex items-center gap-4">
                                <Slider
                                  value={[newPrompt.consensusScore]}
                                  onValueChange={([v]) => setNewPrompt({ ...newPrompt, consensusScore: v })}
                                  max={100}
                                  step={5}
                                  className="flex-1"
                                />
                                <span className="w-12 text-right font-medium">{newPrompt.consensusScore}%</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {newPrompt.consensusScore >= 70 ? "🟢 High agreement" : newPrompt.consensusScore >= 40 ? "🟡 Mixed" : "🔴 Low agreement"}
                              </p>
                            </div>
                          </div>
                          
                          <Button 
                            onClick={() => {
                              if (!selectedBrandId) {
                                toast({ title: "Please select a brand first", variant: "destructive" });
                                return;
                              }
                              createPromptMutation.mutate(newPrompt);
                            }}
                            disabled={!newPrompt.prompt || !selectedBrandId || createPromptMutation.isPending}
                            className="w-full"
                          >
                            {createPromptMutation.isPending ? "Saving..." : "Save Prompt"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  {prompts.length === 0 ? (
                    <div className="text-center py-8">
                      <Eye className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground mb-4">No prompts tracked yet</p>
                      <Dialog open={isPromptDialogOpen} onOpenChange={setIsPromptDialogOpen}>
                        <DialogTrigger asChild>
                          <Button data-testid="button-add-prompt">
                            <Plus className="w-4 h-4 mr-2" />
                            Add First Prompt
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Track New Prompt</DialogTitle>
                            <DialogDescription>
                              Add a prompt to monitor across AI platforms
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="prompt-text">Prompt Text</Label>
                              <Textarea
                                id="prompt-text"
                                placeholder="e.g., What is the best CRM software for small businesses?"
                                value={newPrompt.prompt}
                                onChange={(e) => setNewPrompt({ ...newPrompt, prompt: e.target.value })}
                                data-testid="input-prompt-text"
                              />
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label>Category</Label>
                                <Select value={newPrompt.category} onValueChange={(v) => setNewPrompt({ ...newPrompt, category: v })}>
                                  <SelectTrigger data-testid="select-category">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="informational">Informational</SelectItem>
                                    <SelectItem value="comparison">Comparison</SelectItem>
                                    <SelectItem value="transactional">Transactional</SelectItem>
                                    <SelectItem value="navigational">Navigational</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Funnel Stage</Label>
                                <Select value={newPrompt.funnelStage} onValueChange={(v) => setNewPrompt({ ...newPrompt, funnelStage: v })}>
                                  <SelectTrigger data-testid="select-funnel">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="tofu">TOFU (Awareness)</SelectItem>
                                    <SelectItem value="mofu">MOFU (Consideration)</SelectItem>
                                    <SelectItem value="bofu">BOFU (Decision)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              <div className="space-y-2">
                                <Label>AI Platform</Label>
                                <Select value={newPrompt.aiPlatform} onValueChange={(v) => setNewPrompt({ ...newPrompt, aiPlatform: v })}>
                                  <SelectTrigger data-testid="select-platform">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="chatgpt">ChatGPT</SelectItem>
                                    <SelectItem value="claude">Claude</SelectItem>
                                    <SelectItem value="perplexity">Perplexity</SelectItem>
                                    <SelectItem value="gemini">Gemini</SelectItem>
                                    <SelectItem value="google-ai">Google AI</SelectItem>
                                    <SelectItem value="copilot">Microsoft Copilot</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <Label>Brand Cited in Answer</Label>
                                <p className="text-sm text-muted-foreground">Was your brand mentioned in the AI response?</p>
                              </div>
                              <Switch
                                checked={newPrompt.isBrandCited === 1}
                                onCheckedChange={(checked) => setNewPrompt({ ...newPrompt, isBrandCited: checked ? 1 : 0 })}
                                data-testid="switch-cited"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor="share-of-answer">Share of Answer (%)</Label>
                              <div className="flex items-center gap-4">
                                <Slider
                                  value={[newPrompt.shareOfAnswer]}
                                  onValueChange={([v]) => setNewPrompt({ ...newPrompt, shareOfAnswer: v })}
                                  max={100}
                                  step={5}
                                  className="flex-1"
                                  data-testid="slider-share"
                                />
                                <span className="w-12 text-right font-medium">{newPrompt.shareOfAnswer}%</span>
                              </div>
                              <p className="text-xs text-muted-foreground">How much of the answer featured your brand</p>
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor="competitors" className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Competitor Set
                              </Label>
                              <Input
                                id="competitors"
                                placeholder="e.g., Salesforce, HubSpot, Zoho (comma-separated)"
                                value={newPrompt.competitorSet}
                                onChange={(e) => setNewPrompt({ ...newPrompt, competitorSet: e.target.value })}
                                data-testid="input-competitors"
                              />
                              <p className="text-xs text-muted-foreground">Other brands mentioned in the same answer (for win rate tracking)</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Answer Volatility (0-100)</Label>
                                <div className="flex items-center gap-4">
                                  <Slider
                                    value={[newPrompt.answerVolatility]}
                                    onValueChange={([v]) => setNewPrompt({ ...newPrompt, answerVolatility: v })}
                                    max={100}
                                    step={5}
                                    className="flex-1"
                                    data-testid="slider-volatility"
                                  />
                                  <span className="w-12 text-right font-medium">{newPrompt.answerVolatility}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {newPrompt.answerVolatility <= 30 ? "🟢 Stable" : newPrompt.answerVolatility <= 60 ? "🟡 Moderate" : "🔴 Volatile"}
                                </p>
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Consensus Score (0-100%)</Label>
                                <div className="flex items-center gap-4">
                                  <Slider
                                    value={[newPrompt.consensusScore]}
                                    onValueChange={([v]) => setNewPrompt({ ...newPrompt, consensusScore: v })}
                                    max={100}
                                    step={5}
                                    className="flex-1"
                                    data-testid="slider-consensus"
                                  />
                                  <span className="w-12 text-right font-medium">{newPrompt.consensusScore}%</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {newPrompt.consensusScore >= 70 ? "🟢 High agreement" : newPrompt.consensusScore >= 40 ? "🟡 Mixed" : "🔴 Low agreement"}
                                </p>
                              </div>
                            </div>
                            
                            <Button 
                              onClick={() => {
                                if (!selectedBrandId) {
                                  toast({ title: "Please select a brand first", variant: "destructive" });
                                  return;
                                }
                                createPromptMutation.mutate(newPrompt);
                              }}
                              disabled={!newPrompt.prompt || !selectedBrandId || createPromptMutation.isPending}
                              className="w-full"
                              data-testid="button-save-prompt"
                            >
                              {createPromptMutation.isPending ? "Saving..." : "Save Prompt"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {prompts.slice(0, 10).map((prompt) => (
                        <div key={prompt.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium">{prompt.prompt}</p>
                            <div className="flex gap-2 mt-1">
                              <Badge variant="outline">{prompt.category}</Badge>
                              <Badge variant="outline">{prompt.funnelStage}</Badge>
                              <Badge variant="outline">{prompt.aiPlatform}</Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            {prompt.isBrandCited === 1 ? (
                              <Badge className="bg-green-100 text-green-800">Cited</Badge>
                            ) : (
                              <Badge variant="secondary">Not Cited</Badge>
                            )}
                            <p className="text-sm text-muted-foreground mt-1">
                              {prompt.shareOfAnswer}% share
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="competitors">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Competitor Tracking</h3>
                    <p className="text-sm text-muted-foreground">Add competitors by name and domain to compare AI citation performance</p>
                  </div>
                  <Dialog open={isCompetitorDialogOpen} onOpenChange={setIsCompetitorDialogOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-add-competitor">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Competitor
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Competitor</DialogTitle>
                        <DialogDescription>
                          Track a competitor's AI citations to benchmark your GEO performance against them.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="comp-name">Company Name</Label>
                          <Input
                            id="comp-name"
                            placeholder="e.g., Acme Corp"
                            value={newCompetitor.name}
                            onChange={(e) => setNewCompetitor({ ...newCompetitor, name: e.target.value })}
                            data-testid="input-competitor-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="comp-domain">Website Domain</Label>
                          <Input
                            id="comp-domain"
                            placeholder="e.g., acmecorp.com"
                            value={newCompetitor.domain}
                            onChange={(e) => setNewCompetitor({ ...newCompetitor, domain: e.target.value })}
                            data-testid="input-competitor-domain"
                          />
                          <p className="text-xs text-muted-foreground">Used to identify citations across AI platforms</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="comp-industry">Industry</Label>
                          <Input
                            id="comp-industry"
                            placeholder="e.g., SaaS, E-commerce, Healthcare"
                            value={newCompetitor.industry}
                            onChange={(e) => setNewCompetitor({ ...newCompetitor, industry: e.target.value })}
                            data-testid="input-competitor-industry"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="comp-notes">Notes (optional)</Label>
                          <Input
                            id="comp-notes"
                            placeholder="Key differentiators, strengths, etc."
                            value={newCompetitor.description}
                            onChange={(e) => setNewCompetitor({ ...newCompetitor, description: e.target.value })}
                            data-testid="input-competitor-notes"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsCompetitorDialogOpen(false)}>Cancel</Button>
                        <Button
                          onClick={() => createCompetitorMutation.mutate(newCompetitor)}
                          disabled={!newCompetitor.name || !newCompetitor.domain || createCompetitorMutation.isPending}
                          data-testid="button-submit-competitor"
                        >
                          {createCompetitorMutation.isPending ? "Adding..." : "Add Competitor"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid gap-6 md:grid-cols-3 mb-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Competitors Tracked</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold" data-testid="stat-competitor-count">{competitorsList.length}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Leaderboard Entries</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold" data-testid="stat-leaderboard-count">{leaderboard.length}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Your Ranking</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-primary" data-testid="stat-your-rank">
                        {leaderboard.findIndex(e => e.isOwn) >= 0 ? `#${leaderboard.findIndex(e => e.isOwn) + 1}` : "—"}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Your Competitors
                      </CardTitle>
                      <CardDescription>Companies you're tracking for AI citation comparison</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {competitorsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                      ) : competitorsList.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p className="font-medium mb-1">No competitors added yet</p>
                          <p className="text-sm">Add competitors to start comparing your AI visibility against theirs</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {competitorsList.map((comp) => (
                            <div key={comp.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30" data-testid={`competitor-item-${comp.id}`}>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate" data-testid={`text-comp-name-${comp.id}`}>{comp.name}</div>
                                <div className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  <span className="truncate">{comp.domain}</span>
                                </div>
                                {comp.industry && (
                                  <Badge variant="outline" className="text-xs mt-1">{comp.industry}</Badge>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteCompetitorMutation.mutate(comp.id)}
                                className="text-muted-foreground hover:text-destructive flex-shrink-0"
                                data-testid={`button-delete-comp-${comp.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-yellow-500" />
                        Citation Leaderboard
                      </CardTitle>
                      <CardDescription>How you rank vs competitors across AI platforms</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {leaderboardLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                      ) : leaderboard.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p className="font-medium mb-1">No leaderboard data</p>
                          <p className="text-sm">Add competitors and record citations to see rankings</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {leaderboard.map((entry, index) => (
                            <div
                              key={`${entry.domain}-${index}`}
                              className={`flex items-center gap-3 p-3 rounded-lg border ${
                                entry.isOwn ? "bg-primary/5 border-primary/30" : "bg-muted/30"
                              }`}
                              data-testid={`leaderboard-entry-${index}`}
                            >
                              <span className="text-lg font-bold w-8 text-center text-muted-foreground">
                                {index + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate">{entry.name}</span>
                                  {entry.isOwn && <Badge className="text-xs">You</Badge>}
                                </div>
                                <span className="text-xs text-muted-foreground">{entry.domain}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-bold">{entry.totalCitations}</div>
                                <div className="text-xs text-muted-foreground">citations</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="citation-quality">
              <div className="grid gap-6 md:grid-cols-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Avg Quality Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${getQualityColor(cqStats.avgQualityScore)}`} data-testid="stat-avg-quality">
                      {cqStats.avgQualityScore.toFixed(0)}
                    </div>
                    <Progress value={cqStats.avgQualityScore} className="mt-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Primary Citations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600" data-testid="stat-primary-citations">
                      {cqStats.primaryCitations}
                    </div>
                    <p className="text-sm text-muted-foreground">first-position mentions</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Secondary Citations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-yellow-600" data-testid="stat-secondary-citations">
                      {cqStats.secondaryCitations}
                    </div>
                    <p className="text-sm text-muted-foreground">also-ran mentions</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Source Types
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {Object.keys(cqStats.bySourceType).length}
                    </div>
                    <p className="text-sm text-muted-foreground">citation sources</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    Citation Quality Breakdown
                  </CardTitle>
                  <CardDescription>
                    Individual citation scores with authority, relevance, and position metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {citations.length === 0 ? (
                    <div className="text-center py-8">
                      <Award className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground mb-4">No citation quality data yet</p>
                      <p className="text-sm text-muted-foreground">
                        Citation quality scores are calculated when you check rankings
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {citations.map((citation) => (
                        <div key={citation.id} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{citation.aiPlatform}</Badge>
                              {citation.isPrimaryCitation === 1 && (
                                <Badge className="bg-green-100 text-green-800">Primary</Badge>
                              )}
                              <Badge variant="secondary">{citation.sourceType}</Badge>
                            </div>
                            <div className={`text-2xl font-bold ${getQualityColor(citation.totalQualityScore)}`}>
                              {citation.totalQualityScore}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Authority</p>
                              <Progress value={citation.authorityScore} className="h-2" />
                              <p className="text-xs mt-1">{citation.authorityScore}/100</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Relevance</p>
                              <Progress value={citation.relevanceScore} className="h-2" />
                              <p className="text-xs mt-1">{citation.relevanceScore}/100</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Recency</p>
                              <Progress value={citation.recencyScore} className="h-2" />
                              <p className="text-xs mt-1">{citation.recencyScore}/100</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Position</p>
                              <Progress value={citation.positionScore} className="h-2" />
                              <p className="text-xs mt-1">{citation.positionScore}/100</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hallucinations">
              <div className="grid gap-6 md:grid-cols-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Detected
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold" data-testid="stat-total-hallucinations">
                      {halStats.total}
                    </div>
                    <p className="text-sm text-muted-foreground">inaccuracies found</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Resolved
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600" data-testid="stat-resolved">
                      {halStats.resolved}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {halStats.total > 0 ? `${((halStats.resolved / halStats.total) * 100).toFixed(0)}% resolution rate` : 'no issues yet'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Critical Issues
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-red-600" data-testid="stat-critical">
                      {halStats.bySeverity?.critical || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">need immediate attention</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Brand Facts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold" data-testid="stat-facts">
                      {facts.length}
                    </div>
                    <p className="text-sm text-muted-foreground">verified facts stored</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Detected Hallucinations
                    </CardTitle>
                    <CardDescription>
                      AI claims that don't match your brand facts
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {hallucinations.length === 0 ? (
                      <div className="text-center py-8">
                        <Shield className="w-12 h-12 mx-auto mb-4 text-green-500" />
                        <p className="text-muted-foreground">No hallucinations detected</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Your brand information appears accurate across AI platforms
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {hallucinations.map((hal) => (
                          <div key={hal.id} className="p-4 border rounded-lg">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex gap-2">
                                <Badge className={getSeverityColor(hal.severity)}>
                                  {hal.severity}
                                </Badge>
                                <Badge variant="outline">{hal.hallucinationType}</Badge>
                                <Badge variant="outline">{hal.aiPlatform}</Badge>
                              </div>
                              {hal.isResolved === 1 ? (
                                <Badge className="bg-green-100 text-green-800">Resolved</Badge>
                              ) : (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => resolveHallucinationMutation.mutate(hal.id)}
                                  data-testid={`button-resolve-${hal.id}`}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Mark Resolved
                                </Button>
                              )}
                            </div>
                            
                            <div className="mt-3 space-y-2">
                              <div>
                                <p className="text-xs text-muted-foreground">AI Claimed:</p>
                                <p className="text-sm bg-red-50 p-2 rounded text-red-800">
                                  "{hal.claimedStatement}"
                                </p>
                              </div>
                              {hal.actualFact && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Actual Fact:</p>
                                  <p className="text-sm bg-green-50 p-2 rounded text-green-800">
                                    "{hal.actualFact}"
                                  </p>
                                </div>
                              )}
                              {hal.remediationSteps && hal.remediationSteps.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Remediation Steps:</p>
                                  <ul className="text-sm list-disc list-inside text-muted-foreground">
                                    {hal.remediationSteps.map((step, i) => (
                                      <li key={i}>{step}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Brand Fact Sheet
                    </CardTitle>
                    <CardDescription>
                      Your source of truth for AI verification
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {facts.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground mb-4">No facts added yet</p>
                        <p className="text-sm text-muted-foreground">
                          Add verified facts about your brand to enable hallucination detection
                        </p>
                        <Button className="mt-4" data-testid="button-add-fact">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Brand Fact
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {facts.map((fact) => (
                          <div key={fact.id} className="p-3 border rounded-lg">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline">{fact.factCategory}</Badge>
                              <span className="text-xs text-muted-foreground">
                                Verified
                              </span>
                            </div>
                            <p className="font-medium mt-2">{fact.factKey}</p>
                            <p className="text-sm text-muted-foreground">{fact.factValue}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="trends">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Historical Performance Trends</h3>
                    <p className="text-sm text-muted-foreground">
                      Track your AI intelligence metrics over time
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Select value={trendDays.toString()} onValueChange={(v) => setTrendDays(parseInt(v))}>
                      <SelectTrigger className="w-[150px]" data-testid="select-trend-days">
                        <Calendar className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Time range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="14">Last 14 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={() => recordMetricsMutation.mutate()}
                      disabled={recordMetricsMutation.isPending}
                      data-testid="button-record-snapshot"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${recordMetricsMutation.isPending ? 'animate-spin' : ''}`} />
                      Record Snapshot
                    </Button>
                  </div>
                </div>

                {trendsLoading ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                      <p className="text-muted-foreground">Loading trends data...</p>
                    </CardContent>
                  </Card>
                ) : getTrendChartData().length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium mb-2">No Historical Data Yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Start recording snapshots to track your metrics over time
                      </p>
                      <Button 
                        onClick={() => recordMetricsMutation.mutate()}
                        disabled={recordMetricsMutation.isPending}
                        data-testid="button-first-snapshot"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Record First Snapshot
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5" />
                          Share-of-Answer Trend
                        </CardTitle>
                        <CardDescription>
                          Percentage of AI responses that cite your brand
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={getTrendChartData()}>
                              <defs>
                                <linearGradient id="soaGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="date" className="text-xs" />
                              <YAxis domain={[0, 100]} className="text-xs" />
                              <Tooltip 
                                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                labelStyle={{ color: 'hsl(var(--foreground))' }}
                              />
                              <Area 
                                type="monotone" 
                                dataKey="shareOfAnswer" 
                                stroke="#3b82f6" 
                                fill="url(#soaGradient)"
                                name="Share of Answer (%)"
                                connectNulls
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid md:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Award className="w-5 h-5" />
                            Citation Quality Trend
                          </CardTitle>
                          <CardDescription>
                            Average quality score of citations over time
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={getTrendChartData()}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="date" className="text-xs" />
                                <YAxis domain={[0, 100]} className="text-xs" />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="citationQuality" 
                                  stroke="#10b981" 
                                  strokeWidth={2}
                                  dot={{ fill: '#10b981' }}
                                  name="Quality Score"
                                  connectNulls
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Unresolved Hallucinations
                          </CardTitle>
                          <CardDescription>
                            Count of unresolved AI inaccuracies
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={getTrendChartData()}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="date" className="text-xs" />
                                <YAxis className="text-xs" />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="hallucinations" 
                                  stroke="#ef4444" 
                                  strokeWidth={2}
                                  dot={{ fill: '#ef4444' }}
                                  name="Unresolved Issues"
                                  connectNulls
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <BarChart3 className="w-5 h-5" />
                          All Metrics Combined
                        </CardTitle>
                        <CardDescription>
                          Compare all key metrics on a single chart
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[350px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={getTrendChartData()}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="date" className="text-xs" />
                              <YAxis className="text-xs" />
                              <Tooltip 
                                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              />
                              <Legend />
                              <Line 
                                type="monotone" 
                                dataKey="shareOfAnswer" 
                                stroke="#3b82f6" 
                                strokeWidth={2}
                                name="Share of Answer (%)"
                                connectNulls
                              />
                              <Line 
                                type="monotone" 
                                dataKey="citationQuality" 
                                stroke="#10b981" 
                                strokeWidth={2}
                                name="Citation Quality"
                                connectNulls
                              />
                              <Line 
                                type="monotone" 
                                dataKey="hallucinations" 
                                stroke="#ef4444" 
                                strokeWidth={2}
                                name="Hallucinations"
                                connectNulls
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="alerts">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Alert Notifications</h3>
                    <p className="text-sm text-muted-foreground">
                      Get notified about important AI intelligence events via Email or Slack
                    </p>
                  </div>
                  <Dialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-add-alert">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Alert
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Create New Alert</DialogTitle>
                        <DialogDescription>
                          Configure when and how you want to be notified
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Alert Type</Label>
                          <Select value={newAlert.alertType} onValueChange={(v) => setNewAlert({...newAlert, alertType: v})}>
                            <SelectTrigger data-testid="select-alert-type">
                              <SelectValue placeholder="Select alert type" />
                            </SelectTrigger>
                            <SelectContent>
                              {alertTypes.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {alertTypes.find(t => t.value === newAlert.alertType)?.description}
                          </p>
                        </div>

                        {newAlert.alertType !== 'hallucination_detected' && (
                          <div className="space-y-2">
                            <Label>Threshold (%)</Label>
                            <div className="flex items-center gap-4">
                              <Slider
                                value={[newAlert.threshold]}
                                onValueChange={([v]) => setNewAlert({...newAlert, threshold: v})}
                                min={1}
                                max={50}
                                step={1}
                                className="flex-1"
                              />
                              <span className="w-12 text-right font-medium">{newAlert.threshold}%</span>
                            </div>
                          </div>
                        )}

                        <div className="space-y-3 pt-2 border-t">
                          <Label>Notification Channels</Label>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm">Email</span>
                              </div>
                              <Switch
                                checked={newAlert.emailEnabled}
                                onCheckedChange={(v) => setNewAlert({...newAlert, emailEnabled: v})}
                                data-testid="switch-email-enabled"
                              />
                            </div>
                            {newAlert.emailEnabled && (
                              <Input
                                placeholder="your@email.com"
                                value={newAlert.emailAddress}
                                onChange={(e) => setNewAlert({...newAlert, emailAddress: e.target.value})}
                                data-testid="input-email-address"
                              />
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm">Slack</span>
                              </div>
                              <Switch
                                checked={newAlert.slackEnabled}
                                onCheckedChange={(v) => setNewAlert({...newAlert, slackEnabled: v})}
                                data-testid="switch-slack-enabled"
                              />
                            </div>
                            {newAlert.slackEnabled && (
                              <Input
                                placeholder="https://hooks.slack.com/services/..."
                                value={newAlert.slackWebhookUrl}
                                onChange={(e) => setNewAlert({...newAlert, slackWebhookUrl: e.target.value})}
                                data-testid="input-slack-webhook"
                              />
                            )}
                          </div>
                        </div>

                        <Button 
                          className="w-full"
                          onClick={() => createAlertMutation.mutate(newAlert)}
                          disabled={createAlertMutation.isPending || (!newAlert.emailEnabled && !newAlert.slackEnabled)}
                          data-testid="button-create-alert"
                        >
                          {createAlertMutation.isPending ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Bell className="w-4 h-4 mr-2" />
                          )}
                          Create Alert
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {alertsLoading ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                      <p className="text-muted-foreground">Loading alerts...</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Bell className="w-5 h-5" />
                          Active Alerts
                        </CardTitle>
                        <CardDescription>
                          {alertSettings.length} alert{alertSettings.length !== 1 ? 's' : ''} configured
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {alertSettings.length === 0 ? (
                          <div className="text-center py-8">
                            <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-muted-foreground mb-2">No alerts configured</p>
                            <p className="text-sm text-muted-foreground">
                              Create an alert to get notified about important events
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {alertSettings.map((setting) => (
                              <div key={setting.id} className="p-3 border rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="outline">
                                    {alertTypes.find(t => t.value === setting.alertType)?.label || setting.alertType}
                                  </Badge>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => testAlertMutation.mutate(setting.id)}
                                      disabled={testAlertMutation.isPending}
                                      data-testid={`button-test-alert-${setting.id}`}
                                    >
                                      <Send className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => deleteAlertMutation.mutate(setting.id)}
                                      disabled={deleteAlertMutation.isPending}
                                      data-testid={`button-delete-alert-${setting.id}`}
                                    >
                                      <Trash2 className="w-3 h-3 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  {setting.emailEnabled === 1 && (
                                    <div className="flex items-center gap-1">
                                      <Mail className="w-3 h-3" />
                                      <span>Email</span>
                                    </div>
                                  )}
                                  {setting.slackEnabled === 1 && (
                                    <div className="flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" />
                                      <span>Slack</span>
                                    </div>
                                  )}
                                  {setting.threshold && (
                                    <span>| Threshold: {setting.threshold}%</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <History className="w-5 h-5" />
                          Alert History
                        </CardTitle>
                        <CardDescription>
                          Recent notifications sent
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {alertHistoryList.length === 0 ? (
                          <div className="text-center py-8">
                            <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-muted-foreground mb-2">No alerts sent yet</p>
                            <p className="text-sm text-muted-foreground">
                              Alerts will appear here when triggered
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[300px] overflow-y-auto">
                            {alertHistoryList.map((history) => (
                              <div key={history.id} className="p-3 border rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    {history.alertType}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(history.sentAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-sm">{history.message}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Sent via: {history.sentVia}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
