// client/src/components/monitor/CompetitorsSection.tsx
//
// Competitor leaderboard card for the Monitor surface. Each row opens the
// shell Inspector with a CompetitorInspector drill-down. The "Add" button
// is delegated to the parent so it can wire its own dialog/flow.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronRight, Plus } from "lucide-react";
import { useInspector } from "@/components/AppShell";
import CompetitorInspector from "./inspectors/CompetitorInspector";

type LeaderboardRow = {
  id: string;
  name: string;
  shareOfVoice: number;
  isOwn: boolean;
  discoveredBy?: string;
};

export default function CompetitorsSection({
  rows,
  isLoading,
  onAdd,
}: {
  rows: LeaderboardRow[];
  isLoading: boolean;
  onAdd: () => void;
}) {
  const { open } = useInspector();

  function openCompetitor(row: LeaderboardRow) {
    open({
      title: row.name,
      body: <CompetitorInspector competitorId={row.id} shareOfVoice={row.shareOfVoice} />,
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Competitors</CardTitle>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add competitor
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 my-2" />)
          : rows
              .filter((r) => !r.isOwn)
              .map((r) => (
                <button
                  key={r.id}
                  onClick={() => openCompetitor(r)}
                  className="w-full py-3 flex items-center justify-between text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">{r.name}</div>
                    {r.discoveredBy && r.discoveredBy !== "manual" && (
                      <div className="text-xs text-muted-foreground mt-0.5 italic">
                        auto-discovered
                      </div>
                    )}
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground mr-3">
                    {Math.round(r.shareOfVoice)}%
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
      </CardContent>
    </Card>
  );
}
