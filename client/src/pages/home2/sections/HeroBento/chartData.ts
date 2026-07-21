// AUTO-EXTRACTED VERBATIM from _reference/index.html lines 1064-1807 (the
// Hero Bento section's real Recharts-rendered "Visibility over time" SVG
// chart, plus the Crawlers 24-bar micro chart and Conversations 24-bar
// hourly-activity strip). Every path "d" string, gradient stop, axis label,
// and bar height/opacity below was extracted programmatically via regex
// against the literal source markup (see scratchpad extraction scripts run
// during the build), not retyped by hand, to guarantee byte-for-byte
// fidelity to the compiled build's coordinates. Do not hand-edit; re-run
// extraction against a fresh index.html instead.
//
// CHART_* below is the "Visibility over time" line+area chart (30D window,
// the settled/active tab in source): three series — Nike (solid area+line,
// stroke #0e9373, fill url(#hbBrandGrad)), Adidas (dashed line, #64748B),
// New Balance (dashed line, #78716C). viewBox is 794x254, matching source's
// recharts-surface. hbCursorGrad/hbCompGrad0-3 are defined in source's <defs>
// but never applied to a visible path in the settled snapshot (comparison-
// series area fills and the hover cursor gradient are interaction-only) —
// reproduced in defs anyway for byte-fidelity, unused by any rendered shape.
//
// CRAWLER_BARS (24) and CONVERSATION_BARS (24) are the settled per-bar
// height%/opacity values for the two hidden md:grid row-2 micro-charts.
// Note: despite the task brief's "22-bar" description of the Conversations
// strip, re-verification against source (lines 1322-1394) confirms 24 bars
// -- one per hour, matching the 24h "3pm/9pm/3am/9am/Now" x-axis (6h steps).

export interface ChartGradientStop {
  offset: string;
  color: string;
  opacity: number;
}

export interface ChartGradient {
  id: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  stops: ChartGradientStop[];
}

export const CHART_VIEWBOX_WIDTH = 794;
export const CHART_VIEWBOX_HEIGHT = 254;

export const CHART_GRADIENTS: ChartGradient[] = [
  {
    id: "hbBrandGrad",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
    stops: [
      { offset: "0%", color: "#0e9373", opacity: 0.14 },
      { offset: "60%", color: "#0e9373", opacity: 0.14 },
      { offset: "100%", color: "#0e9373", opacity: 0 },
    ],
  },
  {
    id: "hbCursorGrad",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
    stops: [
      { offset: "0%", color: "#0e9373", opacity: 0.3 },
      { offset: "100%", color: "#0e9373", opacity: 0 },
    ],
  },
  {
    id: "hbCompGrad0",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
    stops: [
      { offset: "0%", color: "#64748B", opacity: 0.048 },
      { offset: "100%", color: "#64748B", opacity: 0 },
    ],
  },
  {
    id: "hbCompGrad1",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
    stops: [
      { offset: "0%", color: "#78716C", opacity: 0.048 },
      { offset: "100%", color: "#78716C", opacity: 0 },
    ],
  },
  {
    id: "hbCompGrad2",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
    stops: [
      { offset: "0%", color: "#94A3B8", opacity: 0.048 },
      { offset: "100%", color: "#94A3B8", opacity: 0 },
    ],
  },
  {
    id: "hbCompGrad3",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
    stops: [
      { offset: "0%", color: "#A8A29E", opacity: 0.048 },
      { offset: "100%", color: "#A8A29E", opacity: 0 },
    ],
  },
];

// Nike area fill (fill="url(#hbBrandGrad)"), source id="recharts-area-_r_4_"
export const NIKE_AREA_FILL_D = `M36,128.683C44.575,128.543,53.149,128.402,61.724,127.839C70.299,127.277,78.874,116.83,87.448,116.83C96.023,116.83,104.598,117.714,113.172,118.409C121.747,119.105,130.322,121.004,138.897,121.004C147.471,121.004,156.046,114.087,164.621,112.509C173.195,110.931,181.77,110.142,190.345,110.142C198.92,110.142,207.494,117.652,216.069,118.833C224.644,120.015,233.218,120.605,241.793,120.605C250.368,120.605,258.943,118.416,267.517,115.723C276.092,113.031,284.667,107.119,293.241,104.451C301.816,101.783,310.391,99.718,318.966,99.718C327.54,99.718,336.115,101.329,344.69,101.824C353.264,102.318,361.839,102.684,370.414,102.684C378.989,102.684,387.563,92.251,396.138,89.738C404.713,87.225,413.287,85.968,421.862,85.968C430.437,85.968,439.011,88.643,447.586,88.643C456.161,88.643,464.736,85.394,473.31,81.827C481.885,78.259,490.46,67.236,499.034,67.236C507.609,67.236,516.184,74.325,524.759,74.325C533.333,74.325,541.908,63.896,550.483,62.343C559.057,60.791,567.632,61.129,576.207,60.014C584.782,58.899,593.356,55.653,601.931,55.653C610.506,55.653,619.08,66.302,627.655,66.302C636.23,66.302,644.805,61.052,653.379,58.229C661.954,55.406,670.529,49.364,679.103,49.364C687.678,49.364,696.253,59.954,704.828,59.954C713.402,59.954,721.977,46.09,730.552,46.09C739.126,46.09,747.701,50.012,756.276,50.012C764.851,50.012,773.425,46.204,782,42.396L782,216C773.425,216,764.851,216,756.276,216C747.701,216,739.126,216,730.552,216C721.977,216,713.402,216,704.828,216C696.253,216,687.678,216,679.103,216C670.529,216,661.954,216,653.379,216C644.805,216,636.23,216,627.655,216C619.08,216,610.506,216,601.931,216C593.356,216,584.782,216,576.207,216C567.632,216,559.057,216,550.483,216C541.908,216,533.333,216,524.759,216C516.184,216,507.609,216,499.034,216C490.46,216,481.885,216,473.31,216C464.736,216,456.161,216,447.586,216C439.011,216,430.437,216,421.862,216C413.287,216,404.713,216,396.138,216C387.563,216,378.989,216,370.414,216C361.839,216,353.264,216,344.69,216C336.115,216,327.54,216,318.966,216C310.391,216,301.816,216,293.241,216C284.667,216,276.092,216,267.517,216C258.943,216,250.368,216,241.793,216C233.218,216,224.644,216,216.069,216C207.494,216,198.92,216,190.345,216C181.77,216,173.195,216,164.621,216C156.046,216,147.471,216,138.897,216C130.322,216,121.747,216,113.172,216C104.598,216,96.023,216,87.448,216C78.874,216,70.299,216,61.724,216C53.149,216,44.575,216,36,216Z`;

// Nike stroke line (stroke="#0e9373"), the drawn curve on top of the area fill
export const NIKE_STROKE_LINE_D = `M36,128.683C44.575,128.543,53.149,128.402,61.724,127.839C70.299,127.277,78.874,116.83,87.448,116.83C96.023,116.83,104.598,117.714,113.172,118.409C121.747,119.105,130.322,121.004,138.897,121.004C147.471,121.004,156.046,114.087,164.621,112.509C173.195,110.931,181.77,110.142,190.345,110.142C198.92,110.142,207.494,117.652,216.069,118.833C224.644,120.015,233.218,120.605,241.793,120.605C250.368,120.605,258.943,118.416,267.517,115.723C276.092,113.031,284.667,107.119,293.241,104.451C301.816,101.783,310.391,99.718,318.966,99.718C327.54,99.718,336.115,101.329,344.69,101.824C353.264,102.318,361.839,102.684,370.414,102.684C378.989,102.684,387.563,92.251,396.138,89.738C404.713,87.225,413.287,85.968,421.862,85.968C430.437,85.968,439.011,88.643,447.586,88.643C456.161,88.643,464.736,85.394,473.31,81.827C481.885,78.259,490.46,67.236,499.034,67.236C507.609,67.236,516.184,74.325,524.759,74.325C533.333,74.325,541.908,63.896,550.483,62.343C559.057,60.791,567.632,61.129,576.207,60.014C584.782,58.899,593.356,55.653,601.931,55.653C610.506,55.653,619.08,66.302,627.655,66.302C636.23,66.302,644.805,61.052,653.379,58.229C661.954,55.406,670.529,49.364,679.103,49.364C687.678,49.364,696.253,59.954,704.828,59.954C713.402,59.954,721.977,46.09,730.552,46.09C739.126,46.09,747.701,50.012,756.276,50.012C764.851,50.012,773.425,46.204,782,42.396`;

// Adidas dashed comparison line (stroke="#64748B"), source id="recharts-line-_r_2_"
export const ADIDAS_LINE_D = `M36,94.297C44.575,95.825,53.149,97.353,61.724,97.353C70.299,97.353,78.874,94.052,87.448,92.162C96.023,90.273,104.598,87.576,113.172,86.016C121.747,84.455,130.322,82.799,138.897,82.799C147.471,82.799,156.046,84.105,164.621,84.917C173.195,85.73,181.77,87.676,190.345,87.676C198.92,87.676,207.494,83.165,216.069,83.165C224.644,83.165,233.218,83.563,241.793,84.357C250.368,85.151,258.943,92.817,267.517,92.817C276.092,92.817,284.667,83.606,293.241,83.606C301.816,83.606,310.391,84.456,318.966,84.456C327.54,84.456,336.115,80.786,344.69,79.272C353.264,77.757,361.839,75.37,370.414,75.37C378.989,75.37,387.563,76.034,396.138,76.034C404.713,76.034,413.287,60.776,421.862,60.776C430.437,60.776,439.011,67.771,447.586,69.188C456.161,70.605,464.736,71.314,473.31,71.314C481.885,71.314,490.46,52.873,499.034,52.873C507.609,52.873,516.184,65.648,524.759,65.648C533.333,65.648,541.908,64.931,550.483,63.499C559.057,62.067,567.632,53.582,576.207,50.728C584.782,47.874,593.356,46.373,601.931,46.373C610.506,46.373,619.08,57.065,627.655,57.065C636.23,57.065,644.805,42.354,653.379,42.354C661.954,42.354,670.529,46.725,679.103,46.725C687.678,46.725,696.253,38.527,704.828,38.527C713.402,38.527,721.977,49.373,730.552,49.373C739.126,49.373,747.701,40.896,756.276,40.896C764.851,40.896,773.425,43.617,782,46.338`;

// New Balance dashed comparison line (stroke="#78716C"), source id="recharts-line-_r_3_"
export const NEW_BALANCE_LINE_D = `M36,135.765C44.575,140.069,53.149,144.372,61.724,144.372C70.299,144.372,78.874,132.17,87.448,132.17C96.023,132.17,104.598,135.086,113.172,137.248C121.747,139.411,130.322,145.143,138.897,145.143C147.471,145.143,156.046,144.91,164.621,144.445C173.195,143.98,181.77,131.982,190.345,131.982C198.92,131.982,207.494,140.467,216.069,140.467C224.644,140.467,233.218,127.396,241.793,127.396C250.368,127.396,258.943,140.96,267.517,140.96C276.092,140.96,284.667,135.688,293.241,133.123C301.816,130.558,310.391,125.569,318.966,125.569C327.54,125.569,336.115,126.341,344.69,127.884C353.264,129.428,361.839,136.028,370.414,136.028C378.989,136.028,387.563,131.009,396.138,128.857C404.713,126.705,413.287,123.118,421.862,123.118C430.437,123.118,439.011,131.728,447.586,131.728C456.161,131.728,464.736,122.807,473.31,122.807C481.885,122.807,490.46,124.44,499.034,125.007C507.609,125.575,516.184,126.212,524.759,126.212C533.333,126.212,541.908,123.2,550.483,123.2C559.057,123.2,567.632,123.404,576.207,123.811C584.782,124.219,593.356,126.745,601.931,126.745C610.506,126.745,619.08,120.777,627.655,118.464C636.23,116.15,644.805,112.862,653.379,112.862C661.954,112.862,670.529,117.429,679.103,117.429C687.678,117.429,696.253,104.693,704.828,104.693C713.402,104.693,721.977,109.708,730.552,109.708C739.126,109.708,747.701,109.28,756.276,108.425C764.851,107.569,773.425,103.543,782,99.516`;

export interface ChartAxisLabel {
  x?: number;
  y: number;
  label: string;
}

export const CHART_X_AXIS_LABELS: ChartAxisLabel[] = [
  { x: 36, y: 238, label: "Jun 20" },
  { x: 216.0689655172414, y: 238, label: "Jun 27" },
  { x: 396.1379310344828, y: 238, label: "Jul 4" },
  { x: 576.2068965517242, y: 238, label: "Jul 11" },
  { x: 756.2758620689656, y: 238, label: "Jul 18" },
];

export const CHART_Y_AXIS_LABELS: ChartAxisLabel[] = [
  { y: 216, label: "40" },
  { y: 156, label: "55" },
  { y: 96, label: "70" },
  { y: 16, label: "90" },
];

export interface MicroBar {
  heightPct: number;
  bgOpacity: number;
  barOpacity: number;
}

// Crawlers panel's 24-bar micro bar chart (24h of crawl activity), all bars
// rgba(14, 147, 115, bgOpacity) -- rgb(14,147,115) is var(--color-accent)
// (#0e9373) expressed as a literal rgba() triplet in source rather than a
// CSS var, presumably because these opacity/height values are computed
// per-bar at render time by the dashboard app.
export const CRAWLER_BARS: MicroBar[] = [
  { heightPct: 90.9091, bgOpacity: 0.58, barOpacity: 0.78 },
  { heightPct: 80.6818, bgOpacity: 0.525, barOpacity: 0.789565 },
  { heightPct: 71.5909, bgOpacity: 0.475, barOpacity: 0.79913 },
  { heightPct: 71.5909, bgOpacity: 0.475, barOpacity: 0.808696 },
  { heightPct: 40.9091, bgOpacity: 0.306, barOpacity: 0.818261 },
  { heightPct: 43.1818, bgOpacity: 0.318, barOpacity: 0.827826 },
  { heightPct: 37.5, bgOpacity: 0.286, barOpacity: 0.837391 },
  { heightPct: 13.6364, bgOpacity: 0.157, barOpacity: 0.846957 },
  { heightPct: 26.1364, bgOpacity: 0.224, barOpacity: 0.856522 },
  { heightPct: 26.1364, bgOpacity: 0.224, barOpacity: 0.866087 },
  { heightPct: 17.0455, bgOpacity: 0.173, barOpacity: 0.875652 },
  { heightPct: 14.7727, bgOpacity: 0.16, barOpacity: 0.885217 },
  { heightPct: 4, bgOpacity: 0.04, barOpacity: 0.894783 },
  { heightPct: 10, bgOpacity: 0.106, barOpacity: 0.904348 },
  { heightPct: 12.5, bgOpacity: 0.15, barOpacity: 0.913913 },
  { heightPct: 25, bgOpacity: 0.216, barOpacity: 0.923478 },
  { heightPct: 52.2727, bgOpacity: 0.37, barOpacity: 0.933043 },
  { heightPct: 56.8182, bgOpacity: 0.392, barOpacity: 0.942609 },
  { heightPct: 89.7727, bgOpacity: 0.573, barOpacity: 0.952174 },
  { heightPct: 100, bgOpacity: 0.63, barOpacity: 0.961739 },
  { heightPct: 94.3182, bgOpacity: 0.6, barOpacity: 0.971304 },
  { heightPct: 61.3636, bgOpacity: 0.416, barOpacity: 0.98087 },
  { heightPct: 64.7727, bgOpacity: 0.435, barOpacity: 0.990435 },
  { heightPct: 95.4545, bgOpacity: 0.604, barOpacity: 1 },
];

export interface HourlyBar {
  opacity: number;
}

// Conversations panel's 24-bar hourly activity strip. Fixed 14px height,
// varying OPACITY per bar (not height) -- rgba(14, 147, 115, opacity).
export const CONVERSATION_BARS: HourlyBar[] = [
  { opacity: 0.804 },
  { opacity: 0.82 },
  { opacity: 0.66 },
  { opacity: 0.463 },
  { opacity: 0.443 },
  { opacity: 0.353 },
  { opacity: 0.337 },
  { opacity: 0.318 },
  { opacity: 0.21 },
  { opacity: 0.157 },
  { opacity: 0.03 },
  { opacity: 0.176 },
  { opacity: 0.086 },
  { opacity: 0.03 },
  { opacity: 0.21 },
  { opacity: 0.192 },
  { opacity: 0.353 },
  { opacity: 0.498 },
  { opacity: 0.694 },
  { opacity: 0.714 },
  { opacity: 0.68 },
  { opacity: 0.68 },
  { opacity: 0.75 },
  { opacity: 0.68 },
];
