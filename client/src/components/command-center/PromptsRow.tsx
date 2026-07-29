import { ChevronRight } from "lucide-react";
import { PanelLabel, PanelLink, NoValue, CCLink, DEST } from "./primitives";
import type { PromptRow } from "./useCommandCenterData";

// ─── Top prompts + Site Health + Perception ──────────────────────────────────
// Third content row: prompts across two thirds, two stacked panels in the last.
// Prompt row spec (measured): 36px, py-2 px-2, index (10px mono, w-3) · prompt
// (12px, truncate) · volume (11px mono) · mentions (13px semibold, w-7) ·
// per-platform bars (w-7 h-3) · delta (11px mono, w-4).

function PromptLine({ row, index }: { row: PromptRow; index: number }) {
  const cited = row.platforms.filter((p) => p.isCited).length;
  return (
    <CCLink
      dest={DEST.prompts}
      className="group flex items-center gap-3 px-2 py-2 transition-colors duration-150 hover:bg-vc-muted/50"
    >
      <span className="w-3 flex-shrink-0 font-mono text-[10px] tabular-nums text-vc-hover">
        {index}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-vc-secondary transition-colors group-hover:text-vc-primary">
        {row.prompt}
      </span>
      {/* Search volume has no source: brand_prompts carries no volume column. */}
      <NoValue className="flex-shrink-0 font-mono text-[11px]" />
      <span className="w-7 flex-shrink-0 text-right text-[13px] font-semibold tabular-nums text-vc-primary">
        {cited}
      </span>
      <div className="flex h-3 w-7 flex-shrink-0 items-end gap-px" aria-hidden>
        {row.platforms.map((p) => (
          <div
            key={p.platform}
            className={`h-full flex-1 transition-all ${p.isCited ? "bg-vc-accent" : "bg-vc-default"}`}
          />
        ))}
      </div>
      <NoValue className="w-4 flex-shrink-0 text-right font-mono text-[11px]" />
    </CCLink>
  );
}

export function PromptsRow({ prompts, loading }: { prompts: PromptRow[]; loading: boolean }) {
  const top = [...prompts]
    .sort(
      (a, b) =>
        b.platforms.filter((p) => p.isCited).length - a.platforms.filter((p) => p.isCited).length,
    )
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 border-b border-vc-default lg:grid-cols-3">
      {/* Top prompts */}
      <div className="border-b border-vc-default px-8 py-6 lg:col-span-2 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="mb-3 flex h-4 items-center justify-between">
            <PanelLabel>Top Prompts</PanelLabel>
            <PanelLink dest={DEST.prompts}>View all</PanelLink>
          </div>
          <div className="-mx-2 flex-1">
            {loading ? (
              <div className="space-y-3 px-2 pt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-4 rounded-sm bg-vc-muted" />
                ))}
              </div>
            ) : top.length === 0 ? (
              <p className="px-2 pt-2 text-[11px] text-vc-tertiary">
                No prompt results yet. Run a citation check to populate this list.
              </p>
            ) : (
              top.map((r, i) => <PromptLine key={r.promptId} row={r} index={i + 1} />)
            )}
          </div>
        </div>
      </div>

      {/* Site Health + Perception — neither metric has a backing source. */}
      <div className="flex flex-col">
        <div className="px-6 py-6">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex h-4 items-center justify-between">
              <PanelLabel>Site Health</PanelLabel>
              <PanelLink dest={DEST.signals}>Optimize</PanelLink>
            </div>
            <div className="flex flex-1 items-center gap-5">
              <div className="relative flex-shrink-0">
                <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
                  <circle cx="28" cy="28" r="26" fill="none" stroke="#f5f5f4" strokeWidth="3" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <NoValue className="text-[14px] font-semibold leading-none" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11px] text-vc-tertiary">Site crawling not set up</p>
                <CCLink
                  dest={DEST.crawler}
                  className="flex items-center gap-0.5 text-[10px] text-vc-accent hover:underline"
                >
                  Check crawler access
                  <ChevronRight className="h-2.5 w-2.5" aria-hidden />
                </CCLink>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-vc-default" />

        <div className="px-6 py-6">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex h-4 items-center justify-between">
              <PanelLabel>Perception</PanelLabel>
              <PanelLink dest={DEST.overview}>Details</PanelLink>
            </div>
            <div className="flex flex-1 gap-6">
              <div className="flex flex-col">
                <NoValue className="text-[24px] font-semibold leading-none" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="text-[11px] text-vc-tertiary">
                  Dimension scoring not available yet — only overall sentiment is measured today.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
