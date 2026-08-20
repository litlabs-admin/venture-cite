import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseTextConfig,
} from "openai/resources/responses/responses";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { OutboxProviderResult } from "@shared/outbox";
import type { OutboxCommandHandler } from "./outboxWorker";
import { attachAiLogger } from "../lib/aiLogger";
import { logger } from "../lib/logger";
import { LLM_CALL_TIMEOUT_MS } from "../lib/factAgent/v2/vercelBudget";

const responseFormatSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text") }).strict(),
  z.object({ type: z.literal("json_object") }).strict(),
  z
    .object({
      type: z.literal("json_schema"),
      json_schema: z
        .object({
          name: z.string().min(1).max(64),
          strict: z.boolean().optional(),
          schema: z.record(z.string(), z.unknown()),
        })
        .strict(),
    })
    .strict(),
]);

export const llmJobProviderRequestSchema = z
  .object({
    model: z.string().trim().min(1).max(255),
    instructions: z.string().nullable(),
    input: z.string(),
    responseFormat: responseFormatSchema.nullable(),
  })
  .strict();

const providerResponseSchema = z
  .object({
    id: z.string().trim().min(1).max(255),
  })
  .passthrough();

type Database = Pick<typeof db, "transaction">;
type OpenAiClient = Pick<OpenAI, "responses">;
type LlmJobProviderRequest = z.infer<typeof llmJobProviderRequestSchema>;
export function openAiLlmJobIdempotencyKey(llmJobId: string): string {
  return `openai-start-llm-job:${llmJobId}`;
}

export function createOpenAiLlmJobHandler(
  database: Database = db,
  client: OpenAiClient = createClient(),
): OutboxCommandHandler {
  return async ({ command, idempotencyKey, signal }): Promise<OutboxProviderResult> => {
    if (signal.aborted) {
      throw { kind: "permanent", code: "cancelled" };
    }
    if (command.kind !== "openai.start_llm_job") {
      throw { kind: "permanent", code: "invalid_command" };
    }
    const payload = command.payload;
    if (payload.kind !== "openai.start_llm_job") {
      throw { kind: "permanent", code: "invalid_command" };
    }
    if (openAiLlmJobIdempotencyKey(payload.llmJobId) !== idempotencyKey) {
      throw { kind: "permanent", code: "invalid_command" };
    }

    const current = await loadLlmJob(database, payload.llmJobId);
    if (!current) throw { kind: "permanent", code: "invalid_command" };
    if (current.responseId) return { providerReference: current.responseId };
    if (current.status !== "pending") {
      if (
        current.status === "cancelled" ||
        current.status === "failed" ||
        current.status === "succeeded"
      ) {
        throw { kind: "permanent", code: "cancelled" };
      }
      throw { kind: "permanent", code: "invalid_command" };
    }

    const parsedRequest = llmJobProviderRequestSchema.safeParse(current.providerRequest);
    if (!parsedRequest.success) {
      await failPendingLlmJob(
        database,
        payload.llmJobId,
        "provider_rejected",
        "The stored provider request is invalid",
      );
      throw { kind: "permanent", code: "provider_rejected" };
    }
    const request = parsedRequest.data;
    let response: Response;
    try {
      response = await client.responses.create(createResponseRequest(request), {
        idempotencyKey,
        signal,
      });
    } catch (error) {
      const failure = classifyProviderError(error);
      if (failure.kind === "permanent" || command.attemptCount >= command.maxAttempts) {
        await failPendingLlmJob(
          database,
          payload.llmJobId,
          failure.code,
          providerFailureMessage(failure.code),
        );
      }
      throw failure;
    }
    const providerResponse = providerResponseSchema.parse(response);
    const responseId = providerResponse.id;
    const linked = await linkResponse(database, payload.llmJobId, responseId);
    if (linked === "linked" || linked === "already_linked") {
      return { providerReference: responseId };
    }

    try {
      await client.responses.cancel(responseId);
    } catch (error) {
      logger.warn(
        { err: error, responseId, llmJobId: payload.llmJobId },
        "llm job response cleanup failed",
      );
    }
    if (linked === "cancelled") throw { kind: "permanent", code: "cancelled" };
    throw { kind: "transient", code: "unknown_error" };
  };
}

async function failPendingLlmJob(
  database: Database,
  llmJobId: string,
  errorKind: "provider_rejected" | "provider_unavailable" | "provider_timeout",
  errorMessage: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`set local role venturecite_outbox_worker`);
    await transaction.execute(sql`set local statement_timeout = '5s'`);
    await transaction
      .update(schema.llmJobs)
      .set({ status: "failed", errorKind, errorMessage, completedAt: new Date() })
      .where(and(eq(schema.llmJobs.id, llmJobId), eq(schema.llmJobs.status, "pending")));
  });
}

async function loadLlmJob(database: Database, llmJobId: string) {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`set local role venturecite_outbox_worker`);
    await transaction.execute(sql`set local statement_timeout = '5s'`);
    const rows = await transaction
      .select({
        status: schema.llmJobs.status,
        responseId: schema.llmJobs.responseId,
        providerRequest: schema.llmJobs.providerRequest,
      })
      .from(schema.llmJobs)
      .where(eq(schema.llmJobs.id, llmJobId))
      .limit(1);
    return rows[0] ?? null;
  });
}

type LinkResult = "linked" | "already_linked" | "cancelled" | "lost";

async function linkResponse(
  database: Database,
  llmJobId: string,
  responseId: string,
): Promise<LinkResult> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`set local role venturecite_outbox_worker`);
    await transaction.execute(sql`set local statement_timeout = '5s'`);
    const linked = await transaction
      .update(schema.llmJobs)
      .set({ responseId, status: "running", startedAt: new Date() })
      .where(
        and(
          eq(schema.llmJobs.id, llmJobId),
          eq(schema.llmJobs.status, "pending"),
          isNull(schema.llmJobs.responseId),
        ),
      )
      .returning({ id: schema.llmJobs.id });
    if (linked.length > 0) return "linked";

    const rows = await transaction
      .select({ status: schema.llmJobs.status, responseId: schema.llmJobs.responseId })
      .from(schema.llmJobs)
      .where(eq(schema.llmJobs.id, llmJobId))
      .limit(1);
    const row = rows[0];
    if (row?.responseId === responseId) return "already_linked";
    if (row?.status === "cancelled" || row?.status === "failed" || row?.status === "succeeded") {
      return "cancelled";
    }
    return "lost";
  });
}

function createResponseRequest(request: LlmJobProviderRequest): ResponseCreateParamsNonStreaming {
  return {
    model: request.model,
    instructions: request.instructions,
    input: request.input,
    background: true,
    store: true,
    ...(request.responseFormat
      ? { text: { format: toResponseFormat(request.responseFormat) } }
      : {}),
  };
}

function toResponseFormat(
  format: NonNullable<LlmJobProviderRequest["responseFormat"]>,
): NonNullable<ResponseTextConfig["format"]> {
  if (format.type === "json_schema") {
    return {
      type: "json_schema",
      name: format.json_schema.name,
      strict: format.json_schema.strict ?? true,
      schema: format.json_schema.schema,
    };
  }
  return { type: format.type };
}

function classifyProviderError(error: unknown): {
  kind: "permanent" | "transient";
  code: "provider_rejected" | "provider_unavailable" | "provider_timeout";
} {
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown; code?: unknown; name?: unknown };
    if (candidate.status === 400 || candidate.status === 401 || candidate.status === 403) {
      return { kind: "permanent", code: "provider_rejected" };
    }
    if (
      candidate.name === "AbortError" ||
      candidate.name === "TimeoutError" ||
      candidate.code === "ETIMEDOUT"
    ) {
      return { kind: "transient", code: "provider_timeout" };
    }
    if (typeof candidate.status === "number" && candidate.status >= 500) {
      return { kind: "transient", code: "provider_unavailable" };
    }
  }
  return { kind: "transient", code: "provider_unavailable" };
}

function providerFailureMessage(
  code: "provider_rejected" | "provider_unavailable" | "provider_timeout",
): string {
  if (code === "provider_rejected") return "The provider rejected the request";
  if (code === "provider_timeout") return "The provider request timed out";
  return "The provider is unavailable";
}

function createClient(): OpenAI {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: LLM_CALL_TIMEOUT_MS,
    maxRetries: 1,
  });
  attachAiLogger(client);
  return client;
}
