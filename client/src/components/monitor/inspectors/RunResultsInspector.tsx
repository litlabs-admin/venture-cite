// client/src/components/monitor/inspectors/RunResultsInspector.tsx
//
// Inspector body shown when a user clicks a week on the TrendChart. Lists
// the citation runs that started within that ISO week so the user can see
// what drove the bucket's citation rate.
//
// Server-side filtering by date isn't available on /api/brand-prompts/:brandId/history
// (it just returns the most-recent N runs), so we fetch a generous window
// (200 — the route's hard cap) and filter to the week client-side. For the
// 8-week chart this is comfortably within the available history.

import { useQuery } from "@tanstack/react-query";

type CitationRunEntry = {
  id: string;
  brandId: string;
  totalChecks: number;
  totalCited: number;
  citationRate: number;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  status?: "pending" | "running" | "succeeded" | "failed" | "partial" | "cancelled";
};

export default function RunResultsInspector({
  brandId,
  weekStartIso,
}: {
  brandId: string;
  weekStartIso: string;
}) {
  const { data, isLoading } = useQuery<{ success: boolean; data: CitationRunEntry[] }>({
    queryKey: [`/api/brand-prompts/${brandId}/history`, { limit: 200 }],
    enabled: !!brandId,
  });

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  const weekStart = new Date(weekStartIso).getTime();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const allRuns = data?.data ?? [];
  const runs = allRuns.filter((r) => {
    const t = new Date(r.startedAt).getTime();
    return t >= weekStart && t < weekEnd;
  });

  return (
    <div className="space-y-4 p-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Runs that week</p>
        <h2 className="mt-1 text-lg font-semibold">
          Week of {new Date(weekStartIso).toLocaleDateString()}
        </h2>
      </header>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs in this window.</p>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => (
            <li key={r.id} className="rounded border border-border p-3">
              <div className="text-sm">{new Date(r.startedAt).toLocaleString()}</div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {r.totalCited ?? 0} / {r.totalChecks ?? 0} cited · {Math.round(r.citationRate ?? 0)}
                %
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
