import { TrendingUpIcon } from "./icons";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Verbatim from index.html 2880-3023 - every one of the 48 hourly bars was
// captured mid pre-animation with style="height: 0%" and no recoverable
// target height anywhere in the markup (unlike other panels on this page
// where percentages ARE baked into the DOM). This array is a DECORATIVE
// PLACEHOLDER we invented to make the chart look populated: a fixed,
// deterministic set of plausible hourly-traffic values (two rough day
// cycles, dipping overnight and peaking in the afternoon/evening, trending
// up toward "Now" to match the panel's real "+27%" stat). It is NOT real
// data and must not be treated as recovered from source. Kept as a literal
// array (no Math.random/Date) so server and client render identically.
const BAR_HEIGHTS_PERCENT = [
  38, 28, 18, 15, 14, 16, 22, 32, 45, 58, 66, 72, 78, 82, 88, 85, 79, 74, 68, 60, 52, 46, 40, 34,
  40, 30, 22, 18, 17, 20, 28, 42, 58, 72, 80, 88, 94, 98, 100, 97, 92, 85, 80, 83, 90, 95, 99, 97,
];

// Confirmed real detail (index.html 2881-3022): the first 40 bars fill at a
// tinted opacity and only the last 8 (the most recent ~8 of 48 hours) switch
// to full opacity - not an even half/half split. Per the visual-richness
// pass this whole histogram is a single blue family (pale accent through to
// full-saturation accent + glow at "Now") rather than neutral grey; emphasis
// is carried by both opacity and the gradient/glow on the recent tail.
const SOLID_FROM_INDEX = 40;

// Recent Pages rows - fully recoverable verbatim from index.html 3031-3054.
const RECENT_PAGES = [
  { alt: "ChatGPT", src: "/venturecite/images/ai-logos/chatgpt.svg", path: "/pricing", time: "2m" },
  {
    alt: "Perplexity",
    src: "/venturecite/images/ai-logos/perplexity.svg",
    path: "/blog/ai-seo",
    time: "8m",
  },
  { alt: "Claude", src: "/venturecite/images/ai-logos/claude.png", path: "/features", time: "14m" },
  { alt: "ChatGPT", src: "/venturecite/images/ai-logos/chatgpt.svg", path: "/demo", time: "21m" },
  { alt: "Gemini", src: "/venturecite/images/ai-logos/gemini.svg", path: "/docs/api", time: "28m" },
  {
    alt: "Perplexity",
    src: "/venturecite/images/ai-logos/perplexity.svg",
    path: "/about",
    time: "34m",
  },
];

// AI Traffic · Last 48h panel - the left half of the two-panel mockup
// (index.html 2866-3057). Per the disclosed choreography-simplification
// rule, the dozens of individually-delayed bars/rows in the source are
// rendered settled here, gated by one `isVisible` per panel/list rather
// than 48+6 separately-timed transitions.
export function AiTrafficPanel({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="p-4 sm:p-5 lg:p-6 flex flex-col h-full">
      <div
        className={`flex items-center justify-between mb-4 transition-all duration-500 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
        style={{ transitionTimingFunction: EASE }}
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-vc-accent" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted">
            AI Traffic
          </span>
        </div>
        <span className="text-[10px] text-vc-text-muted">Last 48h</span>
      </div>

      <div
        className={`mb-4 transition-all duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
      >
        <div className="flex items-baseline gap-2">
          <span
            className="text-[28px] font-semibold tracking-tight text-vc-primary tabular-nums leading-none transition-colors duration-300"
            style={{ filter: "brightness(1)" }}
          >
            2,847
          </span>
          <span className="text-[12px] text-vc-text-muted">sessions</span>
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-vc-success tabular-nums transition-all duration-300">
            <TrendingUpIcon />
            +27%
          </span>
        </div>
      </div>

      <div
        className={`mb-5 transition-all duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
      >
        <div className="relative">
          <div className="flex items-end gap-px h-[48px]">
            {BAR_HEIGHTS_PERCENT.map((heightPercent, i) => (
              <div key={i} className="flex-1 h-full relative cursor-pointer min-w-0">
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={
                    i < SOLID_FROM_INDEX
                      ? {
                          height: `${heightPercent}%`,
                          backgroundColor: "var(--accent)",
                          opacity: 0.22,
                        }
                      : {
                          height: `${heightPercent}%`,
                          backgroundImage:
                            "linear-gradient(180deg, var(--hb-accent-bright) 0%, var(--accent) 100%)",
                          boxShadow: "0 0 6px rgba(59,91,246,0.35)",
                        }
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[9px] text-vc-text-muted font-mono tabular-nums">48h ago</span>
            <span className="text-[9px] text-vc-secondary font-mono">Now</span>
          </div>
        </div>
      </div>

      <div
        className={`flex-1 transition-all duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted">
            Recent Pages
          </span>
        </div>
        <div className="space-y-0 -mx-2 overflow-hidden">
          {RECENT_PAGES.map((page, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-vc-muted hover:shadow-[var(--hb-shadow-raised)] hover:-translate-y-px group cursor-default transition-all duration-300"
            >
              <img
                src={page.src}
                alt={page.alt}
                width={14}
                height={14}
                className="w-3.5 h-3.5 object-contain shrink-0 opacity-70"
              />
              <span className="flex-1 text-[11px] text-vc-secondary font-mono truncate group-hover:text-vc-primary transition-colors">
                {page.path}
              </span>
              <span className="text-[10px] tabular-nums text-vc-text-muted shrink-0 transition-all duration-300">
                {page.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
