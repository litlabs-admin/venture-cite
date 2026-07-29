import { NoValue, Bar, InfoDot, CCLink, DEST, type Dest } from "./primitives";

// ─── KPI strip ───────────────────────────────────────────────────────────────
// Six equal columns, hairline-separated, 113px tall. Measured spec:
//   tile     px-5 py-5, hover:bg-muted/50
//   label    10px / 600 / uppercase / tracking-wider / tertiary + info dot
//   value    22px / 600 / mono / tabular-nums / tracking-tight / leading-none
//   delta    11px / mono / tabular-nums / --positive | rose-400
//   caption  9px / tertiary / mt-1
//
// Tiles whose metric has no backing measurement render `–` and a caption
// naming what's missing, in the same chrome — the strip never loses a column
// and never shows a number the data can't support.

function TileLabel({ children, tip }: { children: React.ReactNode; tip: React.ReactNode }) {
  return (
    <div className="mb-2 flex h-6 items-center gap-1.5">
      <span className="text-label font-semibold uppercase tracking-wider text-vc-text-muted">
        {children}
      </span>
      <InfoDot>{tip}</InfoDot>
    </div>
  );
}

function Tile({
  dest,
  label,
  tip,
  caption,
  captionMuted = false,
  loading = false,
  children,
  last = false,
}: {
  dest: Dest;
  label: string;
  tip: React.ReactNode;
  caption: React.ReactNode;
  captionMuted?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`flex-1 ${last ? "" : "border-r border-vc-default"}`}>
      <CCLink
        dest={dest}
        className="group block h-full px-5 py-5 transition-colors hover:bg-vc-muted/50"
      >
        <TileLabel tip={tip}>{label}</TileLabel>
        <div className="flex h-[22px] items-baseline gap-1.5">
          {loading ? <Bar w="w-12" h="h-5" /> : children}
        </div>
        <span
          className={`mt-1 block text-[9px] ${
            captionMuted
              ? "text-vc-text-muted transition-colors group-hover:text-vc-accent"
              : "text-vc-tertiary"
          }`}
        >
          {caption}
        </span>
      </CCLink>
    </div>
  );
}

const VALUE =
  "text-[22px] font-semibold font-mono tabular-nums tracking-tight leading-none text-vc-primary";

export function KpiStrip({
  visibility,
  visibilityDelta,
  mentions7d,
  mentionsTruncated,
  citationsThisWeek,
  loading,
}: {
  visibility: number | null;
  visibilityDelta: number | null;
  mentions7d: number | null;
  mentionsTruncated: boolean;
  citationsThisWeek: number | null;
  loading: boolean;
}) {
  return (
    <div className="border-b border-vc-default">
      <div className="flex">
        <Tile
          dest={DEST.report}
          label="Visibility"
          tip="Composite 0–100 score from citation rate, average rank, and source authority."
          caption="vs. last snapshot"
          loading={loading}
        >
          {visibility === null ? (
            <NoValue className={VALUE} />
          ) : (
            <>
              <span className={VALUE}>{visibility}</span>
              {visibilityDelta !== null && visibilityDelta !== 0 && (
                <span
                  className={`font-mono text-data tabular-nums ${
                    visibilityDelta > 0 ? "text-positive" : "text-destructive"
                  }`}
                >
                  {visibilityDelta > 0 ? "+" : ""}
                  {visibilityDelta}
                </span>
              )}
            </>
          )}
        </Tile>

        <Tile
          dest={DEST.mentions}
          label="Mentions"
          tip="Brand mentions found on Reddit and Hacker News in the last 7 days."
          caption="last 7 days"
          loading={loading}
        >
          {mentions7d === null ? (
            <NoValue className={VALUE} />
          ) : (
            <span className={VALUE}>
              {mentions7d}
              {mentionsTruncated ? "+" : ""}
            </span>
          )}
        </Tile>

        {/* No global brand universe exists, so there is no "#n of N" to show.
            The tile keeps its column and says why rather than inventing one. */}
        <Tile
          dest={DEST.competitors}
          label="Rank"
          tip="Position across all tracked brands. Requires a cross-account brand index, which is not built yet."
          caption="not tracked yet"
          loading={false}
        >
          <NoValue className={VALUE} />
        </Tile>

        <Tile
          dest={DEST.citations}
          label="Citations"
          tip="Prompt checks where an AI engine cited you, in the current week."
          caption="this week"
          loading={loading}
        >
          {citationsThisWeek === null ? (
            <NoValue className={VALUE} />
          ) : (
            <span className={VALUE}>{citationsThisWeek}</span>
          )}
        </Tile>

        <Tile
          dest={DEST.settings}
          label="AI Traffic"
          tip="Visitors arriving from AI citations. Needs a Google Analytics connection."
          caption="Connect GA"
          captionMuted
          loading={false}
        >
          <NoValue className={VALUE} />
        </Tile>

        <Tile
          dest={DEST.crawler}
          label="Conversations"
          tip="AI assistants reading your site. Needs AI crawler tracking on your domain."
          caption="Connect AI Crawlers"
          captionMuted
          loading={false}
          last
        >
          <NoValue className={VALUE} />
        </Tile>
      </div>
    </div>
  );
}
