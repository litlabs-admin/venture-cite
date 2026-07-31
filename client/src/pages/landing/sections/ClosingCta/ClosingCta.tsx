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

  return (
    <section id="closing-cta" ref={ref} className="relative bg-vc-surface py-16 sm:py-24 lg:py-32">
      {/* Gradient art + film grain, bounded to the 1120px column so its edges
          land on the page's vertical grid guides. `overflow-hidden` keeps the
          image from bleeding past them. */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-full overflow-hidden pointer-events-none"
        style={{ maxWidth: 1120 }}
      >
        {/* Sized 100% 180% from the top, NOT `cover`.

            The art is a ~square gradient: white for its top third, then a
            fast transition to saturated blue. Under `cover` the section's
            short box cropped a window out of the MIDDLE of that image, so
            the transition landed exactly on the copy — the heading sat on
            near-white (fine) while the paragraph 60px below sat on
            rgb(72,99,255) at a measured 1.03:1 against its own colour.
            Invisible, and no text colour fixes it: on a mid-luminance blue,
            white tops out at 4.66:1 and black at 4.5:1, and the block spans
            both ends of the ramp anyway.

            Stretching the gradient to 1.8x the box height and anchoring it
            top puts the copy block on the white end — measured in-browser at
            17.67:1 for the heading and 4.79:1 for the paragraph, both AA —
            while the bottom row stays genuinely blue, rgb(88,113,255), so
            the section keeps the blue floor it is drawn around. Past 2x the
            paragraph stops improving (4.79 is its ceiling, set by its own
            darkest backdrop pixel) and the floor washes out to
            rgb(137,155,255) and then to near-white. 1x is the broken case. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url(/venturecite/images/closing-cta-bg.avif)",
            backgroundSize: "100% 180%",
            backgroundPosition: "center top",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div className="absolute inset-0 pointer-events-none mkt-noise" />
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
              Get recommended by AI engines.
              <br />
              Every question your buyers ask.
            </h2>
            <p className="text-[13px] sm:text-[14px] lg:text-[16px] text-vc-secondary leading-relaxed mb-6 sm:mb-8 max-w-[520px] mx-auto">
              Recommendation tracking, share-of-answer, competitor benchmarks, and AI content
              generation — across ChatGPT, Claude, Perplexity, Gemini, Copilot, and Google AI
              Overview.
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
