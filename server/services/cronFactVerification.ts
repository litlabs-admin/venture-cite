// Cron orchestrator fact-reverification step, extracted verbatim from
// server/routes/cron.ts as part of the B7 service-layer split.
//
// The orchestrator's budgeting mechanics (Orchestrator class, STEP_CAPS_MS)
// live in server/services/cronOrchestrator.ts; the
// `orch.run("fact-reverification-batch", ...)` call site stays in
// server/routes/cron.ts, in sequence with the rest of that route's steps.

import { logger } from "../lib/logger";
import { LLM_CALL_TIMEOUT_MS } from "../lib/factAgent/v2/vercelBudget";

// Per-fact re-verification: cheaper than a full re-scrape. Hits each
// stale fact's source URL, re-extracts ONLY that fact, and either marks
// it verified or records drift.
export async function runFactReverificationBatchStep(): Promise<void> {
  const { runReverificationBatch } = await import("../lib/factAgent/v2/reverifyFact");
  // We need an LLM callable here; the structured-data pre-pass
  // in reverify covers most facts, but for the rest we use the
  // same gpt-4o-mini that runs in the main pipeline.
  const OpenAI = (await import("openai")).default;
  const { MODELS } = await import("../lib/modelConfig");
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // Inherit Vercel-tier-aware LLM timeout. On Hobby this is
    // ~6.3s; on Pro ~25s. Avoid orphaning the cron tick.
    timeout: LLM_CALL_TIMEOUT_MS,
    maxRetries: 0,
  });
  const llm: import("../lib/factAgent/v2/extractionPrompt").LlmCallable = async (prompt) => {
    const messages =
      typeof prompt === "string"
        ? [{ role: "user" as const, content: prompt }]
        : [
            { role: "system" as const, content: prompt.system },
            { role: "user" as const, content: prompt.user },
          ];
    const responseFormat =
      typeof prompt === "object" &&
      prompt &&
      "responseFormat" in prompt &&
      (prompt as { responseFormat?: unknown }).responseFormat
        ? (prompt as { responseFormat: unknown }).responseFormat
        : { type: "json_object" as const };
    const res = await openai.chat.completions.create({
      model: MODELS.misc,
      response_format: responseFormat as never,
      messages,
    });
    return res.choices?.[0]?.message?.content ?? "";
  };
  const counters = await runReverificationBatch(20, llm);
  logger.info({ counters }, "fact-reverification-batch: counters");
}
