import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface LeaderboardEntry {
  name: string;
  domain: string;
  isOwn: boolean;
  totalCitations: number;
  platformBreakdown: Record<string, number>;
}

export default function CompetitorsTab({
  selectedBrandId: _selectedBrandId,
}: {
  selectedBrandId: string;
}) {
  const { toast } = useToast();

  const { data: competitorsData, isLoading: competitorsLoading } = useQuery<{
    success: boolean;
    data: Competitor[];
  }>({
    queryKey: ["/api/competitors"],
  });

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{
    success: boolean;
    data: LeaderboardEntry[];
    meta?: { totalTracked: number; withActivity: number };
  }>({
    queryKey: ["/api/competitors/leaderboard"],
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
      return apiRequest("POST", "/api/competitors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/leaderboard"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors/leaderboard"] });
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
          <h3 className="text-lg font-semibold">Competitor Tracking</h3>
          <p className="text-sm text-muted-foreground">
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
                <p className="text-xs text-muted-foreground">
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

      <div className="grid gap-6 md:grid-cols-3 mb-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Competitors Tracked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-competitor-count">
              {leaderboardMeta?.totalTracked ?? competitorsList.length}
            </div>
            {leaderboardMeta && (
              <div className="text-xs text-muted-foreground mt-1">
                {leaderboardMeta.withActivity} with activity in last 30d
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Leaderboard Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-leaderboard-count">
              {leaderboard.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your Ranking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary" data-testid="stat-your-rank">
              {leaderboard.findIndex((e) => e.isOwn) >= 0
                ? `#${leaderboard.findIndex((e) => e.isOwn) + 1}`
                : "—"}
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
                <p className="text-sm">
                  Add competitors to start comparing your AI visibility against theirs
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {competitorsList.map((comp) => (
                  <div
                    key={comp.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    data-testid={`competitor-item-${comp.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-medium truncate"
                        data-testid={`text-comp-name-${comp.id}`}
                      >
                        {comp.name}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        <span className="truncate">{comp.domain}</span>
                      </div>
                      {comp.industry && (
                        <Badge variant="outline" className="text-xs mt-1">
                          {comp.industry}
                        </Badge>
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
  );
}
