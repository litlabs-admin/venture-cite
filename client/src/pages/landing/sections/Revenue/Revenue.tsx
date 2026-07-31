import { SectionHeader } from "@/pages/landing/sections/SectionHeader/SectionHeader";
import { ArrowRightIcon } from "@/pages/landing/sections/Nav/icons";
import { useScrollReveal } from "@/pages/landing/hooks/useScrollReveal";
import { AiTrafficPanel } from "./AiTrafficPanel";
import { RevenueAttributionPanel } from "./RevenueAttributionPanel";
import { CheckCircleIcon } from "./icons";

// Verbatim from _reference/index.html 2827-3131 ("Revenue" / "Proof").
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function Revenue() {
  const { ref, isVisible } = useScrollReveal<HTMLElement>();

  return (
    <>
      <SectionHeader number="04" label="Revenue" subtitle="Proof" />
      <section id="revenue-section" ref={ref} className="bg-vc-surface relative">
        <div className="px-4 lg:px-8">
          <div className="mx-auto" style={{ maxWidth: 1120 }}>
            <div
              className="bg-vc-surface border border-vc-default"
              style={{ maxWidth: 1120, margin: "0 auto" }}
            >
              {/* Top strip: avg. session value stat + headline */}
              <div className="grid grid-cols-1 lg:grid-cols-12 border-b border-vc-default">
                <div
                  className={`lg:col-span-4 p-4 sm:p-6 lg:p-8 flex flex-col justify-center lg:border-r border-vc-default border-b lg:border-b-0 transition-all duration-700 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionTimingFunction: EASE }}
                >
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[28px] sm:text-[32px] lg:text-[36px] font-semibold tracking-tight leading-none text-vc-accent tabular-nums">
                      $15
                    </span>
                    <span className="text-[14px] sm:text-[16px] lg:text-[18px] font-semibold text-vc-accent/60 leading-none">
                      .17
                    </span>
                  </div>
                  <span className="text-[10px] font-medium text-vc-text-muted uppercase tracking-wider mt-1.5">
                    Avg. session value
                  </span>
                </div>
                <div
                  className={`lg:col-span-8 p-4 sm:p-6 lg:p-8 flex flex-col justify-center transition-all duration-700 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionDelay: "100ms", transitionTimingFunction: EASE }}
                >
                  <h2 className="text-[18px] sm:text-[24px] lg:text-[28px] font-semibold text-vc-primary tracking-[-0.02em] leading-[1.2] mb-2">
                    See which recommendations actually bring buyers
                  </h2>
                  <p className="text-[13px] sm:text-[14px] text-vc-secondary leading-relaxed max-w-xl">
                    Follow a recommendation from the answer that made it to the visit it sent you,
                    across ChatGPT, Claude, Perplexity, and Gemini. No engineering required.
                  </p>
                </div>
              </div>

              {/* Two-panel mockup: AI Traffic (left) / Revenue Attribution (right) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-vc-default">
                <AiTrafficPanel isVisible={isVisible} />
                <RevenueAttributionPanel isVisible={isVisible} />
              </div>

              {/* Bottom badge strip */}
              <div className="border-t border-vc-default">
                <div
                  className={`px-3 sm:px-6 lg:px-8 py-3 sm:py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-0 transition-all duration-500 ${
                    isVisible ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 lg:gap-6">
                    <span className="text-[10px] sm:text-[12px] text-vc-secondary flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3 text-vc-accent shrink-0" />
                      10-min setup
                    </span>
                    <span className="text-[10px] sm:text-[12px] text-vc-secondary flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3 text-vc-accent shrink-0" />
                      No code
                    </span>
                    <span className="hidden sm:flex text-[10px] sm:text-[12px] text-vc-secondary items-center gap-1.5">
                      <CheckCircleIcon className="w-3 h-3 text-vc-accent shrink-0" />
                      Weekly reports
                    </span>
                  </div>
                  <a
                    href="/register"
                    className="text-[10px] sm:text-[12px] font-medium text-vc-accent hover:text-vc-accent-hover flex items-center gap-1 transition-colors shrink-0"
                  >
                    Get Started
                    <ArrowRightIcon size={12} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
