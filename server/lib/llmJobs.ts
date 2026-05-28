// Generic LLM-job substrate for Vercel-Hobby-safe one-shot LLM work.
//
// Why this exists
// --------------
// One-shot LLM endpoints — keyword discovery, FAQ generation, hallucination
// detection, prompt generation, suggestion generation — historically ran
// INLINE inside the request handler. On Vercel Hobby (10s function ceiling,
// ~6.3s effective LLM budget) any prompt that legitimately needs >6s gets
// aborted mid-call and the user sees a 504. The work is genuinely lost.
//
// This module replaces that with the canonical Vercel pattern (already used
// by contentGenerationWorker.ts): OpenAI Responses API in background mode.
// The kick-off call returns immediately with a response_id; the LLM run
// happens on OpenAI's infrastructure, decoupled from our function timeout.
// The client polls a fast retrieve endpoint until status='completed', at
// which point a kind-specific finalize handler parses the output and
// persists the product-side rows.
//
// Architecture
// ------------
//                                                ┌─────────────────────┐
//                                                │ openai.responses    │
//                                                │ /v1/responses       │
//                                                │ (background: true)  │
//                                                └─────────────────────┘
//                                                          ▲
//   POST /api/keyword-research/discover                    │
//          │                                               │ (1) create
//          ▼                                               │
//   ┌─────────────────────┐    enqueueLlmJob()             │
//   │ route.handler       │ ────────────────────────────► ─┘
//   │ - validate          │                                 returns response.id
//   │ - permission check  │                                 ────────────────►
//   └─────────────────────┘                                 ┌─────────────────────┐
//          │ returns                                        │ llm_jobs row        │
//          ▼ { jobId, status: 'running' }                   │ status='running'    │
//   ┌─────────────────────┐                                 │ response_id=...     │
//   │ client              │                                 └─────────────────────┘
//   │ shows spinner       │
//   │ polls every 1.5s    │
//   └─────────────────────┘
//          │
//          ▼  GET /api/llm-jobs/:id
//   ┌─────────────────────┐    pollLlmJob()
//   │ route.handler       │ ────────────────────────────►   openai.responses.retrieve()
//   │ - own-row gate      │                                 ┌─────────────────────┐
//   │ - finalize on done  │                                 │ status='completed'? │
//   └─────────────────────┘                                 └─────────────────────┘
//          │                                                          │
//          ▼ returns                                                  ▼ kind-handler.finalize()
//   { status: 'succeeded', result: [...] }                  ┌─────────────────────┐
//                                                            │ persist + return   │
//                                                            └─────────────────────┘
//
// What survives a closed browser
// -------------------------------
// Cron drain step (added to /api/cron/daily-orchestrator) picks up any
// `running` row whose client never polled, retrieves it, and finalizes. The
// product-side rows land in the brand's account; on next visit the user sees
// them as if they polled.
//
// Why not waitUntil()
// -------------------
// Vercel's waitUntil() extends the function lifetime up to maxDuration. On
// Hobby that's still 10s. It does NOT give us minutes of free background
// work. OpenAI's Responses background mode does — the work runs on their
// servers, we just kick off and retrieve.
//
// OpenRouter (non-GPT) gap
// ------------------------
// OpenRouter doesn't expose an equivalent background mode. Routes that use
// OpenRouter (Claude / Gemini / Perplexity / DeepSeek for citations,
// optionally for listicle scanner) stay synchronous and must fit in the
// LLM_CALL_TIMEOUT_MS budget. For complex multi-step OpenRouter work, the
// existing /advance polling pattern (citation checker, fact-scrape SSE
// slices) is the right answer.

import OpenAI from "openai";
import { eq, and, lt, inArray, desc } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { LlmJob } from "@shared/schema";
import { attachAiLogger } from "./aiLogger";
import { logger } from "./logger";
import { LLM_CALL_TIMEOUT_MS } from "./factAgent/v2/vercelBudget";
import { captureAndFlush } from "./sentryReport";

// Standalone OpenAI client — kept separate from routesShared.ts because
// the route layer pulls in express + ownership + rate limiters we don't
// need here. The retrieve calls are fast (<1s) so a tight timeout is OK.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Used by responses.retrieve() polls, which are fast HTTP calls.
  // create() with background:true also returns instantly so the same
  // budget covers it. Tier-aware to keep us inside the function ceiling.
  timeout: LLM_CALL_TIMEOUT_MS,
  maxRetries: 1,
});
attachAiLogger(openai);

// -----------------------------------------------------------------------
// Kind registry — each route owns its finalize handler and registers it
// at app startup. The poll endpoint dispatches by kind.
// -----------------------------------------------------------------------

export interface FinalizeContext<P = Record<string, unknown>> {
  /** Original request payload that went into enqueueLlmJob. */
  payload: P;
  /** Raw model output as a string. For json_object / json_schema this is
   *  a JSON string; for plain text it's the text. */
  outputText: string;
  /** Pre-parsed JSON if the response_format requested it. Null on parse
   *  failure (the handler can decide whether to fall back to outputText). */
  structuredOutput: unknown;
  /** Token usage from the response, if available. */
  usage?: { inputTokens: number; outputTokens: number };
  /** Who initiated the job. NULL = system / cron-spawned. */
  userId: string | null;
  brandId: string | null;
}

export interface LlmJobHandler<P = Record<string, unknown>, R = unknown> {
  /** Stable identifier used by the kind column. */
  kind: string;
  /** Called once OpenAI returns status='completed'. Should:
   *    1. Validate the structured output (Zod, manual checks, etc.).
   *    2. Persist any product-side rows (keywords table, faqs table, etc.).
   *    3. Return the lean result body the client wants to render.
   *  Throw to mark the job failed with error_kind='parse_error'. */
  finalize(ctx: FinalizeContext<P>): Promise<R>;
}

const HANDLERS: Map<string, LlmJobHandler> = new Map();

export function registerLlmJobHandler<P, R>(handler: LlmJobHandler<P, R>): void {
  HANDLERS.set(handler.kind, handler as LlmJobHandler);
}

/** Test helper — clear the registry. Production code never calls this. */
export function _resetLlmJobHandlersForTests(): void {
  HANDLERS.clear();
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

export interface ResponseFormat {
  type: "json_object" | "json_schema" | "text";
  json_schema?: {
    name: string;
    strict?: boolean;
    schema: Record<string, unknown>;
  };
}

export interface EnqueueParams<P = Record<string, unknown>> {
  /** Stable kind id — must match a registered handler. */
  kind: string;
  /** Original request payload. Persisted so the cron drain can finalize
   *  the job even when the original handler context is gone. */
  payload: P;
  brandId?: string | null;
  userId?: string | null;
  // OpenAI Responses API params:
  /** GPT model name. Non-GPT models go through OpenRouter which doesn't
   *  support background mode and shouldn't use this helper. */
  model: string;
  /** System message. Optional. */
  instructions?: string;
  /** User message. */
  input: string;
  /** Response format. Default: text. For structured output prefer
   *  json_schema with strict=true. */
  responseFormat?: ResponseFormat;
  /** Override expires_at relative to now (default 24h). */
  expiresInMs?: number;
}

export interface EnqueueResult {
  jobId: string;
  status: "running";
}

export async function enqueueLlmJob<P>(params: EnqueueParams<P>): Promise<EnqueueResult> {
  if (!HANDLERS.has(params.kind)) {
    throw new Error(
      `enqueueLlmJob: no handler registered for kind=${params.kind}. ` +
        `Did the route module that owns this kind get imported at app startup?`,
    );
  }

  // Insert pending row first so we can pair the OpenAI response_id with
  // a known row id. If the create() throws, we still have the row to
  // mark failed.
  const inserted = await db
    .insert(schema.llmJobs)
    .values({
      kind: params.kind,
      status: "pending",
      payload: params.payload as never,
      brandId: params.brandId ?? null,
      userId: params.userId ?? null,
    })
    .returning({ id: schema.llmJobs.id });
  const jobId = inserted[0].id;

  try {
    // OpenAI Responses API in background mode. response.id is the handle
    // we use for retrieve(). store=true is REQUIRED — without it the
    // response is dropped after the create() call returns.
    const response = await openai.responses.create({
      model: params.model,
      instructions: params.instructions,
      input: params.input,
      background: true,
      store: true,
      // Pass-through for structured output. The OpenAI SDK types
      // response_format strictly; we cast because we narrow at our API
      // boundary above.
      ...(params.responseFormat
        ? { text: { format: toResponsesFormat(params.responseFormat) } }
        : {}),
    } as never);

    await db
      .update(schema.llmJobs)
      .set({
        status: "running",
        responseId: response.id,
        startedAt: new Date(),
        ...(params.expiresInMs ? { expiresAt: new Date(Date.now() + params.expiresInMs) } : {}),
      })
      .where(eq(schema.llmJobs.id, jobId));

    return { jobId, status: "running" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, kind: params.kind, jobId }, "enqueueLlmJob: kickoff failed");
    captureAndFlush(err, { tags: { source: "llmJobs.enqueue", kind: params.kind } });
    await db
      .update(schema.llmJobs)
      .set({
        status: "failed",
        errorKind: classifyError(err),
        errorMessage: message.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(schema.llmJobs.id, jobId));
    // Re-throw so the route handler returns 502 to the client — they
    // never saw the jobId yet.
    throw err;
  }
}

export interface PollResult {
  jobId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  result?: unknown;
  errorKind?: string;
  errorMessage?: string;
  kind: string;
  createdAt: Date;
}

export async function pollLlmJob(jobId: string): Promise<PollResult | null> {
  const rows = await db.select().from(schema.llmJobs).where(eq(schema.llmJobs.id, jobId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  // Terminal states are cached — no point hitting OpenAI again.
  if (row.status === "succeeded" || row.status === "failed" || row.status === "cancelled") {
    return rowToPollResult(row);
  }

  // No response_id yet → kickoff hasn't completed. Caller should poll again.
  if (!row.responseId) {
    return rowToPollResult(row);
  }

  // Retrieve from OpenAI. retrieve() is a fast HTTP call (<1s typical)
  // so it fits inside the per-tier LLM_CALL_TIMEOUT_MS comfortably.
  try {
    const response = await openai.responses.retrieve(row.responseId);
    return await applyResponseToRow(row, response);
  } catch (err) {
    // Don't mark the row failed on a transient retrieve error — the
    // job may still be running on OpenAI's side. Just return the
    // current "running" state so the client polls again.
    logger.warn(
      { err, jobId, responseId: row.responseId },
      "pollLlmJob: retrieve failed (transient, client should retry)",
    );
    return rowToPollResult(row);
  }
}

/** Cron entry point — sweep jobs whose clients haven't polled. */
export async function drainPendingLlmJobs(
  deadlineMs: number,
  batchSize = 20,
): Promise<{ attempted: number; finalized: number; stillRunning: number; failed: number }> {
  // Oldest first so the user who's been waiting longest gets unstuck
  // first. Bounded by batchSize per cron tick.
  const running = await db
    .select()
    .from(schema.llmJobs)
    .where(inArray(schema.llmJobs.status, ["pending", "running"]))
    .orderBy(schema.llmJobs.createdAt)
    .limit(batchSize);

  const counters = { attempted: 0, finalized: 0, stillRunning: 0, failed: 0 };
  for (const row of running) {
    if (Date.now() >= deadlineMs - 500) break;
    counters.attempted++;
    if (!row.responseId) {
      // Kickoff failed silently and the row is orphaned. Mark failed
      // so it doesn't keep getting picked up.
      await db
        .update(schema.llmJobs)
        .set({
          status: "failed",
          errorKind: "api_error",
          errorMessage: "kickoff produced no response_id (orphaned row)",
          completedAt: new Date(),
        })
        .where(eq(schema.llmJobs.id, row.id));
      counters.failed++;
      continue;
    }
    try {
      const response = await openai.responses.retrieve(row.responseId);
      const result = await applyResponseToRow(row, response);
      if (result.status === "succeeded") counters.finalized++;
      else if (result.status === "failed") counters.failed++;
      else counters.stillRunning++;
    } catch (err) {
      logger.warn({ err, jobId: row.id }, "drainPendingLlmJobs: row drain failed");
      counters.stillRunning++;
    }
  }
  return counters;
}

/** Cron prune step — delete jobs past their expires_at. */
export async function pruneExpiredLlmJobs(): Promise<number> {
  const result = await db.delete(schema.llmJobs).where(lt(schema.llmJobs.expiresAt, new Date()));
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

/** UI helper — list a user's recent jobs (Diagnose → Jobs tab, etc.). */
export async function listRecentLlmJobsForUser(userId: string, limit = 20): Promise<LlmJob[]> {
  return await db
    .select()
    .from(schema.llmJobs)
    .where(eq(schema.llmJobs.userId, userId))
    .orderBy(desc(schema.llmJobs.createdAt))
    .limit(limit);
}

// -----------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------

function rowToPollResult(row: LlmJob): PollResult {
  return {
    jobId: row.id,
    status: row.status as PollResult["status"],
    result: row.result ?? undefined,
    errorKind: row.errorKind ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    kind: row.kind,
    createdAt: row.createdAt,
  };
}

interface NormalizedResponse {
  status: string;
  output_text?: string;
  output?: unknown;
  usage?: unknown;
  error?: { message?: string };
}

/** Apply an OpenAI response object to a job row. Idempotent — repeated
 *  applies on a 'succeeded' row return the same cached result. */
async function applyResponseToRow(
  row: LlmJob,
  responseRaw: {
    status?: string;
    output_text?: string;
    output?: unknown;
    usage?: unknown;
    error?: { message?: string } | null;
  },
): Promise<PollResult> {
  // The OpenAI SDK types `status` as optional. Normalize so the rest
  // of this function can treat it as required.
  const response: NormalizedResponse = {
    status: responseRaw.status ?? "unknown",
    output_text: responseRaw.output_text,
    output: responseRaw.output,
    usage: responseRaw.usage,
    error: responseRaw.error ?? undefined,
  };
  // Re-check the row in case a concurrent poll already finalized it.
  if (row.status === "succeeded" || row.status === "failed" || row.status === "cancelled") {
    return rowToPollResult(row);
  }

  if (response.status === "in_progress" || response.status === "queued") {
    // Still running on OpenAI's side. Don't change our row.
    return rowToPollResult({ ...row, status: "running" });
  }

  if (response.status === "completed") {
    const handler = HANDLERS.get(row.kind);
    if (!handler) {
      // No handler → leave the row as failed so it doesn't keep getting
      // re-polled. Operator must register the handler module.
      await db
        .update(schema.llmJobs)
        .set({
          status: "failed",
          errorKind: "parse_error",
          errorMessage: `no handler registered for kind=${row.kind}`,
          completedAt: new Date(),
        })
        .where(eq(schema.llmJobs.id, row.id));
      return rowToPollResult({
        ...row,
        status: "failed",
        errorKind: "parse_error",
        errorMessage: `no handler registered for kind=${row.kind}`,
      });
    }
    const outputText = extractOutputText(response);
    let structuredOutput: unknown = null;
    try {
      structuredOutput = outputText ? JSON.parse(outputText) : null;
    } catch {
      // Plain text — leave structuredOutput=null.
    }
    const usage = extractUsage(response);

    try {
      const result = await handler.finalize({
        payload: (row.payload ?? {}) as never,
        outputText,
        structuredOutput,
        usage: usage ?? undefined,
        userId: row.userId,
        brandId: row.brandId,
      });
      await db
        .update(schema.llmJobs)
        .set({
          status: "succeeded",
          result: (result ?? null) as never,
          completedAt: new Date(),
        })
        .where(and(eq(schema.llmJobs.id, row.id), eq(schema.llmJobs.status, "running")));
      return {
        jobId: row.id,
        status: "succeeded",
        result: result ?? undefined,
        kind: row.kind,
        createdAt: row.createdAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, jobId: row.id, kind: row.kind },
        "applyResponseToRow: handler.finalize threw",
      );
      captureAndFlush(err, { tags: { source: "llmJobs.finalize", kind: row.kind } });
      await db
        .update(schema.llmJobs)
        .set({
          status: "failed",
          errorKind: "parse_error",
          errorMessage: message.slice(0, 500),
          completedAt: new Date(),
        })
        .where(eq(schema.llmJobs.id, row.id));
      return {
        jobId: row.id,
        status: "failed",
        errorKind: "parse_error",
        errorMessage: message,
        kind: row.kind,
        createdAt: row.createdAt,
      };
    }
  }

  if (
    response.status === "failed" ||
    response.status === "cancelled" ||
    response.status === "incomplete"
  ) {
    const errorMessage = response.error?.message ?? `OpenAI returned status=${response.status}`;
    const errorKind = response.status === "cancelled" ? "cancelled" : "api_error";
    await db
      .update(schema.llmJobs)
      .set({
        status: response.status === "cancelled" ? "cancelled" : "failed",
        errorKind,
        errorMessage: errorMessage.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(schema.llmJobs.id, row.id));
    return {
      jobId: row.id,
      status: response.status === "cancelled" ? "cancelled" : "failed",
      errorKind,
      errorMessage,
      kind: row.kind,
      createdAt: row.createdAt,
    };
  }

  // Unknown status — leave the row alone, client polls again.
  return rowToPollResult(row);
}

function extractOutputText(response: { output_text?: string; output?: unknown }): string {
  if (typeof response.output_text === "string") return response.output_text;
  if (Array.isArray(response.output)) {
    for (const block of response.output as Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>) {
      if (block.type === "message" && Array.isArray(block.content)) {
        for (const item of block.content) {
          if (item.type === "output_text" && typeof item.text === "string") {
            return item.text;
          }
        }
      }
    }
  }
  return "";
}

function extractUsage(response: {
  usage?: unknown;
}): { inputTokens: number; outputTokens: number } | null {
  const u = response.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  if (!u) return null;
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
  };
}

function classifyError(err: unknown): string {
  const e = err as { status?: number; code?: string; name?: string } | undefined;
  if (e?.status === 429) return "rate_limited";
  if (e?.status && e.status >= 500 && e.status < 600) return "api_error";
  if (e?.name === "AbortError" || e?.name === "TimeoutError" || e?.code === "ETIMEDOUT") {
    return "timeout";
  }
  return "api_error";
}

/** Translate our public ResponseFormat into the OpenAI Responses API's
 *  text.format shape. The Responses API names things slightly
 *  differently than chat.completions.create. */
function toResponsesFormat(rf: ResponseFormat): Record<string, unknown> {
  if (rf.type === "json_schema" && rf.json_schema) {
    return {
      type: "json_schema",
      name: rf.json_schema.name,
      strict: rf.json_schema.strict ?? true,
      schema: rf.json_schema.schema,
    };
  }
  if (rf.type === "json_object") {
    return { type: "json_object" };
  }
  return { type: "text" };
}
