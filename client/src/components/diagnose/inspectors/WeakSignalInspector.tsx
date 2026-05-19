import { Progress } from "@/components/ui/progress";
import type { GeoSignalRun } from "@shared/schema";

// Per-signal sub-shape — the run row stores a JSON payload that includes
// the per-dimension breakdown the UI iterates over.
interface SignalEntry {
  label: string;
  score: number;
  maxScore?: number;
  recommendations?: string[];
}

// Accept the full geo_signal_runs row from the server aggregator
// (server/lib/diagnoseIssues.ts puts it in `Issue.metadata.run`).
// The legacy `/api/geo-signal-runs/:id` endpoint never existed.
export default function WeakSignalInspector({
  run,
}: {
  run: GeoSignalRun & {
    // Older callers passed a denormalized shape with `signals` at top level.
    signals?: SignalEntry[];
  };
}) {
  if (!run) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  // Signals may live at run.signals (old) or run.payload.signals (canonical).
  const payload = (run.payload as { signals?: SignalEntry[] } | null | undefined) ?? null;
  const signals: SignalEntry[] = run.signals ?? payload?.signals ?? [];

  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">GEO signal</p>
        <h2 className="text-lg font-semibold mt-1">{run.overallScore ?? 0}/100 overall</h2>
      </header>

      <section className="space-y-2">
        {signals.map((s) => (
          <div key={s.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {s.score}/{s.maxScore ?? 100}
              </span>
            </div>
            <Progress value={(s.score / (s.maxScore ?? 100)) * 100} className="h-1.5" />
            {s.recommendations && s.recommendations.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5 pt-1">
                {s.recommendations.slice(0, 3).map((r, i) => (
                  <li key={i}>{`• ${r}`}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
