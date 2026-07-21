import { Helmet } from "react-helmet-async";
import "./trakkr.css";
import { Nav } from "./sections/Nav/Nav";
import { Hero } from "./sections/Hero/Hero";
import { HeroBento } from "./sections/HeroBento/HeroBento";
import { WhyNow } from "./sections/WhyNow/WhyNow";
import { Platform } from "./sections/Platform/Platform";
import { Philosophy } from "./sections/Philosophy/Philosophy";
import { Revenue } from "./sections/Revenue/Revenue";
import { Testimonials } from "./sections/Testimonials/Testimonials";
import { Pricing } from "./sections/Pricing/Pricing";
import { LearnResearch } from "./sections/LearnResearch/LearnResearch";
import { ClosingCta } from "./sections/ClosingCta/ClosingCta";
import { Footer } from "./sections/Footer/Footer";

// The marketing homepage — served at "/" for logged-out visitors. Ported from
// the standalone Next.js build in trakkr.ai/ (kept as the pixel reference),
// then rebranded to VentureCite. Section order is verbatim from
// trakkr.ai/app/page.tsx. All styling is scoped under .trakkr-home — see
// trakkr.css. The predecessor lives on at /oldhome (pages/landing.tsx).
export default function Home2() {
  return (
    <div className="trakkr-home min-h-screen bg-tk-surface relative">
      <Helmet>
        <title>VentureCite — Get Cited by AI Search Engines</title>
        <meta
          name="description"
          content="Track and optimize your brand's visibility in AI-powered search. Monitor citations across ChatGPT, Claude, Perplexity, and more."
        />
      </Helmet>

      {/* Page-wide column guides, verbatim from index.html:680-681 */}
      <div
        className="hidden lg:block fixed top-0 bottom-0 border-r border-tk-default z-10 pointer-events-none"
        style={{ left: "calc(50% - 560px)" }}
      />
      <div
        className="hidden lg:block fixed top-0 bottom-0 border-l border-tk-default z-10 pointer-events-none"
        style={{ right: "calc(50% - 560px)" }}
      />

      <Nav />

      <main>
        <Hero />
        <HeroBento />
        <WhyNow />
        <Platform />
        <Philosophy />
        <Revenue />
        <Testimonials />
        <Pricing />
        <LearnResearch />
        <ClosingCta />
      </main>

      <Footer />
    </div>
  );
}
