// Generic OpenAI background jobs.
//
// The enqueue transaction stores the job and its outbox command together.
// The internal outbox drain starts the provider response with a stable key.
// Client polling retrieves and finalizes the linked provider response.
// The cron drain finalizes jobs when the client closes.

import OpenAI from "openai";
import { eq, and, lt, desc, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { LlmJob } from "@shared/schema";
import { attachAiLogger } from "./aiLogger";
import { logger } from "./logger";
import { LLM_CALL_TIMEOUT_MS } from "./factAgent/v2/vercelBudget";
import { captureAndFlush } from "./sentryReport";
import { waitUntil } from "@vercel/functions";
import { runContentCostOutboxDrain } from "../outbox/contentCostOutboxDrain";

// Standalone OpenAI client - kept separate from routesShared.ts because
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
// Kind registry - each route owns its finalize handler and registers it
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

/** Test helper - clear the registry. Production code never calls this. */
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
  /** Stable kind id - must match a registered handler. */
  kind: string;
  /** Original request payload. Persisted so the cron drain can finalize
   *  the job even when the original handler context is gone. */
  payload: P;
  brandId: string;
  userId: string;
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
  status: "pending";
}

export interface AiEnqueueErrorResponse {
  status: number;
  body: { success: false; error: string };
}

/**
 * Classifies an error thrown by enqueueLlmJob() into the user-facing HTTP
 * response. The keyword-discovery and FAQ-generation routes
 * (server/routes/content.ts, server/routes/contentTypes.ts) each catch
 * immediately after calling enqueueLlmJob() and had their own copy of this
 * 429/401 mapping - byte-identical for those two cases, so it lives here
 * once. Returns null when no known classification applies; the caller
 * should fall back to its own generic error response (and may check
 * additional error shapes, like an AbortError/TimeoutError name, before
 * falling back - see server/routes/content.ts).
 */
export function classifyAiEnqueueError(err: unknown): AiEnqueueErrorResponse | null {
  const e = err as { status?: number } | undefined;
  if (e?.status === 429) {
    return {
      status: 429,
      body: {
        success: false,
        error: "AI is busy right now. Please wait a moment and try again.",
      },
    };
  }
  if (e?.status === 401) {
    return {
      status: 503,
      body: { success: false, error: "AI service is misconfigured. Contact support." },
    };
  }
  return null;
}

export async function enqueueLlmJob<P>(params: EnqueueParams<P>): Promise<EnqueueResult> {
  if (!HANDLERS.has(params.kind)) {
    throw new Error(
      `enqueueLlmJob: no handler registered for kind=${params.kind}. ` +
        `Did the route module that owns this kind get imported at app startup?`,
    );
  }

  const inserted = await db.transaction(async (transaction) => {
    const rows = await transaction
      .insert(schema.llmJobs)
      .values({
        kind: params.kind,
        status: "pending",
        payload: params.payload as never,
        providerRequest: {
          model: params.model,
          instructions: params.instructions ?? null,
          input: params.input,
          responseFormat: params.responseFormat ?? null,
        } as never,
        brandId: params.brandId,
        userId: params.userId,
        ...(params.expiresInMs ? { expiresAt: new Date(Date.now() + params.expiresInMs) } : {}),
      })
      .returning({ id: schema.llmJobs.id });
    const jobId = rows[0]?.id;
    if (!jobId) throw new Error("LLM job insert did not return an id");

    await transaction.execute(sql`set local role venturecite_content_request`);
    await transaction.execute(
      sql`select set_config('venturecite.user_id', ${params.userId}, true)`,
    );
    await transaction.execute(sql`select private.enqueue_openai_start_llm_job(${jobId})`);
    return jobId;
  });

  scheduleImmediateOutboxDrain(inserted);

  return { jobId: inserted, status: "pending" };
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

  // Terminal states are cached - no point hitting OpenAI again.
  if (row.status === "succeeded" || row.status === "failed" || row.status === "cancelled") {
    return rowToPollResult(row);
  }

  // No response_id yet → kickoff hasn't completed. Caller should poll again.
  if (!row.responseId) {
    scheduleImmediateOutboxDrain(row.id);
    return rowToPollResult(row);
  }

  // Retrieve from OpenAI. retrieve() is a fast HTTP call (<1s typical)
  // so it fits inside the per-tier LLM_CALL_TIMEOUT_MS comfortably.
  try {
    const response = await openai.responses.retrieve(row.responseId);
    return await applyResponseToRow(row, response);
  } catch (err) {
    // Don't mark the row failed on a transient retrieve error - the
    // job may still be running on OpenAI's side. Just return the
    // current "running" state so the client polls again.
    logger.warn(
      { err, jobId, responseId: row.responseId },
      "pollLlmJob: retrieve failed (transient, client should retry)",
    );
    return rowToPollResult(row);
  }
}

function scheduleImmediateOutboxDrain(jobId: string): void {
  const immediateDrain = runContentCostOutboxDrain({
    maxCommands: 25,
    deadlineMs: Date.now() + 20_000,
    leaseSeconds: 60,
  }).catch((error) => {
    logger.error({ err: error, jobId }, "LLM job outbox kickoff failed");
    captureAndFlush(error, { tags: { source: "llmJobs.outboxKickoff" } });
  });
  waitUntil(immediateDrain);
}

/** Cron entry point - sweep jobs whose clients haven't polled. */
export async function drainPendingLlmJobs(
  deadlineMs: number,
  batchSize = 20,
): Promise<{ attempted: number; finalized: number; stillRunning: number; failed: number }> {
  // Oldest first so the user who's been waiting longest gets unstuck
  // first. Bounded by batchSize per cron tick.
  const running = await db
    .select()
    .from(schema.llmJobs)
    .where(eq(schema.llmJobs.status, "running"))
    .orderBy(schema.llmJobs.createdAt)
    .limit(batchSize);

  const counters = { attempted: 0, finalized: 0, stillRunning: 0, failed: 0 };
  for (const row of running) {
    if (Date.now() >= deadlineMs - 500) break;
    counters.attempted++;
    if (!row.responseId) continue;
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

/** Cron prune step - delete jobs past their expires_at. */
export async function pruneExpiredLlmJobs(): Promise<number> {
  const result = await db.delete(schema.llmJobs).where(lt(schema.llmJobs.expiresAt, new Date()));
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

/** UI helper - list a user's recent jobs (Diagnose → Jobs tab, etc.). */
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

/** Apply an OpenAI response object to a job row. Idempotent - repeated
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
      // Plain text - leave structuredOutput=null.
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

  // Unknown status - leave the row alone, client polls again.
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
