// client/src/components/monitor/HeroKpiStrip.tsx
//
// The top KPI strip on the Visibility canvas. Three clickable KPIs that
// open the KpiDriverInspector. tnum + count-up — instrument numerics from
// E.1 design tokens.

import { useInspector } from "@/components/AppShell";
import VisibilityGauge from "@/components/dashboard/VisibilityGauge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUp, ArrowDown } from "lucide-react";
import KpiDriverInspector from "./inspectors/KpiDriverInspector";

type HeroData = {
  visibilityScore: number;
  visibilityDelta: number | null;
  citedChecks: number;
  totalChecks: number;
  citationRate: number;
  lastScanAt: string | null;
};

type Props = {
  brandId: string;
  heroData: HeroData | undefined;
  shareOfVoice: number | null;
  topCompetitorName: string | null;
  topCompetitorShare: number | null;
  isLoading: boolean;
};

export default function HeroKpiStrip({
  brandId,
  heroData,
  shareOfVoice,
  topCompetitorName,
  topCompetitorShare,
  isLoading,
}: Props) {
  const { open } = useInspector();

  function openDrivers(kind: "visibility_score" | "share_of_voice" | "citation_rate") {
    open({
      title:
        kind === "visibility_score"
          ? "Visibility drivers"
          : kind === "share_of_voice"
            ? "Share of voice drivers"
            : "Citation rate drivers",
      body: <KpiDriverInspector kind={kind} brandId={brandId} />,
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <button
          type="button"
          onClick={() => openDrivers("visibility_score")}
          data-testid="card-visibility-score"
          className="text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 w-full"
        >
          <CardContent className="p-5 flex flex-col items-center">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              AI Visibility Score
            </p>
            {isLoading ? (
              <Skeleton className="h-32 w-32 rounded-full mt-2" />
            ) : (
              <VisibilityGauge score={heroData?.visibilityScore ?? 0} size={140} />
            )}
            {heroData?.visibilityDelta != null && heroData.visibilityDelta !== 0 && (
              <DeltaChip value={heroData.visibilityDelta} />
            )}
          </CardContent>
        </button>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => openDrivers("share_of_voice")}
          data-testid="card-share-of-voice"
          className="text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 w-full"
        >
          <CardContent className="p-5 flex flex-col items-center">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Share of AI Voice
            </p>
            <div className="text-5xl font-bold mt-3 tabular-nums">
              {shareOfVoice ?? "—"}
              <span className="text-2xl text-muted-foreground font-semibold">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              of AI answers in your category mention you
            </p>
            {topCompetitorName && (
              <p className="text-xs text-muted-foreground mt-2">
                Top competitor · {topCompetitorName} ({topCompetitorShare}%)
              </p>
            )}
          </CardContent>
        </button>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => openDrivers("citation_rate")}
          data-testid="card-cited-total"
          className="text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 w-full"
        >
          <CardContent className="p-5 flex flex-col items-center">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Citation Rate
            </p>
            <div className="text-5xl font-bold mt-3 tabular-nums">
              {heroData?.citedChecks ?? 0}
              <span className="text-2xl text-muted-foreground font-semibold">
                {" "}
                / {heroData?.totalChecks ?? 0}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {heroData?.citationRate ?? 0}% citation rate
            </p>
            <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden mt-3">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${heroData?.citationRate ?? 0}%` }}
              />
            </div>
          </CardContent>
        </button>
      </Card>
    </div>
  );
}

function DeltaChip({ value }: { value: number }) {
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium mt-2 ${
        positive
          ? "bg-[var(--positive)]/10 text-[var(--positive)]"
          : "bg-destructive/10 text-destructive"
      }`}
    >
      {positive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {positive ? "+" : ""}
      {value} pts
    </span>
  );
}
