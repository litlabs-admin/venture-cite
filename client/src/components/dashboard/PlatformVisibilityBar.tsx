import type { PlatformRanking } from "./PlatformRankingCard";

export default function PlatformVisibilityBar({ platform }: { platform: PlatformRanking }) {
  const pct = Math.round((platform.visibilityScore / 10) * 100);
  const tone =
    platform.strengthLabel === "Strong"
      ? "bg-emerald-500"
      : platform.strengthLabel === "Moderate"
        ? "bg-amber-500"
        : "bg-destructive";
  const toneText =
    platform.strengthLabel === "Strong"
      ? "text-emerald-400"
      : platform.strengthLabel === "Moderate"
        ? "text-amber-400"
        : "text-destructive";

  return (
    <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 py-2.5">
      <span className="text-sm text-muted-foreground text-right truncate">
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
        <span className="font-semibold text-foreground text-sm">{platform.visibilityScore}</span>
        <span className={`ml-2 text-[11px] ${toneText}`}>· {platform.strengthLabel}</span>
      </div>
    </div>
  );
}
