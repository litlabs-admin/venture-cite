// Single source of truth for the known-AI-platform badge palette. Previously
// duplicated byte-for-byte in PlatformResultCard.tsx and CitedMentionsStrip.tsx;
// any future palette tweak only needs to happen here now.
//
// Platform identity is CATEGORICAL data, so it uses the chart series ramp
// rather than raw Tailwind hues - the ramp is themed, and these badges no
// longer drift from the rest of the UI. Hue assignment is stable and roughly
// tracks each platform's own brand colour where the ramp allows.
//
// Neutral background with a coloured label + border, the way the Trakkr design
// system treats chips. Note there is no `/10` tint here on purpose: an opacity
// modifier on a var()-backed token computes to nothing in Tailwind v3.
//
// Callers decide their own fallback for unknown platforms (PlatformResultCard
// hashes into the same ramp, CitedMentionsStrip uses a neutral muted badge).
export const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: "bg-muted text-chart-1 border-chart-1",
  Claude: "bg-muted text-chart-3 border-chart-3",
  Gemini: "bg-muted text-chart-2 border-chart-2",
  Perplexity: "bg-muted text-chart-4 border-chart-4",
  DeepSeek: "bg-muted text-chart-5 border-chart-5",
  Grok: "bg-muted text-chart-6 border-chart-6",
};
