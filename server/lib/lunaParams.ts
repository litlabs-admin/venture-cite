// Kept apart from modelConfig.ts, which many tests replace wholesale.
/**
 * Request settings every Luna chat-completions call shares, per OpenAI's
 * GPT-5.6 docs. Luna is a reasoning model:
 * - `temperature` and `top_p` are rejected, so callers must not send them.
 * - Reasoning tokens count against `max_completion_tokens`; a small cap is
 *   spent on reasoning and returns empty content, so the floor is 4000.
 *   The cap is a ceiling, not a charge.
 * - `low` effort is the documented setting for extraction, classification
 *   and short generation, which is every analysis call in this codebase.
 */
export function lunaParams(maxOutput: number) {
  return {
    reasoning_effort: "low" as const,
    max_completion_tokens: Math.max(maxOutput, 4000),
  };
}
