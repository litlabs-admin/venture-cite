// client/src/components/monitor/inspectors/KpiDriverInspector.tsx
//
// Body of the Inspector opened when the user clicks one of the three hero
// KPIs on the Visibility canvas. Shows the drivers behind that number:
// which engines moved, which prompts changed, top regressions.
// Real data only — no fabricated deltas.

import { useQuery } from "@tanstack/react-query";

type KpiKind = "visibility_score" | "share_of_voice" | "citation_rate";

export default function KpiDriverInspector({ kind, brandId }: { kind: KpiKind; brandId: string }) {
  const rankings = useQuery({
    queryKey: [`/api/dashboard/rankings/${brandId}`],
    enabled: !!brandId,
  });
  const entity = useQuery({
    queryKey: [`/api/dashboard/entity-strength/${brandId}`],
    enabled: !!brandId,
  });

  const platforms = (rankings.data as any)?.data?.platforms ?? [];
  const top = platforms
    .slice()
    .sort((a: any, b: any) => (b.citedCount ?? 0) - (a.citedCount ?? 0))[0];
  const worst = platforms
    .slice()
    .sort((a: any, b: any) => (a.citedCount ?? 0) - (b.citedCount ?? 0))[0];

  return (
    <div className="space-y-4 p-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{labelFor(kind)}</p>
        <h2 className="text-lg font-semibold mt-1">What's behind this number</h2>
      </header>

      <section className="space-y-2">
        <p className="text-sm font-medium">By engine</p>
        {platforms.map((p: any) => (
          <div key={p.aiPlatform} className="flex justify-between text-sm">
            <span>{p.aiPlatform}</span>
            <span className="tabular-nums text-muted-foreground">
              {p.citedCount}/{p.totalCount} · avg rank {p.rank ?? "—"}
            </span>
          </div>
        ))}
      </section>

      {kind === "visibility_score" && entity.data ? (
        <section className="space-y-2">
          <p className="text-sm font-medium">Drivers</p>
          <Driver
            label="Citation rate"
            value={`${(entity.data as any)?.data?.citeRatePct ?? 0}%`}
          />
          <Driver label="Avg rank" value={String((entity.data as any)?.data?.avgRank ?? "—")} />
          {(entity.data as any)?.data?.label ? (
            <Driver label="Status" value={String((entity.data as any).data.label)} />
          ) : null}
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Strongest: {top?.aiPlatform ?? "—"} · Weakest: {worst?.aiPlatform ?? "—"}
      </p>
    </div>
  );
}

function Driver({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function labelFor(k: KpiKind): string {
  return k === "visibility_score"
    ? "AI Visibility Score"
    : k === "share_of_voice"
      ? "Share of AI Voice"
      : "Citation Rate";
}
