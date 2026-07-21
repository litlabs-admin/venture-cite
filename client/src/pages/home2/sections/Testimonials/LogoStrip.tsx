// Logo row along the bottom of the testimonials panel.
//
// The source shipped a "Used by teams at" wall of customer logos (Nike,
// Spotify, Walmart, Dropbox, FT). VentureCite is pre-launch and has no
// customers, so the slot is reframed as engine coverage — a claim that is
// true today — using the AI-engine marks already in public/trakkr/. The row's
// layout, grayscale-until-hover treatment and per-logo stagger are unchanged.
//
// Settled-vs-transient: source froze each logo at opacity-0 translate-y-2
// (entrance start) while ALSO carrying its permanent opacity-40 "dimmed
// until hover" styling — both opacity utilities on the same element at
// once is an artifact of the frozen DOM snapshot, not the real rest state.
// The real rest state (post-reveal) is opacity-40, which then raises to
// opacity-70 on hover; the reveal only animates opacity 0 -> 40.
//
// Engine list matches the `aiEngines` array on the main landing page
// (client/src/pages/landing.tsx). Copilot has no mark in the asset set, so
// the row shows the five that do.
const logos = [
  { alt: "ChatGPT", src: "/trakkr/images/ai-logos/chatgpt.svg", delay: 400 },
  { alt: "Claude", src: "/trakkr/images/ai-logos/claude.svg", delay: 450 },
  { alt: "Perplexity", src: "/trakkr/images/ai-logos/perplexity.svg", delay: 500 },
  { alt: "Gemini", src: "/trakkr/images/ai-logos/gemini.svg", delay: 550 },
  { alt: "Google AI Overviews", src: "/trakkr/images/ai-logos/google.svg", delay: 600 },
];

export function LogoStrip({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="border-t border-tk-default">
      <div
        className={`px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-8 transition-all duration-700 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDelay: "300ms" }}
      >
        <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.08em] text-tk-text-muted whitespace-nowrap">
          Tracks citations across
        </span>
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 lg:gap-8">
          {logos.map((logo) => (
            <img
              key={logo.alt}
              alt={logo.alt}
              src={logo.src}
              width={24}
              height={24}
              className={`h-3.5 sm:h-5 w-auto grayscale hover:opacity-70 hover:grayscale-0 transition-all duration-500 ${
                isVisible ? "opacity-40 translate-y-0" : "opacity-0 translate-y-2"
              }`}
              style={{ transitionDelay: `${logo.delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
