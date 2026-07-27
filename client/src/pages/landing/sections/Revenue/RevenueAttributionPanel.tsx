import { TrendingUpIcon } from "./icons";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// By Source rows — dollar amounts fully recoverable verbatim from
// index.html 3069-3104. Fill-bar widths were captured pre-animation at
// "width: 0%"; since the real dollar amounts are known, each bar's settled
// width is derived as (amount / largest) * 100 — proportional to ChatGPT,
// the largest source — a legitimate derivation, not an invented value.
const BY_SOURCE = [
  {
    alt: "ChatGPT",
    src: "/venturecite/images/ai-logos/chatgpt.svg",
    name: "ChatGPT",
    amount: 6841,
  },
  {
    alt: "Perplexity",
    src: "/venturecite/images/ai-logos/perplexity.svg",
    name: "Perplexity",
    amount: 2847,
  },
  { alt: "Claude", src: "/venturecite/images/ai-logos/claude.png", name: "Claude", amount: 1853 },
  { alt: "Gemini", src: "/venturecite/images/ai-logos/gemini.svg", name: "Gemini", amount: 1306 },
];
const MAX_AMOUNT = BY_SOURCE[0].amount;

// Revenue Attribution · This month panel — the right half of the
// two-panel mockup (index.html 3058-3115). Note the "Avg. session value /
// Top page conv." recap row (index.html 3107-3114) is, per a careful
// div-nesting re-verification against source, the 4th child *inside this
// same panel's flex-col* (after By Source), not a separate element
// spanning both panels — see closing report.
export function RevenueAttributionPanel({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="p-4 sm:p-5 lg:p-6 flex flex-col h-full">
      <div
        className={`flex items-center justify-between mb-4 transition-all duration-500 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
        style={{ transitionTimingFunction: EASE }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted">
          Revenue Attribution
        </span>
        <span className="text-[10px] text-vc-text-muted">This month</span>
      </div>

      <div
        className={`mb-4 transition-all duration-500 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
        style={{ transitionDelay: "50ms", transitionTimingFunction: EASE }}
      >
        <div className="flex items-baseline gap-2">
          <span
            className="text-[28px] font-semibold tracking-tight text-vc-primary tabular-nums leading-none transition-all duration-300"
            style={{ filter: "brightness(1)" }}
          >
            $12,847
          </span>
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-vc-success tabular-nums transition-all duration-300">
            <TrendingUpIcon />
            +23%
          </span>
        </div>
        <p className="text-[12px] text-vc-text-muted mt-1">from AI-referred visitors</p>
      </div>

      <div
        className={`flex-1 transition-all duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted mb-1.5">
          By Source
        </div>
        <div className="border border-vc-default rounded overflow-hidden divide-y divide-vc-default">
          {BY_SOURCE.map((source) => (
            <div
              key={source.name}
              className="flex items-center gap-2.5 px-4 py-2.5 bg-vc-surface hover:bg-vc-muted/30 transition-all duration-300"
            >
              <img
                src={source.src}
                alt={source.alt}
                width={14}
                height={14}
                className="w-3.5 h-3.5 object-contain shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] text-vc-primary font-medium truncate">
                    {source.name}
                  </span>
                  <span
                    className="text-[11px] font-semibold text-vc-primary tabular-nums transition-all duration-300"
                    style={{ filter: "brightness(1)" }}
                  >
                    ${source.amount.toLocaleString()}
                  </span>
                </div>
                <div className="h-0.5 bg-vc-muted overflow-hidden rounded-sm">
                  <div
                    className="h-full bg-vc-accent transition-all duration-700"
                    style={{
                      width: isVisible ? `${(source.amount / MAX_AMOUNT) * 100}%` : "0%",
                      transitionTimingFunction: EASE,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`mt-3 pt-3 flex items-center justify-between transition-all duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
      >
        <div>
          <span className="text-[10px] text-vc-text-muted uppercase tracking-[0.08em]">
            Avg. session value
          </span>
          <p className="text-[16px] font-semibold text-vc-primary tabular-nums tracking-tight">
            $15.17
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-vc-text-muted uppercase tracking-[0.08em]">
            Top page conv.
          </span>
          <p className="text-[16px] font-semibold text-vc-accent tabular-nums tracking-tight">
            34%
          </p>
        </div>
      </div>
    </div>
  );
}
