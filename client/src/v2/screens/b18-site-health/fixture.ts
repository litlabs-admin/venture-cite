import type { Board18Data, Board18Value } from "./Screen";

function measured<T>(value: T): Board18Value<T> {
  return { kind: "measured", value };
}

export const board18Fixture = {
  navigation: { brandId: "brand-venture-pr", mode: "expert" },
  brand: { name: measured("VenturePR") },
  header: { lastUpdatedAt: measured("2026-09-09T10:24:00.000Z") },
  health: {
    score: measured(72),
    status: measured("Needs attention"),
    lastVerifiedAt: measured("2026-09-09T10:24:00.000Z"),
    history: measured([
      { date: "2026-08-10T00:00:00.000Z", score: 45 },
      { date: "2026-08-12T00:00:00.000Z", score: 43 },
      { date: "2026-08-15T00:00:00.000Z", score: 50 },
      { date: "2026-08-17T00:00:00.000Z", score: 47 },
      { date: "2026-08-20T00:00:00.000Z", score: 55 },
      { date: "2026-08-22T00:00:00.000Z", score: 52 },
      { date: "2026-08-24T00:00:00.000Z", score: 60 },
      { date: "2026-08-27T00:00:00.000Z", score: 57 },
      { date: "2026-08-29T00:00:00.000Z", score: 63 },
      { date: "2026-09-01T00:00:00.000Z", score: 61 },
      { date: "2026-09-04T00:00:00.000Z", score: 67 },
      { date: "2026-09-07T00:00:00.000Z", score: 65 },
      { date: "2026-09-09T00:00:00.000Z", score: 72 },
    ]),
    range: "30D",
  },
  priorityIssue: {
    title: measured("Pricing page blocks AI crawlers"),
    description: measured(
      "Our tests show AI crawlers are disallowed from /pricing/, preventing them from accessing key product and plan information.",
    ),
    evidencePath: measured("/pricing/robots.txt"),
    businessImpact: measured(
      "Product, pricing and plan details may not be available in AI answers about VenturePR.",
    ),
  },
  healthChecks: [
    {
      name: "Crawl access",
      question: "Can AI crawlers access your important pages?",
      icon: "doc",
      verified: measured(8),
      needsReview: measured(2),
      userConfirmation: measured(1),
    },
    {
      name: "Indexability",
      question: "Which pages are discoverable and canonical?",
      icon: "srch",
      verified: measured(12),
      needsReview: measured(3),
      userConfirmation: measured(1),
    },
    {
      name: "Structured data",
      question: "Is your content marked up for AI understanding?",
      icon: "diag",
      verified: measured(9),
      needsReview: measured(4),
      userConfirmation: measured(2),
    },
    {
      name: "Answer-ready content",
      question: "Do key pages directly answer common questions?",
      icon: "doc",
      verified: measured(11),
      needsReview: measured(5),
      userConfirmation: measured(3),
    },
    {
      name: "Entity clarity",
      question: "Is your brand, product and leadership information clear?",
      icon: "scale",
      verified: measured(7),
      needsReview: measured(4),
      userConfirmation: measured(2),
    },
  ],
  evidence: {
    observed: measured(148),
    unknown: measured(27),
    nextCheckAt: measured("2026-09-16T00:00:00.000Z"),
  },
  crawlSchedule: measured("Weekly on Wednesdays"),
  verificationActivity: measured([
    { event: "Crawl completed", timestamp: "Sep 9, 2026  10:24 AM", detail: "", tone: "ok" },
    { event: "robots.txt fetched", timestamp: "Sep 9, 2026  10:24 AM", detail: "", tone: "ok" },
    { event: "Structured data scan", timestamp: "Sep 9, 2026  10:22 AM", detail: "", tone: "ok" },
    {
      event: "/pricing/ blocked for GPTBot",
      timestamp: "Sep 9, 2026  10:20 AM",
      detail: "",
      tone: "warn",
    },
    { event: "Sitemap processed", timestamp: "Sep 9, 2026  10:18 AM", detail: "", tone: "ok" },
  ]),
  resources: [
    {
      title: "Site health guide for AI visibility",
      href: "https://developers.google.com/search/docs/crawling-indexing/overview",
      icon: "learn",
    },
    {
      title: "AI crawler reference (GPTBot, ClaudeBot, etc.)",
      href: "https://platform.openai.com/docs/bots",
      icon: "globe",
    },
    {
      title: "Robots.txt best practices",
      href: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
      icon: "shield",
    },
    {
      title: "Structured data for AI answers",
      href: "https://developers.google.com/search/docs/appearance/structured-data/intro",
      icon: "diag",
    },
  ],
} satisfies Board18Data;
