import { CRAWLER_BARS } from "./chartData";
import { CRAWLER_ROWS } from "./data";

// Crawlers panel content, verbatim from _reference/index.html lines
// 1196-1307 (desktop) / 1499-1608 (mobile carousel duplicate -- confirmed
// identical content on spot-check). Rendered as a single reusable component
// mounted twice by HeroBento.tsx: once inside the `hidden md:grid` desktop
// row, once inside the `md:hidden` mobile snap-scroll carousel -- the
// col-span-4/snap-start wrapper classes differ per mount site, so they live
// in HeroBento.tsx, not here.

// Per-vendor share bars are a gradient, not a flat fill. CRAWLER_ROWS.color
// is always `rgba(r, g, b, 0.55)`; the gradient's far end is the same hue at
// full-ish alpha, so the bar gains depth without inventing a second colour.
function gradientEnd(color: string): string {
  return color.replace(/,\s*0\.55\s*\)$/, ", 0.9)");
}

export function CrawlersPanel() {
  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium text-vc-secondary">Crawlers</p>
      </div>
      <div className="relative">
        <div
          className="flex items-end gap-[2px] h-[56px] rounded-[3px] border-b"
          style={{
            background:
              "linear-gradient(180deg, rgba(238,242,254,0.5) 0%, rgba(238,242,254,0) 100%)",
            borderBottomColor: "var(--hb-chart-baseline)",
          }}
        >
          {CRAWLER_BARS.map((bar, i) => {
            const isNow = i === CRAWLER_BARS.length - 1;
            return (
              <div key={i} className="flex-1 h-full relative cursor-pointer">
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t-[2px]"
                  style={{
                    height: `${bar.heightPct}%`,
                    background:
                      "linear-gradient(180deg, var(--accent) 0%, var(--hb-accent-bright) 45%, var(--accent-tint-1) 100%)",
                    // Floor 0.4 -> 0.30: the fill is now a saturated gradient,
                    // not a pale flat, so the old alpha ramp would read too heavy.
                    opacity: isNow ? 1 : 0.3 + 0.7 * (bar.bgOpacity * bar.barOpacity),
                    filter: isNow ? "drop-shadow(0 0 6px rgba(59,91,246,0.40))" : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[9px] font-mono text-vc-tertiary">24h ago</span>
          <span className="text-[9px] font-mono font-medium text-vc-secondary">Now</span>
        </div>
      </div>

      <div className="mt-3 mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] font-semibold tracking-tight text-vc-primary tabular-nums leading-none">
            7,247
          </span>
          <span className="hb-pill hb-pill-up">↑12%</span>
        </div>
        <span className="text-[10px] text-vc-text-muted mt-1 block">crawls this week</span>
      </div>

      <div className="space-y-1 mt-auto">
        {CRAWLER_ROWS.map((row) => (
          <div
            key={row.name}
            data-crawler-row={row.name}
            className={
              "flex items-center gap-2 py-1 px-1 -mx-1 rounded cursor-pointer transition-colors duration-150 hover:bg-vc-row-hover" +
              (row.mdHidden ? " md:hidden" : "")
            }
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-white ring-1 ring-[rgba(22,22,46,0.06)]">
              <img
                src={row.logoSrc}
                alt=""
                width={14}
                height={14}
                className="w-3.5 h-3.5 object-contain"
              />
            </span>
            <span className="w-[80px] text-[11px] truncate transition-colors text-vc-secondary">
              {row.name}
            </span>
            <div
              className="flex-1 h-[5px] overflow-hidden rounded-full"
              style={{
                background: "rgba(22,22,46,0.055)",
                boxShadow: "inset 0 1px 1px rgba(22,22,46,0.04)",
              }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${row.widthPct}%`,
                  background: `linear-gradient(90deg, ${row.color} 0%, ${gradientEnd(row.color)} 100%)`,
                  boxShadow: "0 1px 2px rgba(16,22,55,0.12)",
                }}
              />
            </div>
            <span className="text-[10px] font-mono tabular-nums text-vc-secondary font-medium w-8 text-right">
              {row.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
