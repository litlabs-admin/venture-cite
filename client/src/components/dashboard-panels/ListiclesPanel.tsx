import { PanelLabel, PanelLink, NoValue, DEST } from "./primitives";
import type { Listicle } from "./useDashboardData";

// ─── Listicles ───────────────────────────────────────────────────────────────
// Replaced "Conversations", which needed AI-crawler tracking that does not
// exist. "Best X" roundups are a source AI engines lean on heavily, and
// presence in them is already scanned and stored - it was surfaced nowhere on
// this page.
//
// `isIncluded` is an INTEGER column (0/1), not a boolean - compare against 1
// rather than testing truthiness, or every row counts as included.
export function summariseListicles(rows: Listicle[]) {
  const included = rows.filter((r) => r.isIncluded === 1);
  const ranked = included
    .map((r) => r.listPosition)
    .filter((p): p is number => typeof p === "number");
  return {
    total: rows.length,
    included: included.length,
    // Null, not 0, when nothing carries a position - an average of no
    // samples is not "position zero".
    avgPosition:
      ranked.length > 0
        ? Math.round((ranked.reduce((a, b) => a + b, 0) / ranked.length) * 10) / 10
        : null,
    top: [...included].sort((a, b) => (a.listPosition ?? Infinity) - (b.listPosition ?? Infinity)),
  };
}

export function ListiclesPanel({ rows, loading }: { rows: Listicle[] | null; loading: boolean }) {
  const s = rows ? summariseListicles(rows) : null;

  return (
    <div className="min-h-[340px] overflow-hidden px-8 py-6">
      <div className="flex h-full flex-col">
        <div className="mb-4 flex h-5 items-center justify-between gap-4">
          <PanelLabel>Listicles</PanelLabel>
          <PanelLink dest={DEST.listicles}>Explore</PanelLink>
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
              <div className="flex items-baseline gap-1.5">
                {s === null ? (
                  <NoValue className="text-[28px] font-semibold leading-none" />
                ) : (
                  <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-vc-primary">
                    {s.included}
                  </span>
                )}
                <span className="text-label text-vc-label">
                  {s === null ? "" : `of ${s.total}`}
                </span>
                {s?.avgPosition !== null && s !== null && (
                  <span className="ml-auto text-label uppercase tracking-wider text-vc-tertiary">
                    avg #{s.avgPosition}
                  </span>
                )}
              </div>
              <div className="mt-1 text-label text-vc-label">
                {s === null ? "not scanned yet" : "“best of” lists you appear in"}
              </div>
            </div>

            {s === null || s.total === 0 ? (
              <p className="text-data text-vc-tertiary">
                {s?.total === 0
                  ? "No roundups found for your category yet."
                  : "Scan for “best of” roundups to see which ones list you."}
              </p>
            ) : (
              <>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-label font-medium uppercase tracking-wider text-vc-label">
                    Where you rank
                  </span>
                </div>
                <div className="-mx-2 min-h-0 flex-1 overflow-hidden">
                  {s.top.slice(0, 4).map((r) => (
                    <a
                      key={r.id}
                      href={r.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group flex items-center gap-3 px-2 py-2 transition-colors hover:bg-vc-muted/50"
                      title={r.title}
                    >
                      <span className="flex-1 truncate text-caption text-vc-secondary transition-colors group-hover:text-vc-primary">
                        {r.sourcePublication ?? r.title}
                      </span>
                      <span className="flex-shrink-0 font-mono text-data tabular-nums text-vc-label">
                        {r.listPosition === null ? (
                          <NoValue className="text-data" />
                        ) : (
                          `#${r.listPosition}${r.totalListItems ? ` of ${r.totalListItems}` : ""}`
                        )}
                      </span>
                    </a>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
