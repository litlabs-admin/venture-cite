// Single source for Recharts series colors + tooltip styling so every chart
// in the product reads as one system instead of each component hardcoding its
// own hex values.
//
// Design tokens are OKLCH color values (client/src/index.css) referenced as
// raw `var(--token)`. Never wrap them in `hsl(...)` — that double-wraps an
// oklch() value and the whole declaration is dropped by the browser.
export const chartTheme = {
  series: {
    // Primary "visibility / share-of-answer" metric — the accent-anchored
    // head of the data-viz ramp (was a stray hardcoded #3b82f6).
    visibility: "var(--chart-1)",
    // Negative / issues — theme-aware destructive red.
    issues: "var(--destructive)",
    // There was a third entry here, `quality: "var(--chart-4)"`, commented
    // "design-system green". It had NO consumers, and --chart-4 is violet
    // (oklch 0.6056 0.2189 292.7), not green. That mislabel is the most
    // likely origin of --chart-4 being used as the app's success colour in
    // components that have nothing to do with charts.
    //
    // Removed rather than repointed: aiming it at --positive would not help,
    // because in the light theme --positive and --chart-1 are the same green,
    // so a "quality" series would have been indistinguishable from
    // "visibility" in the very charts it was meant for. A positive series
    // needs a hue picked against the rest of the ramp, which is a design
    // decision, not a rename.
  },
  // Categorical palette for multi-series / donut charts (competitor slices
  // etc.). Raw var() — the --chart-* tokens are oklch(), same as every other
  // token in this file; never wrap them in hsl() (see the file header).
  palette: [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ],
  tooltipContentStyle: {
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
  },
  tooltipLabelStyle: { color: "var(--foreground)" },
  // Entrance-animation props to spread onto Recharts series components
  // (Line, Area, Bar, Pie, etc). Wired into monitor-overview.tsx's citation
  // trend Line and share-of-voice Pie; spread onto any other chart that
  // wants the same draw-in/fade-in as it's added.
  animation: {
    // Line draw-in.
    lineAnimation: {
      isAnimationActive: true,
      animationDuration: 1000,
      animationEasing: "ease" as const,
    },
    // Area fill fade-in, starting after the line begins drawing.
    areaAnimation: {
      isAnimationActive: true,
      animationDuration: 600,
      animationBegin: 400,
      animationEasing: "ease" as const,
    },
  },
} as const;
