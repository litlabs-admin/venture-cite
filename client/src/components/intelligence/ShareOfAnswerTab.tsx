import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Target,
  BarChart3,
  PieChart,
  Eye,
  MessageSquare,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import type { PromptPortfolio } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ShareOfAnswerTab({ selectedBrandId }: { selectedBrandId: string }) {
  const { toast } = useToast();

  const { data: shareOfAnswerStats } = useQuery<{
    success: boolean;
    data: any;
  }>({
    queryKey: [`/api/prompt-portfolio/stats/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: promptsData } = useQuery<{
    success: boolean;
    data: PromptPortfolio[];
  }>({
    queryKey: [`/api/prompt-portfolio?brandId=${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const prompts = promptsData?.data || [];
  const soaStats = shareOfAnswerStats?.data || {
    totalPrompts: 0,
    citedPrompts: 0,
    shareOfAnswer: 0,
    byCategory: {},
    byFunnel: {},
    byCompetitor: {},
    avgVolatility: 0,
    avgConsensus: 0,
    volatilityDistribution: { stable: 0, moderate: 0, volatile: 0 },
  };

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
        competitorSet: data.competitorSet
          ? data.competitorSet
              .split(",")
              .map((c: string) => c.trim())
              .filter((c: string) => c)
          : [],
        isBrandCited: data.isBrandCited ? 1 : 0,
      };
      return apiRequest("POST", "/api/prompt-portfolio", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-portfolio"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/prompt-portfolio/stats/${selectedBrandId}`],
      });
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
      toast({
        title: "Failed to create prompt",
        description: error.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  return (
    <>
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
            <div className="text-3xl font-bold">{Object.keys(soaStats.byCategory).length}</div>
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
            <CardDescription>Share-of-answer breakdown by intent type</CardDescription>
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
            <CardDescription>Performance across the buyer's journey</CardDescription>
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
            <CardDescription>Your share-of-answer vs competitors in shared prompts</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(soaStats.byCompetitor).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No competitor citation data yet. Run a citation check to populate head-to-head
                numbers — competitors only appear here after they&apos;re cited on at least one of
                your tracked prompts.
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(soaStats.byCompetitor).map(([competitor, data]: [string, any]) => (
                  <div key={competitor} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{competitor}</span>
                      <span
                        className={data.shareAgainst >= 50 ? "text-green-600" : "text-orange-600"}
                      >
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
                  {soaStats.avgVolatility <= 30
                    ? "🟢 Stable"
                    : soaStats.avgVolatility <= 60
                      ? "🟡 Moderate"
                      : "🔴 Volatile"}
                </p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold" data-testid="stat-consensus">
                  {soaStats.avgConsensus.toFixed(0)}%
                </div>
                <p className="text-xs text-muted-foreground">Avg Consensus</p>
                <p className="text-xs mt-1">
                  {soaStats.avgConsensus >= 70
                    ? "🟢 High"
                    : soaStats.avgConsensus >= 40
                      ? "🟡 Medium"
                      : "🔴 Low"}
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
            <CardDescription>All prompts being monitored for your brand</CardDescription>
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
                  <DialogDescription>Add a prompt to monitor across AI platforms</DialogDescription>
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
                      <Select
                        value={newPrompt.category}
                        onValueChange={(v) => setNewPrompt({ ...newPrompt, category: v })}
                      >
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
                      <Select
                        value={newPrompt.funnelStage}
                        onValueChange={(v) => setNewPrompt({ ...newPrompt, funnelStage: v })}
                      >
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
                      <Select
                        value={newPrompt.aiPlatform}
                        onValueChange={(v) => setNewPrompt({ ...newPrompt, aiPlatform: v })}
                      >
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
                      <p className="text-sm text-muted-foreground">
                        Was your brand mentioned in the AI response?
                      </p>
                    </div>
                    <Switch
                      checked={newPrompt.isBrandCited === 1}
                      onCheckedChange={(checked) =>
                        setNewPrompt({ ...newPrompt, isBrandCited: checked ? 1 : 0 })
                      }
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
                      <span className="w-12 text-right font-medium">
                        {newPrompt.shareOfAnswer}%
                      </span>
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
                      onChange={(e) =>
                        setNewPrompt({ ...newPrompt, competitorSet: e.target.value })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Answer Volatility (0-100)</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[newPrompt.answerVolatility]}
                          onValueChange={([v]) =>
                            setNewPrompt({ ...newPrompt, answerVolatility: v })
                          }
                          max={100}
                          step={5}
                          className="flex-1"
                        />
                        <span className="w-12 text-right font-medium">
                          {newPrompt.answerVolatility}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {newPrompt.answerVolatility <= 30
                          ? "🟢 Stable"
                          : newPrompt.answerVolatility <= 60
                            ? "🟡 Moderate"
                            : "🔴 Volatile"}
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
                        <span className="w-12 text-right font-medium">
                          {newPrompt.consensusScore}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {newPrompt.consensusScore >= 70
                          ? "🟢 High agreement"
                          : newPrompt.consensusScore >= 40
                            ? "🟡 Mixed"
                            : "🔴 Low agreement"}
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      if (!selectedBrandId) {
                        toast({
                          title: "Please select a brand first",
                          variant: "destructive",
                        });
                        return;
                      }
                      createPromptMutation.mutate(newPrompt);
                    }}
                    disabled={
                      !newPrompt.prompt || !selectedBrandId || createPromptMutation.isPending
                    }
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
                        <Select
                          value={newPrompt.category}
                          onValueChange={(v) => setNewPrompt({ ...newPrompt, category: v })}
                        >
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
                        <Select
                          value={newPrompt.funnelStage}
                          onValueChange={(v) => setNewPrompt({ ...newPrompt, funnelStage: v })}
                        >
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
                        <Select
                          value={newPrompt.aiPlatform}
                          onValueChange={(v) => setNewPrompt({ ...newPrompt, aiPlatform: v })}
                        >
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
                        <p className="text-sm text-muted-foreground">
                          Was your brand mentioned in the AI response?
                        </p>
                      </div>
                      <Switch
                        checked={newPrompt.isBrandCited === 1}
                        onCheckedChange={(checked) =>
                          setNewPrompt({ ...newPrompt, isBrandCited: checked ? 1 : 0 })
                        }
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
                        <span className="w-12 text-right font-medium">
                          {newPrompt.shareOfAnswer}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        How much of the answer featured your brand
                      </p>
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
                        onChange={(e) =>
                          setNewPrompt({ ...newPrompt, competitorSet: e.target.value })
                        }
                        data-testid="input-competitors"
                      />
                      <p className="text-xs text-muted-foreground">
                        Other brands mentioned in the same answer (for win rate tracking)
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Answer Volatility (0-100)</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[newPrompt.answerVolatility]}
                            onValueChange={([v]) =>
                              setNewPrompt({ ...newPrompt, answerVolatility: v })
                            }
                            max={100}
                            step={5}
                            className="flex-1"
                            data-testid="slider-volatility"
                          />
                          <span className="w-12 text-right font-medium">
                            {newPrompt.answerVolatility}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {newPrompt.answerVolatility <= 30
                            ? "🟢 Stable"
                            : newPrompt.answerVolatility <= 60
                              ? "🟡 Moderate"
                              : "🔴 Volatile"}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Consensus Score (0-100%)</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[newPrompt.consensusScore]}
                            onValueChange={([v]) =>
                              setNewPrompt({ ...newPrompt, consensusScore: v })
                            }
                            max={100}
                            step={5}
                            className="flex-1"
                            data-testid="slider-consensus"
                          />
                          <span className="w-12 text-right font-medium">
                            {newPrompt.consensusScore}%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {newPrompt.consensusScore >= 70
                            ? "🟢 High agreement"
                            : newPrompt.consensusScore >= 40
                              ? "🟡 Mixed"
                              : "🔴 Low agreement"}
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={() => {
                        if (!selectedBrandId) {
                          toast({
                            title: "Please select a brand first",
                            variant: "destructive",
                          });
                          return;
                        }
                        createPromptMutation.mutate(newPrompt);
                      }}
                      disabled={
                        !newPrompt.prompt || !selectedBrandId || createPromptMutation.isPending
                      }
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
                <div
                  key={prompt.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
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
    </>
  );
}
