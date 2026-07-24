import {
  ADIDAS_LINE_D,
  CHART_GRADIENTS,
  CHART_VIEWBOX_HEIGHT,
  CHART_VIEWBOX_WIDTH,
  CHART_X_AXIS_LABELS,
  CHART_Y_AXIS_LABELS,
  NEW_BALANCE_LINE_D,
  NIKE_AREA_FILL_D,
  NIKE_STROKE_LINE_D,
} from "./chartData";

// Left column of Row 1 (col-span-8): "Visibility over time" label + the
// 7D/14D/30D segmented toggle, and the real chart -- verbatim from
// _reference/index.html lines 1096-1141. The chart itself is a hand-built
// SVG standing in for Recharts' generated markup (same approach the
// LearnResearch section's AiSearchAreaChart.tsx took): we render our own
// clean <svg viewBox="0 0 794 254"> rather than reproducing Recharts'
// wrapper-div-in-div-in-div DOM, since that structure is a library
// implementation detail, not a visual one -- but every path "d", gradient
// stop, and axis label below is the byte-for-byte extracted source data.
//
// The 30D tab is the only settled dataset captured in source (real chart
// coordinates only exist for this window) -- 7D/14D have no recoverable
// data, so the toggle renders statically at "30D active" and is NOT wired
// to switch datasets (would require inventing 7D/14D chart data, which the
// task disallows). See closing report AMBIGUITIES.
export function VisibilityChartPanel() {
  return (
    <div className="col-span-12 lg:col-span-8 border-b lg:border-b-0 lg:border-r border-[#EFEEEA]">
      <div className="flex flex-col h-full min-h-[260px] lg:min-h-0">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-medium text-vc-secondary">Visibility over time</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative inline-grid grid-cols-3 bg-vc-muted/60 rounded p-0.5 border border-vc-default/40">
              <div
                aria-hidden="true"
                className="absolute top-0.5 bottom-0.5 bg-white rounded shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]"
                style={{
                  width: "calc(33.3333% - 1.33333px)",
                  left: "calc(66.6667% - 0.666667px)",
                  transition: "left 220ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
              <button
                type="button"
                className="relative z-[1] px-2.5 py-1 text-[11px] font-medium rounded transition-colors duration-200 cursor-pointer text-vc-text-muted hover:text-vc-secondary"
              >
                7D
              </button>
              <button
                type="button"
                className="relative z-[1] px-2.5 py-1 text-[11px] font-medium rounded transition-colors duration-200 cursor-pointer text-vc-text-muted hover:text-vc-secondary"
              >
                14D
              </button>
              <button
                type="button"
                className="relative z-[1] px-2.5 py-1 text-[11px] font-medium rounded transition-colors duration-200 cursor-pointer text-vc-primary"
              >
                30D
              </button>
            </div>
          </div>
        </div>

        <div className="hero-bento-chart flex-1 px-2 pb-2 relative">
          <svg
            role="application"
            className="recharts-surface block"
            width={CHART_VIEWBOX_WIDTH}
            height={CHART_VIEWBOX_HEIGHT}
            viewBox={`0 0 ${CHART_VIEWBOX_WIDTH} ${CHART_VIEWBOX_HEIGHT}`}
          >
            <title>Visibility over time</title>
            <defs>
              <clipPath id="hbChartClip">
                <rect x={36} y={16} height={200} width={746} />
              </clipPath>
              {CHART_GRADIENTS.map((g) => (
                <linearGradient key={g.id} id={g.id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
                  {g.stops.map((s) => (
                    <stop
                      key={s.offset}
                      offset={s.offset}
                      stopColor={s.color}
                      stopOpacity={s.opacity}
                    />
                  ))}
                </linearGradient>
              ))}
            </defs>

            <g clipPath="url(#hbChartClip)">
              <path d={NIKE_AREA_FILL_D} fill="url(#hbBrandGrad)" stroke="none" />
              <path d={NIKE_STROKE_LINE_D} fill="none" stroke="#0e9373" strokeWidth={1.5} />
            </g>
            <path
              d={ADIDAS_LINE_D}
              fill="none"
              stroke="#64748B"
              strokeWidth={1.1}
              strokeOpacity={0.6}
              strokeDasharray="3 4"
              strokeLinecap="round"
            />
            <path
              d={NEW_BALANCE_LINE_D}
              fill="none"
              stroke="#78716C"
              strokeWidth={1.1}
              strokeOpacity={0.6}
              strokeDasharray="3 4"
              strokeLinecap="round"
            />

            {CHART_X_AXIS_LABELS.map((l) => (
              <text
                key={l.label}
                x={l.x}
                y={l.y}
                dy="0.71em"
                fontSize={10}
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
                fill="#9ca3af"
              >
                {l.label}
              </text>
            ))}
            {CHART_Y_AXIS_LABELS.map((l) => (
              <text
                key={l.label}
                x={28}
                y={l.y}
                dy="0.355em"
                fontSize={10}
                fontFamily="JetBrains Mono, monospace"
                textAnchor="end"
                fill="#9ca3af"
              >
                {l.label}
              </text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
