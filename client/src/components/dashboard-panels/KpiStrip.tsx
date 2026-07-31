import { NoValue, Bar, InfoDot, CCLink, DEST, type Dest } from "./primitives";
import type { HallucinationStats, Listicle } from "./useDashboardData";

// ─── KPI strip ───────────────────────────────────────────────────────────────
// Six equal columns, hairline-separated, 113px tall. Measured spec:
//   tile     px-5 py-5, hover:bg-muted/50
//   label    10px / 600 / uppercase / tracking-wider / tertiary + info dot
//   value    22px / 600 / mono / tabular-nums / tracking-tight / leading-none
//   delta    11px / mono / tabular-nums / --positive | rose-400
//   caption  9px / tertiary / mt-1
//
// Tiles whose metric has no backing measurement render `–` and a caption
// naming what's missing, in the same chrome - the strip never loses a column
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
  mentionsScanned,
  mentionsScanLoading,
  citationsThisWeek,
  loading,
  ownRank,
  trackedBrands,
  leaderboardLoading,
  hallucinations,
  hallucinationsLoading,
  listicles,
  listiclesLoading,
}: {
  visibility: number | null;
  visibilityDelta: number | null;
  mentions7d: number | null;
  mentionsTruncated: boolean;
  mentionsScanned: boolean;
  mentionsScanLoading: boolean;
  citationsThisWeek: number | null;
  loading: boolean;
  ownRank: number | null;
  trackedBrands: number;
  leaderboardLoading: boolean;
  hallucinations: HallucinationStats | null;
  hallucinationsLoading: boolean;
  listicles: Listicle[] | null;
  listiclesLoading: boolean;
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

        {/* `–` until a scan has actually completed. The mention scan is
            opt-in (brands.monitor_mentions gates the weekly cron) and
            otherwise runs on demand from Monitor › Mentions, so an unscanned
            brand is the normal starting state - and it used to render a
            confident "0 · last 7 days", which claims a measurement nobody
            took. The caption names the missing step instead. */}
        <Tile
          dest={DEST.mentions}
          label="Mentions"
          tip="Brand mentions found on Reddit and Hacker News in the last 7 days. Run a scan from Monitor › Mentions to populate this."
          caption={mentionsScanned ? "last 7 days" : "run a scan"}
          captionMuted={!mentionsScanned}
          loading={loading || mentionsScanLoading}
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

        {/* Your position in the competitive set, from the same
            rankLeaderboard() the Rankings panel uses - the tile and the panel
            are one claim shown twice and must not sort independently.
            Previously specced as a cross-account GLOBAL rank, which needs an
            index that does not exist, so it rendered a permanent `–` directly
            above a panel reading "You: #1 of 14 tracked". */}
        <Tile
          dest={DEST.competitors}
          label="Rank"
          tip="Your position by share of voice among the brands you track."
          caption={ownRank === null ? "no competitors tracked" : `of ${trackedBrands} tracked`}
          captionMuted={ownRank === null}
          loading={leaderboardLoading}
        >
          {ownRank === null ? (
            <NoValue className={VALUE} />
          ) : (
            <span className={VALUE}>#{ownRank}</span>
          )}
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

        {/* Replaced "AI Traffic" (needed a Google Analytics connection that
            does not exist). Unresolved contradicted claims - measured on every
            citation run, and the highest-stakes number on this strip. */}
        <Tile
          dest={DEST.hallucinations}
          label="Hallucinations"
          tip="Claims an AI engine stated about you that contradict your fact sheet, still unresolved."
          caption={
            hallucinations === null
              ? "not checked yet"
              : `${(hallucinations.bySeverity.critical ?? 0) + (hallucinations.bySeverity.high ?? 0)} critical or high`
          }
          captionMuted={hallucinations === null}
          loading={hallucinationsLoading}
        >
          {hallucinations === null ? (
            <NoValue className={VALUE} />
          ) : (
            <span className={VALUE}>{hallucinations.total - hallucinations.resolved}</span>
          )}
        </Tile>

        {/* Replaced "Conversations" (needed AI-crawler tracking on the
            customer's domain). "Best of" roundups are a source AI engines lean
            on heavily, and presence in them was already scanned and stored. */}
        <Tile
          dest={DEST.listicles}
          label="Listicles"
          tip={'"Best of" roundups in your category that list your brand, out of those we track.'}
          caption={listicles === null ? "not scanned yet" : `of ${listicles.length} tracked`}
          captionMuted={listicles === null}
          loading={listiclesLoading}
          last
        >
          {listicles === null ? (
            <NoValue className={VALUE} />
          ) : (
            <span className={VALUE}>{listicles.filter((l) => l.isIncluded === 1).length}</span>
          )}
        </Tile>
      </div>
    </div>
  );
}
