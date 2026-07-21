import { scrollRevealEase } from "@/pages/home2/hooks/useScrollReveal";
import { CHART_AREA_FILLS, CHART_END_DOTS, CHART_GRADIENTS, CHART_STROKE_LINES } from "./chartData";
import { chartCallouts, chartYAxisLabels } from "./data";

// Hand-built inline SVG stacked-area chart (Perplexity/Claude/Gemini/ChatGPT
// AI-referral-traffic lines), verbatim from _reference/index.html lines
// 3471-3487. Settled state renders fully drawn/visible by default (real
// coordinates, opacity 1, stroke fully drawn, callouts in place); `isVisible`
// (driven by the section's single useScrollReveal call) plays the same
// draw-in/fade-in transitions the source captured mid-flight.
export function AiSearchAreaChart({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="mt-6 sm:mt-7">
      <div className="tds" style={{ background: "transparent" }}>
        <a className="block" aria-label="See how AI search actually works" href="#platform-section">
          <div className="relative" style={{ height: 210 }}>
            {chartYAxisLabels.map((l) => (
              <span
                key={l.label}
                className="tds-mono absolute pointer-events-none tabular-nums"
                style={{
                  left: 0,
                  top: l.top,
                  width: 30,
                  textAlign: "right",
                  fontSize: 10,
                  color: "var(--tds-ink-4)",
                  lineHeight: 1,
                  opacity: isVisible ? 1 : 0,
                  transition: `opacity 700ms ${scrollRevealEase} ${l.delayMs}ms`,
                }}
              >
                {l.label}
              </span>
            ))}
            <svg width={1054} height={210} style={{ display: "block" }}>
              <defs>
                {CHART_GRADIENTS.map((g) => (
                  <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={g.color} stopOpacity={0.24} />
                    <stop offset="100%" stopColor={g.color} stopOpacity={0.04} />
                  </linearGradient>
                ))}
              </defs>
              {CHART_AREA_FILLS.map((f) => (
                <path
                  key={f.name}
                  d={f.d}
                  fill={`url(#${f.gradientId})`}
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transition: `opacity ${f.durationMs}ms ${scrollRevealEase} ${f.delayMs}ms`,
                  }}
                />
              ))}
              {CHART_STROKE_LINES.map((s) => (
                <path
                  key={s.name}
                  d={s.d}
                  fill="none"
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: isVisible ? 0 : 1,
                    transition: `stroke-dashoffset ${s.durationMs}ms ${scrollRevealEase} ${s.delayMs}ms`,
                  }}
                />
              ))}
              {CHART_END_DOTS.map((c) => (
                <circle
                  key={c.name}
                  cx={c.cx}
                  cy={c.cy}
                  r={c.r}
                  fill={c.fill}
                  stroke={c.stroke}
                  strokeWidth={c.strokeWidth}
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transition: `opacity ${c.durationMs}ms ${scrollRevealEase} ${c.delayMs}ms`,
                  }}
                />
              ))}
            </svg>
            {chartCallouts.map((c) => (
              <div
                key={c.name}
                className="absolute flex items-center gap-1.5 pointer-events-none"
                style={{
                  left: 968,
                  top: c.top,
                  transform: isVisible
                    ? "translateY(-50%) translateX(0)"
                    : "translateY(-50%) translateX(-6px)",
                  opacity: isVisible ? 1 : 0,
                  transition: `opacity 480ms ${scrollRevealEase} 1000ms, transform 480ms ${scrollRevealEase} 1000ms`,
                }}
              >
                <img
                  src={c.logoSrc}
                  alt=""
                  width={14}
                  height={14}
                  className="w-3.5 h-3.5 object-contain"
                />
                <span
                  className="text-[12px] font-medium leading-none"
                  style={{ color: "var(--tds-ink-2)" }}
                >
                  {c.name}
                </span>
              </div>
            ))}
          </div>
        </a>
      </div>
    </div>
  );
}
