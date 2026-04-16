import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Zap, TrendingUp, Target, Users, HelpCircle, Info, Lightbulb, FileText, CheckCircle, Clock, BarChart3 } from "lucide-react";
import { Link } from "wouter";
import OnboardingChecklist from "@/components/OnboardingChecklist";

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

export default function Dashboard() {
  const [keywords, setKeywords] = useState("");
  const [industry, setIndustry] = useState("Technology");
  const [generatedContent, setGeneratedContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Get dashboard analytics. refetchInterval only fires when the tab is
  // visible AND the last attempt didn't 401 — previously this hammered the
  // server during logout/tab-hidden states.
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useQuery<{ success: boolean; data: any }>({
    queryKey: ['/api/dashboard'],
    refetchInterval: (q) => (q.state.error ? false : 30000),
    refetchIntervalInBackground: false,
  });

  const { data: platforms, isLoading: platformsLoading, error: platformsError } = useQuery<{ success: boolean; data: any }>({
    queryKey: ['/api/search-performance'],
    refetchInterval: (q) => (q.state.error ? false : 30000),
    refetchIntervalInBackground: false,
  });

  const { data: metrics, error: metricsError } = useQuery<{ success: boolean; data: any }>({
    queryKey: ['/api/platform-metrics'],
    refetchInterval: (q) => (q.state.error ? false : 60000),
    refetchIntervalInBackground: false,
  });

  const hasError = analyticsError || platformsError || metricsError;

  // Generate content mutation
  const generateContentMutation = useMutation({
    mutationFn: async (data: { keywords: string; industry: string; type: string }) => {
      const response = await apiRequest('POST', '/api/generate-content', data);
      return response.json();
    },
    onSuccess: (data) => {
      // If it's a demo response, show the demo content, otherwise show the real content
      const contentToShow = data.demo ? data.generatedText : (data.content || "Content generated successfully!");
      setGeneratedContent(contentToShow);
      setIsGenerating(false);
    },
    onError: () => {
      setGeneratedContent("Error generating content. Please try again.");
      setIsGenerating(false);
    },
  });

  const handleGenerateContent = () => {
    if (!keywords) {
      alert('Please enter keywords');
      return;
    }
    
    setIsGenerating(true);
    setGeneratedContent("");
    generateContentMutation.mutate({
      keywords,
      industry,
      type: 'article'
    });
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="header-title">GEO Platform</h1>
              <p className="text-sm text-muted-foreground">AI Citation Tracking & Content Generation</p>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/geo-rankings">
                <Button variant="outline" size="sm" data-testid="link-geo-rankings">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  GEO Rankings
                </Button>
              </Link>
              <div className="bg-green-100 dark:bg-green-900 px-3 py-1 rounded-full">
                <span className="text-green-800 dark:text-green-200 text-sm" data-testid="status-live">✓ Live</span>
              </div>
              <span className="text-lg font-bold text-foreground" data-testid="citations-count">
                {analyticsLoading ? "Loading..." : `${formatNumber(analytics?.data?.totalCitations || 0)} Citations`}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Onboarding Checklist */}
        <OnboardingChecklist />

        {/* Stats Grid */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white" data-testid="card-total-citations">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold" data-testid="stat-total-citations">
                    {analyticsLoading ? "Loading..." : formatNumber(analytics?.data?.totalCitations || 0)}
                  </div>
                  <div className="flex items-center gap-2 text-blue-100">
                    <span>Total Citations</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-4 h-4 text-blue-200 hover:text-white cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">How many times your content has been referenced or cited by AI platforms like ChatGPT, Claude, and others. Higher numbers mean better visibility!</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <Target className="w-8 h-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-green-500 to-teal-600 text-white" data-testid="card-weekly-growth">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold" data-testid="stat-weekly-growth">
                    {analyticsLoading ? "Loading..." : `+${analytics?.data?.weeklyGrowth || 0}%`}
                  </div>
                  <div className="flex items-center gap-2 text-green-100">
                    <span>Weekly Growth</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-4 h-4 text-green-200 hover:text-white cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">How fast your citations are increasing each week. Positive growth means you're gaining momentum and visibility!</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <TrendingUp className="w-8 h-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-yellow-500 to-orange-600 text-white" data-testid="card-avg-position">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold" data-testid="stat-avg-position">
                    {analyticsLoading ? "Loading..." : `${analytics?.data?.avgPosition || 0}`}
                  </div>
                  <div className="flex items-center gap-2 text-yellow-100">
                    <span>Avg Position</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-4 h-4 text-yellow-200 hover:text-white cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">Your average ranking when your content appears in AI responses. Lower numbers are better (position 1-3 means you're usually mentioned first!).</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <Zap className="w-8 h-8 text-yellow-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-purple-500 to-pink-600 text-white" data-testid="card-monthly-traffic">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold" data-testid="stat-monthly-traffic">
                    {analyticsLoading ? "Loading..." : formatNumber(analytics?.data?.monthlyTraffic || 0)}
                  </div>
                  <div className="flex items-center gap-2 text-purple-100">
                    <span>Monthly Traffic</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-4 h-4 text-purple-200 hover:text-white cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">Estimated monthly visitors driven to your content through AI platform citations. This shows the real business impact of your GEO efforts!</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <Users className="w-8 h-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Getting Started Section */}
        <Card className="mb-8 border-l-4 border-l-blue-500" data-testid="getting-started-section">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0">
                <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-foreground mb-3">🚀 Getting Started with GEO Platform</h2>
                <p className="text-muted-foreground mb-4">
                  New to Generative Engine Optimization? Follow these simple steps to start getting your content mentioned by AI platforms:
                </p>
                
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
                      <h3 className="font-semibold text-foreground">Create Content</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">Use the AI Content Generator below to create content optimized for AI platforms. Start with keywords your customers search for.</p>
                  </div>
                  
                  <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
                      <h3 className="font-semibold text-foreground">Track Citations</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">Monitor when AI platforms mention your content. Use the Citations page to manually track mentions you discover.</p>
                  </div>
                  
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">3</span>
                      <h3 className="font-semibold text-foreground">Monitor Growth</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">Watch your metrics above to see your citations and traffic grow. More citations mean more visibility and customers.</p>
                  </div>
                </div>
                
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 text-sm mb-1">💡 Pro Tip for Beginners</h4>
                      <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                        Start by creating one piece of content below, then ask AI platforms like ChatGPT questions related to your topic. 
                        If they mention your content, add it to Citations tracking. This builds momentum quickly!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Generator */}
        <Card className="mb-8" data-testid="content-generator">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">AI Content Generator</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Input
                  type="text"
                  placeholder="Enter keywords..."
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  data-testid="input-keywords"
                />
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger data-testid="select-industry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Technology">Technology</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Healthcare">Healthcare</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="E-commerce">E-commerce</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleGenerateContent}
                  disabled={isGenerating || generateContentMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-generate-content"
                >
                  {isGenerating ? "Generating..." : "Generate AI Content"}
                </Button>
              </div>
              <div>
                <div className="bg-secondary p-4 rounded-lg h-48 overflow-auto" data-testid="content-output">
                  {isGenerating ? (
                    <p className="text-muted-foreground">Generating content...</p>
                  ) : generatedContent ? (
                    <pre className="whitespace-pre-wrap text-sm text-foreground">{generatedContent}</pre>
                  ) : (
                    <p className="text-muted-foreground">Generated content will appear here...</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity Metrics */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card data-testid="content-metrics">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5 text-blue-600" />
                Content Production
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Articles</span>
                  <span className="text-xl font-bold">{metrics?.data?.content?.totalArticles || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">This Week</span>
                  <span className="text-lg font-semibold text-green-600">+{metrics?.data?.content?.articlesThisWeek || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">This Month</span>
                  <span className="text-lg font-semibold">+{metrics?.data?.content?.articlesThisMonth || 0}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Articles</span>
                    <span>{metrics?.data?.content?.totalArticles || 0}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="task-metrics">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Task Completion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Completion Rate</span>
                  <span className="text-xl font-bold text-green-600">{metrics?.data?.tasks?.completionRate || 0}%</span>
                </div>
                <Progress value={metrics?.data?.tasks?.completionRate || 0} className="h-3" />
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="text-center p-2 bg-green-50 dark:bg-green-950 rounded">
                    <div className="text-lg font-bold text-green-600">{metrics?.data?.tasks?.completed || 0}</div>
                    <div className="text-xs text-muted-foreground">Completed</div>
                  </div>
                  <div className="text-center p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                    <div className="text-lg font-bold text-yellow-600">{metrics?.data?.tasks?.pending || 0}</div>
                    <div className="text-xs text-muted-foreground">Pending</div>
                  </div>
                  <div className="text-center p-2 bg-red-50 dark:bg-red-950 rounded">
                    <div className="text-lg font-bold text-red-600">{metrics?.data?.tasks?.failed || 0}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Platform Performance */}
        <Card data-testid="platform-performance">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">AI Platform Performance</h2>
            <div className="space-y-3" data-testid="platforms-list">
              {platformsLoading ? (
                <p className="text-muted-foreground">Loading platforms...</p>
              ) : platforms?.data?.platforms?.length > 0 ? (
                platforms?.data?.platforms?.map((platform: any, index: number) => (
                  <div 
                    key={platform.name} 
                    className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                    data-testid={`platform-${index}`}
                  >
                    <span className="font-medium text-foreground">{platform.name}</span>
                    <div className="text-right">
                      <span className="text-lg font-bold text-foreground" data-testid={`platform-citations-${index}`}>
                        {formatNumber(platform.citations)}
                      </span>
                      <span className="text-sm text-green-600 ml-2" data-testid={`platform-growth-${index}`}>
                        {platform.growth}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8" data-testid="empty-state-platforms">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground font-medium" data-testid="text-no-platforms">No platform data yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add citations from AI platforms to see performance tracking here.
                  </p>
                  <Link href="/citations">
                    <Button variant="outline" size="sm" className="mt-3" data-testid="button-add-first-citation">
                      Add Your First Citation
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </TooltipProvider>
  );
}