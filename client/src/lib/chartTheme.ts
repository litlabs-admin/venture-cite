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
    // head of the DESIGN.md data-viz ramp (was a stray hardcoded #3b82f6).
    visibility: "var(--chart-1)",
    // Positive / quality — design-system green (consistent in light & dark).
    quality: "var(--chart-4)",
    // Negative / issues — theme-aware destructive red.
    issues: "var(--destructive)",
  },
  // Categorical palette for multi-series / donut charts (competitor slices
  // etc.). Raw var() — the --chart-* tokens already include hsl().
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
} as const;
