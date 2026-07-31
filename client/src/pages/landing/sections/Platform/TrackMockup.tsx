import { MockupBackdrop } from "./MockupBackdrop";
import { scrollRevealEase } from "@/pages/landing/hooks/useScrollReveal";
import { TrendingUpIcon } from "./icons";
import { faviconUrl } from "@/pages/landing/faviconUrl";

// Row 01 "Track" mockup - a fake Nike workspace card, verbatim structure
// from _reference/index.html 2053-2129. Source captures this card mid
// entrance: dozens of individually opacity-0/transform/transition-delay'd
// child elements (header, 3 stat cells, chart, by-model list). Per the
// simplify-choreography rule, that per-element choreography is collapsed
// into the ONE outer reveal already applied by the caller (the wrapper at
// index.html:2051, 700ms translateY(20px) delay 150ms) - everything below
// renders at its settled/final look.
//
// HARDCODED DYNAMIC DATA: the Visibility/Mentions stat values and all 4
// "By Model" scores are captured as literal "0" in source (pre-count-up
// placeholder state) - the real target numbers are not recoverable from
// this static snapshot. Small plausible round numbers are substituted
// below and flagged again in the closing report. The Rank stat ("#3 /10",
// trend "+2") and all three trend deltas (+3, +2, +12) ARE real captured
// values, not placeholders.
type Stat = { label: string; value: string; suffix?: string; trend: string };
const stats: Stat[] = [
  { label: "Visibility", value: "68", trend: "+3" },
  { label: "Rank", value: "#3", suffix: "/10", trend: "+2" },
  { label: "Mentions", value: "142", trend: "+12" },
];

// Verbatim <path> data from index.html:2099 (single manageable chart, per
// task instructions copied exactly rather than approximated).
const AREA_FILL_D =
  "M 0 107.52 C 17.77777777777778 107.52, 17.77777777777778 97.2454054054054, 35.55555555555556 97.2454054054054 C 53.333333333333336 97.2454054054054, 53.333333333333336 84.40216216216217, 71.11111111111111 84.40216216216217 C 88.88888888888889 84.40216216216217, 88.88888888888889 71.55891891891892, 106.66666666666666 71.55891891891892 C 124.44444444444444 71.55891891891892, 124.44444444444444 56.14702702702702, 142.22222222222223 56.14702702702702 C 160 56.14702702702702, 160 43.303783783783786, 177.77777777777777 43.303783783783786 C 195.55555555555554 43.303783783783786, 195.55555555555554 30.46054054054053, 213.33333333333331 30.46054054054053 C 231.1111111111111 30.46054054054053, 231.1111111111111 22.754594594594593, 248.88888888888889 22.754594594594593 C 266.6666666666667 22.754594594594593, 266.6666666666667 17.6172972972973, 284.44444444444446 17.6172972972973 C 302.22222222222223 17.6172972972973, 302.22222222222223 12.480000000000006, 320 12.480000000000006 L 320 120 L 0 120 Z";
const LINE_D =
  "M 0 107.52 C 17.77777777777778 107.52, 17.77777777777778 97.2454054054054, 35.55555555555556 97.2454054054054 C 53.333333333333336 97.2454054054054, 53.333333333333336 84.40216216216217, 71.11111111111111 84.40216216216217 C 88.88888888888889 84.40216216216217, 88.88888888888889 71.55891891891892, 106.66666666666666 71.55891891891892 C 124.44444444444444 71.55891891891892, 124.44444444444444 56.14702702702702, 142.22222222222223 56.14702702702702 C 160 56.14702702702702, 160 43.303783783783786, 177.77777777777777 43.303783783783786 C 195.55555555555554 43.303783783783786, 195.55555555555554 30.46054054054053, 213.33333333333331 30.46054054054053 C 231.1111111111111 30.46054054054053, 231.1111111111111 22.754594594594593, 248.88888888888889 22.754594594594593 C 266.6666666666667 22.754594594594593, 266.6666666666667 17.6172972972973, 284.44444444444446 17.6172972972973 C 302.22222222222223 17.6172972972973, 302.22222222222223 12.480000000000006, 320 12.480000000000006";

// HARDCODED DYNAMIC DATA: all 4 scores captured as literal "0" pre-reveal
// in source (index.html 2114/2118/2122/2126) - unrecoverable, substituted
// with plausible descending placeholders. Row/name/score color classes are
// NOT uniform - verbatim per-row from source: ChatGPT is the sole
// highlighted row (bg-accent-subtle/30, text-accent name+score); Claude's
// name is text-secondary but its score is uniquely text-primary (not
// text-secondary like Perplexity/Gemini) - reproduced exactly, not
// normalized into a single "highlighted vs not" rule.
const byModel = [
  {
    name: "ChatGPT",
    logo: "/venturecite/images/ai-logos/chatgpt.svg",
    score: "78",
    rowClassName: "bg-vc-accent-subtle/30",
    nameClassName: "text-vc-accent font-medium",
    scoreClassName: "text-vc-accent font-semibold",
  },
  {
    name: "Claude",
    logo: "/venturecite/images/ai-logos/claude.png",
    score: "64",
    rowClassName: "hover:bg-vc-muted/30",
    nameClassName: "text-vc-secondary",
    scoreClassName: "text-vc-primary",
  },
  {
    name: "Perplexity",
    logo: "/venturecite/images/ai-logos/perplexity.svg",
    score: "52",
    rowClassName: "hover:bg-vc-muted/30",
    nameClassName: "text-vc-secondary",
    scoreClassName: "text-vc-secondary",
  },
  {
    name: "Gemini",
    logo: "/venturecite/images/ai-logos/gemini.svg",
    score: "41",
    rowClassName: "hover:bg-vc-muted/30",
    nameClassName: "text-vc-secondary",
    scoreClassName: "text-vc-secondary",
  },
];

export function TrackMockup({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="relative bg-white overflow-hidden h-full flex flex-col min-h-[240px] sm:min-h-[320px] lg:min-h-[360px]">
      <MockupBackdrop />
      <div className="relative flex-1 flex items-center justify-center py-8">
        <div
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
            transition: `700ms ${scrollRevealEase} 150ms`,
          }}
        >
          <div className="p-6 lg:p-8">
            <div
              className="mx-auto w-full max-w-[600px] rounded overflow-hidden bg-vc-surface ring-1 ring-vc-hairline"
              style={{ boxShadow: "var(--hb-shadow-shell)" }}
            >
              {/* Header row */}
              <div
                className="flex items-stretch border-b border-vc-default"
                style={{ background: "var(--hb-surface-wash)" }}
              >
                <div className="flex items-center gap-2.5 px-4 py-3 border-r border-vc-default w-[180px] shrink-0">
                  {/* Plain <img>, not next/image: this is an external Google
                      favicon-service URL and next.config.ts has no
                      remotePatterns configured for it (verified - see
                      closing report). Matches source's own literal <img>
                      tag anyway. */}
                  <img
                    alt="Nike"
                    className="w-6 h-6 rounded object-contain shrink-0"
                    src={faviconUrl("nike.com", 128)}
                  />
                  <div className="min-w-0 -space-y-1">
                    <div className="text-[13px] font-semibold text-vc-primary truncate">Nike</div>
                    <div className="flex items-center gap-1.5 text-[9px] text-vc-text-muted whitespace-nowrap">
                      <div className="w-1.5 h-1.5 rounded-full bg-vc-success" />
                      Updated 2h ago
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 flex-1">
                  {stats.map((stat, i) => (
                    <div
                      key={stat.label}
                      className={`px-4 py-3 transition-colors duration-250 ${i < 2 ? "border-r border-vc-default" : ""} hover:bg-vc-muted/20`}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-vc-text-muted mb-1">
                        {stat.label}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[22px] font-semibold tracking-tight tabular-nums text-vc-primary">
                          {stat.value}
                        </span>
                        {stat.suffix && (
                          <span className="text-[12px] text-vc-text-muted">{stat.suffix}</span>
                        )}
                        <span className="flex items-center gap-0.5 text-[10px] font-medium text-vc-success ml-auto">
                          <TrendingUpIcon />
                          <span className="tabular-nums">{stat.trend}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart + By Model split */}
              <div className="flex">
                <div className="flex-1 p-4 border-r border-vc-default min-w-0">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-[12px] font-semibold text-vc-primary">
                        Visibility trend
                      </div>
                      <div className="text-[10px] text-vc-text-muted mt-0.5">Past 14 days</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-vc-text-muted whitespace-nowrap">
                      <div className="w-1.5 h-1.5 rounded-full bg-vc-success" />
                      Updated 2h ago
                    </div>
                  </div>
                  <svg
                    width="100%"
                    height="120"
                    viewBox="0 0 320 120"
                    preserveAspectRatio="none"
                    className="overflow-visible"
                  >
                    <defs>
                      <linearGradient
                        id="venturecite-chart-gradient"
                        x1="0%"
                        y1="0%"
                        x2="0%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                        <stop offset="40%" stopColor="var(--accent)" stopOpacity={0.1} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                      <filter
                        id="venturecite-line-glow"
                        x="-20%"
                        y="-60%"
                        width="140%"
                        height="220%"
                      >
                        <feGaussianBlur stdDeviation="2.5" />
                      </filter>
                    </defs>
                    <path d={AREA_FILL_D} fill="url(#venturecite-chart-gradient)" />
                    {/* Soft glow duplicate behind the crisp line. Nike's own trend
                        line is the chart's one series, so it carries the accent
                        blue directly rather than sitting on the neutral ramp. */}
                    <path
                      d={LINE_D}
                      fill="none"
                      stroke="var(--hb-accent-bright)"
                      strokeWidth={4}
                      strokeOpacity={0.22}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter="url(#venturecite-line-glow)"
                    />
                    <path
                      d={LINE_D}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Halo endpoint marker instead of a bare terminated stroke. */}
                    <circle cx={317} cy={12.48} r={5} fill="var(--accent)" fillOpacity={0.18} />
                    <circle cx={317} cy={12.48} r={2.2} fill="var(--accent)" />
                  </svg>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[9px] text-vc-text-muted font-mono tabular-nums">
                      Jul 5
                    </span>
                    <span className="text-[9px] text-vc-text-muted font-mono tabular-nums">
                      Jul 19
                    </span>
                  </div>
                </div>

                <div className="w-44 shrink-0 p-4">
                  <div className="mb-2">
                    <div className="text-[12px] font-semibold text-vc-primary">By Model</div>
                    <div className="text-[10px] text-vc-text-muted mt-0.5">Visibility scores</div>
                  </div>
                  <div className="space-y-0">
                    {byModel.map((m) => (
                      <div
                        key={m.name}
                        className={`flex items-center gap-2 py-1.5 px-2 -mx-2 rounded transition-colors duration-200 ${m.rowClassName}`}
                      >
                        <img
                          src={m.logo}
                          alt=""
                          width={14}
                          height={14}
                          className="w-3.5 h-3.5 object-contain rounded"
                        />
                        <span className={`flex-1 text-[11px] truncate ${m.nameClassName}`}>
                          {m.name}
                        </span>
                        <span className={`text-[12px] font-mono tabular-nums ${m.scoreClassName}`}>
                          {m.score}
                        </span>
                      </div>
                    ))}
                    <div className="text-[10px] text-vc-text-muted pt-1.5 pl-5 cursor-default">
                      +2 more
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
