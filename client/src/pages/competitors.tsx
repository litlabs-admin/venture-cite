import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Trophy, TrendingUp, Users, Trash2, ExternalLink, Crown, Award, Medal } from "lucide-react";
import { SiOpenai } from "react-icons/si";
import type { Competitor, Brand } from "@shared/schema";

const AI_PLATFORMS = [
  "ChatGPT",
  "Claude",
  "Grok",
  "Perplexity",
  "Google AI",
  "Gemini",
  "Microsoft Copilot",
  "Meta AI",
  "DeepSeek"
];

interface LeaderboardEntry {
  name: string;
  domain: string;
  isOwn: boolean;
  totalCitations: number;
  platformBreakdown: Record<string, number>;
}

export default function CompetitorsPage() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSnapshotDialogOpen, setIsSnapshotDialogOpen] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [newCompetitor, setNewCompetitor] = useState({ name: "", domain: "", industry: "", description: "" });
  const [newSnapshot, setNewSnapshot] = useState({ aiPlatform: "", citationCount: 0 });

  const { data: competitorsData, isLoading: isLoadingCompetitors } = useQuery<{ success: boolean; data: Competitor[] }>({
    queryKey: ["/api/competitors"],
  });

  const { data: brandsData } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const { data: leaderboardData, isLoading: isLoadingLeaderboard } = useQuery<{ success: boolean; data: LeaderboardEntry[] }>({
    queryKey: ["/api/competitors/leaderboard"],
  });

  const createCompetitorMutation = useMutation({
    mutationFn: async (data: typeof newCompetitor) => {
      return apiRequest("POST", "/api/competitors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/leaderboard"] });
      setIsAddDialogOpen(false);
      setNewCompetitor({ name: "", domain: "", industry: "", description: "" });
      toast({ title: "Competitor Added", description: "You can now track their AI citations." });
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

  const createSnapshotMutation = useMutation({
    mutationFn: async (data: { competitorId: string; aiPlatform: string; citationCount: number }) => {
      return apiRequest("POST", `/api/competitors/${data.competitorId}/snapshots`, {
        aiPlatform: data.aiPlatform,
        citationCount: data.citationCount,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/leaderboard"] });
      setIsSnapshotDialogOpen(false);
      setSelectedCompetitor(null);
      setNewSnapshot({ aiPlatform: "", citationCount: 0 });
      toast({ title: "Citation Recorded", description: "Competitor citation count has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record citation", variant: "destructive" });
    },
  });

  const competitors = competitorsData?.data || [];
  const brands = brandsData?.data || [];
  const leaderboard = leaderboardData?.data || [];

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Award className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Medal className="w-5 h-5 text-orange-400" />;
    return <span className="w-5 h-5 flex items-center justify-center text-sm font-medium text-muted-foreground">#{index + 1}</span>;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Helmet>
        <title>Competitor Intelligence | GEO Platform</title>
        <meta name="description" content="Track and compare AI citations for your brand vs competitors across ChatGPT, Claude, Grok, and other AI platforms." />
      </Helmet>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Competitor Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Track how your brand ranks against competitors in AI platform citations
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
                Track a competitor's AI citations to benchmark your GEO performance.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Acme PR Agency"
                  value={newCompetitor.name}
                  onChange={(e) => setNewCompetitor({ ...newCompetitor, name: e.target.value })}
                  data-testid="input-competitor-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Website Domain</Label>
                <Input
                  id="domain"
                  placeholder="e.g., acmepr.com"
                  value={newCompetitor.domain}
                  onChange={(e) => setNewCompetitor({ ...newCompetitor, domain: e.target.value })}
                  data-testid="input-competitor-domain"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  placeholder="e.g., PR & Communications"
                  value={newCompetitor.industry}
                  onChange={(e) => setNewCompetitor({ ...newCompetitor, industry: e.target.value })}
                  data-testid="input-competitor-industry"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Notes (optional)</Label>
                <Input
                  id="description"
                  placeholder="Any notes about this competitor"
                  value={newCompetitor.description}
                  onChange={(e) => setNewCompetitor({ ...newCompetitor, description: e.target.value })}
                  data-testid="input-competitor-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createCompetitorMutation.mutate(newCompetitor)}
                disabled={!newCompetitor.name || !newCompetitor.domain || createCompetitorMutation.isPending}
                data-testid="button-submit-competitor"
              >
                {createCompetitorMutation.isPending ? "Adding..." : "Add Competitor"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                GEO Leaderboard
              </CardTitle>
              <CardDescription>
                See how your brand stacks up against competitors in AI citations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLeaderboard ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No data yet</p>
                  <p className="text-sm">Add competitors and record their citations to see the leaderboard</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {leaderboard.map((entry, index) => (
                    <div
                      key={`${entry.domain}-${index}`}
                      className={`flex items-center gap-4 p-4 rounded-lg border ${
                        entry.isOwn ? "bg-primary/5 border-primary/20" : "bg-muted/50"
                      }`}
                      data-testid={`leaderboard-entry-${index}`}
                    >
                      <div className="flex-shrink-0">{getRankIcon(index)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold truncate" data-testid={`text-competitor-name-${index}`}>
                            {entry.name}
                          </span>
                          {entry.isOwn && (
                            <Badge variant="default" className="text-xs">Your Brand</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <ExternalLink className="w-3 h-3" />
                          <span className="truncate">{entry.domain}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold" data-testid={`text-citation-count-${index}`}>
                          {entry.totalCitations}
                        </div>
                        <div className="text-xs text-muted-foreground">citations</div>
                      </div>
                      <div className="hidden md:flex flex-wrap gap-1 max-w-[200px]">
                        {Object.entries(entry.platformBreakdown).slice(0, 3).map(([platform, count]) => (
                          <Badge key={platform} variant="outline" className="text-xs">
                            {platform}: {count}
                          </Badge>
                        ))}
                        {Object.keys(entry.platformBreakdown).length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{Object.keys(entry.platformBreakdown).length - 3} more
                          </Badge>
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
                <TrendingUp className="w-5 h-5 text-green-500" />
                Platform Breakdown
              </CardTitle>
              <CardDescription>
                Citations by AI platform for top performers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Add data to see platform breakdown</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {AI_PLATFORMS.map((platform) => {
                    const platformData = leaderboard
                      .filter((entry) => entry.platformBreakdown[platform])
                      .sort((a, b) => (b.platformBreakdown[platform] || 0) - (a.platformBreakdown[platform] || 0))
                      .slice(0, 3);

                    if (platformData.length === 0) return null;

                    return (
                      <div key={platform} className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                          <SiOpenai className="w-4 h-4" />
                          <span className="font-medium text-sm">{platform}</span>
                        </div>
                        <div className="space-y-1">
                          {platformData.map((entry, idx) => (
                            <div key={entry.domain} className="flex justify-between text-xs">
                              <span className={entry.isOwn ? "font-medium text-primary" : "text-muted-foreground"}>
                                {idx + 1}. {entry.name}
                              </span>
                              <span className="font-medium">{entry.platformBreakdown[platform]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Tracked Competitors
              </CardTitle>
              <CardDescription>
                {competitors.length} competitor{competitors.length !== 1 ? "s" : ""} being tracked
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingCompetitors ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : competitors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No competitors added yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setIsAddDialogOpen(true)}
                    data-testid="button-add-first-competitor"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Your First
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {competitors.map((competitor) => (
                    <div
                      key={competitor.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      data-testid={`competitor-card-${competitor.id}`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{competitor.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" />
                          {competitor.domain}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedCompetitor(competitor);
                            setIsSnapshotDialogOpen(true);
                          }}
                          data-testid={`button-add-citation-${competitor.id}`}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteCompetitorMutation.mutate(competitor.id)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-competitor-${competitor.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Brands</CardTitle>
              <CardDescription>
                Your brands are automatically included in the leaderboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              {brands.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">No brands created yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {brands.map((brand) => (
                    <div
                      key={brand.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20"
                    >
                      <Badge variant="default" className="text-xs">Own</Badge>
                      <span className="font-medium text-sm truncate">{brand.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isSnapshotDialogOpen} onOpenChange={setIsSnapshotDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Citation Count</DialogTitle>
            <DialogDescription>
              Add a citation count for {selectedCompetitor?.name} on an AI platform
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>AI Platform</Label>
              <Select
                value={newSnapshot.aiPlatform}
                onValueChange={(value) => setNewSnapshot({ ...newSnapshot, aiPlatform: value })}
              >
                <SelectTrigger data-testid="select-snapshot-platform">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {AI_PLATFORMS.map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="citationCount">Number of Citations</Label>
              <Input
                id="citationCount"
                type="number"
                min="0"
                placeholder="e.g., 25"
                value={newSnapshot.citationCount || ""}
                onChange={(e) => setNewSnapshot({ ...newSnapshot, citationCount: parseInt(e.target.value) || 0 })}
                data-testid="input-citation-count"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (selectedCompetitor) {
                  createSnapshotMutation.mutate({
                    competitorId: selectedCompetitor.id,
                    aiPlatform: newSnapshot.aiPlatform,
                    citationCount: newSnapshot.citationCount,
                  });
                }
              }}
              disabled={!newSnapshot.aiPlatform || createSnapshotMutation.isPending}
              data-testid="button-submit-snapshot"
            >
              {createSnapshotMutation.isPending ? "Saving..." : "Save Citation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
