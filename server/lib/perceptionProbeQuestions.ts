import type { Brand } from "@shared/schema";
import type { PerceptionAxis } from "./perceptionScorer";

// ─── The probe questions ─────────────────────────────────────────────────────
// Kept in their own module, deliberately free of any database or client
// import, so the wording that the whole pipeline's honesty rests on can be
// read, reviewed and unit-tested without booting anything.
//
// See server/lib/perceptionProbes.ts for how these are asked and scored.

export interface ProbeQuestion {
  axis: PerceptionAxis;
  question: string;
}

/**
 * The five probes. Deliberately NOT leading: none of them presumes the brand
 * is good, well-known, or even real. Each asks for what is actually reported
 * rather than for the model's opinion, and each closes with the non-answer
 * invitation that makes `noInformation` reachable.
 */
export function buildProbeQuestions(brand: Brand): ProbeQuestion[] {
  const name = brand.name.trim();
  const site = brand.website ? ` (${brand.website})` : "";
  const industry = brand.industry?.trim();
  const field = industry ? ` in the ${industry} industry` : "";
  // One shared closing clause: the model must be told, every time, that "I
  // don't know" is an acceptable and expected answer. Without it the model
  // treats the question as a request to produce SOMETHING.
  const escape = ` If you do not have reliable information about this specific company, say so plainly instead of guessing or describing a similarly named company.`;

  return [
    {
      axis: "trust",
      question:
        `How trustworthy and reliable is ${name}${site} considered to be? Summarise what customers, reviews, press coverage, or public records actually report about their reliability, track record, and any complaints or trust concerns.` +
        escape,
    },
    {
      axis: "quality",
      question:
        `How is the quality of ${name}'s${site} products or services regarded? Summarise what customers and reviewers actually say about how well the work is delivered, including specific criticisms.` +
        escape,
    },
    {
      axis: "value",
      question:
        `How is ${name}'s${site} pricing and value for money regarded? What do they charge, how does that compare to alternatives${field}, and do customers consider it worth the cost?` +
        escape,
    },
    {
      axis: "market",
      question:
        `What is ${name}'s${site} position${field}? How established and how large are they relative to their competitors, who are their main competitors, and how are they usually described relative to those competitors?` +
        escape,
    },
    {
      axis: "innovation",
      question:
        `How innovative is ${name}${site} considered${field}? Summarise what is actually reported about their technology, methods, or approach, and whether they are seen as leading or following.` +
        escape,
    },
  ];
}
