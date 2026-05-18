// Single source for Recharts series colors + tooltip styling so every chart
// in the product reads as one system instead of each component hardcoding its
// own hex values.
//
// Design tokens already include the hsl() wrapper (e.g. --chart-4 is defined
// as `hsl(147 50% 42%)`), so they are referenced as raw `var(--token)` — NOT
// `hsl(var(--token))`, which would double-wrap and resolve to a fallback. The
// tooltip strings are kept exactly as the pre-existing inline values so this
// is a pure de-duplication with zero rendering change for tooltips.
export const chartTheme = {
  series: {
    // Primary "visibility / share-of-answer" metric. The palette has no blue
    // token; centralised here so the accent is defined once, not inlined.
    visibility: "#3b82f6",
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
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
  },
  tooltipLabelStyle: { color: "hsl(var(--foreground))" },
} as const;
