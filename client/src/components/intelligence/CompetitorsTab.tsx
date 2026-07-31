import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, Eye, Plus, Users, Trash2 } from "lucide-react";
import type { Competitor } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PanelLabel, NoValue } from "@/components/dashboard-panels/primitives";

interface LeaderboardEntry {
  name: string;
  domain: string;
  isOwn: boolean;
  totalCitations: number;
  platformBreakdown: Record<string, number>;
}

export default function CompetitorsTab({ selectedBrandId }: { selectedBrandId: string }) {
  const { toast } = useToast();

  // Wave 9.3: scope both queries to the active brand. Previously these
  // omitted brandId entirely, so the server's no-brand-id branch
  // aggregated leaderboards across every brand the user owned and
  // mixed multi-brand competitor lists into the panel - switching
  // brands didn't change what was rendered.
  const { data: competitorsData, isLoading: competitorsLoading } = useQuery<{
    success: boolean;
    data: Competitor[];
  }>({
    queryKey: ["/api/competitors", { brandId: selectedBrandId }],
    enabled: !!selectedBrandId,
  });

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{
    success: boolean;
    data: LeaderboardEntry[];
    meta?: { totalTracked: number; withActivity: number };
  }>({
    queryKey: ["/api/competitors/leaderboard", { brandId: selectedBrandId }],
    enabled: !!selectedBrandId,
  });

  const competitorsList = competitorsData?.data || [];
  const leaderboard = leaderboardData?.data || [];
  const leaderboardMeta = leaderboardData?.meta;

  const [isCompetitorDialogOpen, setIsCompetitorDialogOpen] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState({
    name: "",
    domain: "",
    industry: "",
    description: "",
  });

  const createCompetitorMutation = useMutation({
    mutationFn: async (data: typeof newCompetitor) => {
      return apiRequest("POST", "/api/competitors", { ...data, brandId: selectedBrandId });
    },
    onSuccess: () => {
      // Predicate-based invalidation matches every variant of the key
      // (with or without a brandId object segment).
      queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === "/api/competitors" ||
            q.queryKey[0] === "/api/competitors/leaderboard"),
      });
      setIsCompetitorDialogOpen(false);
      setNewCompetitor({ name: "", domain: "", industry: "", description: "" });
      toast({
        title: "Competitor Added",
        description: "You can now track and compare their AI citations.",
      });
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
      queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === "/api/competitors" ||
            q.queryKey[0] === "/api/competitors/leaderboard"),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-ui font-semibold">Competitor Tracking</h3>
          <p className="text-caption text-muted-foreground">
            Add competitors by name and domain to compare AI citation performance
          </p>
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
                <p className="text-caption text-muted-foreground">
                  Used to identify citations across AI platforms
                </p>
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
                  onChange={(e) =>
                    setNewCompetitor({ ...newCompetitor, description: e.target.value })
                  }
                  data-testid="input-competitor-notes"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCompetitorDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createCompetitorMutation.mutate(newCompetitor)}
                disabled={
                  !newCompetitor.name || !newCompetitor.domain || createCompetitorMutation.isPending
                }
                data-testid="button-submit-competitor"
              >
                {createCompetitorMutation.isPending ? "Adding..." : "Add Competitor"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 border border-vc-default sm:grid-cols-3 mb-4">
        <div className="border-b border-vc-default px-4 py-4 sm:border-b-0 sm:border-r">
          <PanelLabel>Competitors Tracked</PanelLabel>
          <div
            className="mt-2 text-stat font-semibold tabular-nums"
            data-testid="stat-competitor-count"
          >
            {leaderboardMeta?.totalTracked ?? competitorsList.length}
          </div>
          {leaderboardMeta && (
            <div className="text-caption text-muted-foreground mt-1">
              {leaderboardMeta.withActivity} with activity in last 30d
            </div>
          )}
        </div>
        <div className="border-b border-vc-default px-4 py-4 sm:border-b-0 sm:border-r">
          <PanelLabel>Leaderboard Entries</PanelLabel>
          <div
            className="mt-2 text-stat font-semibold tabular-nums"
            data-testid="stat-leaderboard-count"
          >
            {leaderboard.length}
          </div>
        </div>
        <div className="px-4 py-4">
          <PanelLabel>Your Ranking</PanelLabel>
          <div
            className="mt-2 text-stat font-semibold tabular-nums text-primary"
            data-testid="stat-your-rank"
          >
            {leaderboard.findIndex((e) => e.isOwn) >= 0 ? (
              `#${leaderboard.findIndex((e) => e.isOwn) + 1}`
            ) : (
              <NoValue />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border border-vc-default">
          <div className="border-b border-vc-default px-4 py-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-vc-tertiary" />
              <PanelLabel>Your Competitors</PanelLabel>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">
              Companies you're tracking for AI citation comparison
            </p>
          </div>
          {competitorsLoading ? (
            <div aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 border-b border-vc-default last:border-b-0"
                >
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                </div>
              ))}
            </div>
          ) : competitorsList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium mb-1">No competitors added yet</p>
              <p className="text-caption">
                Add competitors to start comparing your AI visibility against theirs
              </p>
            </div>
          ) : (
            <div>
              {competitorsList.map((comp) => (
                <div
                  key={comp.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-vc-default last:border-b-0 transition-colors hover:bg-vc-muted/50"
                  data-testid={`competitor-item-${comp.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" data-testid={`text-comp-name-${comp.id}`}>
                      {comp.name}
                    </div>
                    <div className="text-caption text-muted-foreground flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      <span className="truncate">{comp.domain}</span>
                    </div>
                    {comp.industry && (
                      <Badge variant="outline" className="text-caption mt-1">
                        {comp.industry}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteCompetitorMutation.mutate(comp.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    data-testid={`button-delete-comp-${comp.id}`}
                    aria-label={`Delete competitor ${comp.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-vc-default">
          <div className="border-b border-vc-default px-4 py-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-vc-tertiary" />
              <PanelLabel>Citation Leaderboard</PanelLabel>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">
              How you rank vs competitors across AI platforms
            </p>
          </div>
          {leaderboardLoading ? (
            <div aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 border-b border-vc-default last:border-b-0"
                >
                  <Skeleton className="h-6 w-8 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="text-right space-y-2">
                    <Skeleton className="h-5 w-10 ml-auto" />
                    <Skeleton className="h-3 w-14 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium mb-1">No leaderboard data</p>
              <p className="text-caption">Add competitors and record citations to see rankings</p>
            </div>
          ) : (
            <div>
              {leaderboard.map((entry, index) => (
                <div
                  key={`${entry.domain}-${index}`}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-vc-default last:border-b-0 transition-colors hover:bg-vc-muted/50 ${
                    entry.isOwn ? "bg-primary/5" : ""
                  }`}
                  data-testid={`leaderboard-entry-${index}`}
                >
                  <span className="text-ui font-semibold w-8 text-center tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{entry.name}</span>
                      {entry.isOwn && <Badge className="text-caption">You</Badge>}
                    </div>
                    <span className="text-caption text-muted-foreground">{entry.domain}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-page font-semibold tabular-nums">
                      {entry.totalCitations}
                    </div>
                    <div className="text-caption text-muted-foreground">citations</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
