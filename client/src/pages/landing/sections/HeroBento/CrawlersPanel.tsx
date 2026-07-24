import { CRAWLER_BARS } from "./chartData";
import { CRAWLER_ROWS } from "./data";

// Crawlers panel content, verbatim from _reference/index.html lines
// 1196-1307 (desktop) / 1499-1608 (mobile carousel duplicate -- confirmed
// identical content on spot-check). Rendered as a single reusable component
// mounted twice by HeroBento.tsx: once inside the `hidden md:grid` desktop
// row, once inside the `md:hidden` mobile snap-scroll carousel -- the
// col-span-4/snap-start wrapper classes differ per mount site, so they live
// in HeroBento.tsx, not here.
export function CrawlersPanel() {
  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium text-vc-secondary">Crawlers</p>
      </div>
      <div className="relative">
        <div className="flex items-end gap-[2px] h-[56px]">
          {CRAWLER_BARS.map((bar, i) => (
            <div key={i} className="flex-1 h-full relative cursor-pointer">
              <div
                className="absolute bottom-0 left-0 right-0 rounded-[1px]"
                style={{
                  height: `${bar.heightPct}%`,
                  backgroundColor: `rgba(14, 147, 115, ${bar.bgOpacity})`,
                  opacity: bar.barOpacity,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[8px] font-mono text-vc-tertiary">24h ago</span>
          <span className="text-[8px] font-mono text-vc-text-muted">Now</span>
        </div>
      </div>

      <div className="mt-3 mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] font-semibold tracking-tight text-vc-primary tabular-nums leading-none">
            7,247
          </span>
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-vc-accent tabular-nums">
            ↑12%
          </span>
        </div>
        <span className="text-[10px] text-vc-text-muted mt-0.5 block">crawls this week</span>
      </div>

      <div className="space-y-1 mt-auto">
        {CRAWLER_ROWS.map((row) => (
          <div
            key={row.name}
            data-crawler-row={row.name}
            className={
              "flex items-center gap-2 py-1 px-1 -mx-1 rounded cursor-pointer transition-colors duration-150 hover:bg-[rgba(244,244,240,0.55)]" +
              (row.mdHidden ? " md:hidden" : "")
            }
          >
            <img
              src={row.logoSrc}
              alt=""
              width={14}
              height={14}
              className="w-3.5 h-3.5 shrink-0 object-contain"
            />
            <span className="w-[80px] text-[11px] truncate transition-colors text-vc-secondary">
              {row.name}
            </span>
            <div className="flex-1 h-[3px] bg-vc-muted overflow-hidden rounded-sm">
              <div
                className="h-full"
                style={{ width: `${row.widthPct}%`, backgroundColor: row.color }}
              />
            </div>
            <span className="text-[10px] font-mono tabular-nums text-vc-text-muted w-8 text-right">
              {row.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
