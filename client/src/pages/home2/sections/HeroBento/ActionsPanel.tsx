import { ACTION_ROWS } from "./data";
import { ChevronRightIcon, PlayIcon } from "./icons";

// Actions panel content, verbatim from _reference/index.html lines
// 1450-1493 (desktop) / 1750-1793 (mobile carousel duplicate -- confirmed
// identical content on spot-check). Mounted twice by HeroBento.tsx, same
// pattern as CrawlersPanel/ConversationsPanel.
//
// Only the first row is expanded in the settled snapshot (an accordion with
// no other row's expanded state ever captured in source) -- rendered
// statically as captured rather than wired into a real accordion, since
// building one would require inventing expanded content for rows 2-4 that
// doesn't exist in the source.
export function ActionsPanel() {
  const [firstRow, ...restRows] = ACTION_ROWS;

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-medium text-tk-secondary">Actions</p>
        <span className="text-[11px] tabular-nums text-tk-tertiary">
          7 open<span className="text-tk-tertiary"> · </span>
          <span className="text-tk-accent">+24</span>
        </span>
      </div>

      <div className="-mx-1 flex flex-col">
        {/* Row 1 — pre-expanded */}
        <div>
          <button
            type="button"
            className="group flex w-full items-center gap-2.5 px-2 py-2 text-left transition-colors duration-200 hover:bg-tk-muted/50 cursor-pointer rounded"
          >
            <span className="w-8 shrink-0 text-[10px] font-mono tabular-nums text-tk-accent">
              {firstRow.delta}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] leading-4 font-medium text-tk-primary">
                {firstRow.title}
              </span>
            </span>
            <ChevronRightIcon
              size={13}
              className="shrink-0 text-tk-text-muted transition-transform duration-200 rotate-90 text-tk-accent"
            />
          </button>
          {firstRow.expanded && (
            <div className="pr-2 pb-3 pl-[50px]">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-tk-text-muted">
                <span className="font-mono tabular-nums">{firstRow.expanded.date}</span>
                <span className="text-tk-tertiary">·</span>
                <span>{firstRow.expanded.tag}</span>
              </div>
              <p className="mb-2.5 text-[10.5px] leading-snug text-tk-tertiary">
                {firstRow.expanded.body}
              </p>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1.5 rounded bg-tk-accent-subtle px-2.5 text-[11px] font-medium text-tk-accent transition-colors duration-200 hover:bg-tk-accent hover:text-white cursor-pointer"
              >
                <span>{firstRow.expanded.ctaLabel}</span>
                <PlayIcon size={9} />
              </button>
            </div>
          )}
        </div>

        {/* Rows 2-4 — collapsed */}
        {restRows.map((row) => (
          <div key={row.title} className="border-t border-tk-subtle">
            <button
              type="button"
              className="group flex w-full items-center gap-2.5 px-2 py-2 text-left transition-colors duration-200 hover:bg-tk-muted/50 cursor-pointer rounded"
            >
              <span className="w-8 shrink-0 text-[10px] font-mono tabular-nums text-tk-accent">
                {row.delta}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] leading-4 text-tk-secondary group-hover:text-tk-primary">
                  {row.title}
                </span>
              </span>
              <ChevronRightIcon
                size={13}
                className="shrink-0 text-tk-text-muted transition-transform duration-200 group-hover:text-tk-secondary"
              />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-tk-subtle px-2 pt-2 mt-1">
        <span className="text-[10px] tabular-nums text-tk-tertiary">+3 more</span>
        <span className="text-[10px] text-tk-tertiary">Sorted by ROI</span>
      </div>
    </div>
  );
}
