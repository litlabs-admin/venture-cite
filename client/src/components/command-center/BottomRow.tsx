import { BarChart3 } from "lucide-react";
import { PanelLabel, PanelLink, PanelEmptyState, CCLink, DEST } from "./primitives";
import type { TrendWeek } from "./useCommandCenterData";

// ─── Citations / AI Traffic / Conversations ──────────────────────────────────
// Final content row, three equal columns, min-h-[340px], px-8 py-6.
// Only the first has a data source. The other two carry the reference's own
// empty-state treatment — which is exactly what the reference itself renders
// for an account without analytics connected.

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

        {/* Weekly sparkline — real cited counts, dimmed flat when all zero. */}
        <div className="relative mb-4">
          <div className={`flex h-12 items-end gap-px ${hasSpark ? "" : "opacity-20"}`}>
            {(spark.length ? spark : Array.from({ length: 7 }).map(() => null)).map((w, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-sm ${hasSpark ? "bg-vc-accent/70" : "bg-vc-hover"}`}
                style={{ height: `${w ? Math.max(4, (w.cited / max) * 100) : 30}%` }}
                title={w ? `${w.cited} cited — week of ${w.weekStart}` : undefined}
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
            <span className="text-[10px] text-vc-label">cited URLs (30d)</span>
          </div>
        </div>

        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-vc-label">
            Top sources
          </span>
          <span className="text-[10px] text-vc-hover">last 30 days</span>
        </div>

        <div className="-mx-2 min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="space-y-3 px-2 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 rounded-sm bg-vc-muted" />
              ))}
            </div>
          ) : sources.length === 0 ? (
            <p className="px-2 pt-2 text-[11px] text-vc-label">
              No cited URLs in the last 30 days.
            </p>
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
                <span className="flex-1 truncate text-[12px] text-vc-secondary transition-colors group-hover:text-vc-primary">
                  {s.domain}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-vc-label">{s.count}</span>
              </a>
            ))
          )}
        </div>
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
}: {
  weeks: TrendWeek[];
  totalCitedUrls: number | null;
  citedUrlsTruncated: boolean;
  topSources: { domain: string; count: number }[];
  loading: boolean;
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

      <div className="min-h-[340px] overflow-hidden border-b border-vc-default px-8 py-6 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="mb-4 flex h-5 items-center justify-between gap-4">
            <PanelLabel>AI Traffic</PanelLabel>
          </div>
          <PanelEmptyState
            icon={<BarChart3 className="h-5 w-5" aria-hidden />}
            title="Connect analytics"
            hint="See visitors arriving from AI citations"
            cta={{ label: "Connect", dest: DEST.settings }}
          />
        </div>
      </div>

      <div className="min-h-[340px] overflow-hidden px-8 py-6">
        <div className="flex h-full flex-col">
          <div className="mb-4 flex h-5 items-center justify-between gap-4">
            <PanelLabel>Conversations</PanelLabel>
            <PanelLink dest={DEST.crawler}>Set up</PanelLink>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mb-3 flex items-center gap-3 opacity-20" aria-hidden>
              <img src="/venturecite/images/ai-logos/chatgpt.svg" alt="" className="h-5 w-5" />
              <img src="/venturecite/images/ai-logos/perplexity.svg" alt="" className="h-5 w-5" />
              <img src="/venturecite/images/ai-logos/claude.svg" alt="" className="h-5 w-5" />
            </div>
            <p className="text-[11px] text-vc-label">No conversation tracking yet</p>
            <CCLink
              dest={DEST.crawler}
              className="mt-1 flex items-center gap-0.5 text-[10px] text-vc-accent hover:underline"
            >
              Check crawler access
            </CCLink>
          </div>
        </div>
      </div>
    </div>
  );
}
