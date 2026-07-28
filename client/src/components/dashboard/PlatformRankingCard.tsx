import { Card, CardContent } from "@/components/ui/card";
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
  const cardBorder = found
    ? "border-positive bg-positive-subtle"
    : showDestructive
      ? "border-destructive/20 bg-destructive/5"
      : "border-border bg-muted/30";
  const pillClasses = platform.isCitedSnippet
    ? "text-positive bg-positive-subtle"
    : showDestructive
      ? "text-destructive bg-destructive/10"
      : "text-muted-foreground bg-muted";
  const pillText = platform.isCitedSnippet ? "Cited" : hasMeasured ? "Not cited" : "Pending";
  const rankText =
    platform.rank !== null
      ? `#${platform.rank}`
      : found
        ? "Cited"
        : hasMeasured
          ? "Not found"
          : "Pending";

  return (
    <Card className={"border " + cardBorder} data-testid={`platform-card-${platform.aiPlatform}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-1.5 gap-2">
          <span className="font-medium text-sm text-foreground">{platform.aiPlatform}</span>
          <span
            className={
              "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold " +
              pillClasses
            }
          >
            {pillText}
          </span>
        </div>

        <div className={`text-xl font-bold leading-tight ${rankTone}`}>{rankText}</div>
        <div className="text-[11px] text-muted-foreground mb-2.5">
          {platform.citedCount}/{platform.totalCount} cited
        </div>

        {hasMeasured && platform.latestSnippet ? (
          <div className="prose prose-sm dark:prose-invert line-clamp-4 max-w-none text-xs italic leading-snug text-muted-foreground prose-p:my-0 prose-p:inline">
            <span aria-hidden="true">&ldquo;</span>
            <SafeMarkdown>{stripTrackingParams(platform.latestSnippet)}</SafeMarkdown>
            <span aria-hidden="true">&rdquo;</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
