// Canonical FAQ editor (spine: /act?tab=faq). The geo-tools FAQ tab was
// removed in favour of this one to end the duplication.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet-async";
import type { FaqItem } from "@shared/schema";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatusDot } from "@/components/foundations";
import {
  HelpCircle,
  Sparkles,
  Plus,
  Trash2,
  Code,
  CheckCircle,
  AlertTriangle,
  Target,
  TrendingUp,
  Loader2,
  Copy,
  RefreshCw,
  Edit,
  Save,
  X,
  Zap,
  FileText,
  Search,
  BookOpen,
} from "lucide-react";

export default function FaqManager() {
  const { toast } = useToast();
  const { selectedBrandId } = useBrandSelection();
  const [activeTab, setActiveTab] = useState("manage");
  const [generateTopic, setGenerateTopic] = useState("");
  const [generateCount, setGenerateCount] = useState("5");
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const {
    data: faqsData,
    isLoading: faqsLoading,
    isError: faqsIsError,
    isRefetching: faqsIsRefetching,
    refetch: refetchFaqs,
  } = useQuery<{ data: FaqItem[] }>({
    queryKey: [`/api/faqs?brandId=${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const faqs = faqsData?.data || [];
  const filteredFaqs =
    filterCategory === "all" ? faqs : faqs.filter((f) => f.category === filterCategory);

  const categories = Array.from(new Set(faqs.map((f) => f.category).filter(Boolean))) as string[];

  const generateFaqsMutation = useMutation({
    mutationFn: async (data: { topic: string; count: number }) => {
      const response = await apiRequest("POST", `/api/faqs/generate/${selectedBrandId}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "FAQs generated successfully!" });
      queryClient.invalidateQueries({ queryKey: [`/api/faqs?brandId=${selectedBrandId}`] });
      setGenerateTopic("");
    },
    onError: () => toast({ title: "Failed to generate FAQs", variant: "destructive" }),
  });

  const createFaqMutation = useMutation({
    mutationFn: async (data: { question: string; answer: string; category: string }) => {
      const response = await apiRequest("POST", "/api/faqs", {
        brandId: selectedBrandId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "FAQ created!" });
      queryClient.invalidateQueries({ queryKey: [`/api/faqs?brandId=${selectedBrandId}`] });
      setNewQuestion("");
      setNewAnswer("");
      setNewCategory("general");
    },
    onError: () => toast({ title: "Failed to create FAQ", variant: "destructive" }),
  });

  const updateFaqMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FaqItem> }) => {
      const response = await apiRequest("PATCH", `/api/faqs/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "FAQ updated!" });
      queryClient.invalidateQueries({ queryKey: [`/api/faqs?brandId=${selectedBrandId}`] });
      setEditingFaq(null);
    },
    onError: () => toast({ title: "Failed to update FAQ", variant: "destructive" }),
  });

  const deleteFaqMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/faqs/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "FAQ deleted!" });
      queryClient.invalidateQueries({ queryKey: [`/api/faqs?brandId=${selectedBrandId}`] });
    },
    onError: () => toast({ title: "Failed to delete FAQ", variant: "destructive" }),
  });

  const optimizeFaqMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/faqs/${id}/optimize`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "FAQ optimized for AI citation!" });
      queryClient.invalidateQueries({ queryKey: [`/api/faqs?brandId=${selectedBrandId}`] });
    },
    onError: () => toast({ title: "Failed to optimize FAQ", variant: "destructive" }),
  });

  const generateSchemaMarkup = () => {
    if (!faqs.length) return "";

    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    };

    return JSON.stringify(schema, null, 2);
  };

  const copySchemaToClipboard = () => {
    navigator.clipboard.writeText(generateSchemaMarkup());
    toast({ title: "Schema copied to clipboard!" });
  };

  const avgScore = faqs.length
    ? Math.round(faqs.reduce((sum, f) => sum + (f.aiSurfaceScore || 0), 0) / faqs.length)
    : 0;

  const optimizedCount = faqs.filter((f) => f.isOptimized === 1).length;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-chart-4";
    if (score >= 60) return "text-chart-3";
    return "text-red-500";
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  return (
    <>
      <Helmet>
        <title>FAQ Manager - VentureCite</title>
      </Helmet>
      <div className="space-y-8">
        {!selectedBrandId && (
          <Card data-testid="empty-state-no-brand">
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="font-medium text-muted-foreground">Select a brand to get started</p>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a brand above to create and manage AI-optimized FAQs
              </p>
            </CardContent>
          </Card>
        )}

        {selectedBrandId && (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total FAQs</p>
                      <p className="text-2xl font-bold" data-testid="text-total-faqs">
                        {faqs.length}
                      </p>
                    </div>
                    <HelpCircle className="h-8 w-8 text-chart-1 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg AI Score</p>
                      <p
                        className={`text-2xl font-bold ${getScoreColor(avgScore)}`}
                        data-testid="text-avg-score"
                      >
                        {avgScore}%
                      </p>
                    </div>
                    <Target className="h-8 w-8 text-chart-5 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Optimized</p>
                      <p
                        className="text-2xl font-bold text-chart-4"
                        data-testid="text-optimized-count"
                      >
                        {optimizedCount}/{faqs.length}
                      </p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-chart-4 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Categories</p>
                      <p className="text-2xl font-bold" data-testid="text-categories-count">
                        {categories.length}
                      </p>
                    </div>
                    <BookOpen className="h-8 w-8 text-chart-3 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger
                  value="manage"
                  className="flex items-center gap-2"
                  data-testid="tab-manage"
                >
                  <HelpCircle className="h-4 w-4" />
                  Manage FAQs
                </TabsTrigger>
                <TabsTrigger
                  value="generate"
                  className="flex items-center gap-2"
                  data-testid="tab-generate"
                >
                  <Sparkles className="h-4 w-4" />
                  AI Generate
                </TabsTrigger>
                <TabsTrigger
                  value="schema"
                  className="flex items-center gap-2"
                  data-testid="tab-schema"
                >
                  <Code className="h-4 w-4" />
                  Schema Markup
                </TabsTrigger>
                <TabsTrigger
                  value="optimize"
                  className="flex items-center gap-2"
                  data-testid="tab-optimize"
                >
                  <Zap className="h-4 w-4" />
                  Bulk Optimize
                </TabsTrigger>
              </TabsList>

              {/* MANAGE TAB */}
              <TabsContent value="manage">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Add New FAQ */}
                  <Card className="lg:col-span-1">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Add New FAQ
                      </CardTitle>
                      <CardDescription>Manually add a question and answer</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Question</label>
                        <Textarea
                          placeholder="What is your product/service?"
                          value={newQuestion}
                          onChange={(e) => setNewQuestion(e.target.value)}
                          rows={2}
                          data-testid="input-new-question"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Answer</label>
                        <Textarea
                          placeholder="Provide a comprehensive answer..."
                          value={newAnswer}
                          onChange={(e) => setNewAnswer(e.target.value)}
                          rows={4}
                          data-testid="input-new-answer"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Category</label>
                        <Select value={newCategory} onValueChange={setNewCategory}>
                          <SelectTrigger data-testid="select-new-category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="general">General</SelectItem>
                            <SelectItem value="pricing">Pricing</SelectItem>
                            <SelectItem value="features">Features</SelectItem>
                            <SelectItem value="support">Support</SelectItem>
                            <SelectItem value="getting-started">Getting Started</SelectItem>
                            <SelectItem value="comparison">Comparison</SelectItem>
                            <SelectItem value="technical">Technical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() =>
                          createFaqMutation.mutate({
                            question: newQuestion,
                            answer: newAnswer,
                            category: newCategory,
                          })
                        }
                        disabled={!newQuestion || !newAnswer || createFaqMutation.isPending}
                        className="w-full"
                        data-testid="button-create-faq"
                      >
                        {createFaqMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        Add FAQ
                      </Button>
                    </CardContent>
                  </Card>

                  {/* FAQ List */}
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Your FAQs</CardTitle>
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                          <SelectTrigger className="w-40" data-testid="select-filter-category">
                            <SelectValue placeholder="Filter by category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {faqsIsError ? (
                        <ErrorState
                          title="Couldn't load FAQs"
                          onRetry={() => refetchFaqs()}
                          isRetrying={faqsIsRefetching}
                        />
                      ) : faqsLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                        </div>
                      ) : filteredFaqs.length > 0 ? (
                        <ScrollArea className="h-[500px]">
                          <div className="space-y-4 pr-4">
                            {filteredFaqs.map((faq, faqIndex) => (
                              <Card
                                key={faq.id}
                                className="border-l border-border"
                                data-tour-id={faqIndex === 0 ? "faq.firstResult" : undefined}
                              >
                                <CardContent className="pt-4">
                                  <div className="flex items-start gap-2">
                                    <StatusDot
                                      tone={
                                        (faq.aiSurfaceScore || 0) >= 80
                                          ? "success"
                                          : (faq.aiSurfaceScore || 0) >= 60
                                            ? "warn"
                                            : "fail"
                                      }
                                      className="mt-2"
                                    />
                                    <div className="flex-1 min-w-0">
                                      {editingFaq?.id === faq.id ? (
                                        <div className="space-y-3">
                                          <Textarea
                                            value={editQuestion}
                                            onChange={(e) => setEditQuestion(e.target.value)}
                                            rows={2}
                                            data-testid={`input-edit-question-${faq.id}`}
                                          />
                                          <Textarea
                                            value={editAnswer}
                                            onChange={(e) => setEditAnswer(e.target.value)}
                                            rows={4}
                                            data-testid={`input-edit-answer-${faq.id}`}
                                          />
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              onClick={() =>
                                                updateFaqMutation.mutate({
                                                  id: faq.id,
                                                  data: {
                                                    question: editQuestion,
                                                    answer: editAnswer,
                                                  },
                                                })
                                              }
                                              disabled={updateFaqMutation.isPending}
                                              data-testid={`button-save-faq-${faq.id}`}
                                            >
                                              <Save className="h-4 w-4 mr-1" />
                                              Save
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => setEditingFaq(null)}
                                              data-testid={`button-cancel-edit-${faq.id}`}
                                            >
                                              <X className="h-4 w-4 mr-1" />
                                              Cancel
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex items-start justify-between mb-2">
                                            <h4
                                              className="font-medium text-chart-1 flex-1"
                                              data-testid={`text-faq-question-${faq.id}`}
                                            >
                                              {faq.question}
                                            </h4>
                                            <div className="flex gap-1 ml-2">
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-7 w-7"
                                                onClick={() => {
                                                  setEditingFaq(faq);
                                                  setEditQuestion(faq.question);
                                                  setEditAnswer(faq.answer);
                                                }}
                                                data-testid={`button-edit-faq-${faq.id}`}
                                              >
                                                <Edit className="h-4 w-4" />
                                              </Button>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-7 w-7"
                                                onClick={() => optimizeFaqMutation.mutate(faq.id)}
                                                disabled={optimizeFaqMutation.isPending}
                                                data-testid={`button-optimize-faq-${faq.id}`}
                                              >
                                                <Zap className="h-4 w-4" />
                                              </Button>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-7 w-7 text-destructive hover:text-destructive/80"
                                                onClick={() => deleteFaqMutation.mutate(faq.id)}
                                                data-testid={`button-delete-faq-${faq.id}`}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </div>
                                          <p
                                            className="text-sm text-muted-foreground mb-3"
                                            data-testid={`text-faq-answer-${faq.id}`}
                                          >
                                            {faq.answer}
                                          </p>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant="outline">
                                              {faq.category || "general"}
                                            </Badge>
                                            <Badge variant={getScoreBadge(faq.aiSurfaceScore || 0)}>
                                              AI Score: {faq.aiSurfaceScore || 0}%
                                            </Badge>
                                            {faq.isOptimized === 1 && (
                                              <Badge className="bg-chart-4">
                                                <CheckCircle className="h-3 w-3 mr-1" />
                                                Optimized
                                              </Badge>
                                            )}
                                          </div>
                                          {faq.optimizationTips &&
                                            faq.optimizationTips.length > 0 && (
                                              <div className="mt-3 p-2 bg-chart-3/10 rounded text-xs">
                                                <p className="font-medium text-chart-3 mb-1">
                                                  Optimization Tips:
                                                </p>
                                                <ul className="list-disc list-inside text-chart-3">
                                                  {faq.optimizationTips.map((tip, i) => (
                                                    <li key={i}>{tip}</li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </ScrollArea>
                      ) : (
                        <EmptyState
                          icon={HelpCircle}
                          title="No FAQs yet. Add one manually or use AI to generate."
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* GENERATE TAB */}
              <TabsContent value="generate">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-chart-5" />
                      AI FAQ Generator
                    </CardTitle>
                    <CardDescription>
                      Generate intelligent, citation-optimized FAQs based on your brand context
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Topic Focus (Optional)
                          </label>
                          <Input
                            placeholder="e.g., pricing, features, getting started, comparisons"
                            value={generateTopic}
                            onChange={(e) => setGenerateTopic(e.target.value)}
                            data-testid="input-generate-topic"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Leave empty to generate general FAQs based on brand context
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-2 block">Number of FAQs</label>
                          <Select value={generateCount} onValueChange={setGenerateCount}>
                            <SelectTrigger data-testid="select-generate-count">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="3">3 FAQs</SelectItem>
                              <SelectItem value="5">5 FAQs</SelectItem>
                              <SelectItem value="10">10 FAQs</SelectItem>
                              <SelectItem value="15">15 FAQs</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          onClick={() =>
                            generateFaqsMutation.mutate({
                              topic: generateTopic,
                              count: parseInt(generateCount),
                            })
                          }
                          disabled={generateFaqsMutation.isPending}
                          className="w-full bg-primary"
                          size="lg"
                          data-testid="button-generate-faqs"
                        >
                          {generateFaqsMutation.isPending ? (
                            <>
                              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-5 w-5 mr-2" />
                              Generate FAQs with AI
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="bg-muted rounded-lg p-4">
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          AI Optimization Features
                        </h4>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-chart-4 mt-0.5" />
                            <span>Questions formatted for AI extraction (clear, specific)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-chart-4 mt-0.5" />
                            <span>Answers optimized for 500-token chunk limits</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-chart-4 mt-0.5" />
                            <span>Structured for Schema.org FAQPage markup</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-chart-4 mt-0.5" />
                            <span>Brand context and tone integrated</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-chart-4 mt-0.5" />
                            <span>AI surface scoring for citation likelihood</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* SCHEMA TAB */}
              <TabsContent value="schema">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      FAQPage Schema Markup
                    </CardTitle>
                    <CardDescription>
                      Copy this structured data to help AI engines understand and cite your FAQs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {faqs.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-chart-4">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {faqs.length} FAQs included
                            </Badge>
                            <Badge variant="outline">Schema.org FAQPage</Badge>
                          </div>
                          <Button onClick={copySchemaToClipboard} data-testid="button-copy-schema">
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Schema
                          </Button>
                        </div>

                        <div className="bg-muted border border-border rounded-md p-4 overflow-x-auto">
                          <pre className="text-foreground text-sm font-mono">
                            <code>{generateSchemaMarkup()}</code>
                          </pre>
                        </div>

                        <div className="bg-chart-1/10 rounded-lg p-4">
                          <h4 className="font-medium text-chart-1 mb-2">How to Use This Schema</h4>
                          <ol className="list-decimal list-inside text-sm text-chart-1 space-y-1">
                            <li>Copy the JSON-LD schema above</li>
                            <li>
                              Add it to your webpage inside a &lt;script
                              type="application/ld+json"&gt; tag
                            </li>
                            <li>Place it in the &lt;head&gt; or end of &lt;body&gt; section</li>
                            <li>Test with Google's Rich Results Test tool</li>
                          </ol>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Add FAQs first to generate schema markup</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* BULK OPTIMIZE TAB */}
              <TabsContent value="optimize">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-chart-3" />
                      Bulk Optimization
                    </CardTitle>
                    <CardDescription>
                      Optimize all FAQs at once for better AI citation rates
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Optimization Stats */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-chart-4/10 border-chart-4/30">
                          <CardContent className="pt-4">
                            <div className="text-center">
                              <p className="text-sm text-chart-4">High Score (80+)</p>
                              <p className="text-3xl font-bold text-chart-4">
                                {faqs.filter((f) => (f.aiSurfaceScore || 0) >= 80).length}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-chart-3/10 border-chart-3/30">
                          <CardContent className="pt-4">
                            <div className="text-center">
                              <p className="text-sm text-chart-3">Medium Score (60-79)</p>
                              <p className="text-3xl font-bold text-chart-3">
                                {
                                  faqs.filter(
                                    (f) =>
                                      (f.aiSurfaceScore || 0) >= 60 && (f.aiSurfaceScore || 0) < 80,
                                  ).length
                                }
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-destructive/10 border-destructive/30">
                          <CardContent className="pt-4">
                            <div className="text-center">
                              <p className="text-sm text-destructive">Low Score (&lt;60)</p>
                              <p className="text-3xl font-bold text-destructive">
                                {faqs.filter((f) => (f.aiSurfaceScore || 0) < 60).length}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Low Score FAQs */}
                      <div>
                        <h4 className="font-medium mb-3 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-chart-3" />
                          FAQs Needing Optimization
                        </h4>
                        {faqs.filter((f) => (f.aiSurfaceScore || 0) < 80).length > 0 ? (
                          <div className="space-y-3">
                            {faqs
                              .filter((f) => (f.aiSurfaceScore || 0) < 80)
                              .sort((a, b) => (a.aiSurfaceScore || 0) - (b.aiSurfaceScore || 0))
                              .map((faq) => (
                                <div
                                  key={faq.id}
                                  className="flex items-center justify-between p-3 border rounded-lg"
                                >
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{faq.question}</p>
                                    <Badge
                                      variant={getScoreBadge(faq.aiSurfaceScore || 0)}
                                      className="mt-1"
                                    >
                                      Score: {faq.aiSurfaceScore || 0}%
                                    </Badge>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => optimizeFaqMutation.mutate(faq.id)}
                                    disabled={optimizeFaqMutation.isPending}
                                    data-testid={`button-bulk-optimize-${faq.id}`}
                                  >
                                    <Zap className="h-4 w-4 mr-1" />
                                    Optimize
                                  </Button>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-chart-4" />
                            <p>All FAQs are well-optimized!</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </>
  );
}
