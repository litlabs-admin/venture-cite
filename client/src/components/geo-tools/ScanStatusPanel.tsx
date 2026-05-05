// ScanStatusPanel — Task 19.5, spec §3.12 flows A/B/F/G/I
//
// Renders the scan-control surface for the Mentions tab: brand variation
// search terms, scan button with cooldown/active state, per-source progress
// chips, last-scan summary, next-auto-scan time, opt-in toggle, and
// diagnostic banners (first-scan, 3-fail, sentiment-cap).

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Bell, Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ScanJob } from "@shared/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanStatusPanelProps = {
  brandId: string;
  brandName: string;
  brandMonitorMentions: boolean;
  variations: string[];
  activeScan: ScanJob | null;
  lastCompletedScan: ScanJob | null;
  scanCooldown: { canStart: boolean; nextAvailableAt: Date | null };
  consecutiveAutoFailures: number;
  sentimentCapped: boolean;
  onStartScan: () => void;
  onAddVariation: () => void;
  onToggleMonitor: (enabled: boolean) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shape of a single source's progress stored in ScanJob.perSource */
interface SourceProgress {
  status?: "pending" | "running" | "done" | "rate_limited" | "error";
  count?: number;
}

type PerSource = Record<string, SourceProgress>;

const SOURCES = ["reddit", "hackernews"] as const;
type Source = (typeof SOURCES)[number];

const SOURCE_LABELS: Record<Source, string> = {
  reddit: "Reddit",
  hackernews: "HN",
};

/**
 * Format a server-computed age (in seconds) as a relative-time label.
 * Server-anchored: the server measured both "now" and the row timestamp on
 * the same clock, so this is immune to DB-host, Node-process, or browser
 * clock skew.
 */
function formatAgeSeconds(s: number): string {
  if (s < 45) return "just now";
  if (s < 90) return "about 1 minute ago";
  const m = Math.round(s / 60);
  if (m < 45) return `${m} minutes ago`;
  if (m < 90) return "about 1 hour ago";
  const h = Math.round(m / 60);
  if (h < 24) return `about ${h} hours ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(mo / 12);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

/** Format ms-remaining as "Xh Ym". */
function formatCountdown(nextAt: Date): string {
  const diffMs = nextAt.getTime() - Date.now();
  if (diffMs <= 0) return "soon";
  const totalMinutes = Math.ceil(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/** Render a single per-source chip for active scanning state. */
function ActiveSourceChip({
  source,
  progress,
}: {
  source: Source;
  progress: SourceProgress | undefined;
}) {
  const label = SOURCE_LABELS[source];
  const s = progress?.status;

  if (!s || s === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
        {label} <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }
  if (s === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-blue-600 border-blue-200 bg-blue-50">
        {label} <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }
  if (s === "done") {
    const count = progress?.count ?? 0;
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-green-700 border-green-200 bg-green-50">
        {label} ✓ {count}
      </span>
    );
  }
  if (s === "rate_limited") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-amber-700 border-amber-200 bg-amber-50">
        {label} ⚠ rate-limited
      </span>
    );
  }
  // error fallback
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-red-700 border-red-200 bg-red-50">
      {label} ⚠ error
    </span>
  );
}

/** Render a single per-source chip for completed-scan summary. */
function CompletedSourceChip({
  source,
  progress,
}: {
  source: Source;
  progress: SourceProgress | undefined;
}) {
  const label = SOURCE_LABELS[source];

  if (!progress || progress.status === "rate_limited") {
    return <span className="text-amber-700">⚠ {label} rate-limited</span>;
  }
  const count = progress.count ?? 0;
  return (
    <span className="text-green-700">
      ✓ {label} {count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScanStatusPanel({
  brandMonitorMentions,
  variations,
  activeScan,
  lastCompletedScan,
  scanCooldown,
  consecutiveAutoFailures,
  sentimentCapped,
  onStartScan,
  onAddVariation,
  onToggleMonitor,
}: ScanStatusPanelProps) {
  // Live countdown — re-render every 60s when a cooldown is active.
  const [_tick, setTick] = useState(0);
  useEffect(() => {
    if (!scanCooldown.nextAvailableAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [scanCooldown.nextAvailableAt]);

  const isActivelyScanning =
    activeScan !== null && (activeScan.status === "queued" || activeScan.status === "running");

  const perSource = (activeScan?.perSource ?? {}) as PerSource;
  const completedPerSource = (lastCompletedScan?.perSource ?? {}) as PerSource;

  const isFirstScan = lastCompletedScan === null && isActivelyScanning;

  // Compute scan button label + disabled state
  let scanButtonLabel: React.ReactNode = "Scan Now";
  let scanButtonDisabled = false;

  if (isActivelyScanning) {
    scanButtonLabel = (
      <>
        <Loader2 className="h-4 w-4 animate-spin" />
        Scanning…
      </>
    );
    scanButtonDisabled = true;
  } else if (!scanCooldown.canStart && scanCooldown.nextAvailableAt) {
    scanButtonLabel = `Next manual scan: ${formatCountdown(scanCooldown.nextAvailableAt)}`;
    scanButtonDisabled = true;
  } else if (!scanCooldown.canStart) {
    scanButtonLabel = "Scan unavailable";
    scanButtonDisabled = true;
  }

  return (
    <Card className="w-full">
      {/* ── 3-fail banner (flow G) ───────────────────────────────────── */}
      {consecutiveAutoFailures >= 3 && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-t-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
        >
          <Bell className="h-4 w-4 shrink-0" />
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Last 3 scheduled scans failed.</span>
          <span className="ml-1">Reddit/HN paused — check status below.</span>
        </div>
      )}

      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Scan Status</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── "Searching for" line (flow A) ──────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="text-muted-foreground">Searching for:</span>
          {variations.length === 0 ? (
            <span className="italic text-muted-foreground">no variations set</span>
          ) : (
            variations.map((v, i) => (
              <span key={v} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground">OR</span>}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{v}</code>
              </span>
            ))
          )}
          <span className="mx-1 text-muted-foreground">·</span>
          <button
            onClick={onAddVariation}
            className="inline-flex items-center gap-0.5 text-xs text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Add search variation"
          >
            <Plus className="h-3 w-3" />
            add variation
          </button>
        </div>

        <hr />

        {/* ── Scan button + per-source progress (flows A/B) ───────────── */}
        <div className="space-y-2">
          {/* First-scan banner (flow F) */}
          {isFirstScan && (
            <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              First scan — pulling up to 1 year of history; this may take longer than usual.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={onStartScan}
              disabled={scanButtonDisabled}
              size="sm"
              className="min-w-[130px]"
            >
              {scanButtonLabel}
            </Button>
          </div>

          {/* Per-source progress chips — aria-live so screen readers announce updates */}
          {isActivelyScanning && (
            <div aria-live="polite" aria-atomic="false" className="flex flex-wrap gap-1.5">
              {SOURCES.map((src) => (
                <ActiveSourceChip key={src} source={src} progress={perSource[src]} />
              ))}
            </div>
          )}
        </div>

        {/* ── Last completed scan summary (flow B — no active scan) ───── */}
        {!isActivelyScanning && lastCompletedScan && (
          <>
            <hr />
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">
                Last scan:{" "}
                <span className="text-foreground font-medium">
                  {(() => {
                    const ageSec =
                      (
                        lastCompletedScan as unknown as {
                          completedAtAgeSeconds?: number;
                          createdAtAgeSeconds?: number;
                        }
                      ).completedAtAgeSeconds ??
                      (
                        lastCompletedScan as unknown as {
                          createdAtAgeSeconds?: number;
                        }
                      ).createdAtAgeSeconds;
                    return typeof ageSec === "number"
                      ? formatAgeSeconds(ageSec)
                      : formatDistanceToNow(
                          new Date(lastCompletedScan.completedAt ?? lastCompletedScan.createdAt),
                          { addSuffix: true },
                        );
                  })()}
                </span>
              </p>
              <div aria-live="polite" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {SOURCES.map((src, i) => (
                  <span key={src} className="inline-flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground">·</span>}
                    <CompletedSourceChip source={src} progress={completedPerSource[src]} />
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        <hr />

        {/* ── Daily auto-scan toggle + next auto-scan (flows I/B) ──────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="scan-monitor-toggle" className="text-sm font-medium leading-none">
              Daily auto-scan
            </label>
            <Switch
              id="scan-monitor-toggle"
              checked={brandMonitorMentions}
              onCheckedChange={onToggleMonitor}
              aria-label="Toggle daily auto-scan for this brand"
            />
          </div>

          {!brandMonitorMentions && (
            <p className="text-sm text-muted-foreground">
              Mention monitoring is paused for this brand.{" "}
              <button
                onClick={() => onToggleMonitor(true)}
                className="text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Resume daily scans
              </button>
            </p>
          )}

          {brandMonitorMentions && (
            <p className="text-xs text-muted-foreground">Daily auto-scan enabled</p>
          )}
        </div>

        {/* ── Sentiment cap indicator (flow I) ─────────────────────────── */}
        {sentimentCapped && (
          <>
            <hr />
            <div
              role="status"
              className={cn(
                "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700",
              )}
            >
              Sentiment processing paused — daily limit reached. Will resume tomorrow.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ScanStatusPanel;
