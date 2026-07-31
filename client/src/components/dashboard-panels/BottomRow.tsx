import { PanelLabel, PanelLink, NoValue, DEST } from "./primitives";
import { ListiclesPanel } from "./ListiclesPanel";
import type { TrendWeek, HallucinationStats, Listicle } from "./useDashboardData";

// ─── Citations / Hallucinations / Listicles ──────────────────────────────────
// Final content row, three equal columns, min-h-[340px], px-8 py-6.
//
// This row used to be Citations + "AI Traffic" + "Conversations". Those two
// were permanent empty states: both need an external integration this product
// does not have (Google Analytics; AI-crawler tracking on the customer's
// domain), so they occupied a third of the dashboard telling you to connect
// something that cannot be connected.
//
// They were replaced with two things already measured for every brand and
// surfaced nowhere on this page - hallucination severity, and presence in the
// "best of" roundups AI engines lean on.

function favicon(domain: string) {
  return `/api/logo-proxy?url=${encodeURIComponent(
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  )}`;
}

function CitationsPanel({
  weeks,
  total,
  truncated,
  sources,
  loading,
}: {
  weeks: TrendWeek[];
  total: number | null;
  truncated: boolean;
  sources: { domain: string; count: number }[];
  loading: boolean;
}) {
  const spark = weeks.slice(-7);
  const max = Math.max(1, ...spark.map((w) => w.cited));
  const hasSpark = spark.some((w) => w.cited > 0);

  return (
    <div className="min-h-[340px] overflow-hidden border-b border-vc-default px-8 py-6 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col">
        <div className="mb-4 flex h-5 items-center justify-between gap-4">
          <PanelLabel>Citations</PanelLabel>
          <PanelLink dest={DEST.citations}>Explore</PanelLink>
        </div>

        {/* Weekly sparkline - real cited counts, dimmed flat when all zero. */}
        <div className="relative mb-4">
          <div className={`flex h-12 items-end gap-px ${hasSpark ? "" : "opacity-20"}`}>
            {(spark.length ? spark : Array.from({ length: 7 }).map(() => null)).map((w, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-sm ${hasSpark ? "bg-vc-accent/70" : "bg-vc-hover"}`}
                style={{ height: `${w ? Math.max(4, (w.cited / max) * 100) : 30}%` }}
                title={w ? `${w.cited} cited - week of ${w.weekStart}` : undefined}
              />
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-[8px] tabular-nums text-vc-hover">7w ago</span>
            <span className="font-mono text-[8px] text-vc-hover">This week</span>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            {loading ? (
              <span className="inline-block h-7 w-16 rounded-sm bg-vc-muted" aria-hidden />
            ) : (
              <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-vc-primary">
                {total === null ? "–" : total}
                {truncated ? "+" : ""}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-label text-vc-label">cited URLs (30d)</span>
          </div>
        </div>

        <div className="mb-1 flex items-center justify-between">
          <span className="text-label font-medium uppercase tracking-wider text-vc-label">
            Top sources
          </span>
          <span className="text-label text-vc-hover">last 30 days</span>
        </div>

        <div className="-mx-2 min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="space-y-3 px-2 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 rounded-sm bg-vc-muted" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <p className="px-2 pt-2 text-data text-vc-label">No cited URLs in the last 30 days.</p>
          ) : (
            sources.slice(0, 4).map((s) => (
              <a
                key={s.domain}
                href={`https://${s.domain}`}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-center gap-3 px-2 py-2 transition-colors hover:bg-vc-muted/50"
              >
                <img src={favicon(s.domain)} alt="" className="h-4 w-4 flex-shrink-0 rounded" />
                <span className="flex-1 truncate text-caption text-vc-secondary transition-colors group-hover:text-vc-primary">
                  {s.domain}
                </span>
                <span className="font-mono text-data tabular-nums text-vc-label">{s.count}</span>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Hallucinations ──────────────────────────────────────────────────────────
// Replaced "AI Traffic", which needed a Google Analytics connection that does
// not exist. This is the one genuinely alarming thing already measured about a
// brand - claims an engine stated that contradict the fact sheet - and the
// dashboard never mentioned it. Severity ramp matches the Site Health panel's.
const SEVERITY: { key: string; label: string; color: string }[] = [
  { key: "critical", label: "crit", color: "var(--negative)" },
  { key: "high", label: "high", color: "var(--brand-accent)" },
  { key: "medium", label: "med", color: "var(--fg-disabled)" },
  { key: "low", label: "low", color: "var(--border-strong)" },
];

function HallucinationsPanel({
  stats,
  loading,
}: {
  stats: HallucinationStats | null;
  loading: boolean;
}) {
  const total = stats?.total ?? null;
  const unresolved = stats ? stats.total - stats.resolved : null;
  const pressing = stats ? (stats.bySeverity.critical ?? 0) + (stats.bySeverity.high ?? 0) : null;

  return (
    <div className="min-h-[340px] overflow-hidden border-b border-vc-default px-8 py-6 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col">
        <div className="mb-4 flex h-5 items-center justify-between gap-4">
          <PanelLabel>Hallucinations</PanelLabel>
          <PanelLink dest={DEST.hallucinations}>Review</PanelLink>
        </div>

        {loading ? (
          <div className="space-y-3">
            <span className="inline-block h-7 w-16 rounded-sm bg-vc-muted" aria-hidden />
            <div className="space-y-2 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 rounded-sm bg-vc-muted" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex items-baseline gap-2">
                {total === null ? (
                  <NoValue className="text-[28px] font-semibold leading-none" />
                ) : (
                  <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-vc-primary">
                    {unresolved}
                  </span>
                )}
              </div>
              <div className="mt-1 text-label text-vc-label">
                {total === null
                  ? "not checked yet"
                  : `unresolved${pressing ? ` · ${pressing} critical or high` : ""}`}
              </div>
            </div>

            {total === null || total === 0 ? (
              <p className="text-data text-vc-tertiary">
                {total === 0
                  ? "No contradicted claims found. Re-checked on every citation run."
                  : "Run a hallucination check to see what AI gets wrong about you."}
              </p>
            ) : (
              <>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-label font-medium uppercase tracking-wider text-vc-label">
                    By severity
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  {SEVERITY.map((s) => {
                    const n = stats?.bySeverity[s.key] ?? 0;
                    return (
                      <div key={s.key} className="flex items-center gap-3 py-2">
                        <span
                          className="h-2 w-2 flex-shrink-0"
                          style={{ backgroundColor: s.color }}
                          aria-hidden
                        />
                        <span className="flex-1 text-caption text-vc-secondary">{s.label}</span>
                        <span className="font-mono text-data tabular-nums text-vc-label">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function BottomRow({
  weeks,
  totalCitedUrls,
  citedUrlsTruncated,
  topSources,
  loading,
  hallucinations,
  hallucinationsLoading,
  listicles,
  listiclesLoading,
}: {
  weeks: TrendWeek[];
  totalCitedUrls: number | null;
  citedUrlsTruncated: boolean;
  topSources: { domain: string; count: number }[];
  loading: boolean;
  hallucinations: HallucinationStats | null;
  hallucinationsLoading: boolean;
  listicles: Listicle[] | null;
  listiclesLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3">
      <CitationsPanel
        weeks={weeks}
        total={totalCitedUrls}
        truncated={citedUrlsTruncated}
        sources={topSources}
        loading={loading}
      />

      <HallucinationsPanel stats={hallucinations} loading={hallucinationsLoading} />
      <ListiclesPanel rows={listicles} loading={listiclesLoading} />
    </div>
  );
}
