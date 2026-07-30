import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { PanelLabel, NoValue, CCLink, DEST } from "./primitives";
import type { LeaderRow } from "./useDashboardData";

// ─── Rankings ────────────────────────────────────────────────────────────────
// Right third of the first content row. Scrolling list of tracked brands
// ordered by share of voice. Row spec: 34px tall, px-6 py-2,
// #rank (w-8, 11px) · favicon (16px) · name (12px, truncate)
// · figure (12px tabular) · delta (10px, w-7, right).
//
// The reference carries an activity dot between the rank and the favicon. It
// is dropped here: it encoded "has any citations", which the figure beside it
// already says, so it read as decoration in a column of eight identical dots.
//
// DELTA IS NULL BY DESIGN: no competitor history table exists, so there is
// nothing to diff against. Every row shows `–` until competitor snapshots are
// recorded — inventing a movement number here would be the easiest possible
// lie for this panel to tell.

function favicon(domain: string) {
  return `/api/logo-proxy?url=${encodeURIComponent(
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  )}`;
}

function Row({
  row,
  rank,
  innerRef,
}: {
  row: LeaderRow;
  rank: number;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const score = Math.round(row.shareOfVoice);
  return (
    <div ref={innerRef} className={row.isOwn ? "bg-vc-accent-subtle/55" : ""}>
      <div className="flex items-center">
        <CCLink
          dest={DEST.competitors}
          className="flex flex-1 items-center gap-2 px-6 py-2 text-left transition-colors hover:bg-vc-muted/50"
        >
          <span
            className={`w-8 flex-shrink-0 text-data tabular-nums ${
              row.isOwn ? "font-medium text-vc-primary" : "text-vc-text-muted"
            }`}
          >
            #{rank}
          </span>
          {row.domain ? (
            <img
              src={favicon(row.domain)}
              alt=""
              className="h-4 w-4 flex-shrink-0 rounded object-contain"
            />
          ) : (
            <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-vc-accent-subtle">
              <span className="text-[9px] font-semibold leading-none text-vc-accent-hover">
                {row.name.charAt(0).toUpperCase()}
              </span>
            </span>
          )}
          <span
            className={`flex-1 truncate text-caption ${
              row.isOwn ? "font-medium text-vc-primary" : "text-vc-secondary"
            }`}
          >
            {row.name}
          </span>
          <span
            className={`text-caption tabular-nums text-vc-primary ${row.isOwn ? "font-semibold" : ""}`}
          >
            {score}
          </span>
          <NoValue className="w-7 flex-shrink-0 text-right text-label" />
        </CCLink>
        <CCLink
          dest={DEST.competitors}
          className="flex-shrink-0 py-2 pl-1 pr-3 text-transparent transition-colors duration-150 hover:text-vc-accent"
          aria-label={`Open ${row.name}`}
        >
          <ChevronRight className="h-3 w-3" aria-hidden />
        </CCLink>
      </div>
    </div>
  );
}

export function RankingsPanel({ rows, loading }: { rows: LeaderRow[]; loading: boolean }) {
  const sorted = [...rows].sort((a, b) => b.shareOfVoice - a.shareOfVoice);
  const ownIndex = sorted.findIndex((r) => r.isOwn);
  const ownRef = useRef<HTMLDivElement>(null);

  // The reference scrolls your own row into view on load — with a long
  // leaderboard, "where do I stand" is the whole point of the panel and
  // landing on rank #1 of someone else's list answers nothing. Scoped to the
  // list container so the page itself never jumps.
  useEffect(() => {
    if (ownIndex < 0) return;
    ownRef.current?.scrollIntoView({ block: "center" });
  }, [ownIndex]);

  return (
    <div className="flex h-full min-h-0 flex-col px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <PanelLabel>Rankings</PanelLabel>
        <CCLink
          dest={DEST.competitors}
          className="text-label text-vc-label transition-colors hover:text-vc-accent"
        >
          Manage
        </CCLink>
      </div>

      <div className="-mx-6 min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 px-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 rounded-sm bg-vc-muted" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="px-6 text-data text-vc-tertiary">
            No competitors tracked yet. Add them in Setup to see where you stand.
          </p>
        ) : (
          // Several tracked competitors can share one domain (product lines
          // under a parent brand), so domain alone is not a unique key.
          sorted.map((r, i) => (
            <Row
              key={`${r.domain}|${r.name}|${i}`}
              row={r}
              rank={i + 1}
              innerRef={r.isOwn ? ownRef : undefined}
            />
          ))
        )}
      </div>

      {ownIndex >= 0 && (
        <p className="mt-3 flex-shrink-0 text-data text-vc-tertiary">
          You: #{ownIndex + 1} of {sorted.length} tracked
        </p>
      )}
    </div>
  );
}
