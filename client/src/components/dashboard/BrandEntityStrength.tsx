// Citation Health card — replaces the older BrandEntityStrength
// ("Entity Strength" + 4 arbitrary subscores). One transparent formula:
//   score = round(100 × cite_rate × rank_factor)
// where rank_factor scales from 1.0 (rank 1) to 0 (rank ≥ 11).
//
// Shown on the dashboard in place of the old Entity Strength pill.

export interface EntityStrengthData {
  score: number;
  label: "Weak" | "Moderate" | "Strong";
  citeRatePct: number;
  avgRank: number | null;
  totalChecks: number;
  citedCount: number;
}

export default function BrandEntityStrength({ data }: { data: EntityStrengthData }) {
  const tone =
    data.label === "Strong"
      ? "text-emerald-400"
      : data.label === "Moderate"
        ? "text-amber-400"
        : "text-destructive";

  const explainer =
    data.totalChecks === 0
      ? "Run a citation check to compute citation health."
      : `${data.citedCount} of ${data.totalChecks} checks cited your brand` +
        (data.avgRank !== null ? ` · avg rank #${data.avgRank}` : "");

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <span className="text-4xl font-bold text-foreground leading-none">{data.score}</span>
        <span className="text-xs text-muted-foreground mb-1">/ 100</span>
        <span className={`ml-auto text-sm font-medium ${tone} mb-1`}>{data.label}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(4, data.score)}%`, transition: "width 600ms ease" }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Weak</span>
        <span>Strong</span>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
        <div>
          <div className="text-xs text-muted-foreground">Citation rate</div>
          <div className="text-xl font-semibold text-foreground">{data.citeRatePct}%</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Avg rank</div>
          <div className="text-xl font-semibold text-foreground">
            {data.avgRank !== null ? `#${data.avgRank}` : "—"}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{explainer}</p>
    </div>
  );
}
