import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { Article } from "@shared/schema";
import {
  Sparkles,
  Loader2,
  BarChart3,
  Layers,
  Code,
  Workflow,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Search,
  FileText,
  Zap,
  Target,
  RefreshCw,
  Brain,
  Gauge,
  SplitSquareVertical,
  Database,
  Timer,
  ArrowRight,
  ChevronRight,
  Activity
} from "lucide-react";

interface SignalScore {
  signal: string;
  score: number;
  maxScore: number;
  status: 'excellent' | 'good' | 'needs_improvement' | 'poor';
  recommendations: string[];
}

interface ChunkAnalysis {
  chunkNumber: number;
  tokenCount: number;
  wordCount: number;
  hasHeading: boolean;
  hasDirectAnswer: boolean;
  questionBased: boolean;
  extractable: boolean;
  content: string;
  issues: string[];
}

interface SchemaAudit {
  schemaType: string;
  present: boolean;
  searchable: boolean;
  indexable: boolean;
  retrievable: boolean;
  recommendations: string[];
}

interface PipelineStage {
  stage: string;
  status: 'pass' | 'warning' | 'fail';
  score: number;
  details: string[];
}

export default function GeoSignals() {
  const { toast } = useToast();
  const { selectedBrandId } = useBrandSelection();
  const [selectedArticleId, setSelectedArticleId] = useState<string>("");
  const [contentToAnalyze, setContentToAnalyze] = useState<string>("");
  const [targetQuery, setTargetQuery] = useState<string>("");
  const [url, setUrl] = useState<string>("");

  const { data: articlesData } = useQuery<{ data: Article[] }>({
    queryKey: ["/api/articles", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const articles = articlesData?.data || [];
  const selectedArticle = articles.find(a => a.id === selectedArticleId);

  const analyzeSignalsMutation = useMutation({
    mutationFn: async (data: { content: string; targetQuery: string; brandId?: string }) => {
      const response = await apiRequest("POST", "/api/geo-signals/analyze", data);
      return response.json();
    },
    onError: () => toast({ title: "Analysis failed", variant: "destructive" }),
  });

  const analyzeChunksMutation = useMutation({
    mutationFn: async (data: { content: string }) => {
      const response = await apiRequest("POST", "/api/geo-signals/chunk-analysis", data);
      return response.json();
    },
    onError: () => toast({ title: "Chunk analysis failed", variant: "destructive" }),
  });

  const optimizeChunksMutation = useMutation({
    mutationFn: async (data: { content: string; brandId?: string }) => {
      const response = await apiRequest("POST", "/api/geo-signals/optimize-chunks", data);
      return response.json();
    },
    onSuccess: () => toast({ title: "Content optimized into AI-extractable chunks!" }),
    onError: () => toast({ title: "Optimization failed", variant: "destructive" }),
  });

  const auditSchemaMutation = useMutation({
    mutationFn: async (data: { url: string }) => {
      const response = await apiRequest("POST", "/api/geo-signals/schema-audit", data);
      return response.json();
    },
    onError: () => toast({ title: "Schema audit failed", variant: "destructive" }),
  });

  const simulatePipelineMutation = useMutation({
    mutationFn: async (data: { content: string; query: string }) => {
      const response = await apiRequest("POST", "/api/geo-signals/pipeline-simulation", data);
      return response.json();
    },
    onError: () => toast({ title: "Pipeline simulation failed", variant: "destructive" }),
  });

  const signalScores: SignalScore[] = analyzeSignalsMutation.data?.data?.signals || [];
  const overallScore = analyzeSignalsMutation.data?.data?.overallScore || 0;
  const chunks: ChunkAnalysis[] = analyzeChunksMutation.data?.data?.chunks || [];
  const chunkStats = analyzeChunksMutation.data?.data?.stats || { totalChunks: 0, extractableChunks: 0, avgTokens: 0 };
  const schemaAudits: SchemaAudit[] = auditSchemaMutation.data?.data?.schemas || [];
  const pipelineStages: PipelineStage[] = simulatePipelineMutation.data?.data?.stages || [];
  const optimizedContent = optimizeChunksMutation.data?.data?.optimizedContent || "";

  const getScoreColor = (score: number, max: number) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return "text-green-500";
    if (percentage >= 60) return "text-yellow-500";
    if (percentage >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'excellent': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'good': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'needs_improvement': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'poor': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pass': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const handleAnalyzeArticle = () => {
    if (selectedArticle) {
      setContentToAnalyze(selectedArticle.content);
      analyzeSignalsMutation.mutate({
        content: selectedArticle.content,
        targetQuery: targetQuery || selectedArticle.title,
        brandId: selectedBrandId,
      });
    }
  };

  return (
    <>
      <Helmet>
        <title>GEO Signal Optimization Suite | VentureCite</title>
        <meta name="description" content="Optimize your content for Google's AI search signals with 7-signal analysis, chunk engineering, schema auditing, and pipeline simulation." />
      </Helmet>
      
      <div className="space-y-8">
        <PageHeader
          title="GEO Signals"
          description="Optimize for Google's 7 AI ranking signals and 4-stage pipeline"
          actions={
            <div className="flex gap-2">
              <BrandSelector className="w-[160px]" />
              {selectedBrandId && (
                <Select value={selectedArticleId} onValueChange={setSelectedArticleId}>
                  <SelectTrigger className="w-[220px]" data-testid="select-article">
                    <SelectValue placeholder="Select article" />
                  </SelectTrigger>
                  <SelectContent>
                    {articles.map(article => (
                      <SelectItem key={article.id} value={article.id}>{article.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          }
        />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Overall Score</span>
                  <Gauge className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-semibold text-foreground tracking-tight" data-testid="stat-overall">{overallScore}<span className="text-lg text-muted-foreground">/100</span></p>
                <Progress value={overallScore} className="mt-3 h-1.5" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Extractable Chunks</span>
                  <SplitSquareVertical className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-semibold text-foreground tracking-tight" data-testid="stat-chunks">{chunkStats.extractableChunks}<span className="text-lg text-muted-foreground">/{chunkStats.totalChunks}</span></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schema Coverage</span>
                  <Code className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-semibold text-foreground tracking-tight" data-testid="stat-schema">{schemaAudits.filter(s => s.present).length}<span className="text-lg text-muted-foreground">/{schemaAudits.length || 6}</span></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pipeline Status</span>
                  <Workflow className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-semibold text-foreground tracking-tight" data-testid="stat-pipeline">
                  {pipelineStages.filter(s => s.status === 'pass').length}<span className="text-lg text-muted-foreground">/{pipelineStages.length || 4}</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="signals" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="signals" data-testid="tab-signals">
                <BarChart3 className="w-4 h-4 mr-2" /> 7-Signal Scorecard
              </TabsTrigger>
              <TabsTrigger value="chunks"  data-testid="tab-chunks">
                <SplitSquareVertical className="w-4 h-4 mr-2" /> Chunk Engineer
              </TabsTrigger>
              <TabsTrigger value="schema"  data-testid="tab-schema">
                <Code className="w-4 h-4 mr-2" /> Schema Lab
              </TabsTrigger>
              <TabsTrigger value="pipeline"  data-testid="tab-pipeline">
                <Workflow className="w-4 h-4 mr-2" /> Pipeline Sim
              </TabsTrigger>
              <TabsTrigger value="freshness"  data-testid="tab-freshness">
                <Clock className="w-4 h-4 mr-2" /> Freshness
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signals" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">7-Signal Optimization Scorecard</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Analyze your content against Google's exact AI ranking signals
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-foreground">Target Query</Label>
                      <Input
                        value={targetQuery}
                        onChange={(e) => setTargetQuery(e.target.value)}
                        placeholder="What query should this content rank for?"
                        className=" text-foreground"
                        data-testid="input-target-query"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={handleAnalyzeArticle}
                        disabled={!selectedArticle || analyzeSignalsMutation.isPending}
                        className="bg-primary hover:bg-primary/90"
                        data-testid="button-analyze-signals"
 >
                        {analyzeSignalsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-2" />}
                        Analyze Signals
                      </Button>
                    </div>
                  </div>

                  {signalScores.length > 0 && (
                    <div className="space-y-4">
                      {signalScores.map((signal, idx) => (
                        <div key={idx} className="p-4 bg-muted/30 rounded-lg border">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(signal.status)}
                              <span className="font-medium text-foreground">{signal.signal}</span>
                            </div>
                            <span className={`font-bold ${getScoreColor(signal.score, signal.maxScore)}`}>
                              {signal.score}/{signal.maxScore}
                            </span>
                          </div>
                          <Progress value={(signal.score / signal.maxScore) * 100} className="h-2 mb-2" />
                          {signal.recommendations.length > 0 && (
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {signal.recommendations.map((rec, rIdx) => (
                                <li key={rIdx} className="flex items-start gap-2">
                                  <ChevronRight className="w-3 h-3 mt-1 text-primary" />
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {signalScores.length === 0 && !analyzeSignalsMutation.isPending && (
                    <div className="text-center py-12 text-muted-foreground">
                      <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="font-medium">Select an article and run analysis</p>
                      <p className="text-sm">Get scores for all 7 Google AI ranking signals</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    How to Improve Each Signal
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Step-by-step actions your brand should take for each of Google's 7 AI ranking signals
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 text-sm">
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-5 h-5 text-primary" />
                        <span className="font-semibold text-foreground text-base">1. Base Ranking</span>
                      </div>
                      <p className="text-foreground mb-3">Google's core relevance score. This determines whether your page even enters the AI pipeline.</p>
                      <div className="space-y-2 text-muted-foreground">
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Submit to Google Search Console</strong> - Verify your site and submit your sitemap so Google discovers all your pages</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Build domain authority</strong> - Get backlinks from reputable sites in your industry (guest posts, PR mentions, partnerships)</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Optimize page speed</strong> - Ensure Core Web Vitals pass (use PageSpeed Insights to check)</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Use proper HTML structure</strong> - Title tags, meta descriptions, H1/H2 hierarchy, internal linking</span></p>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Brain className="w-5 h-5 text-blue-500" />
                        <span className="font-semibold text-foreground text-base">2. Gecko Score (Semantic Similarity)</span>
                      </div>
                      <p className="text-foreground mb-3">How well your content's meaning matches what the user is asking. Google converts both your text and the query into vectors and compares them.</p>
                      <div className="space-y-2 text-muted-foreground">
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Answer the question directly</strong> - Start sections with a clear, definitive answer before adding context</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Use question-based headings</strong> - Write H2s as questions people actually ask (e.g., "What is the best CRM for small business?")</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Include synonyms and related terms</strong> - Don't just repeat one keyword; use natural variations AI understands</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Write comprehensive content</strong> - Cover the topic thoroughly so your content matches many related queries</span></p>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-5 h-5 text-yellow-500" />
                        <span className="font-semibold text-foreground text-base">3. Jetstream (Context Understanding)</span>
                      </div>
                      <p className="text-foreground mb-3">Google's ability to understand nuance in your content - negation, contrast, comparisons, and caveats.</p>
                      <div className="space-y-2 text-muted-foreground">
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Be specific about what your product does AND doesn't do</strong> - "Our tool handles X but not Y" helps AI understand scope</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Use comparison language</strong> - "Unlike competitors, we..." or "Compared to X, our approach..." helps AI differentiate</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Add nuanced qualifiers</strong> - "Best for teams of 10-50" instead of just "Best tool" gives AI context for specific queries</span></p>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Search className="w-5 h-5 text-green-500" />
                        <span className="font-semibold text-foreground text-base">4. BM25 (Keyword Matching)</span>
                      </div>
                      <p className="text-foreground mb-3">Traditional keyword matching still matters. Google checks if your exact keywords appear in the content.</p>
                      <div className="space-y-2 text-muted-foreground">
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Include target keywords naturally</strong> - Put your main keyword in the title, first paragraph, and at least 2-3 subheadings</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Use exact-match phrases</strong> - If people search "best project management software," use that exact phrase in your content</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Don't over-optimize</strong> - Keyword density of 1-2% is ideal. Over-stuffing hurts readability and AI trust</span></p>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-5 h-5 text-orange-500" />
                        <span className="font-semibold text-foreground text-base">5. PCTR (Predicted Click-Through Rate)</span>
                      </div>
                      <p className="text-foreground mb-3">Google predicts how likely users are to click your result. Higher PCTR = more likely to be shown in AI responses.</p>
                      <div className="space-y-2 text-muted-foreground">
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Write compelling title tags</strong> - Include numbers, years, and power words ("Complete Guide," "2025 Update")</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Craft descriptive meta descriptions</strong> - Summarize the value proposition in 150-160 characters</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Add structured data</strong> - FAQ schema, How-to schema, and Review schema create rich snippets that boost CTR</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Match search intent</strong> - If people want a comparison, write a comparison. If they want a how-to, write a tutorial</span></p>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-5 h-5 text-cyan-500" />
                        <span className="font-semibold text-foreground text-base">6. Freshness Score</span>
                      </div>
                      <p className="text-foreground mb-3">How recently your content was published or updated. AI prefers current information over outdated content.</p>
                      <div className="space-y-2 text-muted-foreground">
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Update articles every 30-60 days</strong> - Even small updates (new stats, current year) refresh the freshness signal</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Add "Last Updated" dates visibly</strong> - Show the date prominently on the page so both users and AI see it</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Include current year statistics</strong> - Reference "In 2025..." data points to signal recency</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Use the Freshness tab above</strong> - Check which of your articles are aging and need updates</span></p>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-5 h-5 text-red-500" />
                        <span className="font-semibold text-foreground text-base">7. Boost/Bury Rules</span>
                      </div>
                      <p className="text-foreground mb-3">Google applies manual or algorithmic rules to boost trusted content and bury low-quality or harmful content.</p>
                      <div className="space-y-2 text-muted-foreground">
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Demonstrate E-E-A-T</strong> - Show Experience, Expertise, Authoritativeness, Trustworthiness through author bios, credentials, and citations</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Cite authoritative sources</strong> - Link to .gov, .edu, and respected industry sources to build credibility</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Avoid thin content</strong> - Pages under 500 words with no unique value are likely to be buried</span></p>
                        <p className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> <span><strong className="text-foreground">Get listed on Wikipedia and authoritative databases</strong> - These are signals Google uses to validate brand legitimacy</span></p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chunks" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">500-Token Chunk Engineer</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Restructure content into AI-extractable ~375 word chunks with question-based headings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <Button
                      onClick={() => {
                        if (selectedArticle) {
                          setContentToAnalyze(selectedArticle.content);
                          analyzeChunksMutation.mutate({ content: selectedArticle.content });
                        }
                      }}
                      disabled={!selectedArticle || analyzeChunksMutation.isPending}
                      variant="outline"
                      data-testid="button-analyze-chunks"
 >
                      {analyzeChunksMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <SplitSquareVertical className="w-4 h-4 mr-2" />}
                      Analyze Chunks
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedArticle) {
                          optimizeChunksMutation.mutate({ content: selectedArticle.content, brandId: selectedBrandId });
                        }
                      }}
                      disabled={!selectedArticle || optimizeChunksMutation.isPending}
                      className="bg-primary hover:bg-primary/90"
                      data-testid="button-optimize-chunks"
 >
                      {optimizeChunksMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      Auto-Optimize Chunks
                    </Button>
                  </div>

                  {chunks.length > 0 && (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="p-4 bg-muted/30 rounded-lg text-center">
                        <p className="text-2xl font-bold text-foreground">{chunkStats.totalChunks}</p>
                        <p className="text-sm text-muted-foreground">Total Chunks</p>
                      </div>
                      <div className="p-4 bg-muted/30 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-500">{chunkStats.extractableChunks}</p>
                        <p className="text-sm text-muted-foreground">Extractable</p>
                      </div>
                      <div className="p-4 bg-muted/30 rounded-lg text-center">
                        <p className="text-2xl font-bold text-foreground">{chunkStats.avgTokens}</p>
                        <p className="text-sm text-muted-foreground">Avg Tokens</p>
                      </div>
                    </div>
                  )}

                  {chunks.length > 0 && (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-4">
                        {chunks.map((chunk, idx) => (
                          <div
                            key={idx}
                            className={`p-4 rounded-lg border ${chunk.extractable ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-destructive/10 border-destructive/30'}`}
 >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={chunk.extractable ? "default" : "destructive"}>
                                  Chunk {chunk.chunkNumber}
                                </Badge>
                                <span className="text-sm text-muted-foreground">{chunk.tokenCount} tokens / {chunk.wordCount} words</span>
                              </div>
                              <div className="flex gap-2">
                                {chunk.hasHeading && <Badge variant="outline" className="text-emerald-600 border-emerald-500/50">Has Heading</Badge>}
                                {chunk.questionBased && <Badge variant="outline" className="text-sky-600 border-sky-500/50">Question H2</Badge>}
                                {chunk.hasDirectAnswer && <Badge variant="outline" className="text-primary border-primary">Direct Answer</Badge>}
                              </div>
                            </div>
                            <p className="text-sm text-foreground line-clamp-3 mb-2">{chunk.content}</p>
                            {chunk.issues.length > 0 && (
                              <div className="text-sm text-red-500">
                                {chunk.issues.map((issue, iIdx) => (
                                  <p key={iIdx}>⚠️ {issue}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}

                  {optimizedContent && (
                    <div className="mt-4">
                      <Label className="text-foreground">Optimized Content</Label>
                      <Textarea
                        value={optimizedContent}
                        readOnly
                        className=" text-foreground min-h-[300px] font-mono text-sm"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="schema" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Schema Impact Lab</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Audit structured data for Searchable, Indexable, and Retrievable functions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <Label className="text-foreground">URL to Audit</Label>
                      <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/page"
                        className=" text-foreground"
                        data-testid="input-url"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={() => auditSchemaMutation.mutate({ url })}
                        disabled={!url || auditSchemaMutation.isPending}
                        className="bg-primary hover:bg-primary/90"
                        data-testid="button-audit-schema"
 >
                        {auditSchemaMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Code className="w-4 h-4 mr-2" />}
                        Audit Schema
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div className="text-center">
                      <Search className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                      <p className="font-medium text-foreground">Searchable</p>
                      <p className="text-xs text-muted-foreground">Affects recall - whether AI can find you</p>
                    </div>
                    <div className="text-center">
                      <Database className="w-8 h-8 mx-auto text-green-500 mb-2" />
                      <p className="font-medium text-foreground">Indexable</p>
                      <p className="text-xs text-muted-foreground">Affects filtering and ordering</p>
                    </div>
                    <div className="text-center">
                      <FileText className="w-8 h-8 mx-auto text-primary mb-2" />
                      <p className="font-medium text-foreground">Retrievable</p>
                      <p className="text-xs text-muted-foreground">Affects what gets cited</p>
                    </div>
                  </div>

                  {schemaAudits.length > 0 ? (
                    <div className="space-y-4">
                      {schemaAudits.map((schema, idx) => (
                        <div key={idx} className="p-4 bg-muted/30 rounded-lg border">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {schema.present ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                              <span className="font-medium text-foreground">{schema.schemaType}</span>
                            </div>
                            <Badge variant={schema.present ? "default" : "secondary"}>
                              {schema.present ? "Present" : "Missing"}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className={`p-2 rounded text-center ${schema.searchable ? 'bg-sky-500/10' : ''}`}>
                              <p className="text-xs text-muted-foreground">Searchable</p>
                              <p className={schema.searchable ? 'text-blue-500' : 'text-muted-foreground'}>
                                {schema.searchable ? '✓' : '—'}
                              </p>
                            </div>
                            <div className={`p-2 rounded text-center ${schema.indexable ? 'bg-emerald-500/10' : ''}`}>
                              <p className="text-xs text-muted-foreground">Indexable</p>
                              <p className={schema.indexable ? 'text-green-500' : 'text-muted-foreground'}>
                                {schema.indexable ? '✓' : '—'}
                              </p>
                            </div>
                            <div className={`p-2 rounded text-center ${schema.retrievable ? 'bg-primary/10' : ''}`}>
                              <p className="text-xs text-muted-foreground">Retrievable</p>
                              <p className={schema.retrievable ? 'text-primary' : 'text-muted-foreground'}>
                                {schema.retrievable ? '✓' : '—'}
                              </p>
                            </div>
                          </div>
                          {schema.recommendations.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              {schema.recommendations.map((rec, rIdx) => (
                                <p key={rIdx} className="flex items-start gap-2">
                                  <ChevronRight className="w-3 h-3 mt-1 text-primary" />
                                  {rec}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="font-medium">Enter a URL to audit schema markup</p>
                      <p className="text-sm">Analyze how structured data affects AI visibility</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pipeline" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Pipeline Simulation Tool</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Map your content through Google's 4-stage AI pipeline: Prepare → Retrieve → Signal → Serve
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <Button
                      onClick={() => {
                        if (selectedArticle) {
                          simulatePipelineMutation.mutate({
                            content: selectedArticle.content,
                            query: targetQuery || selectedArticle.title,
                          });
                        }
                      }}
                      disabled={!selectedArticle || simulatePipelineMutation.isPending}
                      className="bg-primary hover:bg-primary/90"
                      data-testid="button-simulate-pipeline"
 >
                      {simulatePipelineMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Workflow className="w-4 h-4 mr-2" />}
                      Simulate Pipeline
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    {['Prepare', 'Retrieve', 'Signal', 'Serve'].map((stage, idx) => (
                      <div key={stage} className="flex items-center">
                        <div className="text-center">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                            pipelineStages[idx]?.status === 'pass' ? 'bg-green-600' :
                            pipelineStages[idx]?.status === 'warning' ? 'bg-yellow-600' :
                            pipelineStages[idx]?.status === 'fail' ? 'bg-red-500' : 'bg-muted'
                          }`}>
                            {stage === 'Prepare' && <Brain className="w-6 h-6 text-white" />}
                            {stage === 'Retrieve' && <SplitSquareVertical className="w-6 h-6 text-white" />}
                            {stage === 'Signal' && <Activity className="w-6 h-6 text-white" />}
                            {stage === 'Serve' && <Sparkles className="w-6 h-6 text-white" />}
                          </div>
                          <p className="text-sm font-medium text-foreground">{stage}</p>
                          {pipelineStages[idx] && (
                            <p className="text-xs text-muted-foreground">{pipelineStages[idx].score}/100</p>
                          )}
                        </div>
                        {idx < 3 && <ArrowRight className="w-6 h-6 text-muted-foreground mx-4" />}
                      </div>
                    ))}
                  </div>

                  {pipelineStages.length > 0 && (
                    <div className="space-y-4">
                      {pipelineStages.map((stage, idx) => (
                        <div key={idx} className="p-4 bg-muted/30 rounded-lg border">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(stage.status)}
                              <span className="font-medium text-foreground">{stage.stage}</span>
                            </div>
                            <Badge variant={stage.status === 'pass' ? 'default' : stage.status === 'warning' ? 'outline' : 'destructive'}>
                              {stage.score}/100
                            </Badge>
                          </div>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {stage.details.map((detail, dIdx) => (
                              <li key={dIdx} className="flex items-start gap-2">
                                <ChevronRight className="w-3 h-3 mt-1 text-primary" />
                                {detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="freshness" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Freshness Automation</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Track content age decay and schedule updates before freshness score drops
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg text-center">
                      <Timer className="w-8 h-8 mx-auto text-green-500 mb-2" />
                      <p className="text-2xl font-bold text-foreground">{articles.filter(a => {
                        const age = (Date.now() - new Date(a.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
                        return age < 30;
                      }).length}</p>
                      <p className="text-sm text-muted-foreground">Fresh (&lt;30 days)</p>
                    </div>
                    <div className="p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg text-center">
                      <Clock className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
                      <p className="text-2xl font-bold text-foreground">{articles.filter(a => {
                        const age = (Date.now() - new Date(a.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
                        return age >= 30 && age < 90;
                      }).length}</p>
                      <p className="text-sm text-muted-foreground">Aging (30-90 days)</p>
                    </div>
                    <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg text-center">
                      <AlertTriangle className="w-8 h-8 mx-auto text-red-500 mb-2" />
                      <p className="text-2xl font-bold text-foreground">{articles.filter(a => {
                        const age = (Date.now() - new Date(a.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
                        return age >= 90;
                      }).length}</p>
                      <p className="text-sm text-muted-foreground">Stale (&gt;90 days)</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">Content Freshness Timeline</h3>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {articles.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()).map(article => {
                          const age = Math.floor((Date.now() - new Date(article.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
                          const freshness = Math.max(0, 100 - age);
                          const status = age < 30 ? 'fresh' : age < 90 ? 'aging' : 'stale';
                          
                          return (
                            <div key={article.id} className="p-4 bg-muted/30 rounded-lg border">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-foreground truncate max-w-md">{article.title}</span>
                                <Badge variant={status === 'fresh' ? 'default' : status === 'aging' ? 'outline' : 'destructive'}>
                                  {age} days old
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4">
                                <Progress value={freshness} className="flex-1 h-2" />
                                <span className={`text-sm font-medium ${
                                  status === 'fresh' ? 'text-green-500' : status === 'aging' ? 'text-yellow-500' : 'text-red-500'
                                }`}>
                                  {freshness}%
                                </span>
                                {status !== 'fresh' && (
                                  <Button size="sm" variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                                    <RefreshCw className="w-3 h-3 mr-1" /> Schedule Update
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
      </div>
    </>
  );
}
