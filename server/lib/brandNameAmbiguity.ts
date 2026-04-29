// Wave 9.4: warn users when their brand name is ambiguous (a common
// English word, a country, a major existing brand, etc.). The scanner
// will still run — common-word brands aren't blocked — but the toast
// surfaces the warning so the user knows to add nameVariations to
// reduce false positives downstream.

const COMMON_WORD_NAMES = new Set([
  // Common English words used as brand names — generates noise.
  "apple",
  "amazon",
  "amazon's",
  "match",
  "square",
  "stripe",
  "slack",
  "ace",
  "circle",
  "block",
  "uber",
  "lyft",
  "shop",
  "shop pay",
  "target",
  "walmart",
  "discover",
  "capital",
  "captain",
  "club",
  "post",
  "post-it",
  "notion",
  "asana",
  "loom",
  "twitch",
  "miro",
  "atlas",
  "atlas obscura",
  "buffer",
  "warp",
  "linear",
  "boom",
  "pulse",
  "flow",
  "vibe",
  "ramp",
  "raycast",
  "cursor",
  "windsurf",
  "echo",
  "alpha",
  "alpha vantage",
  "beta",
  "nova",
  "fluent",
  "patch",
  "lemon",
  "lemon squeezy",
  "github",
  "monday",
  "friday",
  "tuesday",
  "wednesday",
  "saturday",
  "sunday",
  "zoom",
  "meet",
  "teams",
  "spaces",
  "go",
  "google",
  "googled",
  "yahoo",
  "bing",
  "edge",
  "safari",
  "fire",
  "firewatch",
  "gem",
  "gems",
  "pearl",
  "diamond",
  "ruby",
  "emerald",
  "rust",
  // Countries / cities (frequently coincide with brands).
  "panama",
  "asia",
  "europe",
  "america",
  "africa",
  "india",
  "china",
]);

/**
 * Score a brand name for ambiguity. >= 1 = ambiguous; clients should
 * surface a warning. The current implementation is a hardcoded list;
 * future versions could consult Wiktionary or Wikipedia disambiguation.
 */
export function brandNameAmbiguityScore(name: string | null | undefined): number {
  if (!name) return 0;
  const trimmed = String(name).trim().toLowerCase();
  if (!trimmed) return 0;
  if (COMMON_WORD_NAMES.has(trimmed)) return 2;
  // Single-word, all-lowercase, very short common-letter combos — likely
  // ambiguous. "ace", "tab", "pop" etc.
  if (trimmed.length <= 3 && /^[a-z]+$/.test(trimmed)) return 1;
  return 0;
}

export function brandNameWarning(name: string | null | undefined): string | null {
  const score = brandNameAmbiguityScore(name);
  if (score === 0) return null;
  return [
    `Brand name "${name}" is a common word and may produce many false-positive results.`,
    "Consider adding distinctive name variations (e.g. legal name, slogan keywords) on the brand profile to filter scan results.",
  ].join(" ");
}
