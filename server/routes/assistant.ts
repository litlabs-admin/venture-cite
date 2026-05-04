// AI tutor chatbot endpoints (Phase 5 v2 — multi-thread).
//
// REST surface:
//   GET    /api/assistant/threads                    list user threads
//   POST   /api/assistant/threads                    create empty thread
//   GET    /api/assistant/threads/:threadId/messages get thread transcript
//   DELETE /api/assistant/threads/:threadId          soft-archive thread
//   POST   /api/assistant/threads/:threadId/restore  un-archive thread
//   POST   /api/assistant/chat                       SSE-streaming chat
//
// All thread endpoints scope by ownership and return 404 (not 403) on miss
// per project anti-enumeration policy.

import type { Express } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { requireUser, requireChatbotThread } from "../lib/ownership";
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

const uuidSchema = z.string().uuid();

const chatRequestSchema = z.object({
  threadId: uuidSchema,
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

const createThreadSchema = z.object({
  brandId: z.string().optional().nullable(),
});

// First-message titles use plain truncation. No second LLM call to keep cost
// at zero per thread — we can swap to a summarizer later.
function deriveThreadTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 57) + "…";
}

export function setupAssistantRoutes(app: Express): void {
  // ------------------------------ Threads ------------------------------

  app.get(
    "/api/assistant/threads",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const threads = await storage.listChatbotThreads(user.id, 50);
        res.json({
          success: true,
          data: {
            threads: threads.map((t) => ({
              id: t.id,
              title: t.title,
              brandId: t.brandId,
              createdAt: t.createdAt,
              updatedAt: t.updatedAt,
              messageCount: t.messageCount,
            })),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load conversations");
      }
    }),
  );

  app.post(
    "/api/assistant/threads",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const parsed = createThreadSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "Invalid request" });
        }
        const thread = await storage.createChatbotThread(user.id, parsed.data.brandId ?? null);
        res.json({ success: true, data: { thread } });
      } catch (error) {
        sendError(res, error, "Failed to create conversation");
      }
    }),
  );

  app.get(
    "/api/assistant/threads/:threadId/messages",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const idParse = uuidSchema.safeParse(req.params.threadId);
        if (!idParse.success) {
          return res.status(404).json({ success: false, error: "Conversation not found" });
        }
        await requireChatbotThread(idParse.data, user.id);
        const rows = await storage.getChatbotThreadMessages(idParse.data, 200);
        res.json({
          success: true,
          data: {
            messages: rows.map((m) => ({
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
            })),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load messages");
      }
    }),
  );

  app.delete(
    "/api/assistant/threads/:threadId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const idParse = uuidSchema.safeParse(req.params.threadId);
        if (!idParse.success) {
          return res.status(404).json({ success: false, error: "Conversation not found" });
        }
        await requireChatbotThread(idParse.data, user.id);
        await storage.archiveChatbotThread(idParse.data);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to archive conversation");
      }
    }),
  );

  app.post(
    "/api/assistant/threads/:threadId/restore",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const idParse = uuidSchema.safeParse(req.params.threadId);
        if (!idParse.success) {
          return res.status(404).json({ success: false, error: "Conversation not found" });
        }
        await requireChatbotThread(idParse.data, user.id);
        await storage.restoreChatbotThread(idParse.data);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to restore conversation");
      }
    }),
  );

  // -------------------------------- Chat -------------------------------

  app.post(
    "/api/assistant/chat",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const tier = (user.accessTier ?? "free") as Tier;

        // ---- Pre-stream validation (returns JSON) ----
        const parsed = chatRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { threadId, messages, brandId } = parsed.data;

        // Ownership: user can only post into their own thread.
        const thread = await requireChatbotThread(threadId, user.id);

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

        // Budget check (returns JSON 429)
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

        // Persist user message before flushHeaders so a failed call still
        // captures the user's input in DB.
        await storage.insertChatbotMessage({
          userId: user.id,
          threadId,
          brandId: brandId ?? null,
          role: "user",
          content: last.content,
        });

        // Auto-title on the first user message in a fresh thread.
        if (thread.title === "New chat") {
          try {
            await storage.setChatbotThreadTitle(threadId, deriveThreadTitle(last.content));
          } catch (err) {
            logger.warn({ err, threadId }, "assistant.chat: title set failed");
          }
        }
        await storage.touchChatbotThread(threadId);

        // Build brand context block (silently skip if brand doesn't belong to user)
        let brandContextBlock = "";
        if (brandId) {
          const brand = await storage.getBrandById(brandId);
          if (brand && brand.userId === user.id) {
            const [articles, citationRuns] = await Promise.all([
              storage.getArticlesByUserIdWithStatus(user.id, {
                brandId,
                limit: 1,
                offset: 0,
              }),
              storage.getCitationRunsByBrandId(brandId, 30),
            ]);
            const recentRuns = citationRuns.filter(
              (r) => new Date(r.startedAt).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000,
            );
            const latest = citationRuns.find(
              (r) => r.status === "completed" || r.status === "succeeded",
            );
            const rate =
              latest && (latest.totalChecks ?? 0) > 0
                ? Math.round(((latest.totalCited ?? 0) / latest.totalChecks!) * 100)
                : null;
            brandContextBlock = `[Current user's brand]
Name: ${brand.name}
Industry: ${brand.industry ?? "(not set)"}
Articles: ${articles.length > 0 ? "yes" : "0"}
Citation runs in last 30 days: ${recentRuns.length}
Latest citation rate: ${rate !== null ? rate + "%" : "no completed runs yet"}

Use this context to make your answers specific to their situation. If they ask "what should I do next," reference their actual numbers.`;
          }
        }

        // Build prompt: only history within THIS thread (not user-wide). The
        // freshly-inserted user message is already in the rows.
        const history = await storage.getChatbotThreadMessages(threadId, 11);
        const promptMessages = [
          {
            role: "system" as const,
            content: SYSTEM_PROMPT,
          },
          ...(brandContextBlock ? [{ role: "system" as const, content: brandContextBlock }] : []),
          ...history.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        const client = getOpenRouterClient();

        // ---- Open SSE response ----
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        let aborted = false;
        req.on("close", () => {
          aborted = true;
        });

        const heartbeat = setInterval(() => {
          if (!aborted) {
            try {
              res.write(": heartbeat\n\n");
            } catch {
              // ignore — write after close
            }
          }
        }, 15_000);

        let acc = "";
        let inputTokens = 0;
        let outputTokens = 0;

        try {
          const stream = (await client.chat.completions.create({
            model: CHATBOT_MODEL,
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
            stream: true,
            stream_options: { include_usage: true },
          } as Parameters<typeof client.chat.completions.create>[0])) as AsyncIterable<{
            choices: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          }>;

          for await (const chunk of stream) {
            if (aborted) break;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
            }
            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens ?? 0;
              outputTokens = chunk.usage.completion_tokens ?? 0;
            }
          }
        } catch (err) {
          captureAndFlush(err, {
            tags: { source: "assistant.chat", stage: "openrouter-stream" },
          });
          if (!aborted) {
            try {
              res.write(
                `data: ${JSON.stringify({ type: "error", error: "AI tutor is temporarily unavailable." })}\n\n`,
              );
            } catch {
              // ignore
            }
          }
        } finally {
          clearInterval(heartbeat);
        }

        // Persist whatever we got, even on abort
        if (acc.length > 0) {
          try {
            await storage.insertChatbotMessage({
              userId: user.id,
              threadId,
              brandId: brandId ?? null,
              role: "assistant",
              content: acc,
              inputTokens,
              outputTokens,
              model: CHATBOT_MODEL,
            });
            await storage.touchChatbotThread(threadId);
            await recordChatbotUsage(user.id, inputTokens, outputTokens);
            try {
              const cents = estimateCostCents(CHATBOT_MODEL, inputTokens, outputTokens);
              await db.execute(sql`
                insert into public.api_costs (user_id, service, model, tokens_in, tokens_out, est_cost_cents)
                values (${user.id}, 'chatbot', ${CHATBOT_MODEL}, ${inputTokens}, ${outputTokens}, ${cents})
              `);
            } catch (err) {
              logger.warn({ err, userId: user.id }, "assistant.chat: api_costs log failed");
            }
          } catch (err) {
            logger.warn(
              { err, userId: user.id },
              "assistant.chat: failed to persist assistant message",
            );
          }
        }

        if (!aborted) {
          try {
            res.write(`data: ${JSON.stringify({ type: "done", inputTokens, outputTokens })}\n\n`);
          } catch {
            // ignore
          }
          res.end();
        }
      } catch (error) {
        if (!res.headersSent) {
          sendError(res, error, "Failed to process chatbot message");
        } else {
          captureAndFlush(error, { tags: { source: "assistant.chat", stage: "post-flush" } });
          try {
            res.end();
          } catch {
            // ignore
          }
        }
      }
    }),
  );
}
