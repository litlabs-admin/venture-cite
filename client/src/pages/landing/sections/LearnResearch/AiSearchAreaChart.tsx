import { scrollRevealEase } from "@/pages/landing/hooks/useScrollReveal";
import { CHART_AREA_FILLS, CHART_END_DOTS, CHART_GRADIENTS, CHART_STROKE_LINES } from "./chartData";
import { chartCallouts, chartYAxisLabels } from "./data";

// Hand-built inline SVG stacked-area chart (Perplexity/Claude/Gemini/ChatGPT
// AI-referral-traffic lines), verbatim from _reference/index.html lines
// 3471-3487. Settled state renders fully drawn/visible by default (real
// coordinates, opacity 1, stroke fully drawn, callouts in place); `isVisible`
// (driven by the section's single useScrollReveal call) plays the same
// draw-in/fade-in transitions the source captured mid-flight.
//
// Visual-richness pass: wrapped in an elevated tile and given the same SVG
// depth vocabulary as HeroBento's VisibilityChartPanel — 4-stop area
// gradients (from chartData.ts), a blurred glow duplicate under ChatGPT's
// crisp stroke (the chart's one leading/accent series), an edge-fade mask so
// the area fills don't look chopped at x=40/x=958, and two-layer halo end
// markers instead of flat dots. Path/coordinate data is untouched.
export function AiSearchAreaChart({ isVisible }: { isVisible: boolean }) {
  const leadingStroke = CHART_STROKE_LINES.find((s) => s.name === "ChatGPT");

  return (
    <div
      className="mt-6 sm:mt-7 rounded-lg p-3 sm:p-4 ring-1 ring-vc-hairline"
      style={{ background: "var(--hb-surface-wash)", boxShadow: "var(--hb-shadow-raised)" }}
    >
      <div className="vc-ds" style={{ background: "transparent" }}>
        <a className="block" aria-label="See how AI search actually works" href="#platform-section">
          <div className="relative" style={{ height: 210 }}>
            {chartYAxisLabels.map((l) => (
              <span
                key={l.label}
                className="vc-ds-mono absolute pointer-events-none tabular-nums"
                style={{
                  left: 0,
                  top: l.top,
                  width: 30,
                  textAlign: "right",
                  fontSize: 10,
                  color: "var(--vc-ds-ink-4)",
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
                    {g.stops.map((s) => (
                      <stop
                        key={s.offset}
                        offset={s.offset}
                        stopColor={g.color}
                        stopOpacity={s.opacity}
                      />
                    ))}
                  </linearGradient>
                ))}
                <filter id="lr-chart-glow" x="-10%" y="-60%" width="120%" height="220%">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
                <linearGradient id="lr-chart-fade" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="white" stopOpacity={0} />
                  <stop offset="6%" stopColor="white" stopOpacity={1} />
                  <stop offset="94%" stopColor="white" stopOpacity={1} />
                  <stop offset="100%" stopColor="white" stopOpacity={0} />
                </linearGradient>
                <mask id="lr-chart-fade-mask">
                  <rect x={0} y={0} width={1054} height={210} fill="url(#lr-chart-fade)" />
                </mask>
              </defs>
              {/* Edge-fade mask so area fills recede at the historic/right
                  edges instead of hard-clipping, mirroring HeroBento's
                  hbFade mask. */}
              <g mask="url(#lr-chart-fade-mask)">
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
              </g>
              {/* Soft glow duplicate under ChatGPT's crisp line — the chart's
                  one leading/accent series (see chartData.ts). */}
              {leadingStroke && (
                <path
                  d={leadingStroke.d}
                  fill="none"
                  stroke={leadingStroke.stroke}
                  strokeWidth={7}
                  strokeOpacity={0.16}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  filter="url(#lr-chart-glow)"
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: isVisible ? 0 : 1,
                    transition: `stroke-dashoffset ${leadingStroke.durationMs}ms ${scrollRevealEase} ${leadingStroke.delayMs}ms`,
                  }}
                />
              )}
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
              {/* Two-layer halo end markers instead of flat dots. */}
              {CHART_END_DOTS.map((c) => (
                <g
                  key={c.name}
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transition: `opacity ${c.durationMs}ms ${scrollRevealEase} ${c.delayMs}ms`,
                  }}
                >
                  <circle cx={c.cx} cy={c.cy} r={c.r + 3.5} fill={c.fill} fillOpacity={0.18} />
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r={c.r}
                    fill={c.fill}
                    stroke={c.stroke}
                    strokeWidth={c.strokeWidth}
                  />
                </g>
              ))}
            </svg>
            {chartCallouts.map((c) => (
              <div
                key={c.name}
                className={`absolute flex items-center gap-1.5 pointer-events-none ${c.name === "ChatGPT" ? "hb-callout" : ""}`}
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
                  style={{ color: "var(--vc-ds-ink-2)" }}
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
