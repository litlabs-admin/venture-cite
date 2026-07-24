import type { CSSProperties } from "react";
import { useScrollReveal, scrollRevealEase } from "@/pages/landing/hooks/useScrollReveal";
import { DomainCaptureForm } from "./DomainCaptureForm";

// Closing CTA — verbatim from _reference/index.html lines 3593-3625. No
// section-header eyebrow precedes this one (see SectionHeader.tsx's own
// note confirming that).
//
// Settled-vs-transient: the source snapshot froze this section mid
// scroll-reveal entrance (opacity-0/translate-y on the content block, form
// wrapper, and footnote, each with a transition-*/duration-*/delay class).
// Rendered here in its SETTLED state by default (fully opaque, untransformed)
// and wired to replay the entrance via useScrollReveal, matching every other
// top-level <section> on the page.
export function ClosingCta() {
  const { ref, isVisible } = useScrollReveal<HTMLElement>();

  const dotGridStyle = {
    "--vc-mkt-dot-opacity": 0.08,
    "--vc-mkt-dot-spacing": "9px",
    "--vc-mkt-dot-size": "0.8px",
  } as CSSProperties;

  return (
    <section id="closing-cta" ref={ref} className="relative bg-vc-surface py-16 sm:py-24 lg:py-32">
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-full pointer-events-none"
        style={{ maxWidth: 1120 }}
      >
        <div className="absolute inset-0 pointer-events-none mkt-dot-grid" style={dotGridStyle} />
      </div>
      <div className="px-4 lg:px-8">
        <div className="mx-auto" style={{ maxWidth: 1120 }}>
          <div
            className={`text-center max-w-[640px] mx-auto relative transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
            style={{ transitionTimingFunction: scrollRevealEase }}
          >
            <h2 className="text-[20px] sm:text-[28px] lg:text-[32px] font-semibold text-vc-primary tracking-[-0.02em] leading-[1.2] mb-3 sm:mb-4">
              Get cited by AI search engines<span className="text-vc-accent">.</span>
              <br />
              Track every mention. Optimize every prompt.
            </h2>
            <p className="text-[13px] sm:text-[14px] lg:text-[16px] text-vc-secondary leading-relaxed mb-6 sm:mb-8 max-w-[520px] mx-auto">
              Citation tracking, share-of-answer, competitor benchmarks, and AI content generation —
              across ChatGPT, Claude, Perplexity, Gemini, Copilot, and Google AI Overview.
            </p>
            <div
              className={`transition-all duration-500 max-w-[440px] mx-auto ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ transitionDelay: "200ms" }}
            >
              <DomainCaptureForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
