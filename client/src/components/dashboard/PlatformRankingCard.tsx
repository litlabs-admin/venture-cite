import { StatusDot, type StatusDotTone } from "@/components/foundations";
import SafeMarkdown from "@/components/SafeMarkdown";
import { stripTrackingParams } from "@/lib/stripTrackingParams";

export interface PlatformRanking {
  aiPlatform: string;
  isLive: boolean;
  rank: number | null;
  citedCount: number;
  totalCount: number;
  visibilityScore: number;
  strengthLabel: "Weak" | "Moderate" | "Strong";
  latestSnippet: string | null;
  latestSnippetPrompt: string | null;
  // True when the snippet came from a cited row; false when we fell back
  // to a not-cited row because no citations exist for this platform yet.
  // Drives the green vs red pill on the card.
  isCitedSnippet: boolean;
}

export default function PlatformRankingCard({
  platform,
  hasMeasured,
}: {
  platform: PlatformRanking;
  hasMeasured: boolean;
}) {
  const found = platform.citedCount > 0;
  const showDestructive = hasMeasured && !found;
  const rankTone = found
    ? "text-positive"
    : showDestructive
      ? "text-destructive"
      : "text-muted-foreground";
  const statusTone: StatusDotTone = platform.isCitedSnippet
    ? "success"
    : showDestructive
      ? "fail"
      : "pending";
  const statusText = platform.isCitedSnippet ? "Cited" : hasMeasured ? "Not cited" : "Pending";
  const rankText =
    platform.rank !== null
      ? `#${platform.rank}`
      : found
        ? "Cited"
        : hasMeasured
          ? "Not found"
          : "Pending";

  return (
    <div
      className="border border-vc-default rounded p-4"
      data-testid={`platform-card-${platform.aiPlatform}`}
    >
      <div className="flex items-start justify-between mb-1.5 gap-2">
        <span className="font-medium text-caption text-vc-primary">{platform.aiPlatform}</span>
        <span className="inline-flex items-center gap-1.5 text-label uppercase tracking-wider font-semibold text-vc-tertiary">
          <StatusDot tone={statusTone} aria-label={statusText} />
          {statusText}
        </span>
      </div>

      <div className={`text-page font-semibold leading-tight tabular-nums ${rankTone}`}>
        {rankText}
      </div>
      <div className="text-data text-vc-tertiary mb-2.5 tabular-nums">
        {platform.citedCount}/{platform.totalCount} cited
      </div>

      {hasMeasured && platform.latestSnippet ? (
        <div className="prose prose-sm dark:prose-invert line-clamp-4 max-w-none text-caption italic leading-snug text-vc-tertiary prose-p:my-0 prose-p:inline">
          <span aria-hidden="true">&ldquo;</span>
          <SafeMarkdown>{stripTrackingParams(platform.latestSnippet)}</SafeMarkdown>
          <span aria-hidden="true">&rdquo;</span>
        </div>
      ) : null}
    </div>
  );
}
