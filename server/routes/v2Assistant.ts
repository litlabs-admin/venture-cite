// GEO assistant (board 22 / `/v2/geo-assistant`): real chat and real context
// stats, scoped to the selected brand and grounded only in verified
// VentureCite data.
//
// Reuses the general chatbot backend wholesale: the same chatbot_threads /
// chatbot_messages tables and REST surface (`POST/GET/DELETE
// /api/assistant/threads...` in server/routes/assistant.ts) handle thread
// lifecycle - a GEO assistant conversation is simply a chatbot thread with
// `brandId` set, so "Recent saved conversations" reads the same storage the
// general AI Tutor writes to. Budget checks, the OpenRouter client, the
// model id and the base system prompt (chatbotBudget.ts, openrouterClient.ts,
// chatbotKnowledge.ts) are reused unchanged too.
//
// The one piece that differs is the context block fed to the model. The
// general endpoint's context (name, industry, latest citation rate) does not
// carry tracked-question count, cited-source count or tracked-competitor
// names, all of which this panel's "Data available" rail promises and which
// its evidence rules require ("Answers use only your verified VentureCite
// data", "Cite specific records when possible"). That is the actual new
// surface here, not a reimplementation of the chat transport.

import type { Express } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { requireUser, requireChatbotThread } from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { db } from "../db";
import { assertChatbotBudget, recordChatbotUsage } from "../lib/chatbotBudget";
import { BudgetExceededError, estimateCostCents, type Tier } from "../lib/llmPricing";
import { getOpenRouterClient, CHATBOT_MODEL } from "../lib/openrouterClient";
import { SYSTEM_PROMPT } from "../lib/chatbotKnowledge";
import { resolveTier, type Brand } from "@shared/schema";
import { getV2MentionRate, type V2MentionRate } from "../services/v2Visibility";
import { getDashboardCitedUrls } from "../services/dashboardVisibility";
import { extractDomain } from "../lib/brandMatcher";

const uuidSchema = z.string().uuid();

const chatRequestSchema = z.object({
  threadId: uuidSchema,
  message: z.string().min(1).max(2_000),
});

// First-message titles use plain truncation, matching
// server/routes/assistant.ts's `deriveThreadTitle` - duplicated rather than
// imported because that helper is not exported and this route does not own
// assistant.ts.
function deriveThreadTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 57) + "…";
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** The first and last week in the mention-rate window that actually holds a
 *  collected answer. `null` when nothing has ever been measured - the window
 *  itself is not a fact in that case. */
function observedWindow(rate: V2MentionRate): { start: string; end: string } | null {
  const observed = rate.weeks.filter((week) => week.measured > 0);
  if (observed.length === 0) return null;
  return { start: observed[0].weekStart, end: observed[observed.length - 1].weekStart };
}

type GeoAssistantContext = {
  brand: { name: string; domain: string | null };
  trackedQuestions: number;
  mentionRate: V2MentionRate;
  window: { start: string; end: string } | null;
  citedSources: { total: number; topDomains: Array<{ domain: string; count: number }> };
  competitors: { count: number; names: string[] };
};

/** Everything both the right rail and the chat prompt need, computed once
 *  from real storage reads so the two can never disagree with each other. */
async function loadGeoAssistantContext(brand: Brand): Promise<GeoAssistantContext> {
  const [prompts, mentionRate, competitors, citedUrls] = await Promise.all([
    storage.getBrandPromptsByBrandId(brand.id),
    getV2MentionRate(brand.id),
    storage.getCompetitors(brand.id),
    getDashboardCitedUrls(brand, null),
  ]);

  const domainCounts = new Map<string, number>();
  for (const row of citedUrls.items) {
    const domain = extractDomain(row.url) ?? row.url;
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }
  const topDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }));

  return {
    brand: { name: brand.name, domain: brand.website ? extractDomain(brand.website) : null },
    trackedQuestions: prompts.length,
    mentionRate,
    window: observedWindow(mentionRate),
    citedSources: { total: citedUrls.total, topDomains },
    competitors: {
      count: competitors.length,
      names: competitors.slice(0, 8).map((c) => c.name),
    },
  };
}

/** The text block the model sees. Every number in it comes straight from
 *  `loadGeoAssistantContext`, never from the model's own guess. */
function buildContextBlock(ctx: GeoAssistantContext): string {
  const rate = ctx.mentionRate;
  const lines: string[] = [
    "[Verified VentureCite data for this brand - the ONLY source of numbers, competitor names or source domains you may state]",
    `Brand: ${ctx.brand.name}${ctx.brand.domain ? ` (${ctx.brand.domain})` : ""}`,
    `Tracked questions in the active query set: ${ctx.trackedQuestions}`,
  ];
  if (rate.measured > 0) {
    lines.push(
      `Mention rate, trailing 8 weeks: ${rate.mentionRate}% (${rate.cited} of ${rate.measured} collected answers cited the brand)`,
      `Failed provider calls in this window: ${rate.failed} (excluded from the rate above)`,
    );
    if (ctx.window) {
      lines.push(`Observed data window: ${formatDate(ctx.window.start)} - ${formatDate(ctx.window.end)}`);
    }
  } else {
    lines.push("Mention rate: not measured - no answer has been collected for this brand yet.");
  }
  lines.push(`Cited source count (all time): ${ctx.citedSources.total}`);
  if (ctx.citedSources.topDomains.length > 0) {
    lines.push(
      `Most-cited source domains: ${ctx.citedSources.topDomains
        .map((d) => `${d.domain} (${d.count})`)
        .join(", ")}`,
    );
  }
  lines.push(`Tracked competitors: ${ctx.competitors.count}`);
  if (ctx.competitors.names.length > 0) {
    lines.push(`Tracked competitor names: ${ctx.competitors.names.join(", ")}`);
  }
  lines.push(
    "",
    "If the user asks about something not covered above, say plainly that VentureCite has not measured it yet - never estimate or invent a number, competitor, or source to fill the gap.",
  );
  return lines.join("\n");
}

const GEO_ASSISTANT_ADDENDUM = `

# GEO assistant panel mode
You are answering inside the GEO assistant panel. This panel's own on-screen evidence rules govern every reply:
- Answers use only the verified data block above - never a number, competitor name, or source domain absent from it.
- Structure a substantive answer as "Observations" (facts read directly from the data block) followed by "Hypotheses" (your reasoning about why, explicitly labelled as a hypothesis, never stated as settled fact).
- Show multiple plausible explanations rather than false certainty.
- You have no direct or live access to any AI model's internals, and individual user prompts are not stored - say so plainly if asked, instead of guessing.
- Keep the reply focused on the brand's verified data; do not reintroduce the general "Next: Open <page>" pointer format unless it genuinely helps.`;

export function setupV2AssistantRoutes(app: Express): void {
  // ==========================================================================
  // GET /api/v2/geo-assistant/context/:brandId
  // Real "Data available" counts for the right rail, and the same numbers the
  // chat handler below grounds its answers in.
  // ==========================================================================
  app.get(
    "/api/v2/geo-assistant/context/:brandId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await storage.getBrandById(req.params.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }
        const ctx = await loadGeoAssistantContext(brand);

        const threads = await storage.listChatbotThreads(user.id, 50);
        const savedConversations = threads
          .filter((t) => t.brandId === brand.id)
          .slice(0, 5)
          .map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }));

        res.json({
          success: true,
          data: {
            brand: ctx.brand,
            dataAvailable: {
              trackedQuestions: ctx.trackedQuestions,
              window: ctx.window,
              citedSourceCount: ctx.citedSources.total,
              competitorCount: ctx.competitors.count,
            },
            savedConversations,
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load GEO assistant context");
      }
    }),
  );

  // ==========================================================================
  // POST /api/v2/geo-assistant/chat
  // SSE-streaming chat, same wire format as /api/assistant/chat, grounded in
  // the richer context block above.
  // ==========================================================================
  app.post(
    "/api/v2/geo-assistant/chat",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const tier = resolveTier(user) as Tier;

        const parsed = chatRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }
        const { threadId, message } = parsed.data;

        const thread = await requireChatbotThread(threadId, user.id);
        if (!thread.brandId) {
          return res.status(400).json({
            success: false,
            error: "This conversation has no brand attached.",
          });
        }
        const brand = await storage.getBrandById(thread.brandId);
        if (!brand || brand.userId !== user.id) {
          return res.status(404).json({ success: false, error: "Brand not found" });
        }

        if (message.length > 2_000) {
          return res.status(400).json({
            success: false,
            error: "Message too long (max 2,000 characters)",
          });
        }

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

        await storage.insertChatbotMessage({
          userId: user.id,
          threadId,
          brandId: brand.id,
          role: "user",
          content: message,
        });

        if (thread.title === "New chat") {
          try {
            await storage.setChatbotThreadTitle(threadId, deriveThreadTitle(message));
          } catch (err) {
            logger.warn({ err, threadId }, "v2Assistant.chat: title set failed");
          }
        }
        await storage.touchChatbotThread(threadId);

        const ctx = await loadGeoAssistantContext(brand);
        const contextBlock = buildContextBlock(ctx);

        const history = await storage.getChatbotThreadMessages(threadId, 11);
        const promptMessages = [
          { role: "system" as const, content: SYSTEM_PROMPT + GEO_ASSISTANT_ADDENDUM },
          { role: "system" as const, content: contextBlock },
          ...history.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        const client = getOpenRouterClient();

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
              // ignore - write after close
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
                ? ({ ...m, cache_control: { type: "ephemeral" } } as unknown as (typeof promptMessages)[number])
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
            tags: { source: "v2Assistant.chat", stage: "openrouter-stream" },
          });
          if (!aborted) {
            try {
              res.write(
                `data: ${JSON.stringify({ type: "error", error: "GEO assistant is temporarily unavailable." })}\n\n`,
              );
            } catch {
              // ignore
            }
          }
        } finally {
          clearInterval(heartbeat);
        }

        if (acc.length > 0) {
          try {
            await storage.insertChatbotMessage({
              userId: user.id,
              threadId,
              brandId: brand.id,
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
                values (${user.id}, 'geo_assistant', ${CHATBOT_MODEL}, ${inputTokens}, ${outputTokens}, ${cents})
              `);
            } catch (err) {
              logger.warn({ err, userId: user.id }, "v2Assistant.chat: api_costs log failed");
            }
          } catch (err) {
            logger.warn(
              { err, userId: user.id },
              "v2Assistant.chat: failed to persist assistant message",
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
          sendError(res, error, "Failed to process GEO assistant message");
        } else {
          captureAndFlush(error, { tags: { source: "v2Assistant.chat", stage: "post-flush" } });
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
