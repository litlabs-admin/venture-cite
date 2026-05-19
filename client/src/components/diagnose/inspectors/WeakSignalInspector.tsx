import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

export default function WeakSignalInspector({ signalRunId }: { signalRunId: string }) {
  const { data } = useQuery({
    queryKey: [`/api/geo-signal-runs/${signalRunId}`],
    enabled: !!signalRunId,
  });
  const run = (data as any)?.data;
  if (!run) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">GEO signal</p>
        <h2 className="text-lg font-semibold mt-1">{run.overallScore}/100 overall</h2>
      </header>

      <section className="space-y-2">
        {(run.signals ?? []).map((s: any) => (
          <div key={s.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {s.score}/{s.maxScore ?? 100}
              </span>
            </div>
            <Progress value={(s.score / (s.maxScore ?? 100)) * 100} className="h-1.5" />
            {s.recommendations?.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5 pt-1">
                {s.recommendations.slice(0, 3).map((r: string, i: number) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
