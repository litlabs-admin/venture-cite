import { ChevronRight } from "lucide-react";
import { AI_PLATFORMS_ACTIVE } from "@shared/constants";
import { CCLink, DEST } from "./primitives";
import type { PlatformRank } from "./useDashboardData";

// ─── Platform strip ──────────────────────────────────────────────────────────
// Six hairline-separated cells, 49px tall: logo + citation count + a 2px share
// bar. Measured cell spec: px-2.5 py-2.5, logo 16px, bar h-[2px] over
// bg-muted/50. The whole cell is a link to the per-model results.
//
// Each cell used to raise a 192px hover card (score over /100, a line about the
// engine, a "View prompts by model" link). Removed on request: the cards
// covered the panels behind them and the same numbers are one click away on
// the results page the cell already links to.
//
// ONLY platforms we actually query get a cell. Meta AI and Google AI used to
// occupy greyed-out cells rendering `–` "not queried yet" - strip space spent
// advertising engines that produce no data and that the user cannot enable.
// The reference's 8-wide grid is not a reason to ship dead columns. Grok was
// one of those dead cells; it is a real queried platform now, so it earns one.

const LOGOS: Record<string, string> = {
  ChatGPT: "/venturecite/images/ai-logos/chatgpt.svg",
  Claude: "/venturecite/images/ai-logos/claude.svg",
  Perplexity: "/venturecite/images/ai-logos/perplexity.svg",
  Gemini: "/venturecite/images/ai-logos/gemini.svg",
  Grok: "/venturecite/images/ai-logos/grok.svg",
};

// DeepSeek ships no logo asset, so it falls back to a monogram rather than a
// broken image.
const CELLS = AI_PLATFORMS_ACTIVE;

function Cell({
  name,
  platform,
  share,
  last,
}: {
  name: string;
  platform: PlatformRank | undefined;
  share: number;
  last?: boolean;
}) {
  const logo = LOGOS[name];
  const count = platform ? platform.citedCount : null;
  const dim = count === null || count === 0;

  return (
    <div className={last ? "" : "border-r border-vc-default"}>
      <CCLink
        dest={DEST.promptResults}
        // `title` carries what the hover card used to say, without painting a
        // panel over the page.
        title={
          platform
            ? `${name}: ${platform.citedCount} of ${platform.totalCount} checks cited`
            : `${name}: not queried yet`
        }
        className="group flex flex-col px-2.5 py-2.5 transition-colors hover:bg-vc-muted/40"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {logo ? (
            <img
              src={logo}
              alt=""
              className={`h-4 w-4 object-contain transition-transform group-hover:scale-105 ${
                dim ? "grayscale" : ""
              }`}
            />
          ) : (
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-sm bg-vc-muted text-[8px] font-semibold ${
                dim ? "text-vc-hover" : "text-vc-secondary"
              }`}
              aria-hidden
            >
              {name.charAt(0)}
            </span>
          )}
          <span
            className={`font-mono text-data tabular-nums ${
              dim ? "text-vc-hover" : "text-vc-primary"
            }`}
          >
            {count === null ? "–" : count}
          </span>
        </div>
        <div className="h-[2px] w-full overflow-hidden bg-vc-muted/50">
          <div
            className={dim ? "h-full bg-vc-hover/30" : "h-full bg-vc-accent"}
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </div>
      </CCLink>
    </div>
  );
}

export function PlatformStrip({ platforms }: { platforms: PlatformRank[] }) {
  const byName = new Map(platforms.map((p) => [p.aiPlatform, p]));
  const max = Math.max(1, ...platforms.map((p) => p.citedCount));

  return (
    <div className="border-b border-vc-default">
      <div className="flex">
        <div className="grid flex-1 grid-cols-3 sm:grid-cols-6">
          {CELLS.map((name, i) => {
            const p = byName.get(name);
            return (
              <Cell
                key={name}
                name={name}
                platform={p}
                share={p ? p.citedCount / max : 0}
                last={i === CELLS.length - 1}
              />
            );
          })}
        </div>
        <CCLink
          dest={DEST.promptResults}
          className="flex flex-shrink-0 items-center gap-0.5 whitespace-nowrap border-l border-vc-default px-4 text-label text-vc-label transition-colors hover:text-vc-accent"
        >
          Explore
          <ChevronRight className="h-2.5 w-2.5" aria-hidden />
        </CCLink>
      </div>
    </div>
  );
}
