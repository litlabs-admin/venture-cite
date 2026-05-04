// AI tutor chatbot endpoint (Phase 5 — A1).
//
// Non-streaming Sonnet-4.5 chat via OpenRouter. Per-user daily token
// budget + hourly message cap enforced before the upstream call. User
// message persists BEFORE the call so a failed call still preserves
// the user's input. System prompt is sent with Anthropic ephemeral
// cache_control so the ~3.5K-token tutor preamble hits the cache on
// every subsequent turn (90% discount).
//
// PR 5.2 will swap the non-streaming call for SSE; PR 5.3 layers in
// a brand-context system message after the cached preamble.

import type { Express } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { requireUser } from "../lib/ownership";
import { asyncHandler } from "../lib/asyncHandler";
import { sendError } from "../lib/routesShared";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { db } from "../db";
import { assertChatbotBudget, recordChatbotUsage } from "../lib/chatbotBudget";
import { BudgetExceededError, estimateCostCents, type Tier } from "../lib/llmPricing";
import { getOpenRouterClient, CHATBOT_MODEL } from "../lib/openrouterClient";
import { SYSTEM_PROMPT } from "../lib/chatbotKnowledge";

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8_000),
      }),
    )
    .min(1),
  brandId: z.string().optional(),
});

export function setupAssistantRoutes(app: Express): void {
  app.post(
    "/api/assistant/chat",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const tier = (user.accessTier ?? "free") as Tier;

        const parsed = chatRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { messages, brandId } = parsed.data;

        const last = messages[messages.length - 1];
        if (last.role !== "user") {
          return res.status(400).json({
            success: false,
            error: "Last message must be from user",
          });
        }
        if (last.content.length > 2_000) {
          return res.status(400).json({
            success: false,
            error: "Message too long (max 2,000 characters)",
          });
        }

        // 1. Budget check
        try {
          await assertChatbotBudget(user.id, tier);
        } catch (e) {
          if (e instanceof BudgetExceededError) {
            return res.status(429).json({
              success: false,
              code: "budget_exceeded",
              error: "Daily AI tutor budget reached. Resets at midnight UTC.",
            });
          }
          throw e;
        }

        // 2. Persist user message FIRST so a failed call still preserves it
        await storage.insertChatbotMessage({
          userId: user.id,
          brandId: brandId ?? null,
          role: "user",
          content: last.content,
        });

        // 3. Build prompt: cached system + last 10 messages from DB + new user msg
        const history = await storage.getChatbotHistory(user.id, 11);
        const promptMessages = [
          {
            role: "system" as const,
            content: SYSTEM_PROMPT,
          },
          ...history.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        // 4. Call OpenRouter
        const client = getOpenRouterClient();
        let completion;
        try {
          completion = await client.chat.completions.create({
            model: CHATBOT_MODEL,
            // Anthropic cache_control passes through OpenRouter for the system
            // message. The OpenAI SDK type doesn't include cache_control; cast
            // for the field on the system message only.
            messages: promptMessages.map((m, i) =>
              i === 0
                ? ({
                    ...m,
                    cache_control: { type: "ephemeral" },
                  } as unknown as (typeof promptMessages)[number])
                : m,
            ),
            temperature: 0.4,
            max_tokens: 1500,
          });
        } catch (err) {
          captureAndFlush(err, {
            tags: { source: "assistant.chat", stage: "openrouter" },
          });
          return res.status(502).json({
            success: false,
            error: "AI tutor is temporarily unavailable. Please try again in a moment.",
          });
        }

        const content = completion.choices[0]?.message?.content ?? "";
        const inputTokens = completion.usage?.prompt_tokens ?? 0;
        const outputTokens = completion.usage?.completion_tokens ?? 0;

        // 5. Persist assistant message
        await storage.insertChatbotMessage({
          userId: user.id,
          brandId: brandId ?? null,
          role: "assistant",
          content,
          inputTokens,
          outputTokens,
          model: CHATBOT_MODEL,
        });

        // 6. Increment usage
        await recordChatbotUsage(user.id, inputTokens, outputTokens);

        // 7. Log to api_costs for analytics (best-effort)
        try {
          const cents = estimateCostCents(CHATBOT_MODEL, inputTokens, outputTokens);
          await db.execute(sql`
            insert into public.api_costs (user_id, service, model, tokens_in, tokens_out, est_cost_cents)
            values (${user.id}, 'chatbot', ${CHATBOT_MODEL}, ${inputTokens}, ${outputTokens}, ${cents})
          `);
        } catch (err) {
          logger.warn({ err, userId: user.id }, "assistant.chat: api_costs log failed");
        }

        res.json({
          success: true,
          data: { content, inputTokens, outputTokens },
        });
      } catch (error) {
        sendError(res, error, "Failed to process chatbot message");
      }
    }),
  );
}
