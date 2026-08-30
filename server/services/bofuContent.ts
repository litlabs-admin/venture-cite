// BOFU (bottom-of-funnel) content generation business logic, extracted from
// server/routes/contentTypes.ts (phase B7-13).

import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import { openai } from "../lib/routesShared";
import {
  loadBrandGenerationContext,
  renderFactsBlock,
  renderCompetitorBlock,
} from "../lib/brandGenerationContext";

export type GenerateBofuContentResult =
  { kind: "not_found" } | { kind: "invalid_type" } | { kind: "ok"; data: unknown; tips: string[] };

// Generate BOFU content using AI. Ownership over brandId must already be
// enforced by the caller.
export async function generateBofuContent(params: {
  brandId: string;
  contentType: string;
  comparedWith: unknown;
  keyword: unknown;
}): Promise<GenerateBofuContentResult> {
  const { brandId, contentType, comparedWith, keyword } = params;

  // Load the full grounding context: fact sheet and all
  // tracked competitors (was: comparedWith[0] only). The fact-sheet
  // block + per-competitor verified data goes into the prompt so
  // the LLM stops inventing comparison features.
  const ctx = await loadBrandGenerationContext(
    brandId,
    Array.isArray(comparedWith) ? comparedWith : [],
  );
  if (!ctx) return { kind: "not_found" };
  const { brand, facts, competitorsResolved } = ctx;
  const factsBlock = renderFactsBlock(facts);
  const competitorBlock = renderCompetitorBlock(competitorsResolved);
  const groundingNote = factsBlock
    ? '\n\nGrounding rules:\n- Use only facts in the Verified-facts block above for claims about this brand.\n- For competitor specifics not in the Competitors block, hedge with phrases like "commonly reported as" or omit.\n- If a comparison data point is unknown, say so explicitly rather than inventing a number.\n'
    : '\n\nGrounding rules:\n- This brand has no verified facts on file. Avoid specific numbers or feature claims; describe at a category level only and hedge with "commonly" / "typically".\n';
  const competitorNamesForTitle = competitorsResolved.map((c) => c.name).filter(Boolean);
  const firstCompetitor = competitorNamesForTitle[0] ?? "Competitor";

  let prompt = "";
  let title = "";

  if (contentType === "comparison") {
    title =
      competitorNamesForTitle.length > 1
        ? `${brand.name} vs ${competitorNamesForTitle.slice(0, 3).join(" vs ")}: Complete Comparison Guide`
        : `${brand.name} vs ${firstCompetitor}: Complete Comparison Guide`;
    prompt = `Create a comprehensive comparison article: "${title}"

Brand: ${brand.name}
Industry: ${brand.industry}
Description: ${brand.description || ""}
Key Products/Services: ${Array.isArray(brand.products) ? brand.products.join(", ") : ""}
Unique Selling Points: ${Array.isArray((brand as any).uniqueSellingPoints) ? (brand as any).uniqueSellingPoints.join(", ") : ""}

${factsBlock}

${competitorBlock}

${groundingNote}

Create an in-depth, balanced comparison (1500+ words) that:
1. Compares features, pricing, pros/cons objectively across ALL competitors listed above (not just one)
2. Helps readers make an informed decision
3. Is optimized for AI citation (structured with headers, tables, clear conclusions)
4. Includes a FAQ section at the end
5. Uses a comparison table near the top so AI engines can extract structured data

Format with markdown headers. Be balanced but highlight genuine strengths of ${brand.name} grounded in the verified facts above.`;
  } else if (contentType === "alternatives") {
    title = `Top ${brand.name} Alternatives: Best Options for ${new Date().getFullYear()}`;
    prompt = `Create an alternatives guide that positions ${brand.name} alongside the alternatives listed below.

Brand: ${brand.name}
Industry: ${brand.industry}

${factsBlock}

${competitorBlock}

${groundingNote}

Create a comprehensive alternatives guide (1500+ words) that:
1. Lists each tracked competitor above PLUS ${brand.name} as alternatives, with pros/cons grounded in the verified facts
2. Explains why someone might look for alternatives
3. Positions ${brand.name} favorably but honestly
4. Includes FAQ section for AI indexing

Format with markdown. Each alternative should have clear headers and bullet points.`;
  } else if (contentType === "guide") {
    title = keyword
      ? `${keyword}: Complete Guide for ${new Date().getFullYear()}`
      : `${brand.industry} Buying Guide`;
    prompt = `Create a transactional buying guide for ${brand.industry}.

Brand: ${brand.name}
Target Keyword: ${keyword || brand.industry + " guide"}

${factsBlock}

${groundingNote}

Create a comprehensive buyer's guide (1500+ words) that:
1. Helps buyers understand what to look for
2. Explains key features and considerations
3. Naturally mentions ${brand.name} as a solution, citing the verified facts above
4. Includes comparison tables and checklists
5. Has a detailed FAQ section

This is bottom-of-funnel content designed to convert and get cited by AI.`;
  } else {
    return { kind: "invalid_type" };
  }

  const response = await openai.chat.completions.create({
    model: MODELS.misc,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 4000,
  });

  const generatedContent = response.choices[0].message.content || "";

  // Save to storage
  const saved = await storage.createBofuContent({
    brandId,
    contentType,
    title,
    content: generatedContent,
    primaryKeyword: keyword || null,
    comparedWith: comparedWith || null,
    targetIntent: "transactional",
    status: "draft",
    // aiScore left null on generate; populated only when an actual
    // scoring step runs (e.g. via PATCH from the optimizer). The
    // previous hard-coded 85 was misleading - users read it as a
    // real quality signal.
  } as any);

  return {
    kind: "ok",
    data: saved,
    tips: [
      "BOFU content converts 80% better than top-of-funnel",
      "Include comparison tables for AI snippet optimization",
      "Add FAQ sections - AI surfaces these frequently",
      "Publish on your site + distribute to Medium/LinkedIn",
    ],
  };
}
