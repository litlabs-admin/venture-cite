import { NoValue, InfoDot } from "@/components/dashboard-panels/primitives";

// ─── Funnel stat row ─────────────────────────────────────────────────────
// Reference (trakkr.ai/optimize) shows 6 tiles: AI can reach / Bots fetch /
// AI can read / Matches asks / AI cites / People arrive - each a
// click-to-filter button over the checks table.
//
// HONESTY: only the first 3 have a real measurement in this codebase today.
// "Matches asks" needs a citation-matching pipeline, "AI cites" needs the
// citation-run join, "People arrive" needs traffic analytics - none exist
// yet, so those three render NoValue and are NOT clickable (there is
// nothing real to filter to). This mirrors the reference's OWN convention
// for its own unmeasured stats ("not measured yet"), not a shortcut - the
// reference is honest about gaps in exactly this same way.

export type FunnelStage = "reach" | "fetch" | "read";

interface FunnelStatRowProps {
  crawlersTotal: number;
  crawlersAllowed: number;
  crawlersBlocked: number;
  pagesCrawled: number | null;
  pagesFailed: number | null;
  pagesWithContent: number | null;
  pagesTotal: number | null;
  activeStage: FunnelStage | null;
  onToggleStage: (stage: FunnelStage) => void;
}

function Tile({
  label,
  value,
  caption,
  active,
  onClick,
  tooltip,
}: {
  label: string;
  value: React.ReactNode;
  caption: string;
  active?: boolean;
  onClick?: () => void;
  tooltip: string;
}) {
  const interactive = !!onClick;
  const Comp = interactive ? "button" : "div";
  return (
    <Comp
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={`flex flex-col gap-1 px-4 py-4 text-left transition-colors duration-150 ${
        interactive ? "cursor-pointer hover:bg-vc-muted/50" : ""
      } ${active ? "bg-vc-accent-subtle" : ""}`}
    >
      <span className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-vc-label">
        {label}
        <InfoDot>{tooltip}</InfoDot>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-section font-semibold tracking-tight tabular-nums text-vc-primary">
          {value}
        </span>
      </span>
      <span className="text-data text-vc-tertiary">{caption}</span>
    </Comp>
  );
}

export function FunnelStatRow({
  crawlersTotal,
  crawlersAllowed,
  crawlersBlocked,
  pagesCrawled,
  pagesFailed,
  pagesWithContent,
  pagesTotal,
  activeStage,
  onToggleStage,
}: FunnelStatRowProps) {
  const fetchDenom = (pagesCrawled ?? 0) + (pagesFailed ?? 0);

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-vc-default border-b border-vc-default sm:grid-cols-3 sm:divide-y-0">
      <Tile
        label="AI can reach"
        tooltip="Of the AI crawlers we check, how many robots.txt lets in."
        value={crawlersTotal > 0 ? `${crawlersAllowed} / ${crawlersTotal}` : <NoValue />}
        caption={
          crawlersTotal > 0
            ? crawlersBlocked === 0
              ? "all pass"
              : `${crawlersBlocked} blocked`
            : "not measured yet"
        }
        active={activeStage === "reach"}
        onClick={crawlersTotal > 0 ? () => onToggleStage("reach") : undefined}
      />
      <Tile
        label="Bots fetch"
        tooltip="Pages that were successfully fetched during the last crawl vs. pages that failed."
        value={fetchDenom > 0 ? `${pagesCrawled} / ${fetchDenom}` : <NoValue />}
        caption={
          fetchDenom > 0 ? (pagesFailed ? `${pagesFailed} failed` : "all pass") : "not measured yet"
        }
        active={activeStage === "fetch"}
        onClick={fetchDenom > 0 ? () => onToggleStage("fetch") : undefined}
      />
      <Tile
        label="AI can read"
        tooltip="Pages that yielded extractable content vs. pages that came back empty (often client-rendered content a non-JS crawler never sees)."
        value={pagesTotal ? `${pagesWithContent} / ${pagesTotal}` : <NoValue />}
        caption={
          pagesTotal
            ? (pagesWithContent ?? 0) === pagesTotal
              ? "all pass"
              : `${pagesTotal - (pagesWithContent ?? 0)} empty`
            : "not measured yet"
        }
        active={activeStage === "read"}
        onClick={pagesTotal ? () => onToggleStage("read") : undefined}
      />
      <Tile
        label="Matches asks"
        tooltip="Whether this content actually answers the questions people ask AI. Needs a prompt-matching pipeline we haven't built yet."
        value={<NoValue />}
        caption="not measured yet"
      />
      <Tile
        label="AI cites"
        tooltip="Whether AI answers actually cite these pages as a source. Needs the citation-run join we haven't built yet."
        value={<NoValue />}
        caption="not measured yet"
      />
      <Tile
        label="People arrive"
        tooltip="Visitors who land here after an AI recommendation. Needs traffic analytics we haven't connected yet."
        value={<NoValue />}
        caption="not measured yet"
      />
    </div>
  );
}
