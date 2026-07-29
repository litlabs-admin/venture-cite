import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Award,
  Brain,
  ChevronDown,
  Crown,
  ExternalLink,
  EyeOff,
  Medal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useCitationLiveRefresh } from "@/hooks/useCitationLiveRefresh";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { BsOpenai } from "react-icons/bs";
import { SiClaude, SiPerplexity, SiGooglegemini } from "react-icons/si";
import type { ComponentType, SVGProps } from "react";
import type { Competitor } from "@shared/schema";
import { AI_PLATFORMS } from "@shared/constants";

const platformIcon: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  chatgpt: BsOpenai,
  claude: SiClaude,
  perplexity: SiPerplexity,
  gemini: SiGooglegemini,
  deepseek: Brain,
};

interface LeaderboardEntry {
  name: string;
  domain: string;
  isOwn: boolean;
  totalCitations: number;
  platformBreakdown: Record<string, number>;
}

export default function CompetitorsPage() {
  const { toast } = useToast();
  const { selectedBrandId, brands, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    domain: "",
    industry: "",
    description: "",
    nameVariations: "",
  });
  const [newCompetitor, setNewCompetitor] = useState({
    name: "",
    domain: "",
    industry: "",
    description: "",
  });

  // Poll the competitors list for up to 2 minutes after the user creates
  // their first brand — async discovery runs server-side on brand-create
  // and the UI has no other signal when it finishes.
  const selectedBrandAgeMs = selectedBrand?.createdAt
    ? Date.now() - new Date(selectedBrand.createdAt).getTime()
    : Infinity;
  const shouldPollForDiscovery = selectedBrandAgeMs < 120_000;

  // Wave 9: live-refresh during citation runs. Hook returns the cadence we
  // thread directly into useQuery. Competitor list also has a discovery
  // poll (3s) for new brands; we take the faster of the two when both are
  // active.
  const { refetchInterval: liveInterval } = useCitationLiveRefresh(selectedBrandId, [
    ["/api/competitors", selectedBrandId],
    ["/api/competitors/leaderboard", selectedBrandId],
  ]);

  const {
    data: competitorsData,
    isLoading: isLoadingCompetitors,
    isError: competitorsIsError,
    isRefetching: competitorsIsRefetching,
    refetch: refetchCompetitors,
  } = useQuery<{
    success: boolean;
    data: Competitor[];
  }>({
    queryKey: ["/api/competitors", selectedBrandId],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/competitors?brandId=${encodeURIComponent(selectedBrandId!)}`,
      );
      return response.json();
    },
    enabled: !!selectedBrandId,
    refetchInterval: (query) => {
      const rows = (query.state.data as { data?: Competitor[] } | undefined)?.data;
      const discoveryInterval =
        rows && rows.length > 0 ? false : shouldPollForDiscovery ? 3000 : false;
      // Take the fastest active interval (smaller is faster).
      if (discoveryInterval && liveInterval) return Math.min(discoveryInterval, liveInterval);
      return discoveryInterval || liveInterval;
    },
  });

  const {
    data: leaderboardData,
    isLoading: isLoadingLeaderboard,
    isError: leaderboardIsError,
    isRefetching: leaderboardIsRefetching,
    refetch: refetchLeaderboard,
  } = useQuery<{
    success: boolean;
    data: LeaderboardEntry[];
  }>({
    queryKey: ["/api/competitors/leaderboard", selectedBrandId],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/competitors/leaderboard?brandId=${encodeURIComponent(selectedBrandId!)}`,
      );
      return response.json();
    },
    enabled: !!selectedBrandId,
    refetchInterval: liveInterval,
  });

  const createCompetitorMutation = useMutation({
    mutationFn: async (data: typeof newCompetitor) => {
      return apiRequest("POST", "/api/competitors", { ...data, brandId: selectedBrandId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", selectedBrandId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/competitors/leaderboard", selectedBrandId],
      });
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
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", selectedBrandId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/competitors/leaderboard", selectedBrandId],
      });
      toast({
        title: "Competitor Removed",
        description: "Competitor has been removed from tracking.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove competitor", variant: "destructive" });
    },
  });

  const updateCompetitorMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      return apiRequest("PATCH", `/api/competitors/${id}`, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", selectedBrandId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/competitors/leaderboard", selectedBrandId],
      });
      setEditingCompetitor(null);
      toast({ title: "Competitor updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update competitor", variant: "destructive" });
    },
  });

  // Permanent tombstone — cron won't re-insert this competitor if it comes
  // back up in LLM inference or citation mining. Use when the competitor
  // is a false positive (generic word, fictional company, etc.).
  const ignoreCompetitorMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/competitors/${id}/ignore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", selectedBrandId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/competitors/leaderboard", selectedBrandId],
      });
      toast({
        title: "Competitor Ignored",
        description: "We won't re-discover this competitor in automated scans.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to ignore competitor", variant: "destructive" });
    },
  });

  // Re-run server-side discovery on demand (the brand's auto-discovery only
  // fires once on create). The endpoint upserts, so it never duplicates; we
  // report how many genuinely new rows landed by diffing the returned list.
  const rediscoverMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/competitors/discover/${encodeURIComponent(selectedBrandId!)}`,
      );
      return (await response.json()) as {
        success: boolean;
        data?: { inserted: number; competitors: Competitor[] };
      };
    },
    onSuccess: (result) => {
      const before = competitorsData?.data?.length ?? 0;
      const after = result?.data?.competitors?.length ?? before;
      const added = Math.max(0, after - before);
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", selectedBrandId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/competitors/leaderboard", selectedBrandId],
      });
      toast({
        title: added > 0 ? `Added ${added} new competitor${added === 1 ? "" : "s"}` : "Up to date",
        description:
          added > 0
            ? "Freshly discovered competitors are now in your tracking list."
            : "We rescanned but found no new competitors to add.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to re-discover competitors. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Promote / demote between the curated core set and the discovered pool.
  const setTierMutation = useMutation({
    mutationFn: async ({ id, tier }: { id: string; tier: "core" | "discovered" }) =>
      apiRequest("PATCH", `/api/competitors/${id}`, { tier }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", selectedBrandId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/competitors/leaderboard", selectedBrandId],
      });
      toast({ title: vars.tier === "core" ? "Promoted to core" : "Moved to discovered" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update competitor", variant: "destructive" });
    },
  });

  const competitors = competitorsData?.data || [];
  const leaderboard = leaderboardData?.data || [];

  // Phase 6: curated core set vs the broader discovered pool, ranked by the
  // relevance score discovery assigns. tier defaults to "discovered".
  const coreCompetitors = competitors.filter((c) => c.tier === "core");
  const discoveredCompetitors = competitors
    .filter((c) => c.tier !== "core")
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

  const openEdit = (competitor: Competitor) => {
    setEditingCompetitor(competitor);
    setEditForm({
      name: competitor.name || "",
      domain: competitor.domain || "",
      industry: competitor.industry || "",
      description: competitor.description || "",
      nameVariations: Array.isArray(competitor.nameVariations)
        ? competitor.nameVariations.join(", ")
        : "",
    });
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="w-5 h-5 text-warning" />;
    if (index === 1) return <Award className="w-5 h-5 text-muted-foreground" />;
    if (index === 2) return <Medal className="w-5 h-5 text-warning" />;
    return (
      <span className="w-5 h-5 flex items-center justify-center text-caption font-medium text-muted-foreground">
        #{index + 1}
      </span>
    );
  };

  return (
    // Only ever rendered client-side, as a lazy tab inside
    // client/src/pages/monitor.tsx (no route of its own) — title/meta
    // removed per this task's blanket rule; /monitor falls back to root
    // defaults.
    <div className="space-y-8">
      {/* Competitors/leaderboard are scoped to a single brand */}
      {(brandsLoading || brands.length === 0) && (
        <Card>
          <CardContent className="pt-6">
            {brandsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <p className="text-muted-foreground text-caption">
                Create a brand first to start tracking competitors.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogTrigger asChild>
          <span className="hidden" />
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
                onChange={(e) =>
                  setNewCompetitor({ ...newCompetitor, description: e.target.value })
                }
                data-testid="input-competitor-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createCompetitorMutation.mutate(newCompetitor)}
              disabled={
                !newCompetitor.name || !newCompetitor.domain || createCompetitorMutation.isPending
              }
              data-testid="button-submit-competitor"
            >
              {createCompetitorMutation.isPending ? "Adding..." : "Add Competitor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!selectedBrandId ? null : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-warning" />
                      GEO Leaderboard
                    </CardTitle>
                    <CardDescription>
                      See how your brand stacks up against competitors in AI citations
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rediscoverMutation.mutate()}
                      disabled={rediscoverMutation.isPending}
                      title="Re-run AI discovery to find competitors you may be missing"
                      data-testid="button-rediscover-competitors"
                    >
                      <RefreshCw
                        className={`w-4 h-4 mr-2 ${rediscoverMutation.isPending ? "animate-spin" : ""}`}
                      />
                      {rediscoverMutation.isPending ? "Scanning..." : "Re-discover"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setIsAddDialogOpen(true)}
                      data-testid="button-add-competitor"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Competitor
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {leaderboardIsError ? (
                  <ErrorState
                    title="Couldn't load leaderboard"
                    onRetry={() => refetchLeaderboard()}
                    isRetrying={leaderboardIsRefetching}
                  />
                ) : isLoadingLeaderboard ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">No competitors yet</p>
                    <p className="text-caption">
                      Add a competitor to start benchmarking your AI citations.
                    </p>
                    <Button
                      className="mt-4"
                      size="sm"
                      onClick={() => setIsAddDialogOpen(true)}
                      data-testid="button-leaderboard-empty-add"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add your first competitor
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {leaderboard.map((entry, index) => (
                      <div
                        key={`${entry.domain}-${index}`}
                        className={`flex items-center gap-4 p-3 rounded-lg border ${
                          entry.isOwn ? "bg-primary/5 border-primary/20" : "bg-muted/50"
                        }`}
                        data-testid={`leaderboard-entry-${index}`}
                      >
                        <div className="shrink-0">{getRankIcon(index)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-caption font-semibold truncate"
                              data-testid={`text-competitor-name-${index}`}
                            >
                              {entry.name}
                            </span>
                            {entry.isOwn && (
                              <Badge variant="default" className="text-caption">
                                Your Brand
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-body text-muted-foreground">
                            <ExternalLink className="w-3 h-3" />
                            <span className="truncate">{entry.domain}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className="text-metric font-semibold font-mono tabular-nums"
                            data-testid={`text-citation-count-${index}`}
                          >
                            {entry.totalCitations}
                          </div>
                          <div className="text-caption text-muted-foreground">citations</div>
                        </div>
                        <div className="hidden md:flex flex-wrap gap-1 max-w-[200px]">
                          {Object.entries(entry.platformBreakdown)
                            .slice(0, 3)
                            .map(([platform, count]) => (
                              <Badge key={platform} variant="outline" className="text-caption">
                                {platform}: {count}
                              </Badge>
                            ))}
                          {Object.keys(entry.platformBreakdown).length > 3 && (
                            <Badge variant="outline" className="text-caption">
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
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  Platform Breakdown
                </CardTitle>
                <CardDescription>Citations by AI platform for top performers</CardDescription>
              </CardHeader>
              <CardContent>
                {leaderboard.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-caption">Add data to see platform breakdown</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {AI_PLATFORMS.map((platform) => {
                      const platformData = leaderboard
                        .filter((entry) => entry.platformBreakdown[platform])
                        .sort(
                          (a, b) =>
                            (b.platformBreakdown[platform] || 0) -
                            (a.platformBreakdown[platform] || 0),
                        )
                        .slice(0, 3);

                      if (platformData.length === 0) return null;

                      const Icon = platformIcon[platform.toLowerCase()] ?? Brain;
                      return (
                        <div key={platform} className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className="w-4 h-4" />
                            <span className="font-medium text-caption">{platform}</span>
                          </div>
                          <div className="space-y-1">
                            {platformData.map((entry, idx) => (
                              <div key={entry.domain} className="flex justify-between text-caption">
                                <span
                                  className={
                                    entry.isOwn
                                      ? "font-medium text-primary"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {idx + 1}. {entry.name}
                                </span>
                                <span className="font-medium">
                                  {entry.platformBreakdown[platform]}
                                </span>
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
                  — the leaderboard above adds your brand as its own row.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {competitorsIsError ? (
                  <ErrorState
                    title="Couldn't load competitors"
                    onRetry={() => refetchCompetitors()}
                    isRetrying={competitorsIsRefetching}
                  />
                ) : isLoadingCompetitors ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full rounded-lg" />
                    <Skeleton className="h-12 w-full rounded-lg" />
                  </div>
                ) : competitors.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-caption">No competitors added yet</p>
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
                  <Tabs
                    defaultValue={
                      coreCompetitors.length === 0 && discoveredCompetitors.length > 0
                        ? "discovered"
                        : "core"
                    }
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="core" data-testid="tab-core-competitors">
                        Core ({coreCompetitors.length})
                      </TabsTrigger>
                      <TabsTrigger value="discovered" data-testid="tab-discovered-competitors">
                        Discovered ({discoveredCompetitors.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="core" className="space-y-3">
                      <p className="text-caption text-muted-foreground">
                        The competitors you track most closely. Add them by hand or promote one from
                        the discovered pool.
                      </p>
                      {coreCompetitors.length === 0 ? (
                        <p className="py-6 text-center text-caption text-muted-foreground">
                          No core competitors yet. Add one above, or promote a discovered
                          competitor.
                        </p>
                      ) : (
                        coreCompetitors.map((competitor) => (
                          <CompetitorRow
                            key={competitor.id}
                            competitor={competitor}
                            onEdit={openEdit}
                            onDelete={(id) => deleteCompetitorMutation.mutate(id)}
                            onIgnore={(id) => ignoreCompetitorMutation.mutate(id)}
                            onSetTier={(id, tier) => setTierMutation.mutate({ id, tier })}
                            tierBusy={setTierMutation.isPending}
                          />
                        ))
                      )}
                    </TabsContent>

                    <TabsContent value="discovered" className="space-y-3">
                      <p className="text-caption text-muted-foreground">
                        Competitors AI discovery surfaced, ranked by relevance. Promote the ones
                        that matter, ignore the false positives.
                      </p>
                      {discoveredCompetitors.length === 0 ? (
                        <p className="py-6 text-center text-caption text-muted-foreground">
                          Nothing in the discovered pool. Run Re-discover to surface more.
                        </p>
                      ) : (
                        discoveredCompetitors.map((competitor) => (
                          <CompetitorRow
                            key={competitor.id}
                            competitor={competitor}
                            onEdit={openEdit}
                            onDelete={(id) => deleteCompetitorMutation.mutate(id)}
                            onIgnore={(id) => ignoreCompetitorMutation.mutate(id)}
                            onSetTier={(id, tier) => setTierMutation.mutate({ id, tier })}
                            tierBusy={setTierMutation.isPending}
                          />
                        ))
                      )}
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog
        open={editingCompetitor !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCompetitor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Competitor</DialogTitle>
            <DialogDescription>
              Update the competitor's details and name variations. Variations are extra surface
              forms the detector should treat as this competitor (former names, nicknames, common
              misspellings). Legal suffixes (Inc., LLC) and the website domain are handled
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Company Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                data-testid="input-edit-competitor-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-domain">Website Domain</Label>
              <Input
                id="edit-domain"
                value={editForm.domain}
                onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })}
                data-testid="input-edit-competitor-domain"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-industry">Industry</Label>
              <Input
                id="edit-industry"
                value={editForm.industry}
                onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                data-testid="input-edit-competitor-industry"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                data-testid="input-edit-competitor-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name-variations">Name Variations</Label>
              <Input
                id="edit-name-variations"
                placeholder="e.g., Acme Industries, Acme Labs"
                value={editForm.nameVariations}
                onChange={(e) => setEditForm({ ...editForm, nameVariations: e.target.value })}
                data-testid="input-edit-competitor-variations"
              />
              <p className="text-caption text-muted-foreground">
                Comma-separated. New variants are auto-added when AI responses mention this
                competitor under a new surface form.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingCompetitor(null)}
              data-testid="button-cancel-edit-competitor"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editingCompetitor) return;
                updateCompetitorMutation.mutate({
                  id: editingCompetitor.id,
                  patch: {
                    name: editForm.name,
                    domain: editForm.domain,
                    industry: editForm.industry,
                    description: editForm.description,
                    nameVariations: editForm.nameVariations,
                  },
                });
              }}
              disabled={!editForm.name.trim() || updateCompetitorMutation.isPending}
              data-testid="button-save-edit-competitor"
            >
              {updateCompetitorMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// One tracked-competitor row. Expands to a citation drill-down (which AI
// platforms cite this competitor, and how often) lazily loaded on open, and
// exposes promote/demote between the core set and the discovered pool.
function CompetitorRow({
  competitor,
  onEdit,
  onDelete,
  onIgnore,
  onSetTier,
  tierBusy,
}: {
  competitor: Competitor;
  onEdit: (competitor: Competitor) => void;
  onDelete: (id: string) => void;
  onIgnore: (id: string) => void;
  onSetTier: (id: string, tier: "core" | "discovered") => void;
  tierBusy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCore = competitor.tier === "core";
  const discoveredBy = competitor.discoveredBy;
  const relevanceScore = competitor.relevanceScore;

  const {
    data: citationsData,
    isLoading: citationsLoading,
    isError: citationsIsError,
  } = useQuery<{
    success: boolean;
    data: { platform: string; count: number }[];
  }>({
    queryKey: ["/api/competitors", competitor.id, "latest-citations"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/competitors/${competitor.id}/latest-citations`);
      return res.json();
    },
    enabled: expanded,
    staleTime: 60_000,
  });
  const citations = citationsData?.data ?? [];

  return (
    <div className="rounded-lg border bg-muted/30" data-testid={`competitor-card-${competitor.id}`}>
      <div className="flex items-center justify-between gap-2 p-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
          data-testid={`button-expand-competitor-${competitor.id}`}
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <span className="truncate">{competitor.name}</span>
              {!isCore && typeof relevanceScore === "number" && (
                <Badge
                  variant="outline"
                  className="h-4 shrink-0 px-1.5 py-0 text-label"
                  data-testid={`badge-relevance-${competitor.id}`}
                >
                  {relevanceScore}% match
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-caption text-muted-foreground">
              <ExternalLink className="h-3 w-3" />
              <span className="truncate">{competitor.domain}</span>
            </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {isCore ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetTier(competitor.id, "discovered")}
              disabled={tierBusy}
              title="Move to the discovered pool"
              data-testid={`button-demote-competitor-${competitor.id}`}
            >
              <ArrowDownCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetTier(competitor.id, "core")}
              disabled={tierBusy}
              title="Promote to core competitors"
              data-testid={`button-promote-competitor-${competitor.id}`}
            >
              <ArrowUpCircle className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(competitor)}
            title="Edit competitor"
            data-testid={`button-edit-competitor-${competitor.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {discoveredBy && discoveredBy !== "manual" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onIgnore(competitor.id)}
              className="text-muted-foreground hover:text-foreground"
              title="Mark as false positive, won't be re-discovered"
              data-testid={`button-ignore-competitor-${competitor.id}`}
            >
              <EyeOff className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(competitor.id)}
            className="text-destructive hover:text-destructive"
            title="Remove from tracking"
            data-testid={`button-delete-competitor-${competitor.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 py-3">
          {citationsLoading ? (
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-md" />
            </div>
          ) : citationsIsError ? (
            <p className="text-caption text-muted-foreground">
              Couldn&apos;t load citation data. Expand again to retry.
            </p>
          ) : citations.length === 0 ? (
            <p className="text-caption text-muted-foreground">
              No citations recorded yet. Once a citation scan runs, the AI platforms that cite{" "}
              {competitor.name} show up here.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-caption font-medium text-muted-foreground">
                Where they&apos;re cited
              </p>
              <div className="flex flex-wrap gap-2">
                {citations.map(({ platform, count }) => {
                  const Icon = platformIcon[platform.toLowerCase()] ?? Brain;
                  return (
                    <div
                      key={platform}
                      className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-caption"
                      data-testid={`citation-${competitor.id}-${platform}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="capitalize">{platform}</span>
                      <span className="font-mono font-medium tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
