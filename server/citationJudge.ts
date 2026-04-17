import OpenAI from "openai";
import { attachAiLogger } from "./lib/aiLogger";

// Dedicated client for the citation-judge LLM. Uses gpt-4o-mini for cost —
// a judge call runs ~$0.0002 per response.
const judgeClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
});
attachAiLogger(judgeClient);

const JUDGE_MODEL = "gpt-4o-mini";
const MAX_RESPONSE_CHARS = 8000;

export interface JudgeBrand {
  name: string;
  companyName?: string | null;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  nameVariations?: string[] | null;
}

export interface JudgeVerdict {
  cited: boolean;
  rank: number | null;
  reasoning: string;
}

function buildProfileBlock(brand: JudgeBrand): string {
  const lines: string[] = [];
  lines.push(`- Name: ${brand.name}`);
  if (brand.companyName && brand.companyName !== brand.name) lines.push(`- Full company name: ${brand.companyName}`);
  if (brand.website) lines.push(`- Website: ${brand.website}`);
  if (brand.industry) lines.push(`- Industry: ${brand.industry}`);
  if (brand.description) lines.push(`- Description: ${brand.description}`);
  const variations = (brand.nameVariations || []).filter((v) => typeof v === "string" && v.trim().length > 0);
  if (variations.length > 0) lines.push(`- Also known as: ${variations.join(", ")}`);
  return lines.join("\n");
}

// Asks gpt-4o-mini whether `responseText` actually cites the brand. Unlike
// the string matcher, this can tell "venture capital" apart from "Venture PR"
// because it understands the surrounding context.
export async function judgeCitation(params: {
  responseText: string;
  brand: JudgeBrand;
}): Promise<JudgeVerdict> {
  const { responseText, brand } = params;
  const truncated = responseText.length > MAX_RESPONSE_CHARS
    ? responseText.slice(0, MAX_RESPONSE_CHARS)
    : responseText;

  const profile = buildProfileBlock(brand);

  const systemMsg = `You are a precise citation judge. You decide whether an AI-generated response cites a specific brand/company.

A "citation" means the response explicitly refers to THIS brand — by its name, a known variation, its website/domain, or an unambiguous description. Generic English words that happen to overlap with the brand name do NOT count (e.g., "venture capital" is not a citation of a brand called "Venture PR"). Industry-generic terms (e.g., "PR agency", "CRM software") do NOT count unless the specific brand is named.

Return JSON only, exactly in this shape:
{"cited": boolean, "rank": number | null, "reasoning": "short sentence"}

"rank" is the 1-indexed position of the brand's first mention inside an ordered/numbered list or ranked recommendation in the response. If the brand is mentioned but not inside such a list, return null.`;

  const userMsg = `Brand profile:
${profile}

Response text to evaluate:
"""
${truncated}
"""

Respond with JSON only.`;

  const completion = await judgeClient.chat.completions.create({
    model: JUDGE_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
    ],
    max_tokens: 200,
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(raw);
    const cited = Boolean(parsed.cited);
    const rank = typeof parsed.rank === "number" && parsed.rank > 0 ? Math.round(parsed.rank) : null;
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";
    return { cited, rank: cited ? rank : null, reasoning };
  } catch {
    return { cited: false, rank: null, reasoning: "Judge returned malformed JSON" };
  }
}
