import { useEffect, useState } from "react";
import { scrollRevealEase } from "@/pages/landing/hooks/useScrollReveal";
import { DomainCaptureForm } from "./DomainCaptureForm";
import { AiLogoRow } from "./AiLogoRow";

// Verbatim from _reference/index.html lines 898-1063.
//
// The hero headline is normally A/B tested by a client-side experiment
// engine (4 variants, cookie bucketing, an inline bootstrap script reading
// [data-landing-hero-copy="..."] spans). Per locked decision, that engine is
// NOT ported here - this renders the single captured "brand_control" variant
// copy (server.variant === "brand_control" in the snapshot's bootstrap
// payload) as static JSX text.
//
// Unlike the sections below it, the hero is not scroll-triggered: the source
// snapshot shows it already settled (opacity-100 translate-y-0) immediately
// on load, so it fades in unconditionally on mount rather than via
// useScrollReveal's IntersectionObserver. The four inner blocks stagger via
// the exact transition-delay values present in the source (0ms / 100ms /
// 200ms / 300ms).
export function Hero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative pt-20 sm:pt-24 lg:pt-[140px] pb-0">
      <div className="px-4 lg:px-8">
        <div className="mx-auto" style={{ maxWidth: 1120 }}>
          <div className="text-center mx-auto relative pb-14 sm:pb-16 lg:pb-20">
            <div
              className={`transition-all duration-700 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionTimingFunction: scrollRevealEase }}
            >
              {/* The H1 is written for the FOUNDER reading it, not for the
                  product. It names a loss they cannot currently see - a rival
                  being named in answers they never watch - and then turns it
                  into a question they cannot answer, which is the reason to
                  read on.

                  Present tense ("already"), because the point is that it is
                  happening now, not that it might.

                  Deliberately NO engine names here. Listing ChatGPT, Claude
                  and Perplexity turns the promise into a feature list and
                  dates the line every time the field moves; the logo row below
                  already names them, and the subhead covers the breadth.

                  The break before "Is yours?" is lg+ only, which is exactly
                  where the container (880px) fits the first sentence on one
                  line. Forcing it from sm, as this first did, produced three
                  lines between 640 and ~1000px: the sentence wrapped, stranding
                  "answers." alone, and only then came the break. Below lg the
                  text simply reflows.

                  The non-breaking space earns its place at every width below
                  lg - measured at 375px, "Is" otherwise ended one line and
                  "yours?" sat alone on the next.

                  max-w is 880px, not the 820px this inherited: at 32px the
                  first sentence needs ~825px, so 820 wrapped "answers." onto a
                  line of its own. Threshold measured at 860px; 880 leaves
                  headroom for font-metric variation.

                  No accent-coloured full stop: --accent is interactive/brand
                  only, never decorative. */}
              <h1 className="text-[22px] sm:text-[26px] lg:text-[32px] font-semibold text-vc-primary tracking-[-0.025em] leading-[1.2] mb-4 max-w-[880px] mx-auto">
                Your competitor&apos;s name is already showing up in AI answers.
                <br className="hidden lg:block" /> Is&nbsp;yours?
              </h1>

              {/* The H1 asks the question, so the subhead is purely the
                  answer to "so what do I do about it?", and is the first place
                  the product is named. Three beats: measure, benchmark, fix -
                  and the fix names both delivery models, since "done for you"
                  is the part a founder reading this at 11pm actually wants. */}
              <p
                className={`text-[14px] lg:text-[16px] text-vc-secondary leading-relaxed mb-7 max-w-[540px] mx-auto transition-all duration-500 ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: "100ms" }}
              >
                VentureCite measures your real citations across every major AI platform, benchmarks
                you against competitors, and builds the fix DIY or done for you.
              </p>

              <div
                className={`transition-all duration-500 max-w-[460px] mx-auto ${
                  mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: "200ms" }}
              >
                <DomainCaptureForm />
              </div>

              {/* Reassurance line under the CTA. `text-vc-secondary` (not the
                  muted token) so it holds contrast against the hero's light
                  gradient background, not just a plain surface. */}
              <div
                className={`flex items-center justify-center gap-4 max-[359px]:flex-col max-w-[460px] mx-auto mt-5 transition-all duration-500 ${
                  mounted ? "opacity-100" : "opacity-0"
                }`}
                style={{ transitionDelay: "300ms" }}
              >
                <p className="text-body text-vc-secondary font-medium">
                  10-min setup · No code · Weekly reports
                </p>
                <AiLogoRow />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
