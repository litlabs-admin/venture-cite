import { Helmet } from "react-helmet-async";
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
      <Helmet>
        <title>VentureCite — Get cited by AI search engines</title>
        <meta
          name="description"
          content="Find where AI overlooks, misreads or undersells you, then fix the pages and sources shaping every answer."
        />
      </Helmet>

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
        <Hero />
        <HeroBento />
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
