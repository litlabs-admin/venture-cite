import { useEffect, useState } from "react";
import { scrollRevealEase } from "@/pages/landing/hooks/useScrollReveal";
import { TopChrome } from "./TopChrome";
import { VisibilityChartPanel } from "./VisibilityChartPanel";
import { RankingsList } from "./RankingsList";
import { CrawlersPanel } from "./CrawlersPanel";
import { ConversationsPanel } from "./ConversationsPanel";
import { ActionsPanel } from "./ActionsPanel";

// Verbatim from _reference/index.html lines 1064-1807 -- the "live product
// dashboard" screenshot card sitting directly under the hero headline.
//
// MOUNT-VS-SCROLL-REVEAL DECISION: like Hero.tsx directly above it, this
// section is not scroll-triggered in source -- the shell's own inline style
// (line 1067) shows it already settled (opacity: 1, translateY(0px)) with
// just a 600ms mount transition defined, not an IntersectionObserver-driven
// one. It's also always in the initial viewport (directly below the hero),
// so per the task's own suggested options we picked a simple one-time fade
// on mount (matching Hero's pattern) rather than useScrollReveal.
//
// SIMPLIFY-CHOREOGRAPHY: dozens of individual bars/rows across this section
// carry their own transition-delay in source (rankings rows ~45ms apart via
// rankRowIn, conversation rows via convoIn, crawler bars via inline delays,
// etc.). Per the task's simplify-choreography rule, none of those ~20+
// per-element stagger delays are individually wired -- every row/bar renders
// at its real, settled final value (heights/widths/opacities/copy are
// almost all recoverable real data in this section, see closing report),
// with only this one outer mount fade covering the reveal.
export function HeroBento() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative z-20 overflow-visible">
      <div className="px-4 pt-6 pb-12 sm:pt-8 sm:pb-14 lg:px-8 lg:pt-10 lg:pb-16">
        <div className="mx-auto" style={{ maxWidth: 1280 }}>
          <div
            className="hero-bento-shell relative bg-vc-surface rounded-md overflow-hidden ring-1 ring-black/[0.07]"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0px)" : "translateY(8px)",
              transition: `opacity 600ms ${scrollRevealEase}, transform 600ms ${scrollRevealEase}`,
              boxShadow:
                "rgba(15, 23, 42, 0.22) 0px -8px 28px -24px, rgba(15, 23, 42, 0.14) 0px 24px 60px -20px, rgba(15, 23, 42, 0.08) 0px 8px 24px -12px",
            }}
          >
            <TopChrome />

            {/* Row 1 */}
            <div className="grid grid-cols-12 border-b border-vc-hairline lg:min-h-[296px]">
              <VisibilityChartPanel />
              <RankingsList />
            </div>

            {/* Row 2 — desktop grid */}
            <div className="hidden md:grid md:grid-cols-12 md:min-h-[280px]">
              <div className="col-span-4 border-r border-vc-hairline">
                <CrawlersPanel />
              </div>
              <div className="col-span-4 border-r border-vc-hairline">
                <ConversationsPanel />
              </div>
              <div className="col-span-4">
                <ActionsPanel />
              </div>
            </div>

            {/* Row 2 — mobile snap-scroll carousel (same 3 panels, DOM-equivalent
                to source's second static copy, mounted from the same shared
                components rather than duplicated markup) */}
            <div className="md:hidden relative">
              <div className="hero-bento-row2-scroll flex items-stretch overflow-x-auto snap-x snap-mandatory scroll-smooth">
                <div className="snap-start shrink-0 w-[84vw] border-r border-vc-hairline">
                  <CrawlersPanel />
                </div>
                <div className="snap-start shrink-0 w-[84vw] border-r border-vc-hairline">
                  <ConversationsPanel />
                </div>
                <div className="snap-start shrink-0 w-[84vw]">
                  <ActionsPanel />
                </div>
                <div className="shrink-0 w-4" aria-hidden="true" />
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-0 bottom-0 w-10"
                style={{
                  background:
                    "linear-gradient(to left, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0))",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
