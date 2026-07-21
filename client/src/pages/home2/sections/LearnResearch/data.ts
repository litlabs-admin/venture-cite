// Verbatim data extracted from _reference/index.html lines 3410-3592
// (Learn/Research section). Short/simple values only — see chartData.ts for
// the large hand-built SVG chart path data, which was extracted
// programmatically instead of transcribed here.

export interface ResourceCardData {
  href: string;
  iconSrc: string;
  /** Exact per-card icon size classes from source (they differ per icon). */
  iconClassName: string;
  title: string;
  subtitle: string;
  /** transition-delay in ms applied to this card's own reveal (source: 0/60/120ms). */
  delayMs: number;
  /** Only the first (Documentation) card carries the lg:hidden mobile "[07]" eyebrow. */
  showMobileEyebrow: boolean;
}

// The source listed Documentation/API/MCP here; VentureCite ships no public
// API or MCP server, so these are repointed at routes that exist (same
// treatment as sections/Nav/data.ts resourcesList) rather than renamed
// in place.
export const resourceCards: ResourceCardData[] = [
  {
    href: "/glossary",
    iconSrc: "/trakkr/images/resources/documentation.png",
    iconClassName: "w-10 sm:w-12 h-10 sm:h-12",
    title: "Glossary",
    subtitle: "GEO terms, defined",
    delayMs: 0,
    showMobileEyebrow: true,
  },
  {
    href: "#platform-section",
    iconSrc: "/trakkr/images/resources/api.png",
    iconClassName: "w-[52px] h-[52px]",
    title: "How It Works",
    subtitle: "Track, understand, improve",
    delayMs: 60,
    showMobileEyebrow: false,
  },
  {
    href: "#pricing-section",
    iconSrc: "/trakkr/images/resources/mcp.png",
    iconClassName: "w-[38px] sm:w-[46px] h-[38px] sm:h-[46px]",
    title: "Pricing",
    subtitle: "Plans for teams and agencies",
    delayMs: 120,
    showMobileEyebrow: false,
  },
];

export interface DataTileData {
  href: string;
  iconSlug: string;
  /** Extra icon classes beyond the shared base (only ai-traffic has this, per source). */
  iconExtraClassName?: string;
  title: string;
  count: string;
  description: string;
  /** Exact border-utility classes for this tile's position in the 2-col/4-col grid (source-verbatim, not derived). */
  borderClassName: string;
  delayMs: number;
}

// The source tiles advertised a public rankings/citations/traffic/queries
// dataset the competitor runs, with live counts (9.3K/313K/4.1K/11.5K).
// VentureCite has no such public dataset, so the counts are gone and the
// titles/descriptions/hrefs now point at real VentureCite capabilities and
// routes instead — layout fields (iconSlug/borderClassName/delayMs)
// untouched.
export const dataTiles: DataTileData[] = [
  {
    href: "#revenue-section",
    iconSlug: "rankings",
    title: "Benchmarks",
    count: "",
    description: "See how your AI visibility compares to competitors",
    borderClassName: "lg:border-l-0 lg:border-t-0",
    delayMs: 150,
  },
  {
    href: "#platform-section",
    iconSlug: "citations",
    title: "Citations",
    count: "",
    description: "Every AI mention, tracked as it happens",
    borderClassName: "border-l lg:border-l lg:border-t-0",
    delayMs: 205,
  },
  {
    href: "/register",
    iconSlug: "ai-traffic",
    iconExtraClassName: "opacity-[0.85]",
    title: "Share of answer",
    count: "",
    description: "How much of the AI conversation you own, by engine",
    borderClassName: "border-t lg:border-l lg:border-t-0",
    delayMs: 260,
  },
  {
    href: "#philosophy-section",
    iconSlug: "query-fanout",
    title: "Prompt scoring",
    count: "",
    description: "Content scored against the signals AI engines reward",
    borderClassName: "border-l border-t lg:border-l lg:border-t-0",
    delayMs: 315,
  },
];

export interface ChartYAxisLabel {
  label: string;
  top: number;
  delayMs: number;
}

// left:0; width:30px; transition: opacity 700ms ease <delay>ms — source-verbatim.
export const chartYAxisLabels: ChartYAxisLabel[] = [
  { label: "30K", top: 145, delayMs: 200 },
  { label: "61K", top: 100, delayMs: 260 },
  { label: "91K", top: 55, delayMs: 320 },
  { label: "122K", top: 10, delayMs: 380 },
];

export interface ChartCallout {
  name: string;
  logoSrc: string;
  top: number;
}

// left:968px; transform translateY(-50%) translateX(-6px -> 0); opacity 0 -> 1;
// transition: opacity/transform 480ms ease, both delayed 1000ms — identical
// delay for all four in source despite differing end-dot delays (940-1120ms).
// The `top` values are a deliberate decluttering ladder for the three
// closely-clustered series (Perplexity/Claude/Gemini), NOT each series' exact
// end-of-line y — ChatGPT's top matches its end-dot exactly since it's far
// from the cluster. Reproduced as literally given in source.
export const chartCallouts: ChartCallout[] = [
  { name: "Perplexity", logoSrc: "/trakkr/images/ai-logos/perplexity.svg", top: 194 },
  { name: "Claude", logoSrc: "/trakkr/images/ai-logos/claude.png", top: 176 },
  { name: "Gemini", logoSrc: "/trakkr/images/ai-logos/gemini.svg", top: 158 },
  { name: "ChatGPT", logoSrc: "/trakkr/images/ai-logos/chatgpt.svg", top: 62.967 },
];
