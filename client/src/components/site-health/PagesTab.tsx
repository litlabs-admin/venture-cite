import { useEffect, useMemo, useState } from "react";
import { NoValue, PanelLabel } from "@/components/dashboard-panels/primitives";
import type { SiteHealth } from "@/components/dashboard-panels/useDashboardData";
import type { SiteHealthPage } from "./types";

// ─── Pages tab ───────────────────────────────────────────────────────────
// Reference (trakkr.ai/optimize) groups repeated-template URLs into
// collapsible rows. SCOPED DOWN for a first pass: this renders a flat,
// searchable table instead - grouping needs a URL-template heuristic that
// deserves its own pass rather than a guessed regex shipped alongside
// everything else here.
const FINDING_LABEL: Record<string, string> = {
  "failed-pages": "failed to crawl",
  "thin-content": "no extractable content",
};

export function PagesTab({
  health,
  pages,
  initialSearch = "",
}: {
  health: SiteHealth;
  pages: SiteHealthPage[];
  /** Set by FindingsTab's "Open these pages" link (a path-group prefix like
   *  "/blog") - re-applied whenever it changes so repeated jumps from
   *  different findings each land pre-filtered correctly. */
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => {
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);

  const avgScore = health.score;
  const issuesTotal = health.issues?.total ?? 0;

  const filtered = useMemo(() => {
    if (!search.trim()) return pages;
    const q = search.trim().toLowerCase();
    return pages.filter((p) => p.url.toLowerCase().includes(q));
  }, [pages, search]);

  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-y divide-vc-default border-b border-vc-default sm:grid-cols-4 sm:divide-y-0">
        <div className="px-6 py-5">
          <PanelLabel>Average score</PanelLabel>
          <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
            {avgScore !== null ? `${avgScore}/100` : <NoValue />}
          </div>
        </div>
        <div className="px-6 py-5">
          <PanelLabel>Pages</PanelLabel>
          <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
            {pages.length}
          </div>
        </div>
        <div className="px-6 py-5">
          <PanelLabel>Issues on pages</PanelLabel>
          <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
            {issuesTotal}
          </div>
        </div>
        <div className="px-6 py-5">
          <PanelLabel>Crawls 30d</PanelLabel>
          <div className="mt-1 font-mono text-metric font-semibold tabular-nums text-vc-primary">
            <NoValue />
          </div>
          <div className="mt-1 text-data text-vc-tertiary">not tracked yet</div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-vc-default px-8 py-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pages..."
          className="h-8 w-64 rounded border border-vc-default bg-vc-surface px-3 text-caption text-vc-primary placeholder:text-vc-tertiary focus:outline-none focus:ring-2 focus:ring-vc-accent/20"
        />
        <span className="ml-auto text-data tabular-nums text-vc-tertiary">
          {filtered.length} of {pages.length}
        </span>
      </div>

      {/* Same horizontal-scroll wrapper as ChecksTable, same reason: 5 columns
          with a fixed 216px reserved for the numeric ones don't fit a
          phone-width viewport without either scrolling or corrupting the
          URL/What's-wrong text. */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(0,1fr)_1fr_72px_72px_72px] items-center gap-x-4 border-b border-vc-default px-8 h-10">
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              URL
            </span>
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              What's wrong
            </span>
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              Status
            </span>
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              Facts
            </span>
            <span className="text-label font-semibold uppercase tracking-wider text-vc-label">
              Issues
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
              <p className="text-body text-vc-tertiary">
                {pages.length === 0
                  ? "No pages recorded for the latest crawl."
                  : "No pages match this search."}
              </p>
            </div>
          ) : (
            filtered.map((p) => (
              <div
                key={p.url}
                className="grid grid-cols-[minmax(0,1fr)_1fr_72px_72px_72px] items-center gap-x-4 border-b border-vc-default px-8 h-11"
              >
                <span className="truncate text-caption text-vc-secondary" title={p.url}>
                  {p.url}
                </span>
                <span className="truncate text-data text-vc-tertiary">
                  {p.findingIds.length > 0
                    ? p.findingIds.map((id) => FINDING_LABEL[id] ?? id).join(", ")
                    : "–"}
                </span>
                <span className="tabular-nums text-data text-vc-tertiary">
                  {p.statusCode ?? p.errorKind ?? "-"}
                </span>
                <span className="tabular-nums text-data text-vc-tertiary">{p.factCount}</span>
                <span className="tabular-nums text-data text-vc-tertiary">
                  {p.findingIds.length}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
