import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusDot, type StatusDotTone } from "@/components/foundations";
import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { toLinkTarget, withBrand, type LinkTarget } from "@/lib/linkTarget";
import { cn } from "@/lib/utils";

// ─── Pulse ───────────────────────────────────────────────────────────────────
// The Dashboard's action-first worklist. One ranked list answering "what
// do I do next", merging three REAL measured sources - no estimates, no
// fabricated revenue/traffic (PRODUCT.md: honest by construction):
//
//   1. Run-change alerts  (/api/brands/:id/alerts)         - something regressed
//   2. Recommendations    (/api/brands/:id/recommendations) - deterministic P0/P1/P2
//   3. Open hallucinations (/api/hallucinations/stats/:id)  - standing accuracy debt
//
// Replaces RecommendationsPanel on `/`. RecommendationsPanel itself stays the
// deep view at /diagnose?tab=issues, so this only changes what home renders.

// Mirrors RecommendationsPanel's localStorage contract ON PURPOSE: a rec
// dismissed in either surface stays dismissed in both. Keep these two values
// identical to the ones in RecommendationsPanel.tsx.
const DISMISS_KEY_PREFIX = "venturecite-recs-dismissed:";
const DISMISS_DURATION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Alerts accumulate one row per regression per run; only the last ~2 weekly
// runs are "what needs you now". Older rows describe regressions that may have
// already recovered, so they must not sit in an action list.
const ALERT_RECENT_DAYS = 14;

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
type AlertRow = {
  id: string;
  alertType: string;
  message: string;
  details: Record<string, unknown> | null;
  sentAt: string;
};
type HallucinationStats = {
  total: number;
  resolved: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
};

// One normalised row. `rank` orders the list (0 = most urgent). `marker` is
// the only colour on the row - a small dot, severity not decoration.
type PulseItem = {
  key: string;
  dismissKey: string | null; // null = not dismissible (always shown)
  rank: number;
  marker: StatusDotTone;
  kind: string;
  title: React.ReactNode;
  why: string;
  target: LinkTarget;
  cta: string;
  emphasised: boolean; // render a real Button (regressions + P0 blockers)
};

const ACTIONABLE_ALERTS: Record<string, { href: string; cta: string }> = {
  visibility_drop: { href: "/monitor?tab=citations", cta: "Review citations" },
  prompts_lost: { href: "/act?tab=create", cta: "Generate content for gaps" },
  new_hallucinations: { href: "/diagnose?tab=hallucinations", cta: "Review hallucinations" },
};

/** Resolve a row's destination: decompose the href (a mix of local
 *  `/stage?tab=…` literals and server-supplied `ctaHref`/`nextHref` strings -
 *  never a compile-time route literal), then carry the active brand so the
 *  selection stays sticky when navigating from Pulse. Decomposed once here
 *  rather than round-tripping through a URL string on the way to the Link. */
function resolveTarget(href: string, brandId: string): LinkTarget {
  return withBrand(toLinkTarget(href), brandId);
}

function readDismissed(key: string | null): Record<string, string> {
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeDismissed(key: string, value: Record<string, string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota errors are non-fatal - the row just won't stay hidden.
  }
}

function isDismissed(dismissKey: string | null, dismissed: Record<string, string>): boolean {
  if (!dismissKey) return false;
  const at = dismissed[dismissKey];
  if (!at) return false;
  const ms = new Date(at).getTime();
  if (Number.isNaN(ms)) return false;
  return ms >= Date.now() - DISMISS_DURATION_DAYS * MS_PER_DAY;
}

export default function Pulse() {
  const { user } = useAuth();
  const { selectedBrandId } = useBrandSelection();
  const enabled = !!selectedBrandId;

  const dismissStoreKey = user?.id ? `${DISMISS_KEY_PREFIX}${user.id}` : null;
  const [dismissed, setDismissed] = useState<Record<string, string>>(() =>
    readDismissed(dismissStoreKey),
  );
  useEffect(() => {
    setDismissed(readDismissed(dismissStoreKey));
  }, [dismissStoreKey]);

  // Recommendations are the spine of the worklist - its loading/error state
  // governs the section. Alerts + hallucinations are enrichment: if either
  // fails it degrades to "no rows from that source", never a broken panel.
  const recsQ = useQuery<{ success: boolean; data: Recommendation[] }>({
    queryKey: [`/api/brands/${selectedBrandId}/recommendations`],
    enabled,
    staleTime: 60_000,
  });
  const alertsQ = useQuery<{ success: boolean; data: AlertRow[] }>({
    queryKey: [`/api/brands/${selectedBrandId}/alerts?limit=10`],
    enabled,
    staleTime: 60_000,
  });
  const hallucQ = useQuery<{ success: boolean; data: HallucinationStats }>({
    queryKey: [`/api/hallucinations/stats/${selectedBrandId}`],
    enabled,
    staleTime: 60_000,
  });

  const items = useMemo<PulseItem[]>(() => {
    if (!selectedBrandId) return [];
    const out: PulseItem[] = [];

    // 1 - Run-change alerts. Keep only recent, actionable types; one row per
    // type (newest, since the API returns sentAt-desc).
    const recentCutoff = Date.now() - ALERT_RECENT_DAYS * MS_PER_DAY;
    const seenAlertTypes = new Set<string>();
    let hasFreshHallucAlert = false;
    for (const a of alertsQ.data?.data ?? []) {
      const map = ACTIONABLE_ALERTS[a.alertType];
      if (!map) continue;
      const ts = new Date(a.sentAt).getTime();
      if (Number.isNaN(ts) || ts < recentCutoff) continue;
      if (seenAlertTypes.has(a.alertType)) continue;
      seenAlertTypes.add(a.alertType);
      if (a.alertType === "new_hallucinations") hasFreshHallucAlert = true;
      const d = a.details ?? {};
      const href = typeof d.nextHref === "string" ? d.nextHref : map.href;
      const cta = typeof d.nextLabel === "string" ? d.nextLabel : map.cta;
      out.push({
        key: `alert:${a.id}`,
        dismissKey: `alert:${a.id}`,
        rank: 0,
        marker: "fail",
        kind: "Regression",
        title: a.message,
        why: "Detected on your most recent scan.",
        target: resolveTarget(href, selectedBrandId),
        cta,
        emphasised: true,
      });
    }

    // 2 - Deterministic recommendations. P0 = required blocker, P1/P2 = lower.
    for (const r of recsQ.data?.data ?? []) {
      const rank = r.priority === "P0" ? 1 : r.priority === "P1" ? 3 : 4;
      out.push({
        key: `rec:${r.id}`,
        dismissKey: r.dismissible ? r.id : null,
        rank,
        marker: r.priority === "P0" ? "warn" : "neutral",
        kind: r.priority === "P0" ? "Required" : r.priority === "P1" ? "Suggested" : "Optional",
        title: r.title,
        why: r.why,
        target: resolveTarget(r.ctaHref, selectedBrandId),
        cta: r.ctaLabel,
        emphasised: r.priority === "P0",
      });
    }

    // 3 - Standing open hallucinations. Skipped when a fresh
    // new_hallucinations alert already says the same thing more urgently.
    const stats = hallucQ.data?.data;
    if (stats && !hasFreshHallucAlert) {
      const open = Math.max(0, stats.total - stats.resolved);
      if (open > 0) {
        out.push({
          key: "halluc:open",
          dismissKey: "halluc:open",
          rank: 2,
          marker: "fail",
          kind: "Accuracy",
          title: (
            <>
              <span className="tnum">{open}</span> unresolved hallucination
              {open === 1 ? "" : "s"}
            </>
          ),
          why: "AI engines are stating things your fact sheet contradicts.",
          target: resolveTarget("/diagnose?tab=hallucinations", selectedBrandId),
          cta: "Review hallucinations",
          emphasised: false,
        });
      }
    }

    return out
      .map((it, i) => ({ it, i }))
      .sort((a, b) => a.it.rank - b.it.rank || a.i - b.i)
      .map(({ it }) => it);
  }, [selectedBrandId, alertsQ.data, recsQ.data, hallucQ.data]);

  const visible = useMemo(
    () => items.filter((it) => !isDismissed(it.dismissKey, dismissed)),
    [items, dismissed],
  );

  // Staggered reveal for the worklist rows (roadmap §1e: a 50ms-per-row
  // animation-delay increment, reusing the shared `.reveal`/`.in-view`
  // fade+settle utility). Flips one frame after mount so the transition
  // actually plays instead of rows arriving already in their end state.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [visible.length]);

  if (!user?.id || !selectedBrandId) return null;

  const header = (
    <div className="mb-1 flex items-baseline justify-between gap-3">
      <h2 className="text-label font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Worklist
      </h2>
      {visible.length > 0 && (
        <span className="tnum text-data text-muted-foreground">{visible.length}</span>
      )}
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <section aria-label="Worklist" className="rounded-lg border border-border bg-card p-5">
      {header}
      {children}
    </section>
  );

  if (recsQ.isLoading) {
    return shell(
      <div className="space-y-3 pt-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>,
    );
  }

  if (recsQ.isError) {
    return shell(
      <div className="flex items-center justify-between gap-3 pt-2 text-caption text-muted-foreground">
        <span>Couldn&apos;t load your worklist.</span>
        <button
          type="button"
          onClick={() => recsQ.refetch()}
          className="font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retry
        </button>
      </div>,
    );
  }

  if (visible.length === 0) {
    return shell(
      <div className="pt-2">
        <p className="text-caption font-medium text-foreground">Nothing needs you right now.</p>
        <p className="mt-0.5 text-caption text-muted-foreground">
          The next action surfaces here after your weekly scan, or when something changes.
        </p>
      </div>,
    );
  }

  function handleDismiss(dismissKey: string): void {
    if (!dismissStoreKey) return;
    const next = { ...dismissed, [dismissKey]: new Date().toISOString() };
    setDismissed(next);
    writeDismissed(dismissStoreKey, next);
  }

  return shell(
    <ul className="-mb-3">
      {visible.map((it, index) => (
        <li
          key={it.key}
          className={cn(
            "reveal flex items-start gap-3 border-b border-border/60 py-3 last:border-0",
            revealed && "in-view",
          )}
          style={{ transitionDelay: `${index * 50}ms` }}
        >
          <StatusDot tone={it.marker} className="mt-1.5" aria-label={it.kind} />
          <div className="min-w-0 flex-1">
            <span className="text-label font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {it.kind}
            </span>
            <p className="mt-0.5 text-caption font-medium text-foreground">{it.title}</p>
            <p className="mt-0.5 text-caption text-muted-foreground">{it.why}</p>
            {(() => {
              const target = it.target;
              return it.emphasised ? (
                <Button asChild size="sm" className="mt-2">
                  <Link to={target.to} search={target.search}>
                    {it.cta} →
                  </Link>
                </Button>
              ) : (
                <Link
                  to={target.to}
                  search={target.search}
                  className="mt-2 inline-block text-caption font-medium text-primary hover:underline"
                >
                  {it.cta} →
                </Link>
              );
            })()}
          </div>
          {it.dismissKey && (
            <button
              type="button"
              onClick={() => handleDismiss(it.dismissKey!)}
              aria-label="Dismiss"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>,
  );
}
