import {
  ADIDAS_LINE_D,
  CHART_GRADIENTS,
  CHART_PLOT,
  CHART_VIEWBOX_HEIGHT,
  CHART_VIEWBOX_WIDTH,
  CHART_X_AXIS_LABELS,
  CHART_Y_AXIS_LABELS,
  COMPETITOR_STROKES,
  NEW_BALANCE_LINE_D,
  NIKE_AREA_FILL_D,
  NIKE_END_X,
  NIKE_END_Y,
  NIKE_STROKE_LINE_D,
} from "./chartData";

// Left column of Row 1 (col-span-8): "Visibility over time" label + the
// 7D/14D/30D segmented toggle, and the real chart -- verbatim from
// _reference/index.html lines 1096-1141. The chart itself is a hand-built
// SVG standing in for Recharts' generated markup (same approach the
// LearnResearch section's AiSearchAreaChart.tsx took): we render our own
// clean <svg viewBox="0 0 794 254"> rather than reproducing Recharts'
// wrapper-div-in-div-in-div DOM, since that structure is a library
// implementation detail, not a visual one -- but every path "d" and axis
// label below is the byte-for-byte extracted source data. (Gradients, the
// glow/fade layers and the endpoint marker are the surface-polish pass's
// own treatment -- see the VISUAL-POLISH EXCEPTION note in chartData.ts.)
//
// The 30D tab is the only settled dataset captured in source (real chart
// coordinates only exist for this window) -- 7D/14D have no recoverable
// data, so the toggle renders statically at "30D active" and is NOT wired
// to switch datasets (would require inventing 7D/14D chart data, which the
// task disallows). See closing report AMBIGUITIES.
export function VisibilityChartPanel() {
  return (
    <div className="col-span-12 lg:col-span-8 border-b lg:border-b-0 lg:border-r border-vc-hairline">
      <div className="flex flex-col h-full min-h-[260px] lg:min-h-0">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-medium text-vc-secondary">Visibility over time</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative inline-grid grid-cols-3 rounded-[7px] p-0.5 bg-[#f2f2f8] ring-1 ring-[rgba(22,22,46,0.05)]">
              <div
                aria-hidden="true"
                className="absolute top-0.5 bottom-0.5 rounded-[5px] bg-white ring-1 ring-[rgba(22,22,46,0.06)]"
                style={{
                  width: "calc(33.3333% - 1.33333px)",
                  left: "calc(66.6667% - 0.666667px)",
                  transition: "left 220ms var(--hb-ease-reveal)",
                  boxShadow: "var(--hb-shadow-raised)",
                }}
              />
              <button
                type="button"
                className="relative z-1 px-2.5 py-1 text-[11px] font-medium rounded transition-colors duration-200 cursor-pointer text-vc-text-muted hover:text-vc-secondary"
              >
                7D
              </button>
              <button
                type="button"
                className="relative z-1 px-2.5 py-1 text-[11px] font-medium rounded transition-colors duration-200 cursor-pointer text-vc-text-muted hover:text-vc-secondary"
              >
                14D
              </button>
              <button
                type="button"
                className="relative z-1 px-2.5 py-1 text-[11px] font-semibold rounded transition-colors duration-200 cursor-pointer text-vc-primary"
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
                <rect
                  x={CHART_PLOT.x}
                  y={CHART_PLOT.y}
                  width={CHART_PLOT.w}
                  height={CHART_PLOT.h}
                />
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
              <filter id="hbGlow" x="-10%" y="-60%" width="120%" height="220%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              <mask id="hbFade">
                <rect
                  x={CHART_PLOT.x}
                  y={0}
                  width={CHART_PLOT.w}
                  height={CHART_VIEWBOX_HEIGHT}
                  fill="url(#hbFadeGrad)"
                />
              </mask>
            </defs>

            {/* 1. Grid, drawn first under everything. */}
            <g shapeRendering="crispEdges">
              {CHART_Y_AXIS_LABELS.map((l) => (
                <line
                  key={`grid-${l.label}`}
                  x1={CHART_PLOT.x}
                  x2={CHART_PLOT.x + CHART_PLOT.w}
                  y1={l.y}
                  y2={l.y}
                  stroke={l.y === 216 ? "var(--hb-chart-baseline)" : "var(--hb-chart-grid)"}
                  strokeWidth={1}
                />
              ))}
            </g>

            {/* 2. Competitors - below Nike, masked so they recede at the
                   historic (left) end. Unified onto one cool-grey ramp. */}
            <g clipPath="url(#hbChartClip)" mask="url(#hbFade)">
              <path
                d={ADIDAS_LINE_D}
                fill="none"
                stroke={COMPETITOR_STROKES.adidas}
                strokeWidth={1.25}
                strokeOpacity={0.62}
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
              <path
                d={NEW_BALANCE_LINE_D}
                fill="none"
                stroke={COMPETITOR_STROKES.newBalance}
                strokeWidth={1.25}
                strokeOpacity={0.7}
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
            </g>

            {/* 3. Nike area + soft halo + gradient line. */}
            <g clipPath="url(#hbChartClip)">
              <g mask="url(#hbFade)" className="hb-area-in">
                <path d={NIKE_AREA_FILL_D} fill="url(#hbBrandGrad)" stroke="none" />
              </g>
              <path
                className="hb-draw"
                d={NIKE_STROKE_LINE_D}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={7}
                strokeOpacity={0.14}
                strokeLinecap="round"
                filter="url(#hbGlow)"
              />
              <path
                className="hb-draw"
                d={NIKE_STROKE_LINE_D}
                fill="none"
                stroke="url(#hbLineGrad)"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            {/* 4. "Now" drop line. */}
            <line
              className="hb-area-in"
              x1={NIKE_END_X}
              x2={NIKE_END_X}
              y1={NIKE_END_Y}
              y2={216}
              stroke="var(--accent)"
              strokeOpacity={0.22}
              strokeWidth={1}
              strokeDasharray="2 3"
            />

            {/* 5. Endpoint marker - deliberately outside #hbChartClip: the
                   clip's right edge is x=782, exactly the marker centre,
                   which would slice every halo in half. Max reach x=791 is
                   still inside the 794 viewBox. */}
            <g className="hb-pop">
              <circle cx={NIKE_END_X} cy={NIKE_END_Y} r={9} fill="var(--accent)" opacity={0.1} />
              <circle cx={NIKE_END_X} cy={NIKE_END_Y} r={5.5} fill="var(--accent)" opacity={0.2} />
              <circle cx={NIKE_END_X} cy={NIKE_END_Y} r={3.6} fill="#ffffff" />
              <circle
                cx={NIKE_END_X}
                cy={NIKE_END_Y}
                r={3.6}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.8}
              />
            </g>

            {/* 6. Value callout - the endpoint's own score, not new copy.
                   Hidden below 1024px via .hb-callout's media query. */}
            <g className="hb-pop hb-callout">
              <rect x={752} y={18} width={30} height={18} rx={5} fill="url(#hbCalloutGrad)" />
              <text
                x={767}
                y={27}
                dy="0.355em"
                fontSize={11}
                fontWeight={600}
                textAnchor="middle"
                fill="#ffffff"
                fontFamily="JetBrains Mono, monospace"
              >
                83
              </text>
            </g>

            {CHART_X_AXIS_LABELS.map((l, i) => (
              <text
                key={l.label}
                x={l.x}
                y={l.y}
                dy="0.71em"
                fontSize={10}
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
                fontWeight={i === CHART_X_AXIS_LABELS.length - 1 ? 600 : 400}
                fill={
                  i === CHART_X_AXIS_LABELS.length - 1
                    ? "var(--text-body-color)"
                    : "var(--text-muted-color)"
                }
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
                fontSize={9.5}
                fontFamily="JetBrains Mono, monospace"
                textAnchor="end"
                fill="var(--text-muted-color)"
                letterSpacing="0.02em"
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
