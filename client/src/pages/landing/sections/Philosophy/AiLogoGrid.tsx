// Card 01 visual — logo grid (_reference/index.html:2479, single unbroken
// line). Filenames and order are from source, but the source's Grok, Meta AI
// and DeepSeek entries are dropped: VentureCite's engine list doesn't
// include them, and card 01's copy names the engines explicitly, so the
// visual has to agree with it.
// Note "Claude" here uses claude.svg (not the claude.png used elsewhere on
// the page, e.g. WhyNow's marquee) — checked against this section's actual
// markup rather than assumed consistent with other sections.
const logos = [
  { name: "ChatGPT", src: "/venturecite/images/ai-logos/chatgpt.svg" },
  { name: "Perplexity", src: "/venturecite/images/ai-logos/perplexity.svg" },
  { name: "Claude", src: "/venturecite/images/ai-logos/claude.svg" },
  { name: "Gemini", src: "/venturecite/images/ai-logos/gemini.svg" },
  { name: "Google", src: "/venturecite/images/ai-logos/google.svg" },
];

// Source's dimmed grayscale look (opacity: 0.18, filter: grayscale(1)) is
// the DEFAULT/settled state, paired with a 450ms opacity+filter transition
// for a hover-driven brighten — reproduced here as CSS opacity/grayscale
// utilities plus hover: variants (equivalent to source's per-item
// hover-triggered inline-style swap), rather than as a pre-mount reveal.
export function AiLogoGrid() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
        {logos.map((logo) => (
          <div
            key={logo.name}
            title={logo.name}
            className="flex min-w-0 items-center gap-2 opacity-[0.18] grayscale transition-[opacity,filter] duration-450 ease-vc hover:opacity-100 hover:grayscale-0"
          >
            <img
              src={logo.src}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 flex-shrink-0 object-contain"
            />
            <span className="truncate text-[11px] font-medium transition-colors duration-500 text-vc-text-muted">
              {logo.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
