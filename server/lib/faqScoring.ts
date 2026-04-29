// Wave 9.4: deterministic AI-surface heuristic for FAQ items. Replaces
// the previous LLM-self-scored aiSurfaceScore field, which was a
// meaningless number — same FAQ scored differently on consecutive
// generations, and the optimizer hardcoded 85 if the model omitted it.
//
// The score is a coarse but honest signal users can compare across
// FAQs: it rewards short direct answers, question-form questions, the
// brand mention being present, and a clean prose paragraph (no markdown
// bullets in the lead) so the FAQ is well-shaped for AI citation.
//
// Range: 0-100 integer. Higher = more likely to be surfaced verbatim
// by AI engines. Designed so that a "perfect" FAQ scores ~95 and a
// "terrible" one scores ~15-30.

import type { Brand } from "@shared/schema";

interface ScoreInput {
  question: string;
  answer: string;
  brand?: Pick<Brand, "name" | "nameVariations"> | null;
}

const QUESTION_WORDS = [
  "what",
  "how",
  "why",
  "when",
  "where",
  "who",
  "which",
  "is",
  "are",
  "do",
  "does",
  "can",
  "should",
];

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function startsWithQuestionWord(question: string): boolean {
  const first = question.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return QUESTION_WORDS.includes(first);
}

function mentionsBrand(answer: string, brand: ScoreInput["brand"]): boolean {
  if (!brand?.name) return false;
  const candidates = [
    brand.name,
    ...(Array.isArray(brand.nameVariations) ? brand.nameVariations : []),
  ]
    .map((s) => s?.trim().toLowerCase())
    .filter((s): s is string => !!s);
  const lower = answer.toLowerCase();
  return candidates.some((c) => lower.includes(c));
}

function leadsWithBullets(answer: string): boolean {
  // First non-empty line starts with a markdown list marker. AI engines
  // surface direct prose better than bullet leads.
  const firstLine = answer.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  return /^\s*([-*+]|\d+\.)\s+/.test(firstLine);
}

export function computeAiSurfaceScore(input: ScoreInput): number {
  const question = String(input.question ?? "").trim();
  const answer = String(input.answer ?? "").trim();
  if (!question || !answer) return 0;

  let score = 50; // baseline

  // Length window. 40-80 words is the sweet spot for AI summarization;
  // <30 or >120 gets penalized hard.
  const wc = wordCount(answer);
  if (wc >= 40 && wc <= 80) score += 25;
  else if (wc >= 25 && wc < 40) score += 10;
  else if (wc > 80 && wc <= 120) score += 10;
  else if (wc < 15) score -= 25;
  else if (wc > 200) score -= 15;

  // Question phrasing. Real questions start with a question word.
  if (startsWithQuestionWord(question)) score += 10;
  else score -= 10;

  // Question ends in '?'
  if (question.endsWith("?")) score += 5;

  // Brand mention in the answer (verbatim or via known variation).
  if (mentionsBrand(answer, input.brand)) score += 10;

  // Lead-with-prose vs lead-with-bullets. Either is acceptable, but
  // bullet leads degrade extractability.
  if (leadsWithBullets(answer)) score -= 5;

  // Clamp to 0-100.
  return Math.max(0, Math.min(100, Math.round(score)));
}
