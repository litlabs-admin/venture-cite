import type OpenAI from "openai";
import { logger } from "./logger";

// Monkey-patches `openai.chat.completions.create` for optional diagnostics.
// Pino sanitizes the structured payload before it reaches stdout.

const ATTACHED = Symbol.for("venturecite.aiLogger.attached");
const PAYLOAD_LOGGING_ENABLED = process.env.AI_LOG_PAYLOADS === "true";

function messageRoles(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) =>
      typeof message === "object" && message ? (message as { role?: unknown }).role : null,
    )
    .filter((role): role is string => typeof role === "string");
}

export function attachAiLogger(openai: OpenAI): void {
  const client: any = openai;
  if (client[ATTACHED]) return;
  client[ATTACHED] = true;

  const original = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = async (body: any, options?: any) => {
    const started = Date.now();
    const model = body?.model ?? "?";
    try {
      if (PAYLOAD_LOGGING_ENABLED) {
        logger.info(
          {
            aiRequest: {
              model,
              roles: messageRoles(body?.messages),
              messages: body?.messages,
              responseFormat: body?.response_format,
              maxTokens: body?.max_tokens,
              temperature: body?.temperature,
            },
          },
          "ai request",
        );
      }

      const result = await original(body, options);

      if (PAYLOAD_LOGGING_ENABLED) {
        logger.info(
          {
            aiResponse: {
              model,
              durationMs: Date.now() - started,
              content: result?.choices?.[0]?.message?.content ?? "",
            },
          },
          "ai response",
        );
      }

      return result;
    } catch (err) {
      logger.warn(
        {
          aiFailure: {
            model,
            durationMs: Date.now() - started,
            errorName: err instanceof Error ? err.name : "UnknownError",
          },
        },
        "ai request failed",
      );
      throw err;
    }
  };
}
