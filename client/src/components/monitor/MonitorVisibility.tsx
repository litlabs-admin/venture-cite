// client/src/components/monitor/MonitorVisibility.tsx
//
// The /monitor canvas. Single scrollable surface composing the six sections
// (HeroKpiStrip, TrendChart, ByEngineSection, CompetitorsSection,
// TrackedPromptsSection, MentionsSection) plus the adaptive Add ▾ button.
//
// Replaces monitor-overview.tsx + citations.tsx + competitors.tsx +
// TrendsTab + MentionsScanner. Task 16 wires this as the single panel
// behind pages/monitor.tsx.
//
// Integration decision (Task 15): the CompetitorsSection's "Add competitor"
// header button requires an `onAdd` callback. Rather than refactor MonitorAdd
// to expose an imperative open, we lift a tiny local Dialog state into this
// canvas — same form as MonitorAdd's inline AddCompetitorForm, kept here so
// this task touches only the one new file. Both entry points invalidate
// the same query keys so the leaderboard refreshes either way.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useVisibilityQueries } from "@/lib/monitorQueries";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Brain, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import HeroKpiStrip from "./HeroKpiStrip";
import TrendChart from "./TrendChart";
import ByEngineSection from "./ByEngineSection";
import CompetitorsSection from "./CompetitorsSection";
import TrackedPromptsSection from "./TrackedPromptsSection";
import MentionsSection from "./MentionsSection";
import MonitorAdd from "./MonitorAdd";

export default function MonitorVisibility() {
  const { selectedBrandId, brands, isLoading: brandsLoading } = useBrandSelection();
  const v = useVisibilityQueries(selectedBrandId || null);
  const [competitorDialogOpen, setCompetitorDialogOpen] = useState(false);

  // Narrowing: useDashboardQueries types `visibilityDelta` as `number` but
  // HeroKpiStrip's HeroData prop expects `number | null`. The data is
  // structurally identical, so cast through unknown to satisfy the prop.
  const heroData = v.hero.data?.data as
    | {
        visibilityScore: number;
        visibilityDelta: number | null;
        citedChecks: number;
        totalChecks: number;
        citationRate: number;
        lastScanAt: string | null;
      }
    | undefined;

  // ByEngineSection's PlatformRow uses `avgRank` while the dashboard
  // PlatformRanking shape uses `rank`. Cast through unknown — ByEngineSection
  // only reads citedCount/totalCount/latestSnippet so the field-name gap is
  // harmless for current rendering.
  const platforms = (v.rankings.data?.data?.platforms ?? []) as unknown as {
    aiPlatform: string;
    citedCount: number;
    totalCount: number;
    avgRank: number | null;
    latestSnippet?: string | null;
  }[];
  const trendWeeks = v.trend.data?.data?.weeks ?? [];

  // Leaderboard rows from /api/competitors/leaderboard don't include an
  // `id` or `discoveredBy` field — those are only present on the
  // /api/competitors response. CompetitorsSection's typed contract names
  // both fields, so we cast through unknown and let the existing row
  // rendering (which already guards on `discoveredBy`) handle the gap.
  const leaderboardRowsRaw = v.leaderboard.data?.data ?? [];
  const ownRow = leaderboardRowsRaw.find((e) => e.isOwn);
  const ownShareOfVoice = ownRow ? Math.round(ownRow.shareOfVoice) : null;
  const topCompetitor = leaderboardRowsRaw
    .filter((e) => !e.isOwn)
    .sort((a, b) => b.shareOfVoice - a.shareOfVoice)[0];
  const leaderboardRows = leaderboardRowsRaw as unknown as {
    id: string;
    name: string;
    shareOfVoice: number;
    isOwn: boolean;
    discoveredBy?: string;
  }[];

  if (brandsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (brands.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="Create a brand to get started"
        description="Set up your first brand to see your AI visibility data."
        action={{ label: "Create brand", href: "/setup?tab=brands", onClick: () => {} }}
      />
    );
  }
  if (!selectedBrandId) {
    return (
      <EmptyState
        icon={Brain}
        title="Select a brand"
        description="Pick a brand from the selector above to see its visibility data."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <MonitorAdd brandId={selectedBrandId} />
      </div>

      {v.activeRuns.length > 0 && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>Citation run in progress…</AlertDescription>
        </Alert>
      )}

      <HeroKpiStrip
        brandId={selectedBrandId}
        heroData={heroData}
        shareOfVoice={ownShareOfVoice}
        topCompetitorName={topCompetitor?.name ?? null}
        topCompetitorShare={topCompetitor ? Math.round(topCompetitor.shareOfVoice) : null}
        isLoading={v.hero.isLoading}
      />

      <TrendChart brandId={selectedBrandId} weeks={trendWeeks} isLoading={v.trend.isLoading} />

      <ByEngineSection
        brandId={selectedBrandId}
        platforms={platforms}
        isLoading={v.rankings.isLoading}
      />

      <CompetitorsSection
        rows={leaderboardRows}
        isLoading={v.leaderboard.isLoading}
        onAdd={() => setCompetitorDialogOpen(true)}
      />

      <TrackedPromptsSection brandId={selectedBrandId} />

      <MentionsSection brandId={selectedBrandId} />

      <Dialog open={competitorDialogOpen} onOpenChange={(o) => setCompetitorDialogOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add competitor</DialogTitle>
          </DialogHeader>
          <AddCompetitorForm
            brandId={selectedBrandId}
            onDone={() => setCompetitorDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Inline competitor-add form mirroring MonitorAdd's AddCompetitorForm.
// Lives here so MonitorVisibility can serve the section-header "Add
// competitor" button without modifying MonitorAdd or any other file.
// Invalidates the same query keys so the leaderboard refreshes regardless
// of which entry point the user came from.
function AddCompetitorForm({ brandId, onDone }: { brandId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => apiRequest("POST", `/api/competitors`, { brandId, name, domain }),
    onSuccess: () => {
      toast({ title: "Competitor added" });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", brandId] });
      queryClient.invalidateQueries({
        queryKey: [`/api/competitors/leaderboard?brandId=${brandId}`],
      });
      setName("");
      setDomain("");
      onDone();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not add competitor",
        description: err.message,
        variant: "destructive",
      }),
  });
  return (
    <div className="space-y-3">
      <Label htmlFor="monitor-visibility-add-competitor-name">Name</Label>
      <Input
        id="monitor-visibility-add-competitor-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Acme PR Agency"
        data-testid="monitor-visibility-add-competitor-name"
      />
      <Label htmlFor="monitor-visibility-add-competitor-domain">Website domain</Label>
      <Input
        id="monitor-visibility-add-competitor-domain"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="e.g. acmepr.com"
        data-testid="monitor-visibility-add-competitor-domain"
      />
      <Button
        onClick={() => create.mutate()}
        disabled={!name.trim() || !domain.trim() || create.isPending}
        data-testid="monitor-visibility-add-competitor-submit"
      >
        {create.isPending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}
