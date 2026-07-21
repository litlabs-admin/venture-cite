import { SectionHeader } from "@/pages/home2/sections/SectionHeader/SectionHeader";
import { useScrollReveal } from "@/pages/home2/hooks/useScrollReveal";
import { MarqueeRow, type MarqueeQuery } from "./MarqueeRow";

// Verbatim from _reference/index.html 1840-2002 ("Why Now" / "The Shift").
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Row 1 (drift-left), 6 unique pills in source order (index.html 1902-1912).
const rowOneQueries: MarqueeQuery[] = [
  {
    alt: "ChatGPT",
    src: "/trakkr/images/ai-logos/chatgpt.svg",
    query: "What CRM would work well for a 10-person sales team?",
  },
  {
    alt: "Claude",
    src: "/trakkr/images/ai-logos/claude.png",
    query: "What streaming service has the best original content?",
  },
  {
    alt: "Perplexity",
    src: "/trakkr/images/ai-logos/perplexity.svg",
    query: "Best mattress with a long trial period and free returns?",
  },
  {
    alt: "ChatGPT",
    src: "/trakkr/images/ai-logos/chatgpt.svg",
    query: "Which analytics platform would you recommend for a SaaS?",
  },
  {
    alt: "Gemini",
    src: "/trakkr/images/ai-logos/gemini.svg",
    query: "What meal kit delivery is best for families with kids?",
  },
  {
    alt: "Claude",
    src: "/trakkr/images/ai-logos/claude.png",
    query: "Looking for skincare with clean ingredients that actually works",
  },
];

// Row 2 (drift-right), 6 unique pills in source order (index.html 1941-1951).
const rowTwoQueries: MarqueeQuery[] = [
  {
    alt: "Claude",
    src: "/trakkr/images/ai-logos/claude.png",
    query: "Best carry-on luggage that fits in overhead bins?",
  },
  {
    alt: "ChatGPT",
    src: "/trakkr/images/ai-logos/chatgpt.svg",
    query: "I need HR software that handles payroll for contractors",
  },
  {
    alt: "Grok",
    src: "/trakkr/images/ai-logos/grok.svg",
    query: "What home security system is easiest to install yourself?",
  },
  {
    alt: "Perplexity",
    src: "/trakkr/images/ai-logos/perplexity.svg",
    query: "What project management tool is best for creative agencies?",
  },
  {
    alt: "Gemini",
    src: "/trakkr/images/ai-logos/gemini.svg",
    query: "Any good glasses brands with virtual try-on?",
  },
  {
    alt: "Meta AI",
    src: "/trakkr/images/ai-logos/meta-ai.svg",
    query: "Best credit card for travel rewards right now?",
  },
];

export function WhyNow() {
  const { ref, isVisible } = useScrollReveal<HTMLElement>();

  return (
    <>
      <SectionHeader number="01" label="Why Now" subtitle="The Shift" />
      <section id="why-now-section" ref={ref} className="bg-tk-surface relative">
        <div className="px-4 lg:px-8">
          <div className="mx-auto" style={{ maxWidth: 1120 }}>
            <div
              className="border border-tk-default overflow-hidden"
              style={{ maxWidth: 1120, margin: "0 auto" }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 bg-tk-surface">
                {/* Stat panel */}
                <div
                  className={`lg:col-span-4 p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center lg:border-r border-tk-default border-b lg:border-b-0 transition-all duration-700 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionTimingFunction: EASE }}
                >
                  <div
                    className="flex items-center gap-3"
                    style={{
                      opacity: isVisible ? 1 : 0,
                      transform: isVisible ? "translateY(0)" : "translateY(8px)",
                      transition: `600ms ${EASE}`,
                    }}
                  >
                    {/* Left corner bracket */}
                    <div
                      className="flex flex-col items-center h-16"
                      style={{
                        opacity: isVisible ? 1 : 0,
                        transform: isVisible ? "translateX(0)" : "translateX(4px)",
                        transition: `500ms ${EASE} 100ms`,
                      }}
                    >
                      <div className="w-3 h-3 border-l-2 border-t-2 border-tk-accent" />
                      <div className="flex-1" />
                      <div className="w-3 h-3 border-l-2 border-b-2 border-tk-accent" />
                    </div>

                    {/* Stat number */}
                    <div
                      className="flex items-baseline"
                      style={{
                        opacity: isVisible ? 1 : 0,
                        transform: isVisible ? "scale(1)" : "scale(0.95)",
                        transition: `600ms ${EASE} 200ms`,
                      }}
                    >
                      <span className="text-[44px] sm:text-[48px] lg:text-[56px] font-semibold tracking-tight text-tk-primary tabular-nums leading-none">
                        72
                      </span>
                      <span className="text-[16px] sm:text-[18px] lg:text-[20px] font-medium text-tk-accent ml-1">
                        %
                      </span>
                    </div>

                    {/* Right corner bracket */}
                    <div
                      className="flex flex-col items-center h-16"
                      style={{
                        opacity: isVisible ? 1 : 0,
                        transform: isVisible ? "translateX(0)" : "translateX(-4px)",
                        transition: `500ms ${EASE} 100ms`,
                      }}
                    >
                      <div className="w-3 h-3 border-r-2 border-t-2 border-tk-accent" />
                      <div className="flex-1" />
                      <div className="w-3 h-3 border-r-2 border-b-2 border-tk-accent" />
                    </div>
                  </div>
                </div>

                {/* Headline */}
                <div
                  className={`lg:col-span-8 p-4 sm:p-6 lg:p-8 flex flex-col justify-center transition-all duration-700 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionDelay: "100ms", transitionTimingFunction: EASE }}
                >
                  <h2 className="text-[17px] sm:text-[22px] lg:text-[26px] font-semibold text-tk-primary tracking-[-0.02em] leading-[1.25] mb-2">
                    make AI their first stop before buying
                  </h2>
                  <p className="text-[12px] sm:text-[13px] text-tk-secondary leading-relaxed mb-3 max-w-lg">
                    Once shoppers try AI, it&apos;s their go-to for research. A few brands per
                    query, no second page. You&apos;re on the shortlist or you don&apos;t exist.
                  </p>
                  <span className="text-[10px] text-tk-text-muted uppercase tracking-wider font-medium">
                    Capital One Shopping, 2026
                  </span>
                </div>
              </div>

              {/* Marquee rows — nested inside the same bordered panel, divided by border-t */}
              <div className="relative overflow-hidden bg-tk-surface border-t border-tk-default">
                <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-20 z-10 pointer-events-none bg-gradient-to-r from-tk-surface to-transparent" />
                <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-20 z-10 pointer-events-none bg-gradient-to-l from-tk-surface to-transparent" />
                <div className="divide-y divide-tk-default">
                  <MarqueeRow
                    direction="left"
                    queries={rowOneQueries}
                    isVisible={isVisible}
                    delayMs={200}
                  />
                  <MarqueeRow
                    direction="right"
                    queries={rowTwoQueries}
                    isVisible={isVisible}
                    delayMs={300}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
