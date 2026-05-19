// client/src/components/monitor/inspectors/CompetitorInspector.tsx
//
// Drill-down for a competitor. Replaces /competitors page row actions.
//
// Notes on adaptation from the spec:
// - GET /api/competitors/:id returns the competitor row (name, domain,
//   discoveredBy, ...) but NOT shareOfVoice — SoV is computed at the
//   leaderboard level. We accept it as a prop from the parent section.
// - The schema field is `domain`, not `website`.
// - The server does NOT accept `PATCH ... {status:"ignored"}` — the ignore
//   path is a dedicated POST /api/competitors/:id/ignore endpoint.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Competitor {
  id: string;
  name: string;
  domain?: string | null;
  discoveredBy?: string;
}

export default function CompetitorInspector({
  competitorId,
  shareOfVoice,
}: {
  competitorId: string;
  shareOfVoice?: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: [`/api/competitors/${competitorId}`],
    enabled: !!competitorId,
  });
  const competitor = (data as { data?: Competitor } | undefined)?.data;

  const ignore = useMutation({
    mutationFn: () => apiRequest("POST", `/api/competitors/${competitorId}/ignore`),
    onSuccess: () => {
      toast({ title: "Competitor ignored" });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
    },
  });
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/competitors/${competitorId}`),
    onSuccess: () => {
      toast({ title: "Competitor removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
    },
  });

  if (!competitor) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Competitor</p>
        <h2 className="text-lg font-semibold mt-1">{competitor.name}</h2>
        {competitor.domain && (
          <p className="text-xs text-muted-foreground mt-0.5">{competitor.domain}</p>
        )}
      </header>

      <section>
        <p className="text-sm font-medium">Share of voice</p>
        <p className="text-3xl tabular-nums mt-1">{Math.round(shareOfVoice ?? 0)}%</p>
      </section>

      {competitor.discoveredBy && competitor.discoveredBy !== "manual" && (
        <p className="text-xs text-muted-foreground italic">
          Auto-discovered by {competitor.discoveredBy}
        </p>
      )}

      <footer className="flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => ignore.mutate()}
          disabled={ignore.isPending}
        >
          Ignore
        </Button>
        <Button variant="outline" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>
          Remove
        </Button>
      </footer>
    </div>
  );
}
