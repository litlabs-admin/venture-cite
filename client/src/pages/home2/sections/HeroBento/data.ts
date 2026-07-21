// Content data for the Hero Bento section, verbatim from
// _reference/index.html lines 1064-1807. Favicon URLs use the same Google
// s2/favicons service already seen elsewhere on the page; AI logo files are
// the existing local copies in public/images/ai-logos/.

export interface RankingRow {
  rank: number;
  name: string;
  domain: string;
  score: string;
  delta: string;
  deltaPositive: boolean;
  /** Nike's own row: bg-accent-subtle/55, bold rank + score. */
  highlighted: boolean;
  /** Rows #4-8: grayscale/contrast/brightness filter + opacity 0.55 favicon, text-secondary name. */
  dimmed: boolean;
  /** Rows #7-8: `hidden lg:flex` (only shown at lg+). */
  hiddenBelowLg: boolean;
  /** Source renders Asics/On favicons at 14px, everything else (besides Nike) at 16px. */
  logoSizePx: 14 | 16;
}

export const RANKINGS: RankingRow[] = [
  {
    rank: 1,
    name: "Adidas",
    domain: "adidas.com",
    score: "82",
    delta: "+0.0",
    deltaPositive: true,
    highlighted: false,
    dimmed: false,
    hiddenBelowLg: false,
    logoSizePx: 16,
  },
  {
    rank: 2,
    name: "Nike",
    domain: "nike.com",
    score: "83",
    delta: "+3.3",
    deltaPositive: true,
    highlighted: true,
    dimmed: false,
    hiddenBelowLg: false,
    logoSizePx: 16,
  },
  {
    rank: 3,
    name: "New Balance",
    domain: "newbalance.com",
    score: "69",
    delta: "+6.8",
    deltaPositive: true,
    highlighted: false,
    dimmed: false,
    hiddenBelowLg: false,
    logoSizePx: 16,
  },
  {
    rank: 4,
    name: "Brooks",
    domain: "brooksrunning.com",
    score: "61",
    delta: "-0.3",
    deltaPositive: false,
    highlighted: false,
    dimmed: true,
    hiddenBelowLg: false,
    logoSizePx: 16,
  },
  {
    rank: 5,
    name: "Hoka",
    domain: "hoka.com",
    score: "59",
    delta: "+1.6",
    deltaPositive: true,
    highlighted: false,
    dimmed: true,
    hiddenBelowLg: false,
    logoSizePx: 16,
  },
  {
    rank: 6,
    name: "Asics",
    domain: "asics.com",
    score: "52",
    delta: "+0.2",
    deltaPositive: true,
    highlighted: false,
    dimmed: true,
    hiddenBelowLg: false,
    logoSizePx: 14,
  },
  {
    rank: 7,
    name: "On",
    domain: "on-running.com",
    score: "51",
    delta: "+1.2",
    deltaPositive: true,
    highlighted: false,
    dimmed: true,
    hiddenBelowLg: true,
    logoSizePx: 14,
  },
  {
    rank: 8,
    name: "Saucony",
    domain: "saucony.com",
    score: "47",
    delta: "-1.3",
    deltaPositive: false,
    highlighted: false,
    dimmed: true,
    hiddenBelowLg: true,
    logoSizePx: 16,
  },
];

export interface CrawlerRow {
  name: string;
  logoSrc: string;
  count: number;
  widthPct: number;
  color: string;
  /** Grok row only: `md:hidden` -- present in source on BOTH the desktop and
   * mobile copies, so it never renders in the desktop md:grid instance
   * (always hidden at md+) and only ever shows in the md:hidden mobile
   * carousel instance. Reproduced verbatim rather than dropped. */
  mdHidden: boolean;
}

export const CRAWLER_ROWS: CrawlerRow[] = [
  {
    name: "ChatGPT",
    logoSrc: "/trakkr/images/ai-logos/chatgpt.svg",
    count: 2274,
    widthPct: 48.3727,
    color: "rgba(16, 163, 127, 0.55)",
    mdHidden: false,
  },
  {
    name: "Claude",
    logoSrc: "/trakkr/images/ai-logos/claude.png",
    count: 1129,
    widthPct: 24.0162,
    color: "rgba(217, 119, 6, 0.55)",
    mdHidden: false,
  },
  {
    name: "Perplexity",
    logoSrc: "/trakkr/images/ai-logos/perplexity.svg",
    count: 578,
    widthPct: 12.2953,
    color: "rgba(32, 178, 170, 0.55)",
    mdHidden: false,
  },
  {
    name: "Gemini",
    logoSrc: "/trakkr/images/ai-logos/gemini.svg",
    count: 423,
    widthPct: 8.99809,
    color: "rgba(66, 133, 244, 0.55)",
    mdHidden: false,
  },
  {
    name: "Grok",
    logoSrc: "/trakkr/images/ai-logos/grok.svg",
    count: 297,
    widthPct: 6.3178,
    color: "rgba(17, 24, 39, 0.55)",
    mdHidden: true,
  },
];

export interface ConversationRow {
  logoSrc: string;
  query: string;
  resultPath: string;
  timeAgo: string;
  opacity: number;
}

export const CONVERSATION_ROWS: ConversationRow[] = [
  {
    logoSrc: "/trakkr/images/ai-logos/chatgpt.svg",
    query: "best marathon shoe for sub-3 attempts",
    resultPath: "/vaporfly-4",
    timeAgo: "20s ago",
    opacity: 1,
  },
  {
    logoSrc: "/trakkr/images/ai-logos/perplexity.svg",
    query: "nike alphafly 3 vs adidas adios pro 4",
    resultPath: "/alphafly-3",
    timeAgo: "38s ago",
    opacity: 0.87,
  },
  {
    logoSrc: "/trakkr/images/ai-logos/claude.png",
    query: "are nike pegasus 41 good for daily training",
    resultPath: "/pegasus-41",
    timeAgo: "56s ago",
    opacity: 0.74,
  },
  {
    logoSrc: "/trakkr/images/ai-logos/gemini.svg",
    query: "best stability shoe for overpronators 2026",
    resultPath: "/structure-26",
    timeAgo: "1m ago",
    opacity: 0.61,
  },
];

export interface ActionRow {
  delta: string;
  title: string;
  /** Only the first action is pre-expanded in the settled snapshot. */
  expanded?: {
    date: string;
    tag: string;
    body: string;
    ctaLabel: string;
  };
}

export const ACTION_ROWS: ActionRow[] = [
  {
    delta: "+5.8",
    title: 'Reframe Pegasus 41 for "daily trainer" cluster',
    expanded: {
      date: "Jul 19th",
      tag: "Quick win",
      body: "Nike ranks on marathon prompts, but daily-trainer language routes to Brooks and Hoka. Tighten the Pegasus page around that phrase.",
      ctaLabel: "Run action",
    },
  },
  { delta: "+4.2", title: "Add JSON-LD product schema to /products" },
  { delta: "+6.1", title: "Pitch your Vaporfly 4 lab study to Runner's World" },
  { delta: "+3.7", title: "Counter Hoka's Cliftons-vs-Pegasus page" },
];
