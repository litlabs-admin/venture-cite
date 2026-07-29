import { ChevronRight } from "lucide-react";
import { AI_PLATFORMS_ACTIVE } from "@shared/constants";
import { CCLink, DEST, HoverCard } from "./primitives";
import type { PlatformRank } from "./useCommandCenterData";

// ─── Platform strip ──────────────────────────────────────────────────────────
// Eight hairline-separated cells, 49px tall: logo + citation count + a 2px
// share bar. Measured cell spec: px-2.5 py-2.5, logo 16px, bar h-[2px] over
// bg-muted/50.
//
// Hovering a cell raises a 192px card (measured): accent dot + eyebrow, the
// platform's visibility score over /100, one line describing the engine, and
// an accent call-to-action. Cells with no data get the "No data yet" variant.
//
// Only AI_PLATFORMS_ACTIVE produce data. The planned platforms still occupy
// their cells (the strip is a fixed 8-wide grid in the reference) but render
// grayscale with `–`, which is what "we don't query this yet" looks like.

const LOGOS: Record<string, string> = {
  ChatGPT: "/venturecite/images/ai-logos/chatgpt.svg",
  Claude: "/venturecite/images/ai-logos/claude.svg",
  Perplexity: "/venturecite/images/ai-logos/perplexity.svg",
  Gemini: "/venturecite/images/ai-logos/gemini.svg",
  Grok: "/venturecite/images/ai-logos/grok.svg",
  "Meta AI": "/venturecite/images/ai-logos/meta-ai.svg",
  "Google AI": "/venturecite/images/ai-logos/google.svg",
};

// One line per engine, shown in the hover card. Same register as the
// reference's ("Anthropic's Claude - known for safety and helpfulness").
const BLURB: Record<string, string> = {
  ChatGPT: "OpenAI's ChatGPT — the most widely used AI assistant",
  Claude: "Anthropic's Claude — known for safety and helpfulness",
  Perplexity: "Perplexity AI — answer engine with citations",
  Gemini: "Google's Gemini — search-grounded assistant",
  DeepSeek: "DeepSeek — open-weight reasoning models",
  Grok: "xAI's Grok — not queried yet",
  "Meta AI": "Meta AI — not queried yet",
  "Google AI": "Google's AI-generated search summaries — not queried yet",
};

// DeepSeek ships no logo asset, so it falls back to a monogram rather than a
// broken image.
const PLANNED_SHOWN = ["Grok", "Meta AI", "Google AI"] as const;
const CELLS = [...AI_PLATFORMS_ACTIVE, ...PLANNED_SHOWN];

function Cell({
  name,
  platform,
  share,
  last,
  center,
}: {
  name: string;
  platform: PlatformRank | undefined;
  share: number;
  last?: boolean;
  center?: boolean;
}) {
  const logo = LOGOS[name];
  const count = platform ? platform.citedCount : null;
  const dim = count === null || count === 0;

  return (
    <div className={last ? "" : "border-r border-vc-default"}>
      <CCLink
        dest={DEST.promptResults}
        className="group relative flex flex-col px-2.5 py-2.5 transition-colors hover:bg-vc-muted/40"
      >
        <HoverCard align={center ? "center" : "left"}>
          {platform ? (
            <>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-vc-accent" aria-hidden />
                <span className="text-label font-medium uppercase tracking-wider text-vc-text-muted">
                  {name}
                </span>
              </div>
              <div className="mb-2 flex items-baseline gap-1">
                <span className="text-[22px] font-semibold tabular-nums tracking-tight text-vc-primary">
                  {platform.visibilityScore}
                </span>
                <span className="text-data font-medium text-vc-text-muted">/100</span>
              </div>
              <p className="mb-2 text-data leading-relaxed text-vc-secondary">
                {platform.citedCount} of {platform.totalCount} checks cited. {BLURB[name] ?? name}
              </p>
            </>
          ) : (
            <>
              <p className="mb-1.5 text-caption text-vc-tertiary">Not queried yet</p>
              <p className="mb-2 text-data leading-relaxed text-vc-secondary">
                {BLURB[name] ?? name}
              </p>
            </>
          )}
          <p className="flex items-center gap-1 text-label font-medium text-vc-accent">
            View prompts by model
            <ChevronRight className="h-2.5 w-2.5" aria-hidden />
          </p>
        </HoverCard>

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
        <div className="grid flex-1 grid-cols-4 sm:grid-cols-8">
          {CELLS.map((name, i) => {
            const p = byName.get(name);
            return (
              <Cell
                key={name}
                name={name}
                platform={p}
                share={p ? p.citedCount / max : 0}
                last={i === CELLS.length - 1}
                // Cards on the leading cell hang left so they don't clip the
                // viewport; the rest centre over their cell.
                center={i > 0}
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
