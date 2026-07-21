import type { CSSProperties } from "react";
import { scrollRevealEase } from "@/pages/home2/hooks/useScrollReveal";
import { TrendingUpIcon, MinusIcon } from "./icons";
import { faviconUrl } from "@/pages/home2/faviconUrl";

const dotGridStyle = { "--mkt-dot-opacity": 0.1 } as CSSProperties;

// Row 02 "Understand" mockup — "Citation footprint" + "Top Sources" +
// "Search Queries" cards, verbatim structure from
// _reference/index.html 2163-2249. Per the simplify-choreography rule the
// dozens of individually-delayed child fades are collapsed into the ONE
// outer reveal already applied by the caller (index.html:2160, 700ms
// translateY(20px) delay 150ms).
//
// The 4 legend percentages (Reviews 43% / Social 24% / News 20% / Other
// 13%) ARE verbatim/recoverable text content in source. Only the bar
// SEGMENT WIDTHS were captured as inline `width: 0%` (pre-animation) — the
// widths below are derived directly from these confirmed percentages
// (43% / 24% / 20% / 13%, summing to 100%), which is a legitimate
// derivation rather than an invented value.
const footprintSegments = [
  {
    key: "reviews",
    label: "Reviews",
    pct: 43,
    barClassName: "bg-tk-accent",
    dotClassName: "bg-tk-accent",
  },
  {
    key: "social",
    label: "Social",
    pct: 24,
    barClassName: "bg-tk-accent/60",
    dotClassName: "bg-tk-accent/60",
  },
  {
    key: "news",
    label: "News",
    pct: 20,
    barClassName: "bg-tk-accent/35",
    dotClassName: "bg-tk-accent/35",
  },
  {
    key: "other",
    label: "Other",
    pct: 13,
    barClassName: "bg-tk-accent/20",
    dotClassName: "bg-tk-accent/20",
  },
];

// Verbatim from index.html 2200-2229 (chip labels + citation counts + trend
// icon per chip: G2 trending-up/accent, Reddit trending-up/success,
// TechCrunch minus/muted (flat), Capterra trending-up/success).
const topSources = [
  {
    name: "G2",
    domain: "g2.com",
    count: "14",
    trend: "up" as const,
    chipClassName: "bg-tk-accent-subtle border border-tk-accent/20",
    nameClassName: "text-tk-accent",
    countClassName: "text-tk-accent",
    iconClassName: "text-tk-accent",
  },
  {
    name: "Reddit",
    domain: "reddit.com",
    count: "13",
    trend: "up" as const,
    chipClassName: "bg-tk-muted/40 border border-transparent hover:bg-tk-muted/60",
    nameClassName: "text-tk-primary",
    countClassName: "text-tk-secondary",
    iconClassName: "text-tk-success",
  },
  {
    name: "TechCrunch",
    domain: "techcrunch.com",
    count: "7",
    trend: "flat" as const,
    chipClassName: "bg-tk-muted/40 border border-transparent hover:bg-tk-muted/60",
    nameClassName: "text-tk-primary",
    countClassName: "text-tk-secondary",
    iconClassName: "text-tk-text-muted",
  },
  {
    name: "Capterra",
    domain: "capterra.com",
    count: "6",
    trend: "up" as const,
    chipClassName: "bg-tk-muted/40 border border-transparent hover:bg-tk-muted/60",
    nameClassName: "text-tk-primary",
    countClassName: "text-tk-secondary",
    iconClassName: "text-tk-success",
  },
];

// Verbatim from index.html 2238-2246.
const searchQueries = [
  { query: "Best running shoes 2026", count: "24" },
  { query: "Nike vs Adidas", count: "18" },
  { query: "Top basketball sneakers", count: "12" },
];

export function UnderstandMockup({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="relative bg-white overflow-hidden h-full flex flex-col min-h-[240px] sm:min-h-[320px] lg:min-h-[360px]">
      <div
        className="absolute inset-0 pointer-events-none mkt-dot-grid"
        aria-hidden="true"
        style={dotGridStyle}
      />
      <div className="relative flex-1 flex items-center justify-center py-8">
        <div
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
            transition: `700ms ${scrollRevealEase} 150ms`,
          }}
        >
          <div className="p-6 lg:p-8">
            <div className="flex flex-col gap-6">
              {/* Citation footprint card */}
              <div className="bg-white border border-tk-default rounded overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-tk-default">
                  <div>
                    <div className="text-[12px] font-semibold text-tk-primary">
                      Citation footprint
                    </div>
                    <div className="text-[10px] text-tk-text-muted mt-0.5">Where AI finds you</div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[24px] font-semibold tracking-tight tabular-nums text-tk-accent">
                      23
                    </span>
                    <span className="text-[11px] text-tk-text-muted">sources</span>
                  </div>
                </div>
                <div className="px-5 py-5">
                  <div className="h-2.5 flex rounded overflow-hidden bg-tk-muted/30">
                    {footprintSegments.map((seg) => (
                      <div
                        key={seg.key}
                        className={seg.barClassName}
                        style={{ width: `${seg.pct}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-5 mt-4">
                    {footprintSegments.map((seg) => (
                      <div key={seg.key} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-sm ${seg.dotClassName}`} />
                        <span className="text-[11px] text-tk-secondary">{seg.label}</span>
                        <span className="text-[11px] font-semibold tabular-nums text-tk-primary relative">
                          {seg.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Top Sources + Search Queries card */}
              <div className="bg-white border border-tk-default rounded overflow-hidden">
                <div className="px-5 py-4 border-b border-tk-default">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-tk-primary">Top Sources</div>
                    <div className="text-[10px] text-tk-text-muted">By citation count</div>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {topSources.map((s) => (
                      <div
                        key={s.name}
                        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded ${s.chipClassName}`}
                      >
                        {/* Plain <img>, not next/image: external Google
                            favicon-service URL, no remotePatterns
                            configured (see closing report). */}
                        <img
                          alt=""
                          className="w-3.5 h-3.5 object-contain rounded-sm"
                          src={faviconUrl(s.domain, 32)}
                        />
                        <span className={`text-[11px] font-medium ${s.nameClassName}`}>
                          {s.name}
                        </span>
                        <span
                          className={`text-[11px] font-mono tabular-nums transition-colors duration-500 ${s.countClassName}`}
                        >
                          {s.count}
                        </span>
                        {s.trend === "up" ? (
                          <TrendingUpIcon className={s.iconClassName} />
                        ) : (
                          <MinusIcon className={s.iconClassName} />
                        )}
                      </div>
                    ))}
                    <span className="text-[10px] text-tk-text-muted tabular-nums whitespace-nowrap flex-shrink-0">
                      +19 more
                    </span>
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-tk-primary">Search Queries</div>
                    <div className="text-[10px] text-tk-text-muted">What triggers citations</div>
                  </div>
                  <div className="space-y-1">
                    {searchQueries.map((q) => (
                      <div
                        key={q.query}
                        className="flex items-center gap-3 group -mx-2 px-2 py-1 rounded"
                      >
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-tk-accent" />
                        <span className="flex-1 text-[11px] text-tk-secondary truncate group-hover:text-tk-primary transition-colors duration-150">
                          {q.query}
                        </span>
                        <span
                          className="text-[11px] font-mono tabular-nums font-medium transition-colors duration-500"
                          style={{ color: "var(--color-secondary)" }}
                        >
                          {q.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
