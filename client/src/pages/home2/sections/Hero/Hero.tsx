import { useEffect, useState } from "react";
import { scrollRevealEase } from "@/pages/home2/hooks/useScrollReveal";

// Verbatim from _reference/index.html lines 898-1063.
//
// The hero headline is normally A/B tested by a client-side experiment
// engine (4 variants, cookie bucketing, an inline bootstrap script reading
// [data-landing-hero-copy="..."] spans). Per locked decision, that engine is
// NOT ported here — this renders the single captured "brand_control" variant
// copy (server.variant === "brand_control" in the snapshot's bootstrap
// payload) as static JSX text.
//
// Unlike the sections below it, the hero is not scroll-triggered: the source
// snapshot shows it already settled (opacity-100 translate-y-0) immediately
// on load, so it fades in unconditionally on mount rather than via
// useScrollReveal's IntersectionObserver. The remaining headline/subheadline
// blocks stagger via the exact transition-delay values present in the source
// (0ms / 100ms). The lead-capture form and AI-logo row that originally
// followed (200ms / 300ms delays) have been removed from this render, and
// the bottom spacing that was sized around them has been trimmed to suit —
// the source's pb-14/16/20 plus the subheadline's mb-7 left ~148px of dead
// air above the dashboard card once the form was gone.
export function Hero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative bg-tk-surface pt-20 sm:pt-24 lg:pt-[140px] pb-0">
      <div className="px-4 lg:px-8">
        <div className="mx-auto" style={{ maxWidth: 1120 }}>
          <div className="text-center mx-auto relative pb-2 sm:pb-3 lg:pb-4">
            <div
              className={`transition-all duration-700 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionTimingFunction: scrollRevealEase }}
            >
              <h1 className="text-[22px] sm:text-[26px] lg:text-[32px] font-semibold text-tk-primary tracking-[-0.025em] leading-[1.2] mb-4 max-w-[820px] mx-auto">
                <span>AI is shaping how buyers see your brand. Take control of the story</span>
                <span className="text-tk-accent">.</span>
              </h1>

              <p
                className={`text-[14px] lg:text-[16px] text-tk-secondary leading-relaxed max-w-[540px] mx-auto transition-all duration-500 ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: "100ms" }}
              >
                Find where AI overlooks, misreads or undersells you, then fix the pages and sources
                shaping every answer.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
