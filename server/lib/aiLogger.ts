import type OpenAI from "openai";

// Monkey-patches `openai.chat.completions.create` to print every request and
// response to stdout so you can see exactly what's being sent and received.
// Works for any OpenAI-SDK-compatible client (OpenAI, OpenRouter, etc.).
//
// Writes to console only — no files — so it works on ephemeral hosts (Render,
// Vercel, Fly). Safe to leave on in production; noisy but cheap.
//
// Idempotent: a Symbol-keyed guard prevents re-wrapping if attached twice.

const ATTACHED = Symbol.for("venturecite.aiLogger.attached");

function truncate(s: unknown, max = 2000): string {
  const str = typeof s === "string" ? s : JSON.stringify(s);
  return str.length > max ? `${str.slice(0, max)}…[+${str.length - max} chars]` : str;
}

export function attachAiLogger(openai: OpenAI): void {
  const client: any = openai;
  if (client[ATTACHED]) return;
  client[ATTACHED] = true;

  const original = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = async (body: any, options?: any) => {
    const started = Date.now();
    const tag = `[ai ${body?.model ?? "?"}]`;
    try {
      console.log(
        `${tag} → request`,
        truncate({
          model: body?.model,
          messages: body?.messages,
          response_format: body?.response_format,
          max_tokens: body?.max_tokens,
          temperature: body?.temperature,
        }),
      );
      const result = await original(body, options);
      const content = result?.choices?.[0]?.message?.content ?? "";
      console.log(`${tag} ← response (${Date.now() - started}ms)`, truncate(content));
      return result;
    } catch (err) {
      console.error(
        `${tag} ✗ error (${Date.now() - started}ms)`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  };
}
