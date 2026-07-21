import { useScrollReveal, scrollRevealEase } from "@/pages/home2/hooks/useScrollReveal";
import { ResourceCard } from "./ResourceCard";
import { AiSearchAreaChart } from "./AiSearchAreaChart";
import { DataTileGrid } from "./DataTileGrid";
import { ArrowRightIcon } from "./icons";
import { resourceCards } from "./data";

// Learn/Research section — _reference/index.html lines 3410-3592. Unlike the
// other numbered sections, this one carries its own top margin and inlines
// its own "[07]" eyebrow directly (no separate sibling SectionHeader div),
// so it does not use the shared SectionHeader component.
//
// One bordered panel (max-width 1120px) containing three stacked pieces,
// each divided by a border-t: a 3-col resource row (Documentation/API/MCP),
// a feature block (headline link + the inline AI-referral-traffic area
// chart), and a 4-col data tile grid (Rankings/Citations/AI traffic/
// Queries). All reveal timing is driven by a single useScrollReveal call on
// the outer <section>, matching the source's one-observer-per-section model.
export function LearnResearch() {
  const { ref, isVisible } = useScrollReveal<HTMLElement>();

  return (
    <section
      id="learn-research-section"
      ref={ref}
      className="bg-tk-surface relative mt-[42px] sm:mt-[62px] lg:mt-[83px]"
    >
      <div
        className={
          "hidden lg:flex items-center absolute top-0 z-20 h-[72px] transition-all duration-500 " +
          (isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2")
        }
        style={{ left: "calc(50% - 624px)", transitionTimingFunction: scrollRevealEase }}
      >
        <span className="text-[11px] font-semibold tracking-[0.08em] text-tk-accent tabular-nums">
          [07]
        </span>
      </div>

      <div className="px-4 lg:px-8 ">
        <div className="mx-auto" style={{ maxWidth: 1120 }}>
          <div
            className="border border-tk-default overflow-hidden bg-tk-surface"
            style={{ maxWidth: 1120, margin: "0px auto" }}
          >
            <div
              className={
                "grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-tk-default transition-all duration-700 " +
                (isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
              }
              style={{ transitionTimingFunction: scrollRevealEase }}
            >
              {resourceCards.map((item) => (
                <ResourceCard key={item.href} item={item} isVisible={isVisible} />
              ))}
            </div>

            <div
              className={
                "border-t border-tk-default px-4 sm:px-6 lg:px-8 py-6 sm:py-7 transition-all duration-700 " +
                (isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3")
              }
              style={{ transitionTimingFunction: scrollRevealEase }}
            >
              <a className="group inline-flex flex-col gap-1.5 w-full" href="#platform-section">
                <span className="inline-flex items-center gap-2">
                  <span className="text-[15px] sm:text-[16px] font-semibold text-tk-primary tracking-[-0.01em] group-hover:text-tk-accent transition-colors duration-200">
                    See how AI search actually works
                  </span>
                  <ArrowRightIcon
                    size={14}
                    strokeWidth={1.5}
                    className="text-tk-text-muted opacity-0 -translate-x-0.5 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                  />
                </span>
                <span className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
                  <span className="text-[12px] sm:text-[13px] text-tk-secondary">
                    Track what AI crawls, cites, and recommends about your brand.
                  </span>
                  <span className="tds-mono text-[10px] font-normal tabular-nums tracking-[0.02em] text-tk-tertiary whitespace-nowrap">
                    AI referral traffic · illustrative
                  </span>
                </span>
              </a>

              <AiSearchAreaChart isVisible={isVisible} />
            </div>

            <DataTileGrid isVisible={isVisible} />
          </div>
        </div>
      </div>
    </section>
  );
}
