import { useScrollReveal, scrollRevealEase } from "@/pages/landing/hooks/useScrollReveal";
import { SectionHeader } from "@/pages/landing/sections/SectionHeader/SectionHeader";
import { TrackMockup } from "./TrackMockup";
import { UnderstandMockup } from "./UnderstandMockup";
import { ImproveMockup } from "./ImproveMockup";
import { BuiltForStrip } from "./BuiltForStrip";
import { ArrowRightIcon } from "./icons";

// Verbatim from _reference/index.html 2003-2425 (section-header-02 sibling
// + <section id="platform-section">). Three stacked bordered-panel rows
// ("Track" / "Understand" / "Improve") followed by a "Built for" strip.
//
// STRUCTURAL NOTE (re-verified this session by programmatically balancing
// every <div>/</div> tag in the 2026-2425 range): the "Built for" strip is
// a SIBLING of the bordered panel, not nested inside it — the panel div
// ("border border-default overflow-hidden bg-white", opened line 2033)
// closes at line 2407, one line before the strip's own wrapper opens at
// 2408. Both share only the same outer reveal wrapper (line 2029-2032:
// opacity-0 translate-y-8, transition-all duration-700). See
// BuiltForStrip.tsx for more detail. This corrects an assumption in the
// original task brief.
//
// Per the simplify-choreography rule, each row's text column keeps its
// real 2-stage stagger from source (giant numeral at delay 0ms, then
// eyebrow+heading+body+link together at delay 100ms — only 2 stages, not
// "dozens"), while each mockup's much deeper internal choreography (30-50+
// individually-delayed elements per card) collapses into the ONE reveal
// its own outer wrapper documents (700ms translateY(20px) delay 150ms) —
// implemented inside each *Mockup component.
const EASE = scrollRevealEase;

function FeatureText({
  number,
  eyebrow,
  heading,
  body,
  linkText,
  href,
  isVisible,
}: {
  number: string;
  eyebrow: string;
  heading: string;
  body: string;
  linkText: string;
  href: string;
  isVisible: boolean;
}) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 pt-5 sm:pt-8 lg:pt-10 flex flex-col bg-white">
      <div
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(20px)",
          transition: `opacity 700ms ${EASE}, transform 700ms ${EASE}`,
        }}
      >
        <div
          className="text-[40px] sm:text-[56px] lg:text-[72px] font-semibold tracking-tighter tabular-nums select-none leading-none transition-colors duration-300 text-vc-default/50 group-hover:text-vc-accent"
          aria-hidden="true"
        >
          {number}
        </div>
      </div>
      <div
        className="mt-2 sm:mt-4"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(20px)",
          transition: `opacity 700ms ${EASE} 100ms, transform 700ms ${EASE} 100ms`,
        }}
      >
        <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.2em] text-vc-accent mb-1 sm:mb-2">
          {eyebrow}
        </div>
        <h3 className="text-[16px] sm:text-[20px] lg:text-[24px] font-semibold text-vc-primary tracking-[-0.02em] leading-[1.15] mb-2 sm:mb-3">
          {heading}
        </h3>
        <p className="text-[12px] sm:text-[14px] text-vc-secondary leading-relaxed mb-3 sm:mb-5 max-w-[380px]">
          {body}
        </p>
        <a
          href={href}
          className="inline-flex items-center gap-2 text-[11px] sm:text-[13px] font-semibold text-vc-accent hover:text-vc-accent-hover transition-colors duration-150 group"
        >
          {linkText}
          <ArrowRightIcon
            size={14}
            className="group-hover:translate-x-1 transition-transform duration-200"
          />
        </a>
      </div>
    </div>
  );
}

export function Platform() {
  const { ref, isVisible } = useScrollReveal<HTMLElement>();

  return (
    <>
      <SectionHeader number="02" label="Platform" subtitle="Features" />
      <section id="platform-section" ref={ref} className="bg-vc-surface relative">
        <div className="px-4 lg:px-8">
          <div className="mx-auto" style={{ maxWidth: 1120 }}>
            <div
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(32px)",
                transition: `opacity 700ms ${EASE}, transform 700ms ${EASE}`,
                maxWidth: 1120,
                margin: "0 auto",
              }}
            >
              <div className="border border-vc-default overflow-hidden bg-white">
                {/* Row 01 — Track (text left, mockup right) */}
                <div className="border-b border-vc-default">
                  <div className="group grid grid-cols-1 lg:grid-cols-[40%_60%]">
                    <div className="lg:border-r border-vc-default">
                      <FeatureText
                        number="01"
                        eyebrow="Track"
                        heading="Know every prompt that recommends you — and every one that names a rival"
                        body="Track who gets recommended across ChatGPT, Claude, Perplexity, Gemini, and more, on the questions your buyers actually ask. Your position, prompt by prompt."
                        linkText="Explore tracking"
                        href="#why-now-section"
                        isVisible={isVisible}
                      />
                    </div>
                    <div className="border-t lg:border-t-0 border-vc-default">
                      <TrackMockup isVisible={isVisible} />
                    </div>
                  </div>
                </div>

                {/* Row 02 — Understand (mockup left, text right; order flips via order-1/order-2) */}
                <div className="border-b border-vc-default">
                  <div className="group grid grid-cols-1 lg:grid-cols-[60%_40%]">
                    <div className="order-2 lg:order-1 border-t lg:border-t-0 lg:border-r border-vc-default">
                      <UnderstandMockup isVisible={isVisible} />
                    </div>
                    <div className="order-1 lg:order-2">
                      <FeatureText
                        number="02"
                        eyebrow="Understand"
                        heading="Understand why it recommends them and not you"
                        body="See which sources AI trusts when it makes a recommendation, which questions send buyers to a competitor, and exactly what's missing from your coverage."
                        linkText="See how it works"
                        href="#revenue-section"
                        isVisible={isVisible}
                      />
                    </div>
                  </div>
                </div>

                {/* Row 03 — Improve (text left, mockup right; last row, no border-b) */}
                <div>
                  <div className="group grid grid-cols-1 lg:grid-cols-[40%_60%]">
                    <div className="lg:border-r border-vc-default">
                      <FeatureText
                        number="03"
                        eyebrow="Improve"
                        heading="Publish the evidence AI needs to recommend you"
                        body="Generate articles and FAQs that answer the questions buyers ask, scored against the same GEO signals AI engines reward, and publish straight to your channels."
                        linkText="Start improving"
                        href="#philosophy-section"
                        isVisible={isVisible}
                      />
                    </div>
                    <div className="border-t lg:border-t-0 border-vc-default">
                      <ImproveMockup isVisible={isVisible} />
                    </div>
                  </div>
                </div>
              </div>

              <BuiltForStrip isVisible={isVisible} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
