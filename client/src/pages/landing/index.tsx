import "./styles.css";
import { Nav } from "./sections/Nav/Nav";
import { Hero } from "./sections/Hero/Hero";
import { HeroBento } from "./sections/HeroBento/HeroBento";
import { WhyNow } from "./sections/WhyNow/WhyNow";
import { Platform } from "./sections/Platform/Platform";
import { Philosophy } from "./sections/Philosophy/Philosophy";
import { Revenue } from "./sections/Revenue/Revenue";
import { LearnResearch } from "./sections/LearnResearch/LearnResearch";
import { ClosingCta } from "./sections/ClosingCta/ClosingCta";
import { Footer } from "./sections/Footer/Footer";

// The marketing homepage — served at "/" for logged-out visitors. Ported from
// the standalone Next.js build in trakkr.ai/ (kept as the pixel reference),
// then rebranded to VentureCite. Section order is verbatim from
// trakkr.ai/app/page.tsx. All styling is scoped under .vc-home — see
// styles.css.
export default function Landing() {
  return (
    <div className="vc-home min-h-screen bg-vc-surface relative">
      {/* Title/description moved to src/routes/index.tsx's `head()` —
          metadata belongs to the route, not this component. */}

      {/* Page-wide column guides, verbatim from index.html:680-681 */}
      <div
        className="hidden lg:block fixed top-0 bottom-0 border-r border-vc-default z-10 pointer-events-none"
        style={{ left: "calc(50% - 560px)" }}
      />
      <div
        className="hidden lg:block fixed top-0 bottom-0 border-l border-vc-default z-10 pointer-events-none"
        style={{ right: "calc(50% - 560px)" }}
      />

      <Nav />

      <main>
        {/* Hero region — Hero and HeroBento share one background: a vertical
            gradient running white at the top to saturated blue at the bottom,
            so the headline reads on white while the dashboard card sits on
            blue. Anchored bottom so the saturated end always lands behind the
            card regardless of viewport height.

            Bounded to the 1120px content column so its edges land exactly on
            the page's vertical grid guides (at calc(50% ± 560px)) rather than
            bleeding to the viewport.

            Both children paint above it: they are `relative`, and a positioned
            sibling later in DOM order wins over a z-index:auto absolute
            sibling. Hero must therefore NOT set its own background. */}
        <div className="relative">
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="mx-auto h-full w-full"
              style={{
                maxWidth: 1120,
                backgroundImage: "url(/venturecite/images/hero-bg-2.avif)",
                backgroundSize: "cover",
                backgroundPosition: "center bottom",
                backgroundRepeat: "no-repeat",
              }}
            />
          </div>
          <Hero />
          <HeroBento />
          {/* Blue floor below the dashboard card. Lives on the wrapper rather
              than on HeroBento so the bento itself stays rhythm-neutral. */}
          <div className="h-8 sm:h-10 lg:h-12" />
        </div>

        <WhyNow />
        <Platform />
        <Philosophy />
        <Revenue />
        <LearnResearch />
        <ClosingCta />
      </main>

      <Footer />
    </div>
  );
}
