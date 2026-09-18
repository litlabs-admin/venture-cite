// Ask endpoints - the agent workspace's REST + SSE surface.
//
// REST surface:
//   GET    /api/ask/threads                     list threads
//   POST   /api/ask/threads                     create empty thread
//   GET    /api/ask/threads/:threadId           thread + messages + steps + cards
//   DELETE /api/ask/threads/:threadId           soft-archive
//   POST   /api/ask/threads/:threadId/restore   un-archive
//   POST   /api/ask/threads/:threadId/run       SSE-streaming agent run
//   GET    /api/ask/suggestions                 palette + empty-state questions
//   GET    /api/ask/context                     assembled brief for the drawer
//   GET    /api/ask/actions                     action cards for a brand (sidebar counts)
//   POST   /api/ask/actions/:id/approve
//   POST   /api/ask/actions/:id/dismiss
//   POST   /api/ask/actions/:id/undo
//
// Independence (docs/ask-feature/07-integration-and-hardening.md §0): every
// import here is either Ask's own (server/ask/**) or a shared platform
// helper explicitly allowed by that section. Nothing from
// server/lib/chatbot*.ts, server/storage/chatbotStorage.ts or
// server/routes/assistant.ts.
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { requireUser, requireBrand, OwnershipError } from "../lib/ownership";
import { requireAskThread } from "../ask/ownership";
import { asyncHandler } from "../lib/asyncHandler";
import { sendError } from "../lib/routesShared";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { db } from "../db";
import * as schema from "@shared/schema";
import { resolveTier } from "@shared/schema";
import type { Tier } from "../lib/llmPricing";
import { BudgetExceededError } from "../lib/llmPricing";
import { assertAskBudget, recordAskUsage } from "../ask/budget";
import { tryAcquire } from "../lib/rateLimitBuckets";
import { withDynamicAdvisoryLock, dynamicLockNamespaces } from "../lib/advisoryLock";
import { withSlot } from "../lib/llmConcurrency";
import {
  listAskThreads,
  createAskThread,
  touchAskThread,
  setAskThreadTitle,
  archiveAskThread,
  restoreAskThread,
  getAskThreadMessages,
  insertAskMessage,
  insertAskSteps,
} from "../ask/storage";
import { assembleAskContext } from "../ask/context";
import { runAskLoop } from "../ask/loop";
import { generateFollowups } from "../ask/followups";
import { openAskSse } from "../ask/stream";
import { OpenRouterModelClient, type ModelMessage } from "../ask/modelClient";
import { MODELS } from "../lib/modelConfig";
import {
  toActionCard,
  approveAction,
  dismissAction,
  undoAction,
  ActionNotFoundError,
  ActionConflictError,
} from "../ask/actions/execute";
import { WORK_KINDS } from "@shared/ask/constants";
import { ASK_SUGGESTION_PALETTE } from "@shared/ask/suggestions";
import { env } from "../env";

const uuidSchema = z.string().uuid();

const runRequestSchema = z.object({
  message: z.string().min(1).max(4_000),
});

const createThreadSchema = z.object({
  brandId: z.string().optional().nullable(),
});

const renameThreadSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

function deriveThreadTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 57) + "…";
}

function handleActionError(res: import("express").Response, err: unknown): boolean {
  if (err instanceof OwnershipError) {
    res.status(err.status).json({ success: false, error: err.message });
    return true;
  }
  if (err instanceof ActionNotFoundError) {
    res.status(404).json({ success: false, error: "Action not found" });
    return true;
  }
  if (err instanceof ActionConflictError) {
    res.status(409).json({ success: false, error: err.message });
    return true;
  }
  return false;
}

// On by default in every environment except production, where it needs an
// explicit ASK_ENABLED=true (07 §9's smallest-thing-that-works flag: no
// general feature-flag system exists in this codebase). ASK_ENABLED=false
// forces it off anywhere, including development.
function isAskEnabled(): boolean {
  if (env.ASK_ENABLED === "false") return false;
  if (env.ASK_ENABLED === "true") return true;
  return env.NODE_ENV !== "production";
}

export function setupAskRoutes(app: Express): void {
  // 404, never 403, when the flag is off - matching AGENTS.md's anti-
  // enumeration policy for every other ownership miss in this codebase.
  app.use("/api/ask", (req, res, next) => {
    if (!isAskEnabled()) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    next();
  });

  // ------------------------------ Threads ------------------------------

  app.get(
    "/api/ask/threads",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brandId = typeof req.query.brandId === "string" ? req.query.brandId : undefined;
        const threads = await listAskThreads(user.id, { brandId, limit: 50 });
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
              pendingActionCount: t.pendingActionCount,
            })),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load threads");
      }
    }),
  );

  app.post(
    "/api/ask/threads",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const parsed = createThreadSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ success: false, error: "Invalid request" });
        }
        const thread = await createAskThread(user.id, parsed.data.brandId ?? null);
        res.json({ success: true, data: { thread } });
      } catch (error) {
        sendError(res, error, "Failed to create thread");
      }
    }),
  );

  app.get(
    "/api/ask/threads/:threadId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const idParse = uuidSchema.safeParse(req.params.threadId);
        if (!idParse.success) {
          return res.status(404).json({ success: false, error: "Thread not found" });
        }
        const thread = await requireAskThread(idParse.data, user.id);
        const messages = await getAskThreadMessages(idParse.data, 200);

        // Attach action cards for any propose_action-created agent_tasks
        // linked to this thread's messages.
        const messageIds = messages.map((m) => m.id);
        const cardsByMessage = new Map<string, unknown[]>();
        if (messageIds.length > 0) {
          const tasks = await db
            .select()
            .from(schema.agentTasks)
            .where(eq(schema.agentTasks.askThreadId, idParse.data));
          for (const task of tasks) {
            if (!task.askMessageId) continue;
            const card = await toActionCard(task);
            const arr = cardsByMessage.get(task.askMessageId) ?? [];
            arr.push(card);
            cardsByMessage.set(task.askMessageId, arr);
          }
        }

        res.json({
          success: true,
          data: {
            thread: { id: thread.id, title: thread.title, brandId: thread.brandId },
            messages: messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              blocks: m.blocks ?? [],
              evidence: m.evidence ?? [],
              suggestions: m.suggestions ?? [],
              durationMs: m.durationMs,
              pagesRead: m.pagesRead,
              runStatus: m.runStatus,
              degradedReasons: m.degradedReasons ?? [],
              createdAt: m.createdAt,
              steps: m.steps.map((s) => ({
                ordinal: s.ordinal,
                toolName: s.toolName,
                label: s.label,
                category: s.category,
                summary: s.summary,
                durationMs: s.durationMs,
                status: s.status,
              })),
              actionCards: cardsByMessage.get(m.id) ?? [],
            })),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load thread");
      }
    }),
  );

  app.delete(
    "/api/ask/threads/:threadId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const idParse = uuidSchema.safeParse(req.params.threadId);
        if (!idParse.success) {
          return res.status(404).json({ success: false, error: "Thread not found" });
        }
        await requireAskThread(idParse.data, user.id);
        await archiveAskThread(idParse.data);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to archive thread");
      }
    }),
  );

  app.patch(
    "/api/ask/threads/:threadId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const idParse = uuidSchema.safeParse(req.params.threadId);
        if (!idParse.success) {
          return res.status(404).json({ success: false, error: "Thread not found" });
        }
        const parsed = renameThreadSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }
        await requireAskThread(idParse.data, user.id);
        await setAskThreadTitle(idParse.data, parsed.data.title);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to rename thread");
      }
    }),
  );

  app.post(
    "/api/ask/threads/:threadId/restore",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const idParse = uuidSchema.safeParse(req.params.threadId);
        if (!idParse.success) {
          return res.status(404).json({ success: false, error: "Thread not found" });
        }
        await requireAskThread(idParse.data, user.id);
        await restoreAskThread(idParse.data);
        res.json({ success: true });
      } catch (error) {
        sendError(res, error, "Failed to restore thread");
      }
    }),
  );

  // -------------------------------- Run ---------------------------------

  app.post(
    "/api/ask/threads/:threadId/run",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const tier = resolveTier(user) as Tier;

        const idParse = uuidSchema.safeParse(req.params.threadId);
        if (!idParse.success) {
          return res.status(404).json({ success: false, error: "Thread not found" });
        }
        const threadId = idParse.data;

        const parsed = runRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.issues[0]?.message ?? "Invalid request",
          });
        }

        const thread = await requireAskThread(threadId, user.id);
        if (!thread.brandId) {
          return res
            .status(400)
            .json({ success: false, error: "This thread has no brand selected" });
        }
        const brand = await requireBrand(thread.brandId, user.id);

        // Burst protection (rateLimitBuckets) ahead of the real per-tier
        // budget check (assertAskBudget) - cheap rejection first.
        const withinBurst = await tryAcquire("ask-run", user.id);
        if (!withinBurst) {
          return res
            .status(429)
            .json({ success: false, error: "Too many runs, slow down a moment" });
        }

        try {
          await assertAskBudget(user.id, tier);
        } catch (e) {
          if (e instanceof BudgetExceededError) {
            return res.status(429).json({
              success: false,
              code: "budget_exceeded",
              error: "Daily Ask budget reached. Resets at midnight UTC.",
            });
          }
          throw e;
        }

        const message = parsed.data.message;

        // One active run per thread (07 §4.1) - a dynamic advisory lock
        // whose renewal loop keeps it alive for the whole run regardless of
        // its own fixed lease TTL.
        const lockResult = await withDynamicAdvisoryLock(
          dynamicLockNamespaces.askRunThread,
          threadId,
          "ask-run",
          async () => {
            await runOneAskTurn({ req, res, user, tier, thread, brand, message });
          },
        );
        if (!lockResult.ran) {
          return res.status(409).json({
            success: false,
            error: "A run is already in progress on this thread",
            code: "run_in_progress",
          });
        }
      } catch (error) {
        if (!res.headersSent) {
          sendError(res, error, "Failed to run Ask");
        } else {
          captureAndFlush(error, { tags: { source: "ask.run", stage: "post-flush" } });
          try {
            res.end();
          } catch {
            // ignore
          }
        }
      }
    }),
  );

  // ----------------------------- Suggestions -----------------------------

  // Kept for any non-web caller that still needs a round trip for this,
  // but neither client surface (CommandPalette.tsx's Ask window,
  // AskEmptyState.tsx) calls it any more - both import
  // shared/ask/suggestions.ts directly, since the palette never actually
  // depended on the brand (see that file's header for why). This route
  // used to also carry `explore` (a data-derived list that was ALWAYS
  // empty - "populated once a brand has tracked prompts" never shipped)
  // and `scope.brandName` (fetched with its own requireBrand lookup, read
  // by no client). Both dropped: dead weight that only ever returned the
  // same "not implemented yet" empty array or a value nothing used.
  app.get(
    "/api/ask/suggestions",
    isAuthenticated,
    asyncHandler(async (_req, res) => {
      try {
        res.json({ success: true, data: { palette: ASK_SUGGESTION_PALETTE } });
      } catch (error) {
        sendError(res, error, "Failed to load suggestions");
      }
    }),
  );

  app.get(
    "/api/ask/context",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brandId = typeof req.query.brandId === "string" ? req.query.brandId : undefined;
        if (!brandId) return res.status(400).json({ success: false, error: "brandId required" });
        const brand = await requireBrand(brandId, user.id);
        res.json({
          success: true,
          data: {
            brand: {
              id: brand.id,
              name: brand.name,
              description: brand.description,
              targetAudience: brand.targetAudience,
              products: brand.products ?? [],
              keyValues: brand.keyValues ?? [],
              uniqueSellingPoints: brand.uniqueSellingPoints ?? [],
            },
            workKinds: WORK_KINDS,
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load context");
      }
    }),
  );

  // ------------------------------- Actions --------------------------------

  app.get(
    "/api/ask/actions",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brandId = typeof req.query.brandId === "string" ? req.query.brandId : undefined;
        if (!brandId) return res.status(400).json({ success: false, error: "brandId required" });
        await requireBrand(brandId, user.id);
        const tasks = await db
          .select()
          .from(schema.agentTasks)
          .where(eq(schema.agentTasks.brandId, brandId));
        const askTasks = tasks.filter((t) => t.askThreadId !== null);
        const cards = await Promise.all(askTasks.map((t) => toActionCard(t)));
        res.json({ success: true, data: { cards } });
      } catch (error) {
        sendError(res, error, "Failed to load actions");
      }
    }),
  );

  app.post(
    "/api/ask/actions/:id/approve",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const card = await approveAction(req.params.id, user.id);
        res.json({ success: true, data: { card } });
      } catch (error) {
        if (!handleActionError(res, error)) sendError(res, error, "Failed to approve action");
      }
    }),
  );

  app.post(
    "/api/ask/actions/:id/dismiss",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const card = await dismissAction(req.params.id, user.id);
        res.json({ success: true, data: { card } });
      } catch (error) {
        if (!handleActionError(res, error)) sendError(res, error, "Failed to dismiss action");
      }
    }),
  );

  app.post(
    "/api/ask/actions/:id/undo",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const card = await undoAction(req.params.id, user.id);
        res.json({ success: true, data: { card } });
      } catch (error) {
        if (!handleActionError(res, error)) sendError(res, error, "Failed to undo action");
      }
    }),
  );
}

// One full Ask turn: persist the user message, assemble context, run the
// loop, stream events, persist the result. Broken out of the route handler
// above so the SSE lifecycle (open/close, abort wiring) has one clear home.
async function runOneAskTurn(input: {
  req: import("express").Request;
  res: import("express").Response;
  user: { id: string };
  tier: Tier;
  thread: { id: string; brandId: string | null; title: string };
  brand: import("@shared/schema").Brand;
  message: string;
}): Promise<void> {
  const { req, res, user, thread, brand, message } = input;

  // Stream opens FIRST, before any of the setup work below - a reader used
  // to wait out the user-message insert, the title/touch writes, the
  // history fetch AND the full context assembly before a single byte
  // reached them. `run_started` plus an immediate status line means
  // something is visibly happening within the round trip, not after it.
  const sse = openAskSse(res);
  let aborted = false;
  const controller = new AbortController();
  req.on("close", () => {
    aborted = true;
    controller.abort();
  });

  const runId = randomUUID();
  const pendingMessageId = randomUUID();
  sse.send({ type: "run_started", runId, startedAt: new Date().toISOString() });
  sse.send({ type: "status", verb: "Reading", object: "your brand" });

  // The user-message insert, the prior-turn history and the system-prompt
  // context assembly don't depend on each other - run them together instead
  // of one after another. `userMessageRow` (not array position) is how
  // history below knows which row is the message just inserted: awaiting
  // the insert and the history fetch together means either can resolve
  // first, so "drop the last row" would have been wrong exactly as often as
  // it was right.
  const [userMessageRow, priorMessages, context] = await Promise.all([
    insertAskMessage({
      threadId: thread.id,
      userId: user.id,
      brandId: brand.id,
      role: "user",
      content: message,
    }),
    getAskThreadMessages(thread.id, 21),
    assembleAskContext(brand),
  ]);

  // Title/touch are writes nothing downstream reads back, so they run
  // fire-and-forget rather than adding their own latency to the critical
  // path. A failure here already only warned (never threw) before this
  // change; that behaviour is unchanged, just no longer blocking.
  if (thread.title === "New thread") {
    setAskThreadTitle(thread.id, deriveThreadTitle(message)).catch((err: unknown) => {
      logger.warn({ err, threadId: thread.id }, "ask.run: title set failed");
    });
  }
  touchAskThread(thread.id).catch((err: unknown) => {
    logger.warn({ err, threadId: thread.id }, "ask.run: touch failed");
  });

  const history: ModelMessage[] = priorMessages
    .filter((m) => m.id !== userMessageRow.id)
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const model = new OpenRouterModelClient();

  let result: Awaited<ReturnType<typeof runAskLoop>> | undefined;
  try {
    result = await withSlot("anthropic", runId, () =>
      runAskLoop({
        brand,
        userId: user.id,
        threadId: thread.id,
        messageId: pendingMessageId,
        userMessage: message,
        systemPrompt: context.systemPrompt,
        coreCompetitors: context.coreCompetitors,
        trackedPromptIds: context.trackedPromptIds,
        hero: context.hero,
        history,
        model,
        signal: controller.signal,
        onEvent: (event) => sse.send(event),
      }),
    );
  } catch (err) {
    captureAndFlush(err, { tags: { source: "ask.run", stage: "loop" } });
    sse.send({
      type: "error",
      code: "run_failed",
      message: "Ask is temporarily unavailable.",
    });
  }

  if (result) {
    // Follow-ups run ALONGSIDE persistence, not before it - a `done` event
    // (what closes the loading state client-side) used to wait out this
    // extra model call on top of everything below it. Suggestions still
    // reach the client before `done` when they're ready in time (unchanged,
    // desired ordering: the follow-up chips render, then the run settles);
    // when they're not, the row is patched with them fire-and-forget rather
    // than making the reader wait, and the client still has them for this
    // session via the `suggestions` event whenever it lands.
    const followupsPromise: Promise<string[]> =
      result.text.trim().length > 0 && result.runStatus !== "stopped" && !aborted
        ? generateFollowups(model, message, result.text).catch(() => [] as string[])
        : Promise.resolve([]);

    try {
      const saved = await insertAskMessage({
        threadId: thread.id,
        userId: user.id,
        brandId: brand.id,
        role: "assistant",
        content: result.text,
        blocks: result.blocks,
        evidence: result.evidence,
        durationMs: result.durationMs,
        pagesRead: result.pagesRead,
        runStatus: aborted ? "stopped" : result.runStatus,
        degradedReasons: result.degradedReasons,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: MODELS.ask,
      });

      // By now follow-ups have usually resolved already (they started
      // before the insert above, not after) - race them against a short
      // budget so a slow model call can no longer hold up `done`. Whichever
      // way it resolves, the row gets patched with the final answer
      // (fire-and-forget) so a later thread reload sees the same chips a
      // live viewer saw.
      const suggestions = await Promise.race([
        followupsPromise,
        new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 1500)),
      ]);
      if (suggestions.length > 0) {
        sse.send({ type: "suggestions", items: suggestions });
      }
      followupsPromise
        .then((finalSuggestions) => {
          if (finalSuggestions.length === 0) return;
          return db
            .update(schema.askMessages)
            .set({ suggestions: finalSuggestions })
            .where(eq(schema.askMessages.id, saved.id));
        })
        .catch((err: unknown) => {
          logger.warn({ err, messageId: saved.id }, "ask.run: suggestions patch failed");
        });

      if (result.steps.length > 0) {
        await insertAskSteps(
          result.steps.map((s) => ({
            messageId: saved.id,
            ordinal: s.ordinal,
            toolName: s.toolName,
            label: s.label,
            category: s.category,
            summary: s.summary,
            durationMs: s.durationMs,
            status: s.status,
          })),
        );
      }
      await touchAskThread(thread.id);
      await recordAskUsage(user.id, result.inputTokens, result.outputTokens);
      // Platform-cap decision, option A (07 §1): write to api_costs so Ask
      // spend is visible to opsHealthCheck.ts and counts against the
      // platform-wide 24h cap citationChecker.ts/contentGenerationWorker.ts
      // enforce - but Ask itself gates only on assertAskBudget above, never
      // on that platform cap. Matches exactly how the tutor already writes
      // service='chatbot' while gating on its own CHATBOT_DAILY_TOKEN_CAP.
      try {
        const { estimateCostCents } = await import("../lib/llmPricing");
        const cents = estimateCostCents(MODELS.ask, result.inputTokens, result.outputTokens);
        await db.execute(
          (await import("drizzle-orm")).sql`
            insert into public.api_costs (user_id, service, model, tokens_in, tokens_out, est_cost_cents)
            values (${user.id}, 'ask', ${MODELS.ask}, ${result.inputTokens}, ${result.outputTokens}, ${cents})
          `,
        );
      } catch (err) {
        logger.warn({ err, userId: user.id }, "ask.run: api_costs log failed");
      }

      if (!aborted) {
        sse.send({
          type: "done",
          messageId: saved.id,
          durationMs: result.durationMs,
          stepCount: result.steps.length,
          pagesRead: result.pagesRead,
          runStatus: aborted ? "stopped" : result.runStatus,
          degradedReasons: result.degradedReasons,
          truncated: result.truncated,
        });
      }
    } catch (err) {
      logger.warn({ err, userId: user.id }, "ask.run: failed to persist assistant message");
    }
  }

  sse.close();
}
