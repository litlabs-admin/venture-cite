import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Info } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/foundations";

const DISMISS_KEY_PREFIX = "venturecite-recs-dismissed:";
const DISMISS_DURATION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RecommendationPriority = "P0" | "P1" | "P2";

type Recommendation = {
  id: string;
  title: string;
  why: string;
  ctaLabel: string;
  ctaHref: string;
  priority: RecommendationPriority;
  category: string;
  dismissible: boolean;
};

const PRIORITY_STYLES: Record<RecommendationPriority, string> = {
  // P0 is a blocker, not a failure — use neutral chrome with a status
  // glyph instead of destructive paint. The action button below carries
  // the brand accent.
  P0: "border-border bg-card",
  P1: "border-border bg-muted/30",
  P2: "border-border bg-card",
};

const PRIORITY_LABEL: Record<RecommendationPriority, string> = {
  P0: "Required",
  P1: "Suggested",
  P2: "Optional",
};

function readDismissed(key: string | null): Record<string, string> {
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeDismissed(key: string, dismissed: Record<string, string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(dismissed));
  } catch {
    // Ignore — quota errors aren't fatal.
  }
}

/** Filters out P1/P2 recommendations dismissed within the last
 *  DISMISS_DURATION_DAYS. Returns recs unchanged if dismissals map is empty. */
function applyDismissals(
  recs: Recommendation[],
  dismissed: Record<string, string>,
): Recommendation[] {
  const cutoff = Date.now() - DISMISS_DURATION_DAYS * MS_PER_DAY;
  return recs.filter((r) => {
    if (!r.dismissible) return true; // P0s always show
    const dismissedAt = dismissed[r.id];
    if (!dismissedAt) return true;
    const dismissedMs = new Date(dismissedAt).getTime();
    if (Number.isNaN(dismissedMs)) return true; // bad data — show
    return dismissedMs < cutoff; // re-show after window
  });
}

export default function RecommendationsPanel() {
  const { user } = useAuth();
  const { selectedBrandId } = useBrandSelection();

  const dismissKey = user?.id ? `${DISMISS_KEY_PREFIX}${user.id}` : null;
  const [dismissed, setDismissed] = useState<Record<string, string>>(() =>
    readDismissed(dismissKey),
  );

  // Re-read dismissals when user changes (login as different account).
  useEffect(() => {
    setDismissed(readDismissed(dismissKey));
  }, [dismissKey]);

  const { data, isLoading, isError } = useQuery<{
    success: boolean;
    data: Recommendation[];
  }>({
    queryKey: [`/api/brands/${selectedBrandId}/recommendations`],
    enabled: !!selectedBrandId,
    staleTime: 60_000, // 1 minute — don't hammer on tab focus
  });

  if (!user?.id || !selectedBrandId) return null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Couldn't load recommendations — try refreshing.
        </CardContent>
      </Card>
    );
  }

  const allRecs = data?.data ?? [];
  const visible = applyDismissals(allRecs, dismissed);

  if (visible.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You're caught up for now. Check back as you publish more content.
        </CardContent>
      </Card>
    );
  }

  function handleDismiss(recId: string): void {
    if (!dismissKey) return;
    const next = { ...dismissed, [recId]: new Date().toISOString() };
    setDismissed(next);
    writeDismissed(dismissKey, next);
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold">Recommended next steps</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About recommendations"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                These suggestions update as your data grows. Required items can't be dismissed.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <ul className="space-y-2">
          {visible.map((rec) => (
            <li
              key={rec.id}
              className={[
                "flex items-start gap-3 p-3 rounded-lg border",
                PRIORITY_STYLES[rec.priority],
              ].join(" ")}
            >
              {rec.priority === "P0" && (
                <StatusDot tone="warn" className="mt-1.5 shrink-0" aria-label="Required" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {PRIORITY_LABEL[rec.priority]}
                  </span>
                </div>
                <p className="text-sm font-medium mt-1">{rec.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rec.why}</p>
                {rec.priority === "P0" ? (
                  <Link href={rec.ctaHref} asChild>
                    <Button size="sm" className="mt-2">
                      {rec.ctaLabel} →
                    </Button>
                  </Link>
                ) : (
                  <Link
                    href={rec.ctaHref}
                    className="inline-block mt-2 text-xs font-medium text-primary hover:underline"
                  >
                    {rec.ctaLabel} →
                  </Link>
                )}
              </div>
              {rec.dismissible && (
                <button
                  type="button"
                  onClick={() => handleDismiss(rec.id)}
                  aria-label={`Dismiss recommendation: ${rec.title}`}
                  className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
