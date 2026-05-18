// Canonical "parse possibly-dirty LLM JSON" helper. ONE implementation,
// shared by the routes layer and the lib scanners — it was previously
// copy-pasted byte-for-byte into 6 files.
//
// Zero dependencies on purpose: importing this never drags a heavier
// module (the OpenAI client, db) into a consumer's module graph, so it
// stays safe to use from unit-tested pure code.
//
// It strips markdown code fences, extracts the first balanced {...}/[...]
// span, and returns null on ANY parse failure — callers decide the
// fallback shape. For schema-validated parsing use parseLLMJson
// (server/lib/llmParse.ts); for the fact-extraction LLM repair loop use
// parseFactsWithRepair (factAgent/v2/extractionPrompt.ts).
export function safeParseJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
