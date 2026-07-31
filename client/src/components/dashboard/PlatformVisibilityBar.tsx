import type { PlatformRanking } from "./PlatformRankingCard";

export default function PlatformVisibilityBar({ platform }: { platform: PlatformRanking }) {
  // visibilityScore is 0..100 (server/routes/dashboard.ts) - the bar width
  // IS the score, no rescale. Previously this divided by 10 first, which
  // assumed a 0..10 scale the server no longer emits.
  const pct = Math.round(platform.visibilityScore);
  const tone =
    platform.strengthLabel === "Strong"
      ? "bg-positive"
      : platform.strengthLabel === "Moderate"
        ? "bg-warning"
        : "bg-destructive";
  const toneText =
    platform.strengthLabel === "Strong"
      ? "text-positive"
      : platform.strengthLabel === "Moderate"
        ? "text-warning"
        : "text-destructive";

  return (
    <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 py-2.5">
      <span className="text-caption text-muted-foreground text-right truncate">
        {platform.aiPlatform}
      </span>
      <div>
        <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={`h-full rounded-full ${tone}`}
            style={{ width: `${Math.max(4, pct)}%`, transition: "width 600ms ease" }}
          />
        </div>
      </div>
      <div className="text-right whitespace-nowrap">
        <span className="font-semibold text-foreground text-caption">
          {platform.visibilityScore}
        </span>
        <span className={`ml-2 text-data ${toneText}`}>· {platform.strengthLabel}</span>
      </div>
    </div>
  );
}
