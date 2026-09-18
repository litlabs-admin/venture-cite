// Follow-up chip generation (04-implementation-plan.md §3.5, 01-trakkr-
// teardown.md R13). A cheap, separate call after the final answer - allowed
// to fail silently, since chips are an enhancement, never a blocker (loop.ts
// simply emits no `suggestions` event on failure).
import type { ModelClient } from "./modelClient";
import { ASK_MAX_FOLLOWUPS } from "@shared/ask/constants";

export async function generateFollowups(
  model: ModelClient,
  question: string,
  answer: string,
): Promise<string[]> {
  const prompt = `Given this question and answer from an AI-visibility analysis tool, write exactly ${ASK_MAX_FOLLOWUPS} short follow-up questions the user might naturally ask next. Each should be answerable by the same tool (visibility, competitors, prompts, citation sources, crawler access, site health). Return ONLY a JSON array of ${ASK_MAX_FOLLOWUPS} strings, no other text.

Question: ${question}

Answer: ${answer.slice(0, 4000)}`;

  try {
    const raw = await model.cheapCompletion(prompt, 200);
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, ASK_MAX_FOLLOWUPS);
  } catch {
    return [];
  }
}
