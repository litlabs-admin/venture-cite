import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet";
import { Link } from "wouter";
import type { Brand, Listicle, BofuContent, FaqItem, BrandMention } from "@shared/schema";
import {
  List,
  BookOpen,
  FileText,
  HelpCircle,
  Bell,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  TrendingUp,
  Target,
  CheckCircle,
  XCircle,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Globe,
  MessageSquare,
  Youtube,
  Linkedin,
  Loader2
} from "lucide-react";
// react-icons@5.6 removed SiLinkedin from the simple-icons set; we fall
// back to lucide-react's Linkedin for that platform.
import { SiReddit, SiQuora, SiMedium } from "react-icons/si";
const SiLinkedin = Linkedin;

export default function GeoTools() {
  const { toast } = useToast();
  const [selectedBrandId, setSelectedBrandId] = usePersistedState<string>("vc_geotools_brandId", "");
  const [activeTab, setActiveTab] = useState("listicles");
  const [bofuType, setBofuType] = useState<string>("comparison");
  const [bofuCompetitor, setBofuCompetitor] = useState("");
  const [bofuKeyword, setBofuKeyword] = useState("");
  const [faqTopic, setFaqTopic] = useState("");
  const [listicleOpportunities, setListicleOpportunities] = useState<any[]>([]);

  const { data: brandsData } = useQuery<{ data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsData?.data || [];
  const selectedBrand = brands.find(b => b.id === selectedBrandId);

  useEffect(() => {
    if (brands.length > 0 && (!selectedBrandId || !brands.find(b => b.id === selectedBrandId))) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, selectedBrandId]);

  // Listicle queries
  const { data: listiclesData, isLoading: listiclesLoading } = useQuery({
    queryKey: ["/api/listicles", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const discoverListiclesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/listicles/discover/${selectedBrandId}`);
      return response.json();
    },
    onSuccess: (data: any) => {
      setListicleOpportunities(data.data?.opportunities || []);
      toast({ title: "Listicle opportunities discovered!" });
      queryClient.invalidateQueries({ queryKey: ["/api/listicles"] });
    },
    onError: () => toast({ title: "Failed to discover listicles", variant: "destructive" }),
  });

  // Wikipedia queries
  const [wikiAnalysis, setWikiAnalysis] = useState<any>(null);
  const scanWikipediaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/wikipedia/scan/${selectedBrandId}`);
      return response.json();
    },
    onSuccess: (data: any) => {
      setWikiAnalysis(data.data);
      toast({ title: "Wikipedia analysis complete!" });
    },
    onError: () => toast({ title: "Failed to analyze Wikipedia", variant: "destructive" }),
  });

  // BOFU content queries
  const { data: bofuData, isLoading: bofuLoading } = useQuery({
    queryKey: ["/api/bofu-content", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const generateBofuMutation = useMutation({
    mutationFn: async (data: { contentType: string; comparedWith?: string[]; keyword?: string }) => {
      const response = await apiRequest("POST", "/api/bofu-content/generate", {
        brandId: selectedBrandId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "BOFU content generated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/bofu-content"] });
    },
    onError: () => toast({ title: "Failed to generate content", variant: "destructive" }),
  });

  // FAQ queries
  const { data: faqsData, isLoading: faqsLoading } = useQuery({
    queryKey: ["/api/faqs", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const generateFaqsMutation = useMutation({
    mutationFn: async (topic: string) => {
      const response = await apiRequest("POST", `/api/faqs/generate/${selectedBrandId}`, { topic });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "FAQs generated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
    },
    onError: () => toast({ title: "Failed to generate FAQs", variant: "destructive" }),
  });

  // Brand mentions queries
  const { data: mentionsData, isLoading: mentionsLoading } = useQuery({
    queryKey: ["/api/brand-mentions", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const platformIcons: Record<string, any> = {
    reddit: SiReddit,
    youtube: Youtube,
    quora: SiQuora,
    linkedin: SiLinkedin,
    medium: SiMedium,
    forum: MessageSquare,
    other: Globe,
  };

  return (
    <>
      <Helmet>
        <title>GEO Tools - Listicles, Wikipedia, BOFU, FAQs, Mentions | VenturePR</title>
        <meta name="description" content="Advanced GEO tools for AI visibility: listicle tracking, Wikipedia monitoring, BOFU content generator, FAQ optimizer, and brand mention alerts." />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                GEO Tools
              </h1>
              <p className="text-muted-foreground">
                Advanced tools to boost your AI visibility
              </p>
            </div>
            <Link href="/geo-signals">
              <Button className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700" data-testid="button-geo-signals">
                <Sparkles className="h-4 w-4 mr-2" />
                Google AI Signal Suite
              </Button>
            </Link>
          </div>

          {/* Google AI Signal Optimization Banner */}
          <Card className="mb-6 bg-gradient-to-r from-violet-900/20 to-purple-900/20 border-violet-600/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-violet-400" />
                    NEW: GEO Signal Optimization Suite
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    Optimize for Google's 7 AI ranking signals - Base Ranking, Gecko Score, Jetstream, BM25, PCTR, Freshness, and Boost/Bury rules
                  </p>
                </div>
                <Link href="/geo-signals">
                  <Button variant="outline" className="border-violet-600 text-violet-400 hover:bg-violet-600 hover:text-white" data-testid="button-open-signals">
                    Open Suite
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Brand Selector */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Select Brand</label>
                  <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                    <SelectTrigger data-testid="select-brand">
                      <SelectValue placeholder="Choose a brand to analyze" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name} - {brand.industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!brands.length && (
                  <Link href="/brands">
                    <Button data-testid="button-create-brand">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Brand
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          {selectedBrandId ? (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5 mb-6">
                <TabsTrigger value="listicles" className="flex items-center gap-2" data-testid="tab-listicles">
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">Listicles</span>
                </TabsTrigger>
                <TabsTrigger value="wikipedia" className="flex items-center gap-2" data-testid="tab-wikipedia">
                  <BookOpen className="h-4 w-4" />
                  <span className="hidden sm:inline">Wikipedia</span>
                </TabsTrigger>
                <TabsTrigger value="bofu" className="flex items-center gap-2" data-testid="tab-bofu">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">BOFU</span>
                </TabsTrigger>
                <TabsTrigger value="faqs" className="flex items-center gap-2" data-testid="tab-faqs">
                  <HelpCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">FAQs</span>
                </TabsTrigger>
                <TabsTrigger value="mentions" className="flex items-center gap-2" data-testid="tab-mentions">
                  <Bell className="h-4 w-4" />
                  <span className="hidden sm:inline">Mentions</span>
                </TabsTrigger>
              </TabsList>

              {/* LISTICLES TAB */}
              <TabsContent value="listicles">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <List className="h-5 w-5 text-purple-500" />
                            Listicle Tracker
                          </CardTitle>
                          <CardDescription>
                            Find "best of" articles across consumer, professional, and investor audiences where your brand should be listed
                          </CardDescription>
                        </div>
                        <Button
                          onClick={() => discoverListiclesMutation.mutate()}
                          disabled={discoverListiclesMutation.isPending}
                          data-testid="button-discover-listicles"
                        >
                          {discoverListiclesMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          Discover Opportunities
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>Why Listicles Matter:</strong> Getting included in "Best of" articles is how brands rank #1 on ChatGPT. 
                          AI systems heavily cite these curated lists.
                        </p>
                      </div>

                      {listicleOpportunities.length > 0 ? (
                        <div className="space-y-4">
                          <h3 className="font-semibold">Discovered Opportunities</h3>
                          {listicleOpportunities.map((opp: any, i: number) => (
                            <Card key={i} className="border-l-4 border-l-purple-500">
                              <CardContent className="pt-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h4 className="font-medium">{opp.title}</h4>
                                    <p className="text-sm text-muted-foreground mt-1">{opp.strategy}</p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      {opp.audienceType && (
                                        <Badge variant="outline" className={
                                          opp.audienceType === 'consumer' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                                          opp.audienceType === 'professional' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                          opp.audienceType === 'investor' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                          'bg-teal-50 text-teal-700 border-teal-200'
                                        }>
                                          {opp.audienceType === 'consumer' ? '🛒 Consumer' :
                                           opp.audienceType === 'professional' ? '💼 Professional' :
                                           opp.audienceType === 'investor' ? '📈 Investor' :
                                           '🤝 Partner'}
                                        </Badge>
                                      )}
                                      <Badge variant="outline">
                                        <Search className="h-3 w-3 mr-1" />
                                        {opp.searchVolume?.toLocaleString() || 'N/A'} mo/search
                                      </Badge>
                                      <Badge variant="outline">
                                        DA {opp.domainAuthority}+
                                      </Badge>
                                      <Badge className={opp.priorityScore >= 8 ? "bg-green-500" : opp.priorityScore >= 5 ? "bg-yellow-500" : "bg-gray-500"}>
                                        Priority: {opp.priorityScore}/10
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <List className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Click "Discover Opportunities" to find listicles for {selectedBrand?.name}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* WIKIPEDIA TAB */}
              <TabsContent value="wikipedia">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-blue-500" />
                            Wikipedia Monitor
                          </CardTitle>
                          <CardDescription>
                            Track & improve your Wikipedia presence (40% of AI citations)
                          </CardDescription>
                        </div>
                        <Button
                          onClick={() => scanWikipediaMutation.mutate()}
                          disabled={scanWikipediaMutation.isPending}
                          data-testid="button-scan-wikipedia"
                        >
                          {scanWikipediaMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4 mr-2" />
                          )}
                          Scan Opportunities
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-orange-50 dark:bg-orange-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-orange-700 dark:text-orange-300">
                          <strong>Wikipedia = 40% of AI Citations:</strong> It's the #2 most cited source by AI systems after Reddit.
                          Even a mention on a relevant Wikipedia page can significantly boost your AI visibility.
                        </p>
                      </div>

                      {wikiAnalysis?.analysis ? (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card>
                              <CardContent className="pt-4">
                                <div className="flex items-center gap-2 mb-2">
                                  {wikiAnalysis.analysis.hasDirectPage ? (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                  ) : (
                                    <XCircle className="h-5 w-5 text-yellow-500" />
                                  )}
                                  <span className="font-medium">Direct Wikipedia Page</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {wikiAnalysis.analysis.directPageEligibility}
                                </p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent className="pt-4">
                                <div className="text-2xl font-bold text-blue-600">
                                  {wikiAnalysis.analysis.relevantPages?.length || 0}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Relevant pages to target
                                </p>
                              </CardContent>
                            </Card>
                          </div>

                          {wikiAnalysis.analysis.relevantPages?.length > 0 && (
                            <div>
                              <h3 className="font-semibold mb-3">Target Pages</h3>
                              <div className="space-y-3">
                                {wikiAnalysis.analysis.relevantPages.map((page: any, i: number) => (
                                  <Card key={i}>
                                    <CardContent className="pt-4">
                                      <div className="flex items-start justify-between">
                                        <div>
                                          <a 
                                            href={page.pageUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                                          >
                                            {page.pageTitle}
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                          <p className="text-sm text-muted-foreground mt-1">
                                            Section: {page.sectionToTarget}
                                          </p>
                                          <p className="text-sm mt-2">{page.mentionStrategy}</p>
                                        </div>
                                        <Badge variant={page.difficulty === 'easy' ? 'default' : page.difficulty === 'medium' ? 'secondary' : 'destructive'}>
                                          {page.difficulty}
                                        </Badge>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </div>
                          )}

                          {wikiAnalysis.analysis.tips?.length > 0 && (
                            <div>
                              <h3 className="font-semibold mb-3">Tips</h3>
                              <ul className="space-y-2">
                                {wikiAnalysis.analysis.tips.map((tip: string, i: number) => (
                                  <li key={i} className="flex items-start gap-2 text-sm">
                                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                    {tip}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Click "Scan Opportunities" to analyze Wikipedia presence for {selectedBrand?.name}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* BOFU CONTENT TAB */}
              <TabsContent value="bofu">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-green-500" />
                        BOFU Content Generator
                      </CardTitle>
                      <CardDescription>
                        Generate bottom-of-funnel content: comparisons, alternatives, and transactional guides
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          <strong>80% BOFU Strategy:</strong> Comparison articles ("X vs Y") and alternatives guides convert 80% better 
                          and get cited heavily by AI systems for purchase decisions.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div>
                          <label className="text-sm font-medium mb-2 block">Content Type</label>
                          <Select value={bofuType} onValueChange={setBofuType}>
                            <SelectTrigger data-testid="select-bofu-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="comparison">X vs Y Comparison</SelectItem>
                              <SelectItem value="alternatives">Alternatives To</SelectItem>
                              <SelectItem value="guide">Buying Guide</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(bofuType === 'comparison' || bofuType === 'alternatives') && (
                          <div>
                            <label className="text-sm font-medium mb-2 block">
                              {bofuType === 'comparison' ? 'Compare With' : 'Alternatives To'}
                            </label>
                            <Input
                              placeholder="e.g., Competitor Name"
                              value={bofuCompetitor}
                              onChange={(e) => setBofuCompetitor(e.target.value)}
                              data-testid="input-bofu-competitor"
                            />
                          </div>
                        )}
                        {bofuType === 'guide' && (
                          <div>
                            <label className="text-sm font-medium mb-2 block">Target Keyword</label>
                            <Input
                              placeholder="e.g., PR agency guide"
                              value={bofuKeyword}
                              onChange={(e) => setBofuKeyword(e.target.value)}
                              data-testid="input-bofu-keyword"
                            />
                          </div>
                        )}
                        <div className="flex items-end">
                          <Button
                            onClick={() => generateBofuMutation.mutate({
                              contentType: bofuType,
                              comparedWith: bofuCompetitor ? [bofuCompetitor] : undefined,
                              keyword: bofuKeyword || undefined,
                            })}
                            disabled={generateBofuMutation.isPending}
                            className="w-full"
                            data-testid="button-generate-bofu"
                          >
                            {generateBofuMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-2" />
                            )}
                            Generate
                          </Button>
                        </div>
                      </div>

                      <Separator className="my-6" />

                      {bofuLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                        </div>
                      ) : (bofuData as any)?.data?.length > 0 ? (
                        <div className="space-y-4">
                          <h3 className="font-semibold">Generated Content</h3>
                          {(bofuData as any).data.map((content: BofuContent) => (
                            <Card key={content.id}>
                              <CardContent className="pt-4">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <Badge variant="outline" className="mb-2">{content.contentType}</Badge>
                                    <h4 className="font-medium">{content.title}</h4>
                                  </div>
                                  <Badge>{content.status}</Badge>
                                </div>
                                <ScrollArea className="h-40 mt-3">
                                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                    {content.content.substring(0, 500)}...
                                  </div>
                                </ScrollArea>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No BOFU content yet. Generate your first piece above!</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* FAQs TAB */}
              <TabsContent value="faqs">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-yellow-500" />
                        FAQ Optimizer
                      </CardTitle>
                      <CardDescription>
                        Generate AI-optimized FAQs that get surfaced by AI engines
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-yellow-50 dark:bg-yellow-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          <strong>FAQs = More Shots on Goal:</strong> AI engines frequently surface FAQ sections in responses.
                          Keep answers 40-60 words for optimal AI summarization.
                        </p>
                      </div>

                      <div className="flex gap-4 mb-6">
                        <div className="flex-1">
                          <Input
                            placeholder="Topic focus (optional, e.g., pricing, features)"
                            value={faqTopic}
                            onChange={(e) => setFaqTopic(e.target.value)}
                            data-testid="input-faq-topic"
                          />
                        </div>
                        <Button
                          onClick={() => generateFaqsMutation.mutate(faqTopic)}
                          disabled={generateFaqsMutation.isPending}
                          data-testid="button-generate-faqs"
                        >
                          {generateFaqsMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          Generate FAQs
                        </Button>
                      </div>

                      {faqsLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                        </div>
                      ) : (faqsData as any)?.data?.length > 0 ? (
                        <div className="space-y-4">
                          {(faqsData as any).data.map((faq: FaqItem) => (
                            <Card key={faq.id}>
                              <CardContent className="pt-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h4 className="font-medium text-blue-600">{faq.question}</h4>
                                    <p className="text-sm mt-2">{faq.answer}</p>
                                    <div className="flex gap-2 mt-3">
                                      <Badge variant="outline">{faq.category}</Badge>
                                      <Badge variant={faq.aiSurfaceScore && faq.aiSurfaceScore >= 70 ? 'default' : 'secondary'}>
                                        AI Score: {faq.aiSurfaceScore || 0}
                                      </Badge>
                                    </div>
                                  </div>
                                  {faq.isOptimized === 1 && (
                                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                                  )}
                                </div>
                                {faq.optimizationTips?.length ? (
                                  <div className="mt-3 pt-3 border-t">
                                    <p className="text-xs text-muted-foreground mb-1">Optimization Tips:</p>
                                    <ul className="text-xs space-y-1">
                                      {faq.optimizationTips.map((tip, i) => (
                                        <li key={i} className="flex items-start gap-1">
                                          <Target className="h-3 w-3 mt-0.5 text-yellow-500" />
                                          {tip}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No FAQs yet. Generate AI-optimized FAQs for {selectedBrand?.name}!</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* MENTIONS TAB */}
              <TabsContent value="mentions">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5 text-red-500" />
                        Brand Mention Tracker
                      </CardTitle>
                      <CardDescription>
                        Monitor brand mentions across Reddit, YouTube, Quora, and more
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-red-700 dark:text-red-300">
                          <strong>Track What AI Sees:</strong> Monitor how your brand is discussed on platforms that AI systems cite most.
                          Reddit (43%), YouTube, and Quora are the top sources.
                        </p>
                      </div>

                      {mentionsLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                        </div>
                      ) : (mentionsData as any)?.data ? (
                        <div className="space-y-6">
                          {/* Stats */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Card>
                              <CardContent className="pt-4">
                                <div className="text-2xl font-bold">{(mentionsData as any).data.stats.total}</div>
                                <p className="text-sm text-muted-foreground">Total Mentions</p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent className="pt-4">
                                <div className="text-2xl font-bold text-green-600">
                                  {(mentionsData as any).data.stats.bySentiment.positive}
                                </div>
                                <p className="text-sm text-muted-foreground">Positive</p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent className="pt-4">
                                <div className="text-2xl font-bold text-gray-600">
                                  {(mentionsData as any).data.stats.bySentiment.neutral}
                                </div>
                                <p className="text-sm text-muted-foreground">Neutral</p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent className="pt-4">
                                <div className="text-2xl font-bold text-red-600">
                                  {(mentionsData as any).data.stats.bySentiment.negative}
                                </div>
                                <p className="text-sm text-muted-foreground">Negative</p>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Platform breakdown */}
                          {Object.keys((mentionsData as any).data.stats.byPlatform).length > 0 && (
                            <div>
                              <h3 className="font-semibold mb-3">By Platform</h3>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries((mentionsData as any).data.stats.byPlatform).map(([platform, count]) => {
                                  const Icon = platformIcons[platform] || Globe;
                                  return (
                                    <Badge key={platform} variant="outline" className="flex items-center gap-1 py-1">
                                      <Icon className="h-3 w-3" />
                                      {platform}: {count as number}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Recent mentions */}
                          {(mentionsData as any).data.mentions?.length > 0 ? (
                            <div>
                              <h3 className="font-semibold mb-3">Recent Mentions</h3>
                              <div className="space-y-3">
                                {(mentionsData as any).data.mentions.slice(0, 10).map((mention: BrandMention) => {
                                  const Icon = platformIcons[mention.platform] || Globe;
                                  return (
                                    <Card key={mention.id}>
                                      <CardContent className="pt-4">
                                        <div className="flex items-start gap-3">
                                          <Icon className="h-5 w-5 mt-1 text-muted-foreground" />
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <a 
                                                href={mention.sourceUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="font-medium hover:underline flex items-center gap-1"
                                              >
                                                {mention.sourceTitle || 'View Source'}
                                                <ExternalLink className="h-3 w-3" />
                                              </a>
                                              <Badge variant={
                                                mention.sentiment === 'positive' ? 'default' :
                                                mention.sentiment === 'negative' ? 'destructive' : 'secondary'
                                              }>
                                                {mention.sentiment}
                                              </Badge>
                                            </div>
                                            {mention.mentionContext && (
                                              <p className="text-sm text-muted-foreground mt-1">
                                                "{mention.mentionContext}"
                                              </p>
                                            )}
                                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                              <span>{mention.platform}</span>
                                              {mention.engagementScore && (
                                                <span>Engagement: {mention.engagementScore}</span>
                                              )}
                                              {mention.authorUsername && (
                                                <span>by @{mention.authorUsername}</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p>No mentions tracked yet for {selectedBrand?.name}</p>
                              <p className="text-sm mt-2">Mentions will appear here as they're discovered</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Select a brand to view mentions</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Target className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold mb-2">Select a Brand to Get Started</h3>
                <p className="text-muted-foreground mb-4">
                  Choose a brand above or create one to access GEO tools
                </p>
                <Link href="/brands">
                  <Button data-testid="button-go-to-brands">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Brand
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
