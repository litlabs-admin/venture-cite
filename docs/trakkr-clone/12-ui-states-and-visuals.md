# 12 - UI states and visuals

Scope: transient UI for the trakkr.ai replication spec. Tooltips, charts, toasts, skeletons, popovers.

## Method note (read this first)

The live browser pane failed during this sweep. The pane did not composite frames.
Screenshots failed. After the first dashboard load the renderer stopped answering.
`javascript_tool`, `read_page`, `get_page_text` and `navigate` all timed out.
Two fresh tabs gave the same result.

So the data below comes from two sources:

1. Live DOM reads made before the pane died. These are marked **LIVE**.
2. The production JavaScript and CSS bundles fetched over HTTP. These are marked **BUNDLE**.

Bundle source is the shipped code. It is exact, not inferred.
Bundle files used:

- `https://trakkr.ai/assets/index-Dguo47UF.js` (main)
- `https://trakkr.ai/assets/index-FXwgnpwI.css`
- `https://trakkr.ai/assets/vendor-charts-BS-TXgPL.js`
- `https://trakkr.ai/assets/toast-container-D9gsmAp1.js`
- `https://trakkr.ai/assets/ChartTooltip-CE43oBgi.js`
- `https://trakkr.ai/assets/AreaTrend-C91-KMIU.js`
- `https://trakkr.ai/assets/TrendChart-CvJL4_PD.js`
- `https://trakkr.ai/assets/ChartFrame-BwuEFAuD.js`
- `https://trakkr.ai/assets/InstrumentTable-BYafPo_5.js`
- `https://trakkr.ai/assets/FilterBar-ibxvPsmR.js`
- `https://trakkr.ai/assets/Dashboard-CaTWfFir.js`
- `https://trakkr.ai/assets/CompetitorsV2-eU0MpW0X.js`
- `https://trakkr.ai/assets/Prompts-eXKnUOn8.js`

---

## 1. KPI help tooltips on /dashboard

### 1.1 The trigger button (LIVE + BUNDLE)

Six buttons exist. Each has `aria-label="Help: <metric title>"`.
LIVE positions were all `y=82`, `height=28`, `width=28`.

```html
<button
  class="inline-flex items-center justify-center min-w-[28px] min-h-[28px] -m-2
         text-gray-400 hover:text-gray-600 transition-colors cursor-help"
  aria-label="Help: Visibility score">
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
       stroke-linejoin="round" class="lucide lucide-info" aria-hidden="true">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M12 16v-4"></path>
    <path d="M12 8h.01"></path>
  </svg>
</button>
```

### 1.2 The popover shell (BUNDLE)

The tooltip renders into `document.body` through a portal. It is not a Radix popper.
It is a hand-written component with manual positioning.

```jsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.98 }}
  transition={{ duration: standard.duration / 1000, ease: [0.16, 1, 0.3, 1] }}
  className="fixed z-[300] px-3 py-2 max-w-[280px]
             bg-white text-gray-900 rounded border border-gray-200
             shadow-sm"
  style={{ left: pos.x, top: pos.y }}
  role="tooltip">
  <div className="text-[12px] leading-relaxed">{content}</div>
  {description && <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{description}</p>}
  {learnMoreHref && (
    <Link className="inline-flex items-center gap-1 mt-2 text-[11px] text-accent
                     hover:text-[#0b7a5e] font-medium transition-colors">
      Learn more <ArrowIcon size={10} strokeWidth={2} />
    </Link>
  )}
  {kbd && (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <kbd class="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">…</kbd>
    </div>
  )}
  <div className="absolute w-2 h-2 bg-white border-gray-200 …arrow classes…" />
</motion.div>
```

Resolved CSS values:

```css
/* tooltip panel */
position: fixed;
z-index: 300;
padding: 8px 12px;          /* px-3 py-2 */
max-width: 280px;
background: #ffffff;
color: #111827;             /* text-gray-900 */
border: 1px solid #e5e7eb;  /* border-gray-200 */
border-radius: 4px;         /* rounded */
box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);  /* shadow-sm */
font-size: 12px;
line-height: 1.625;
pointer-events: none;       /* unless interactive */
```

Arrow: an 8 x 8 px white square, rotated 45deg, with two borders only.

```css
/* placement = top  -> arrow sits on the bottom edge */
.arrow { position:absolute; width:8px; height:8px; background:#fff; border-color:#e5e7eb; }
top:    bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45; border-bottom:1px; border-right:1px;
bottom: top-0    left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45; border-top:1px; border-left:1px;
left:   right-0  top-1/2  translate-x-1/2  -translate-y-1/2 rotate-45; border-right:1px; border-top:1px;
right:  left-0   top-1/2  -translate-x-1/2 -translate-y-1/2 rotate-45; border-left:1px; border-bottom:1px;
```

Behaviour:

- Open delay default 300 ms. The KPI help variant passes `delay: 150`.
- Close delay 100 ms when the tooltip is interactive. Otherwise it closes at once.
- Gap between trigger and panel is 12 px.
- The panel clamps to the viewport with a 12 px margin.
- If a `top` panel would overflow the top, it flips to `bottom`, and the reverse.
- A click on the trigger closes the tooltip.

### 1.3 Tooltip body layout (BUNDLE)

```jsx
<div className="min-w-[200px]">
  <p className="font-medium text-gray-900 mb-1">{title}</p>
  <p className="text-[11px] text-gray-600 leading-relaxed">{description}</p>
  {formula && <p className="text-[10px] font-mono text-gray-400 mt-1.5 bg-gray-50 px-2 py-1 rounded border border-gray-100">{formula}</p>}
  {benchmark && <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{benchmark}</p>}
</div>
```

`Learn more` links to `/learn/docs/concepts#<anchor>`.

### 1.4 The six dashboard tooltips, verbatim (BUNDLE)

**Visibility score**
> How prominently AI models mention your brand when answering relevant questions. Higher-ranked mentions earn more points.
> Formula: `100 × √(position points ÷ (successful responses × 10))`
> Benchmark: `Good: 40+ · Excellent: 60+`
> Anchor: `visibility`

**Total mentions**
> The raw count of times your brand appeared across all prompts and AI models in the selected period.
> Anchor: `mentions`

**Competitive rank**
> Your position among distinct tracked brands, ordered by visibility score. Product variants are grouped and hidden competitors are excluded.
> Anchor: `rank`

**Citation count**
> The number of unique URLs that AI models reference when mentioning your brand. More citations often indicates stronger source authority.
> Anchor: `citations`

**AI traffic**
> Website sessions from AI-referred visitors in the last 7 days. Measured via your Google Analytics integration.
> Anchor: `ai-traffic`

**Conversations**
> Pages fetched during live AI conversations in the last 7 days. This is the strongest signal your content is being actively cited by AI models like ChatGPT, Claude, and Perplexity.
> Anchor: `conversations`

### 1.5 Other metric tooltips in the same registry (BUNDLE)

The registry holds more keys than the dashboard shows. Record them for other pages.

| Key | Title | Description | Formula | Benchmark |
|---|---|---|---|---|
| `presence` | Presence rate | The percentage of tracked prompts where your brand appears in AI responses at all. | Prompts where mentioned ÷ total prompts × 100 | Good: 50%+ · Excellent: 75%+ |
| `avg_position` | Average position | Your typical ranking position when AI lists multiple brands. Position 1 means mentioned first. | Sum of positions ÷ number of mentions | Excellent: 1-2 · Good: 3-4 |
| `avg_rank` | Average rank | The average position your brand is mentioned across all prompts for this dimension. Lower is better - rank 1 means mentioned first. | Sum of mention positions ÷ number of mentions | Excellent: 1-3 · Good: 3-5 |
| `rank1_share` | #1 Share | The percentage of prompts where this model or competitor ranked your brand first. Shows which platforms or competitors drive top placements. | Prompts ranked #1 ÷ total prompts with mentions × 100 | Strong: 30%+ · Dominant: 50%+ |
| `win_rate` | Win rate | How often you rank higher than competitors when you both appear in the same AI response. | Prompts where you ranked higher ÷ prompts where both appeared × 100 | Winning: 55%+ · Dominant: 70%+ |
| `share_of_voice` | Share of voice | Your visibility as a proportion of total visibility across all tracked competitors. | Your visibility ÷ sum of all competitor visibility × 100 | - |
| `head_to_head` | Head-to-head score | A direct comparison of how you perform against a single competitor across all shared prompts. | - | - |
| `competitive_gap` | Competitive gap | The visibility score difference between you and a competitor. Positive means you're ahead. | - | - |
| `perception_score` | Perception score | How positively AI models describe your brand overall. Combines 20 attributes across 5 categories. | - | Excellent: 75+ · Good: 60-74 · Needs work: <60 |

### 1.6 Sparkline tooltip variant (BUNDLE)

A second tooltip shape wraps KPI sparklines.

```jsx
<div className="min-w-[120px]">
  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{title}</p>
  <div className="flex items-end justify-between gap-4">
    <span className="text-[18px] font-semibold text-gray-900 tabular-nums leading-none mb-px">{value}</span>
    <Sparkline data={history} width={60} height={20} color="#0e9373" strokeWidth={2} />
  </div>
  <p className="text-[10px] text-gray-500 mt-2 border-t border-gray-100 pt-1.5">Last 30 days history</p>
</div>
```

---

## 2. Chart internals

### 2.1 Library

**Recharts.** Confirmed from `vendor-charts-BS-TXgPL.js`. The bundle contains `recharts-wrapper`,
`recharts-surface`, `recharts-cartesian-grid-bg`, `recharts-cartesian-axis-tick-value`,
`recharts-area-curve`, `recharts-line-curve`, `rechartsEventEmitter` and more.

One chart is **not** Recharts. The /prompts audience trend is hand-drawn SVG. See 2.6.
A second hand-drawn engine, `TrendChart-CvJL4_PD.js`, also exists. See 2.7.

### 2.2 Global chart token set (BUNDLE)

`ChartTooltip-CE43oBgi.js` reads nine CSS variables from `documentElement`.
It also carries hard-coded fallbacks.

```css
--chart-1: var(--color-accent);     /* -> var(--color-green-500) -> #0e9373 */
--chart-2: var(--color-gray-400);   /* #a8a29e */
--chart-3: var(--color-blue-500);   /* #3b82f6 */
--chart-4: var(--color-amber-500);  /* #f59e0b */
--chart-5: var(--color-gray-600);   /* #57534e */
--chart-6: var(--color-gray-300);   /* #d6d3d1 */
--chart-grid: var(--color-gray-100);/* #f5f5f4 */
--chart-axis: var(--color-gray-500);/* #78716c */
--color-surface: #ffffff;
```

Fallback map inside the JS, used before hydration:

```js
{ "--chart-1": ACCENT, "--chart-2": "#a8a29e", "--chart-3": "#3b82f6",
  "--chart-4": "#f59e0b", "--chart-5": "#57534e", "--chart-6": "#d6d3d1",
  "--chart-grid": "#f5f5f4", "--chart-axis": "#78716c", "--color-surface": "#ffffff" }
```

Chart font: `JetBrains Mono, ui-monospace, monospace`.

Shared props built by the `useChartTheme` hook:

```js
gridProps:  { stroke: "#f5f5f4", strokeDasharray: "0", vertical: false, horizontal: true }
axisProps:  { stroke: "#f5f5f4", tickLine: false, axisLine: false,
              tick: { fontSize: 11, fill: "#78716c", fontFamily: "JetBrains Mono, ui-monospace, monospace" } }
margin:     { top: 8, right: 8, bottom: 0, left: -16 }
gradientId: (i) => `trk-chart-grad-${i}`
```

A `MutationObserver` on `documentElement` (`style`, `class`) re-reads the variables when the theme changes.

Series gradient definition:

```jsx
<linearGradient id={`trk-chart-grad-${index}`} x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%"   stopColor={color} stopOpacity={0.14} />
  <stop offset="100%" stopColor={color} stopOpacity={0} />
</linearGradient>
```

Global CSS overrides applied to every Recharts chart:

```css
.recharts-area-curve { stroke-width: 2.5px !important; stroke-opacity: 1 !important; }
.recharts-area-area  { fill-opacity: .15 !important; }
.recharts-line-curve { stroke-dasharray: none !important; stroke-dashoffset: 0 !important; }
.recharts-wrapper    { opacity:1 !important; visibility:visible !important; width:100% !important;
                       max-width:100% !important; overflow:visible !important; }
.recharts-surface    { opacity:1 !important; visibility:visible !important; width:100% !important;
                       overflow:visible !important; }
.recharts-wrapper text { visibility:visible !important; opacity:1 !important; }
```

### 2.3 Shared chart tooltip (BUNDLE)

Used by `AreaTrend` and every chart built on the shared theme.

```jsx
<div className="rounded-md border border-default bg-surface px-3 py-2 min-w-[7rem]"
     style={{ boxShadow: "var(--shadow-overlay)" }}>
  <div className="mb-1.5 text-[11px] text-muted">{label}</div>
  <div className="space-y-1">
    {rows.map((e,i) => (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} aria-hidden />
        <span className="flex-1 truncate text-[11px] text-secondary">{e.name}</span>
        <span className="font-mono tabular-nums text-[13px] font-semibold text-primary">{value}</span>
      </div>
    ))}
  </div>
</div>
```

```css
--shadow-overlay: 0 4px 16px -4px #00000014;
```

Rows with `value === undefined` or `null` are dropped. If no rows remain, the tooltip renders nothing.
Numbers print as integers, or one decimal place when not integral. An optional unit suffix is appended.
With a single series, the colour dot and the name are hidden (`hideName`).

### 2.4 The shared AreaTrend chart (BUNDLE)

```jsx
<ResponsiveContainer width="100%" height={height /* default 220 */} minWidth={120}>
  <AreaChart data={data} margin={{ top:8, right:8, bottom:0, left:-16, ...override }}>
    <defs>{/* one gradient per area series */}</defs>
    <XAxis dataKey={xKey} tickFormatter={fmt} {...axisProps} dy={8} minTickGap={24} />
    <YAxis {...axisProps} domain={["dataMin - 4","dataMax + 4"]} tickFormatter={v=>Math.round(v)} width={34} />
    <Tooltip cursor={{ stroke:"#f5f5f4", strokeWidth:1 }} content={<ChartTooltip/>} />
    <Area  type="monotone" stroke={color} strokeWidth={2} fill="url(#trk-chart-grad-N)" dot={false}
           activeDot={{ r:4, fill:color, stroke:"#ffffff", strokeWidth:2 }}
           isAnimationActive animationDuration={650} />
    <Line  type="monotone" stroke={color} strokeWidth={2} dot={false}
           activeDot={{ r:4, fill:color, stroke:"#ffffff", strokeWidth:2 }}
           isAnimationActive animationDuration={650} />
  </AreaChart>
</ResponsiveContainer>
```

Dashed series use `strokeDasharray="4 3"`.
Series index 0 renders as an area. All later series render as lines.
Y domain defaults to `["dataMin - 4", "dataMax + 4"]`.

### 2.5 Dashboard "Visibility over time" (BUNDLE, `Dashboard-CaTWfFir.js`)

Header:

```jsx
<p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Visibility over time</p>
```

While a recalculation runs, a spinner and the word `Recalculating...` appear:

```html
<div class="w-2 h-2 border border-accent border-t-transparent rounded-full animate-spin"></div>
<span>Recalculating...</span>
```

When the state is `observed-zero`:
`No tracked mentions in the latest scan`.

Chart height is 340 px. Container class `print-chart-container`.

```jsx
<AreaChart data={rows} margin={{ top:16, right:32, left:4, bottom:8 }}>
  <defs>
    <linearGradient id="visGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor={ACCENT} stopOpacity={0.085} />
      <stop offset="60%"  stopColor={ACCENT} stopOpacity={0.03} />
      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
    </linearGradient>
    <linearGradient id="cursorGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor={ACCENT} stopOpacity={0.3} />
      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
    </linearGradient>
    {/* one compGradient{N} per competitor: 0.05 -> 0.02 @50% -> 0 */}
  </defs>

  <XAxis dataKey="date" axisLine={false} tickLine={false} dy={12} tickMargin={4}
         tick={{ fontSize:10, fill:"#9ca3af", fontFamily:"JetBrains Mono, monospace" }} />
  <YAxis axisLine={false} tickLine={false} width={32} tickFormatter={v=>v.toFixed(0)}
         tick={{ fontSize:10, fill:"#9ca3af", fontFamily:"JetBrains Mono, monospace" }}
         domain={[0, computedTop]} ticks={computedTicks} />

  <Tooltip content={<DashboardChartTooltip/>}
           cursor={{ stroke:"url(#cursorGradient)", strokeWidth:1.5 }}
           animationDuration={150} animationEasing="ease-out" />

  <Area type="monotone" dataKey={brandName} stroke={ACCENT}
        strokeWidth={dimmed ? 1 : 1.5} strokeOpacity={dimmed ? 0.4 : 1}
        fill="url(#visGradient)" fillOpacity={dimmed ? 0.3 : 1} dot={false}
        activeDot={customDot} animationDuration={800} animationEasing="ease-out"
        style={{ transition:"stroke-width 150ms ease, stroke-opacity 150ms ease, fill-opacity 150ms ease" }} />
</AreaChart>
```

Y tick interval is computed, not fixed:

```js
// max <= 10  -> step 2
// max <= 25  -> step 5
// max <= 50  -> step 10
// max <= 100 -> step 20
// else       -> step = ceil(max / 5 / 10) * 10
// top = ceil((max + 2) / step) * step; ticks run 0..top by step
// empty data -> [0, 25, 50, 75, 100]
```

Active dot is a custom `<g>`: an outer circle plus an inner circle with `stroke="#fff"` and
`strokeWidth={1.5}`.

Inline chart keyframes declared by this panel:

```css
@keyframes tooltipFadeIn { from { opacity:0; transform: translateY(4px); }
                           to   { opacity:1; transform: translateY(0); } }
@keyframes chartLineDrawIn { from { stroke-dashoffset: 2000; } to { stroke-dashoffset: 0; } }
@keyframes chartFillFadeIn { from { opacity: 0; } to { opacity: 1; } }
.chart-line-animate { stroke-dasharray: 2000;
  animation: chartLineDrawIn 1000ms cubic-bezier(0.16,1,0.3,1) forwards; }
.chart-fill-animate { animation: chartFillFadeIn 600ms cubic-bezier(0.16,1,0.3,1) 400ms forwards;
  opacity: 0; }
```

Dashboard chart tooltip markup:

```jsx
<div className="bg-white rounded border border-default shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] px-3 py-2.5">
  <p className="text-[10px] text-muted uppercase tracking-wider mb-2">{formattedDate}</p>
  <div className="space-y-1.5">
    {sortedRows.map(r => (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
          <span className="text-[11px] text-secondary truncate max-w-[100px]">{r.name}</span>
        </div>
        <span className="text-[13px] font-medium text-primary tabular-nums">{r.value.toFixed(1)}</span>
      </div>
    ))}
  </div>
</div>
```

Row order: the hovered series first, then the rest by descending value.

**Range switcher.** A `SegmentedControl`, `size="sm"`, `ariaLabel="Visibility chart date range"`.
Options come from the available ranges and render upper case.

```js
const RANGES = [ { value:"7d", days:7 }, { value:"14d", days:14 }, { value:"30d", days:30 } ];
// labels rendered: "7D", "14D", "30D"
// range label helper: "7-day view" | "14-day view" | "30-day view"
```

Changing the range refetches the series and re-renders the chart.
A 0 ms / 50 ms flag pair fires on change, so the chart replays its draw-in animation.

Marketing and locked variants render a static, disabled version of the same switcher:

```html
<div class="flex bg-muted rounded p-0.5">
  <!-- 7D | 14D | 30D, middle item active -->
  <button disabled class="px-2.5 py-1 text-[11px] font-medium rounded cursor-not-allowed
                          bg-surface text-tertiary shadow-sm">14D</button>
</div>
```

### 2.6 /prompts audience trend (BUNDLE, hand-drawn SVG)

This chart does not use Recharts. It draws raw SVG.

```jsx
<svg className="block cursor-crosshair" width={w} height={h}>
  {/* gridlines at 0, 50, 100 */}
  <line x1={padL} x2={w-padR} y1={y} y2={y} stroke="#e7e5e4" strokeWidth={0.5} />
  <text x={padL-6} y={y+3} textAnchor="end" fill="#a8a29e" fontSize={9}>{value}</text>

  {/* fill then stroke */}
  <path d={areaPath} fill="var(--color-accent)" fillOpacity={0.08} />
  <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeLinecap="round" />

  {/* hover cursor */}
  <line x1={cx} y1={padT} x2={cx} y2={base} stroke="#d6d3d1" strokeWidth={0.75} strokeDasharray="2 3" />
  <circle cx={cx} cy={cy} r={3} fill="var(--color-accent)" />
  <text textAnchor="middle" fill="var(--color-primary)" fontSize={10} fontWeight={600}
        className="tabular-nums">{value}%</text>

  {/* idle state: a dot on the last point */}
  <circle r={3} fill="var(--color-accent)" />
</svg>
```

Y axis is fixed at 0, 50 and 100. Values are percentages.
There is no floating tooltip. The hovered value prints above the point in the SVG.
No range switcher exists on this chart.

### 2.7 The `TrendChart` engine (BUNDLE, hand-drawn SVG)

A second bespoke engine, used by the design-system pages and some panels.

- Left gutter 46 px, right gutter 12 px, top gutter 12 px, bottom 24 px with x labels, else 10 px.
- Y scale supports `linear` and `log`. Default 4 y ticks.
- Linear padding is 8 percent of range on each side, clamped at 0 when the data is non-negative.
- Gridlines: `<line stroke="var(--tds-divider)" strokeWidth={1} shapeRendering="crispEdges">`.
- Y tick labels: `fontSize: 10.5`, `color: var(--tds-ink-3)`, right aligned, mono class `tds-mono`.
- Series fill gradient: `0% opacity .16`, `62% opacity .022`, `100% opacity 0`.
- Hover uses `onPointerMove` on the wrapper and snaps to the nearest index.
- Pulse ring keyframes:

```css
@keyframes tds-pulse-ring {
  0%   { transform: translate(-50%, -50%) scale(0.7); opacity: 0.45; }
  70%  { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
  100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
}
```

Easing constant: `cubic-bezier(.16,1,.3,1)`.
`--tds-divider` and `--tds-ink-3` are not in the main CSS bundle. They come from a design-system scope.

### 2.8 /competitors competitive trend (BUNDLE, `CompetitorsV2-eU0MpW0X.js`)

Recharts `ComposedChart`, height 260 px.

```jsx
<ResponsiveContainer width="100%" height={260} minWidth={0}>
  <ComposedChart data={rows} margin={{ top:8, right:8, left:0, bottom:0 }}>
    <defs>
      <linearGradient id="yourBrandGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={brandColor} stopOpacity={0.12} />
        <stop offset="100%" stopColor={brandColor} stopOpacity={0.01} />
      </linearGradient>
    </defs>

    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />

    <XAxis dataKey="date" axisLine={false} tickLine={false} dy={8} interval="preserveStartEnd"
           tick={{ fontSize:10, fill:"#9ca3af", fontFamily:"JetBrains Mono, monospace" }} />
    <YAxis axisLine={false} tickLine={false} width={32} tickFormatter={v=>v.toFixed(0)}
           domain={computedDomain}
           tick={{ fontSize:10, fill:"#9ca3af", fontFamily:"JetBrains Mono, monospace" }} />

    <Tooltip content={<CompetitorTooltip/>} />

    {/* your brand */}
    <Area type="monotone" dataKey={brandName} stroke={brandColor} strokeWidth={2}
          fill="url(#yourBrandGradient)" dot={false}
          activeDot={{ r:4, fill:brandColor, stroke:"#fff", strokeWidth:2 }}
          animationDuration={500} animationEasing="ease-out" />

    {/* each competitor */}
    <Line type="monotone" dataKey={name} stroke={color} strokeWidth={1.5} dot={false}
          activeDot={{ r:3, fill:color, stroke:"#fff", strokeWidth:2 }}
          animationDuration={500} animationEasing="ease-out" />
  </ComposedChart>
</ResponsiveContainer>
```

Competitor tooltip:

```jsx
<div className="bg-surface border border-default rounded
                shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)] px-3 py-2.5 min-w-[180px]">
  <p className="text-[10px] font-medium text-muted mb-2 uppercase tracking-wider">
    {/* toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }) */}
  </p>
  <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-3 [first row: pb-1.5 border-b border-subtle]">
      <div className="flex items-center gap-2">
        <Favicon name={key} size={14} className="rounded-sm" />
        <span className="text-[12px] [your brand: font-medium text-primary | else text-secondary]">{key}</span>
      </div>
      <span>{value}</span>
    </div>
  </div>
</div>
```

Rows sort with your brand first, then descending value.
Each competitor row shows a favicon, not a colour dot. Your brand row is separated by a bottom border.

The competitor picker footer reads: `Selections & colors are saved for this brand`.
The overflow line reads: `Showing {n} of {total} - keep typing to narrow.`
Empty search: `No competitor matches "{query}".`

### 2.9 /reports charts (BUNDLE, `Reports-gZwSb8Lo.js`)

Imports from `vendor-charts`: `ResponsiveContainer`, `AreaChart`, `XAxis`, `YAxis`, `Tooltip`,
`Line`, `Area`. No `CartesianGrid`. The page follows the shared `AreaTrend` shape in 2.4.

### 2.10 Chart frame and legend (BUNDLE, `ChartFrame-BwuEFAuD.js`)

```jsx
<div className="card p-5">
  <div className="mb-4 flex items-start justify-between gap-4">
    <div className="min-w-0">
      <h3 className="text-ui font-semibold text-primary">{title}</h3>
      <p className="mt-0.5 text-data text-muted">{subtitle}</p>
    </div>
    <div className="flex shrink-0 items-center gap-3">{legend}{action}</div>
  </div>
  <div style={{ height /* default 220 */ }} className="min-h-0">
    {loading ? <div className="h-full w-full animate-pulse rounded bg-muted" />
     : empty ? <div className="flex h-full items-center justify-center text-data text-muted">No data yet</div>
     : children}
  </div>
</div>
```

Legend item:

```jsx
<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
  <div className="flex items-center gap-1.5">
    {/* solid */}  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
    {/* dashed */} <span className="h-px w-3.5 shrink-0" style={{ borderTop:`1.5px dashed ${color}` }} />
    <span className="text-[11px] text-secondary">{label}</span>
    <span className="font-mono tabular-nums text-[12px] font-medium text-primary">{value}</span>
  </div>
</div>
```

---

## 3. Transient UI

### 3.1 Toast

I could not click a live "Copy" control, because the browser pane died.
I found the component in the bundle instead. The lazy chunk is `assets/toast-container-D9gsmAp1.js`.
I found it by grepping the main bundle for `ToastProvider`, then matching the chunk name
in the Vite dependency map.

The API:

```js
toast.success(title, opts)   // duration 4000 ms
toast.error(title, opts)     // duration 6000 ms
toast.info(title, opts)
toast.copied(message = "Copied to clipboard")
```

The provider keeps at most **two** toasts. `slice(-2)` drops the oldest.
Default duration is 4000 ms. The timer pauses on `mouseenter` and restarts on `mouseleave`.

Container. It portals to `document.body`.

```jsx
<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200]
                flex flex-col gap-2 items-center"
     role="region" aria-label="Notifications">
  <AnimatePresence mode="popLayout">{items}</AnimatePresence>
</div>
```

Single toast:

```jsx
<motion.div
  layout
  initial={{ opacity: 0, y: 16, scale: 0.95 }}
  animate={{ opacity: 1, y: 0,  scale: 1 }}
  exit={{    opacity: 0, y: 8,  scale: 0.98 }}
  transition={{ duration: enter.duration / 1000, ease: [0.16, 1, 0.3, 1] }}
  className="relative flex items-center gap-3 px-4 py-3 rounded overflow-hidden
             bg-white border-t border-l border-r border-default
             shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)]
             min-w-[320px] max-w-[400px]">

  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                  {iconTone}">
    <Icon size={12} strokeWidth={2.5} />
  </div>

  <div className="flex-1 min-w-0">
    <p className="text-[13px] font-semibold text-primary leading-tight">{title}</p>
    <p className="text-[12px] text-muted mt-0.5 leading-tight">{description}</p>
  </div>

  <button className="text-[12px] font-medium text-accent hover:text-accent/80
                     transition-colors flex-shrink-0">{action.label}</button>

  <button className="p-1 text-secondary/40 hover:text-secondary transition-colors flex-shrink-0">
    <X size={14} />
  </button>

  <div className="absolute bottom-0 left-0 h-0.5 {barTone}"
       style={{ animation: `toast-progress ${duration}ms linear forwards` }} />
</motion.div>
```

Tone maps:

```js
progressBar = { success:"bg-accent", error:"bg-error", info:"bg-info", copied:"bg-accent" }
iconChip    = { success:"bg-accent-subtle text-accent",
                error:"bg-error-subtle text-error",
                info:"bg-info-subtle text-info",
                copied:"bg-accent-subtle text-accent" }
icons       = { success: Check, error: AlertCircle, info: HelpCircle, copied: Clipboard }
```

Progress keyframes, from the CSS bundle:

```css
@keyframes toast-progress { 0% { width: 100%; } to { width: 0%; } }
```

Note: the toast has no bottom border. Only `border-t`, `border-l` and `border-r` are set.
The progress bar sits on the bottom edge instead.

### 3.2 Loading skeletons

**LIVE.** I read the DOM during the /dashboard fetch, before it resolved.

The whole app boots inside a skeleton shell.

```html
<div class="flex min-h-screen bg-surface" aria-busy="true" data-testid="app-bootstrap-shell">
  <span class="sr-only" role="status" aria-live="polite">Preparing Venture PR’s dashboard</span>

  <aside class="hidden min-h-screen w-[200px] shrink-0 flex-col border-r border-default
                bg-surface lg:flex" aria-hidden="true">
    <div class="flex h-14 shrink-0 items-center gap-2.5 border-b border-default px-4">
      <div class="flex h-7 w-10 shrink-0 items-center justify-center">
        <img alt="Venture PR logo" class="max-h-[25px] max-w-10 object-contain"
             src="https://www.google.com/s2/favicons?domain=venturepr.com&sz=64">
      </div>
      <span class="truncate text-body font-semibold text-primary">Venture PR</span>
    </div>

    <div class="flex flex-1 flex-col px-3 py-4">
      <div class="mb-5">
        <div class="space-y-1">
          <div class="flex h-8 items-center gap-2.5 rounded px-2">
            <div class="animate-pulse bg-muted rounded motion-reduce:animate-none h-full w-full !h-4 !w-4 shrink-0"></div>
            <div class="animate-pulse bg-muted rounded motion-reduce:animate-none h-3 w-full !w-20"></div>
          </div>
          <!-- widths cycle !w-20, !w-24, !w-16 -->
        </div>
      </div>
      <div class="mb-5">
        <div class="animate-pulse bg-muted rounded motion-reduce:animate-none h-3 w-full mb-3 ml-2 !w-14 opacity-60"></div>
        <!-- group label placeholder, then the same 3 rows -->
      </div>
    </div>
  </aside>
```

The brand name and the favicon are **real** during the skeleton. Only the nav items are placeholders.

Dashboard KPI strip skeleton:

```html
<main data-testid="bootstrap-dashboard-content" aria-hidden="true">
  <div class="grid grid-cols-2 border-b border-default md:grid-cols-3 xl:grid-cols-6">
    <div class="min-h-[130px] border-r border-default p-5 last:border-r-0 md:p-6">
      <div class="animate-pulse bg-muted rounded motion-reduce:animate-none h-3 w-full mb-5 !w-16"></div>
      <div class="animate-pulse bg-muted rounded motion-reduce:animate-none h-10 w-24 !w-20"></div>
      <div class="animate-pulse bg-muted rounded motion-reduce:animate-none h-3 w-full mt-3 !w-14 opacity-60"></div>
    </div>
    <!-- six cells; cell 2 uses !w-28 for the value bar -->
  </div>
  <div class="grid min-h-[420px] …">…</div>
</main>
```

Skeleton primitive, in words:

- Base classes `animate-pulse bg-muted rounded motion-reduce:animate-none`.
- Size comes from `h-*` and `w-*`. Callers override with `!h-*` and `!w-*`.
- Secondary lines add `opacity-60`.
- `bg-muted` resolves to `--color-muted` -> `--color-gray-75` -> `#f8f8f7`.
- Reduced-motion users get a static block.

Keyframes:

```css
@keyframes pulse { 50% { opacity: 0.5; } }
/* Tailwind default: animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; */
```

A second, richer skeleton style also ships (BUNDLE):

```css
@keyframes shimmer { 0% { background-position: -200% 0px; } 100% { background-position: 200% 0px; } }
.skeleton-shimmer { position: relative; overflow: hidden; }
.skeleton-shimmer::after {
  content: "";
  background: linear-gradient(90deg, rgba(0,0,0,0), rgba(255,255,255,0.5), rgba(0,0,0,0));
  animation: 1.5s ease-in-out 0s infinite normal none running shimmer;
  position: absolute; inset: 0px;
}
```

Related keyframes in the same bundle, for completeness:

```css
@keyframes bar-shimmer      { 0% { transform: translate(-100%); } 100% { transform: translate(100%); } }
@keyframes progressShimmer  { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes leader-shimmer   { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
@keyframes spin             { 100% { transform: rotate(360deg); } }
@keyframes spinnerPulse     { 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); } }
@keyframes pulse-ring       { 0% { opacity:.4; transform: scale(1); } 100% { opacity:0; transform: scale(2.5); } }
@keyframes avatar-pulse     { 0%,100% { opacity:.6; transform: scale(1); } 50% { opacity:0; transform: scale(1.4); } }
@keyframes connect-pulse    { 0% { opacity:.55; transform: scale(1); } 100% { opacity:0; transform: scale(3); } }
@keyframes apply-pulse      { 0% { background-color: transparent; } 35% { background-color: var(--color-accent-subtle); } 100% { background-color: transparent; } }
@keyframes pulse-once       { 0% { box-shadow: rgba(28,25,23,.4) 0 0; } 50% { box-shadow: rgba(28,25,23,0) 0 0 0 8px; } 100% { box-shadow: rgba(28,25,23,0) 0 0; } }
@keyframes success-pulse    { 0%,100% { box-shadow: rgba(14,147,115,.3) 0 0; } 50% { box-shadow: rgba(14,147,115,0) 0 0 0 8px; } }
```

Page-level skeletons (BUNDLE, `Dashboard-CaTWfFir.js`):

```jsx
/* chart panel skeleton */
<div className="animate-pulse">
  <div className="flex items-center justify-between mb-6">
    <div className="flex items-center gap-4">
      <div className="h-3 w-16 bg-muted rounded" />
      {[0,1,2].map(i => <div className="h-8 w-24 bg-muted rounded" />)}
    </div>
    <div className="h-8 w-28 bg-muted rounded" />
  </div>
  <div className="h-[220px] bg-muted rounded" />
</div>

/* list skeleton, default 4 rows */
<div className="animate-pulse flex flex-col h-full">
  <div className="h-3 w-20 bg-muted rounded mb-4" />
  <div className="flex-1 space-y-3">
    <div className="flex items-center gap-3 py-2">
      <div className="w-5 h-3 bg-muted rounded" />
      <div className="w-4 h-4 bg-muted rounded" />
      <div className="flex-1 h-3 bg-muted rounded" />
      <div className="w-10 h-3 bg-muted rounded" />
    </div>
  </div>
</div>

/* rankings skeleton, six rows */
<div className="flex items-center gap-2 px-6 py-2">
  <div className="w-8 h-3 bg-muted rounded animate-pulse" />
  <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
  <div className="w-4 h-4 rounded bg-muted animate-pulse" />
  <div className="flex-1 h-3 bg-muted rounded animate-pulse" />
  <div className="w-8 h-3 bg-muted rounded animate-pulse" />
</div>
```

/prompts skeleton (BUNDLE):

```jsx
<div className="animate-pulse">
  <div className="flex items-center gap-6 px-4 h-11 border-b border-subtle">
    <div className="h-4 w-20 bg-muted/50 rounded" />
    <div className="h-4 w-14 bg-muted/40 rounded" />
    <div className="h-4 w-24 bg-muted/40 rounded" />
  </div>
  <div className="flex divide-x divide-subtle">
    <div className="flex-1 p-4"><div className="h-[150px] bg-muted/30 rounded" /></div>
    <div className="w-[340px] shrink-0 p-4 space-y-3">{4 x <div className="h-3 bg-muted/40 rounded" />}</div>
    <div className="w-[280px] shrink-0 p-4 space-y-3">
      <div className="h-6 w-16 bg-muted/50 rounded" />
      <div className="h-3 bg-muted/40 rounded" />
    </div>
  </div>
</div>
```

KPI tile skeleton, used while access is checked:

```html
<span class="inline-block align-middle h-[18px] w-[48px] bg-muted rounded animate-pulse"></span>
<span class="block h-2 w-20 bg-muted rounded animate-pulse mt-2"></span>
```

### 3.3 "Columns and density" popover

BUNDLE. Source: `InstrumentTable-BYafPo_5.js`. Used by /actions and every InstrumentTable page.

Trigger:

```jsx
<button type="button" title="Columns and density"
  className="focus-ring h-8 w-8 inline-flex items-center justify-center rounded
             border border-default text-secondary transition-colors duration-200
             hover:border-hover hover:bg-muted hover:text-primary">
  <SlidersIcon size={14} strokeWidth={1.5} />
</button>
```

Popover: `width={240}`, `align="end"`, `ariaLabel="Columns and density"`.

Content:

```jsx
<div className="p-3">
  <div className="flex items-center justify-between">
    <span className="section-label">Columns</span>
    <button className="flex items-center gap-1 text-caption text-secondary
                       transition-colors hover:text-primary">
      <RotateIcon size={12} strokeWidth={1.5} /> Reset
    </button>
  </div>

  <div className="mt-2 space-y-1.5">
    {/* one row per column */}
    <label className="flex items-center gap-2 text-ui text-primary">
      <Checkbox checked={visible} disabled={column.fixed} />
      {column.label}
    </label>
  </div>

  <div className="mt-3 border-t border-subtle pt-2.5">
    <span className="section-label">Density</span>
    <div className="mt-1.5">
      <SegmentedControl size="sm" value={density}
        options={[{ value:"regular", label:"Regular" },
                  { value:"compact", label:"Compact" }]} />
    </div>
  </div>
</div>
```

Options:

- **Columns**: one checkbox per table column. Columns marked `fixed` render disabled and always stay on.
- **Reset**: restores every column where `fixed` is true or `defaultVisible !== false`.
- **Density**: `Regular` and `Compact`. Only these two.

Row heights:

```js
const ROW_HEIGHT = { compact: 40, regular: 48 };
```

Persistence, per table `storageKey`:

```js
localStorage["trakkr:<storageKey>-columns"]  // JSON array of visible column ids
localStorage["trakkr:<storageKey>-density"]  // "compact" | "regular", default "regular"
sessionStorage["trakkr:instrument-scroll:<key>"] // { top, index, offset }
```

An in-memory LRU also caches scroll positions, capped at 100 entries.
The /actions table uses `storageKey="desk-found"`.

### 3.4 Filter and Display popovers

BUNDLE. Source: `FilterBar-ibxvPsmR.js`. This is a generic bar, not a per-page schema.

Bar shell:

```jsx
<div className="flex-shrink-0 min-h-12 px-4 py-2 sm:px-8 border-b border-default
                flex flex-wrap items-center gap-x-4 gap-y-2">
  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 basis-[28rem]">{filters}</div>
  <div className="ml-auto flex max-w-full flex-shrink-0 flex-wrap items-center justify-end gap-2">{right}</div>
</div>
```

Filter chip (the popover trigger):

```jsx
<span className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded border text-[12px]
                 font-medium whitespace-nowrap transition-colors duration-200 max-w-[180px]
                 [inactive] border-default text-secondary hover:text-primary hover:border-hover hover:bg-muted
                 [active]   border-accent/30 bg-accent-subtle text-accent">
  {icon}<span className="truncate">{label}</span><ChevronDown size={12} strokeWidth={1.5} className="flex-shrink-0 opacity-50" />
</span>
```

Popover section label:

```jsx
<p className="section-label px-3 pb-1 pt-2">{label}</p>
```

Popover option row, with a count:

```jsx
<button type="button" disabled={count === 0 && !active}
  className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-caption
             transition-colors duration-150
             [disabled] cursor-default text-faint
             [active]   bg-accent-subtle text-accent
             [idle]     text-secondary hover:bg-muted/50 hover:text-primary">
  <span className="truncate">{label}</span>
  <span className="font-mono text-label tabular-nums text-muted">{count.toLocaleString()}</span>
</button>
```

Result counter, shown on the right of the bar:

```jsx
<span className="text-[11px] text-muted tabular-nums whitespace-nowrap">
  {shown.toLocaleString()} of {total.toLocaleString()}
</span>
```

Sort control: a `DropdownMenu`, `align="right"`, trigger label falls back to `Sort`.

Value control: a `SegmentedControl`, `size="sm"`, with an optional caption label.

/actions concrete instance (BUNDLE, `Actions-DlVvWoTr.js`):

- Search input: `placeholder="Search work"`, bound to the `work_q` URL param.
- Status dropdown: `align="left"`, `title="Which work to show"`. Active when the value is not `open`.
  Values include `open`, `snoozed` and `dismissed`.
- Type popover: `align="start"`, `width={220}`, `ariaLabel="Filter by type"`, section label `Type`.
  Each option shows a count. Clicking an active option clears it.
- Clear filters removes `work_q`, `work_type` and `work_state` from the URL.

The exact field, operator and value list per page is **NOT OBSERVED**. The bar is data-driven.
The options come from the live result set, so they need a live session to enumerate.
I tried to open them in the browser. The pane died first.

### 3.5 Table row hover state

BUNDLE. Source: `InstrumentTable-BYafPo_5.js`.

Base row:

```jsx
<div className="group relative grid items-center gap-3 border-b border-subtle
                [flush ? px-8 : px-4]
                transition-[background-color,transform,box-shadow] duration-200
                [clickable] cursor-pointer
                [committed] bg-accent-subtle/40
                [active]    bg-accent-subtle/20
                [hover]     hover:-translate-y-[0.5px] hover:bg-muted/30 hover:shadow-sm"
     style={{ gridTemplateColumns, height }} />
```

Changed properties on hover:

| Property | Idle | Hover |
|---|---|---|
| `background-color` | transparent | `--color-muted` at 30 percent (`#f8f8f7` / 0.3) |
| `transform` | none | `translateY(-0.5px)` |
| `box-shadow` | none | `shadow-sm` = `0 1px 2px 0 rgb(0 0 0 / 0.05)` |
| transition | - | 200 ms on background-color, transform and box-shadow |

Hover actions inside a row use `group-hover:flex`. They are `hidden` until hover.
The active and committed rows use `bg-accent-subtle` at 20 and 40 percent. Hover does not override them.

Other hover surfaces seen in the bundles:

- Sidebar market rows: `hover:bg-muted/40`, unselected rows sit at `opacity-40 hover:opacity-70`.
- KPI tiles: `hover:bg-muted/50 transition-colors group`.
- "Show more" rows: `hover:text-secondary hover:bg-muted/40 transition-colors duration-250`.

Table column header and group header:

```jsx
<div className="flex items-center gap-3 border-b border-subtle bg-page px-8 py-1.5">
  <span className="section-label">Started</span>
  <span className="flex-1 border-t border-subtle" />
  <span className="font-mono text-label tabular-nums text-muted">{count}</span>
</div>
```

Ghost row (the "Example" preview inside the columns popover):

```jsx
<div className="px-0 pt-3">
  <div className="grid h-12 items-center gap-3 border-b border-subtle px-4 or px-8"
       style={{ gridTemplateColumns }}>…</div>
  <p className="section-label px-4 pt-1.5 text-right">Example</p>
</div>
```

---

## 4. The two stuck views

### 4.1 /citations source profile — NOT OBSERVED

I could not retry it. The browser pane stopped compositing and the renderer stopped
answering all commands. `navigate` timed out after 300 s. `javascript_tool` timed out after 30 s.
Two fresh tabs behaved the same way.

Console errors captured before the freeze, on /dashboard:

```
[error] Failed to load resource: the server responded with a status of 404 ()   x9
```

Nine 404 responses fired on the dashboard load. The failing URLs were not exposed by the
console reader. `read_network_requests` returned only the JS chunk requests.

Bundle names that a clone must implement for this view:

- `assets/CitationSourcePage-C9c3Qys6.js`
- `assets/CitationSources-mkSByMeA.js`
- `assets/CitationDetailModal-3-WvELEp.js`
- `assets/ApiCitations-B5VabSIz.js`

### 4.2 /citations Outreach view, "THE PLAN" stream — NOT OBSERVED

Same cause. I could not open the view.
Whether it resolves, errors, or hangs is still unknown.

Recommended retry method for the next agent: open the Browser pane in the UI first,
then run `computer` with `action: "screenshot"` to confirm compositing, and only then navigate.

---

## 5. Screenshots — NOT OBSERVED

The earlier report was correct. Screenshots still fail.

Exact error, on /dashboard:

```
screenshot failed: Screenshot timed out after 5s: the Browser pane is not displayed,
so the page is not compositing frames. Display the pane and retry.
```

A knock-on effect: `computer` refuses coordinate clicks without a cached screenshot.

```
left_click with `coordinate` requires a prior computer{action:"screenshot"}
(no screenshot dimensions cached)
```

So hover-by-coordinate was impossible for this whole sweep.
No screenshots were saved. Every visual fact above comes from the DOM or from the shipped bundles.

---

## 6. Token quick reference

```css
--color-green-500: #0e9373;   --color-accent: var(--color-green-500);
--color-red-500:   #ef4444;   --color-error:  var(--color-red-500);
--color-blue-500:  #3b82f6;   --color-info:   var(--color-blue-500);
--color-amber-500: #f59e0b;
--color-gray-75:  #f8f8f7;    --color-muted:  var(--color-gray-75);
--color-gray-100: #f5f5f4;
--color-gray-300: #d6d3d1;
--color-gray-400: #a8a29e;
--color-gray-500: #78716c;
--color-gray-600: #57534e;
--color-surface:  #ffffff;
--shadow-overlay: 0 4px 16px -4px #00000014;
```

Z-index ladder observed: toast container `200`, help tooltip `300`.
Shared easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
Chart font: `JetBrains Mono, ui-monospace, monospace`.
