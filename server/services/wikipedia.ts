// Wikipedia scan/draft business logic, extracted from
// server/routes/contentTypes.ts (phase B7-13).

import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import { openai } from "../lib/routesShared";
import { loadBrandGenerationContext, renderFactsBlock } from "../lib/brandGenerationContext";

// Scan for Wikipedia opportunities - real MediaWiki API + LLM classification.
// Callers are responsible for the env/profile/cooldown preflight checks
// (those touch res, or are trivial guards left in the route handler).
export async function scanBrandWikipediaMentions(brandId: string, brandName: string) {
  const { scanBrandWikipedia } = await import("../lib/wikipediaScanner");
  const report = await scanBrandWikipedia(brandId);
  const mentions = await storage.getWikipediaMentions(brandId);

  return {
    brand: { id: brandId, name: brandName },
    report,
    // Legacy aliases for back-compat.
    existing: report.existing,
    opportunities: report.opportunities,
    inserted: report.inserted,
    mentions,
  };
}

export type WikipediaMentionForDraft = {
  pageTitle: string;
  mentionContext: string | null;
};

// Wikipedia draft-text helper. It returns a neutral two- or three-sentence
// mention the user can paste into the Wikipedia edit form.
export async function draftWikipediaMention(
  mention: WikipediaMentionForDraft,
  brandId: string,
): Promise<{ draft: string; notes: string[] } | null> {
  const ctx = await loadBrandGenerationContext(brandId, []);
  if (!ctx) return null;
  const { brand, facts } = ctx;
  const factsBlock = renderFactsBlock(facts);

  const prompt = `You are drafting a Wikipedia mention for the brand "${brand.name}" on the page "${mention.pageTitle}". Wikipedia requires neutral point of view (NPOV) - no marketing language, no superlatives, no claims that aren't backed by a citation.

Brand context:
${factsBlock || `- ${brand.name} (${brand.industry || "unspecified industry"})`}

Page context (existing extract from the article):
${(mention.mentionContext || "").slice(0, 1500)}

Write 2-3 sentences (max ~80 words) that mention the brand neutrally in the context of the page topic. The text MUST:
- Be encyclopedic and factual
- Use only verified facts from the brand-context block above
- Be drop-in addable to the article (don't repeat the page title; assume it's added inside an existing section)
- Suggest a likely citation source after the sentence in parentheses (e.g. "(see: company website / industry report)")

Return ONLY the draft text, no preamble.`;

  const response = await openai.chat.completions.create({
    model: MODELS.misc,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 250,
  });

  const draft = (response.choices[0]?.message?.content || "").trim();
  return {
    draft,
    notes: [
      "Wikipedia requires reliable, independent sources - replace the parenthetical citation hint with a real reference URL before submitting.",
      "Verify your brand meets Wikipedia's WP:NOTABILITY guideline before adding a mention.",
      "Disclose any conflict of interest on the article's talk page (WP:COI).",
    ],
  };
}
