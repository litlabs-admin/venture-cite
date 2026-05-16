import type { PageExplainer } from "@/components/PageHeader";

/** Per-page explainer copy. The popover on each page reads from here.
 *  Edit this file (and only this file) when copy needs updating across
 *  the app. The chatbot system prompt (Phase 5) imports this same map
 *  so its answers stay in sync with the popover copy users see.
 *
 *  Adding a new page: add an entry here keyed by route slug, then add
 *  `explainer={pageExplainers.<slug>}` to that page's <PageHeader>
 *  call site. Pages without explainers render the existing PageHeader
 *  unchanged (the (i) icon only appears when the prop is set).
 */
export const pageExplainers = {
  dashboard: {
    summary: "Your GEO command center — see citation trends, rankings, and what to do next.",
    expectedOutcome: "New data appears within minutes after each citation check completes.",
  },
  brands: {
    summary:
      "Brand profiles power every other feature — name, industry, tone, USPs, and tracked variations.",
    prerequisites: "Add a brand before generating content or running citation checks.",
    expectedOutcome: "Brand details propagate everywhere instantly — no rebuild needed.",
  },
  articles: {
    summary: "AI-optimized articles you've generated. Publish to your site, then track citations.",
    prerequisites: "Articles are created from the Content page; they land here once ready.",
    expectedOutcome:
      "Once published to your site, expect first citations within 1–2 weeks as LLMs re-index.",
  },
  content: {
    summary:
      "Generate AI-optimized articles tuned for citation by ChatGPT, Claude, Perplexity, and others.",
    prerequisites: "Pick a brand. Optional but useful: keywords + target customers.",
    expectedOutcome:
      "Generation takes 2–5 minutes — you'll see live progress and can edit on save.",
    relatedConcept: "GEO",
  },
  citations: {
    summary:
      "Asks ChatGPT, Claude, Perplexity, and others your prompts and tracks whether they mention you.",
    prerequisites: "Run AFTER setting up a brand and generating a few articles.",
    expectedOutcome:
      "Citations typically appear 1–2 weeks after new content is published — LLM models re-index on their own schedule.",
    relatedConcept: "GEO",
  },
  aiVisibility: {
    summary: "One-time setup checklist — make your site machine-readable for AI engines.",
    prerequisites: "Do this BEFORE expecting citations.",
    expectedOutcome: "Each item completed boosts the chance an AI cites you accurately.",
    relatedConcept: "GEO",
  },
  keywordResearch: {
    summary: "Discover keywords AI engines use to surface answers in your industry.",
    expectedOutcome: "Use the suggestions in your Content prompts for higher citation rates.",
    relatedConcept: "GEO",
  },
  geoAnalytics: {
    summary:
      "Share-of-voice + AI visibility + sentiment rollup across all platforms and time windows.",
    prerequisites: "Run a few citation checks first to populate the data.",
    relatedConcept: "GEO",
  },
  aiIntelligence: {
    summary:
      "Deep dive into AI-engine behavior — mentions, hallucinations, citation quality, sources.",
    prerequisites: "Most useful after 2+ weeks of citation runs.",
    relatedConcept: "GEO",
  },
  clientReports: {
    summary: "Period-over-period reports for sharing with stakeholders or as agency deliverables.",
    expectedOutcome: "Auto-generated weekly; export as PDF or share read-only links.",
  },
  community: {
    summary:
      "Reddit + forum outreach — direct engagement that LLMs scrape into their training data.",
    expectedOutcome: "AEO tactic: posts you make today can show up in AI answers within 4–8 weeks.",
    relatedConcept: "AEO",
  },
  competitors: {
    summary:
      "Track competitor brands across the same prompts — see who else AI engines cite, how, and when.",
    prerequisites:
      "Add competitors manually or let the system auto-discover them from citation runs.",
  },
  geoOpportunities: {
    summary: "Specific actions to take next, ranked by impact: outreach, content, schema, etc.",
    expectedOutcome: "Recommendations refresh weekly based on your latest citation data.",
    relatedConcept: "GEO",
  },
  geoSignals: {
    summary:
      "Score your content's chunkability, schema markup, and FAQ structure for AI consumption.",
    expectedOutcome: "Each signal fixed boosts the chance AI engines extract your content cleanly.",
    relatedConcept: "GEO",
  },
  geoTools: {
    summary:
      "Auxiliary tools — bulk ops, data exports, schema generators, listicle scanners, FAQ helpers.",
  },
  crawlerCheck: {
    summary:
      "Check whether AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) are allowed to read your site.",
    expectedOutcome:
      "Run after publishing your robots.txt — flags any AI crawler currently blocked.",
    relatedConcept: "GEO",
  },
  faqManager: {
    summary: "Manage and optimize FAQs that AI engines extract verbatim into answers.",
    expectedOutcome: "Well-structured FAQs are one of the highest-ROI inputs for citation rate.",
    relatedConcept: "AEO",
  },
  brandFactSheet: {
    summary:
      "Canonical facts about your brand — used by AI to verify mentions and avoid hallucinations.",
    expectedOutcome:
      "Adding facts here directly reduces 'wrong' citations (e.g., wrong founding year, wrong CEO).",
    relatedConcept: "GEO",
  },
  settings: {
    summary: "Account, team, billing, integrations, and notification preferences.",
  },
} as const satisfies Record<string, PageExplainer>;
