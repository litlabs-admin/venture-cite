// Hallucination → correction generator. Given a detected false AI claim and
// the brand's verified fact sheet, produce (1) an internal remediation plan
// and (2) a ready-to-publish, fact-grounded public correction snippet.
//
// HONESTY (by construction): this mirrors hallucinationDetector.ts's hard
// rule — the model may use ONLY the provided brand facts + the stated actual
// fact, and is explicitly forbidden from inventing or inferring any claim.
// The output is a PROPOSAL for user review (the route persists it as
// remediation_steps + status=in_progress), never auto-published. Same
// OpenAI client / model / temp-0 / json_object setup as the detector so
// behaviour is consistent across the detect→correct loop.

import OpenAI from "openai";
import { z } from "zod";
import { attachAiLogger } from "./aiLogger";
import { MODELS } from "./modelConfig";
import { parseLLMJson } from "./llmParse";
import type { BrandFactSheet } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

const MAX_FACTS_IN_PROMPT = 40;

const correctionSchema = z.object({
  remediationSteps: z.array(z.string().min(1)).min(2).max(6),
  publicSnippet: z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
  }),
  factsUsed: z.array(z.string()).default([]),
});

export type GeneratedCorrection = z.infer<typeof correctionSchema>;

export class CorrectionUngroundedError extends Error {
  constructor(message = "Not enough verified facts to ground a correction") {
    super(message);
    this.name = "CorrectionUngroundedError";
  }
}

const factLine = (f: BrandFactSheet) =>
  `- ${f.domain}/${f.subcategory}/${f.factKey}: ${f.factValue}`;

/**
 * Generate a fact-grounded correction for one hallucination. `facts` must be
 * the brand's ACTIVE fact sheet rows (the same source of truth the detector
 * used). Throws CorrectionUngroundedError if there's nothing to ground in.
 */
export async function generateCorrection(input: {
  claimedStatement: string;
  actualFact: string;
  category?: string | null;
  brandName?: string | null;
  facts: BrandFactSheet[];
}): Promise<GeneratedCorrection> {
  const active = input.facts.filter((f) => f.isActive !== 0);
  if (active.length === 0 && !input.actualFact.trim()) {
    throw new CorrectionUngroundedError();
  }

  // Manual facts are authoritative; scraped are lower-confidence. Same
  // two-block framing the detector uses.
  const manualBlock = active
    .filter((f) => f.source !== "scraped")
    .slice(0, MAX_FACTS_IN_PROMPT)
    .map(factLine)
    .join("\n");
  const scrapedBlock = active
    .filter((f) => f.source === "scraped")
    .slice(0, MAX_FACTS_IN_PROMPT)
    .map(factLine)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: MODELS.misc,
    temperature: 0,
    response_format: { type: "json_object" },
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content: `You help a brand correct a false statement an AI assistant made about them. You are given the false claim, the verified contradicting fact, and the brand's verified fact sheet.

HARD RULES:
- Use ONLY the verified fact, the brand fact sheet, and plain restatements of them. Do NOT invent, infer, estimate, or add ANY claim, number, name, date, or feature that is not explicitly present in the inputs.
- The "Manual facts" block is authoritative. "Scraped facts" are lower-confidence; only use them when they reinforce a manual fact.
- The public answer must state what is TRUE (from the verified fact / fact sheet). Never repeat the false claim as if it were true; you may reference it only to contrast ("Contrary to some sources, ...").
- No marketing superlatives, no speculation, no competitor claims. Plain, factual, citable.

Produce JSON exactly:
{
  "remediationSteps": string[],   // 2–6 concrete internal actions the brand can take on its OWNED channels (e.g. publish an FAQ, update a specific page, add a fact-sheet entry). Imperative, specific.
  "publicSnippet": { "question": string, "answer": string },  // a ready-to-publish FAQ-style Q&A whose answer states the truth, grounded only in the facts. Answer 1–3 sentences.
  "factsUsed": string[]           // the factKey(s) (or "verified fact") you relied on, for provenance
}`,
      },
      {
        role: "user",
        content: `False claim an AI made: "${input.claimedStatement}"
Verified contradicting fact: "${input.actualFact}"${
          input.category ? `\nTopic: ${input.category}` : ""
        }${input.brandName ? `\nBrand: ${input.brandName}` : ""}

Manual facts (authoritative):
${manualBlock || "(none)"}

Scraped facts (lower confidence):
${scrapedBlock || "(none)"}`,
      },
    ],
  });

  return parseLLMJson(completion.choices[0]?.message?.content, correctionSchema);
}
