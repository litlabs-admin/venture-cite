// Robust LLM JSON parser: strips code fences, tolerates leading/trailing
// prose, falls back to the first balanced {...}/[...] match, and validates
// the result with the provided Zod schema.
//
// Every LLM output we persist (agent outreach body, competitor inference,
// hallucination judge, remediation steps) should go through this — bare
// JSON.parse + try/catch silently swallows malformed output and stores
// garbage, which is how several of the recently-found bugs shipped.
import type { ZodTypeAny, z } from "zod";

export class LLMParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMParseError";
  }
}

const FENCE_RE = /^\s*```(?:json|javascript|js)?\s*([\s\S]*?)\s*```\s*$/i;

function stripFences(text: string): string {
  const m = text.match(FENCE_RE);
  return m ? m[1] : text;
}

// Find the first balanced JSON value (object or array) in the text.
// Returns null if none found. Balances via bracket counting, ignoring
// brackets inside strings.
function extractFirstJsonValue(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") continue;
    const open = ch;
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (inStr) {
        if (c === "\\") escape = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return text.slice(i, j + 1);
      }
    }
  }
  return null;
}

export function parseLLMJson<T extends ZodTypeAny>(
  text: string | null | undefined,
  schema: T,
): z.infer<T> {
  const raw = (text ?? "").trim();
  if (!raw) throw new LLMParseError("Empty LLM output", raw);

  const stripped = stripFences(raw);

  const attempts: string[] = [stripped];
  const extracted = extractFirstJsonValue(stripped);
  if (extracted && extracted !== stripped) attempts.push(extracted);

  let lastErr: unknown = null;
  for (const candidate of attempts) {
    try {
      const json = JSON.parse(candidate);
      const parsed = schema.safeParse(json);
      if (parsed.success) return parsed.data;
      lastErr = parsed.error;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new LLMParseError(
    `Could not parse LLM output as the expected schema: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
    raw,
    lastErr,
  );
}
