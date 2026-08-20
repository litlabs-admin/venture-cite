import { sql } from "drizzle-orm";
import { db } from "../db";
import { apiCosts } from "@shared/schema";
import type { OutboxCommandPayload, OutboxProviderResult } from "@shared/outbox";
import { estimateCostCents } from "../lib/llmPricing";
import type { EnqueueOutboxCommand, OutboxRepository } from "./outboxRepository";
import { createOutboxRepository } from "./outboxRepository";
import type { OutboxCommandHandler } from "./outboxWorker";

type ContentCostPayload = Extract<OutboxCommandPayload, { kind: "content_cost.record" }>;
type Database = Pick<typeof db, "transaction">;

export const CONTENT_COST_MAX_ATTEMPTS = 25;

export type ContentCostCommandInput = Omit<ContentCostPayload, "kind"> & {
  userId: string;
  brandId: string;
};

export function contentCostIdempotencyKey(
  input: Pick<ContentCostPayload, "contentJobId" | "providerResponseId">,
): string {
  return `content-cost:${input.contentJobId}:${input.providerResponseId}`;
}

export function enqueueContentCostCommand(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: ContentCostCommandInput,
  repository: Pick<OutboxRepository, "enqueueInTransaction"> = createOutboxRepository(),
): ReturnType<OutboxRepository["enqueueInTransaction"]> {
  const payload = {
    kind: "content_cost.record",
    contentJobId: input.contentJobId,
    providerResponseId: input.providerResponseId,
    service: input.service,
    model: input.model,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
  } satisfies ContentCostPayload;
  const command: EnqueueOutboxCommand = {
    kind: payload.kind,
    idempotencyKey: contentCostIdempotencyKey(payload),
    aggregateType: "content_generation_job",
    aggregateId: payload.contentJobId,
    userId: input.userId,
    brandId: input.brandId,
    payload,
    maxAttempts: CONTENT_COST_MAX_ATTEMPTS,
    providerName: "internal",
    providerOperation: "record_content_cost",
  };
  return repository.enqueueInTransaction(transaction, command);
}

export function createContentCostOutboxHandler(database: Database = db): OutboxCommandHandler {
  return async ({ command, idempotencyKey, signal }): Promise<OutboxProviderResult> => {
    if (signal.aborted) {
      throw new DOMException("The content cost command was aborted", "AbortError");
    }
    if (command.kind !== "content_cost.record") {
      throw { kind: "permanent", code: "invalid_command" };
    }
    const payload = command.payload;
    if (payload.kind !== "content_cost.record") {
      throw { kind: "permanent", code: "invalid_command" };
    }
    if (contentCostIdempotencyKey(payload) !== idempotencyKey) {
      throw { kind: "permanent", code: "invalid_command" };
    }
    const userId = command.userId;
    if (!userId) {
      throw { kind: "permanent", code: "invalid_command" };
    }
    await database.transaction(async (transaction) => {
      await transaction.execute(sql`set local role venturecite_outbox_worker`);
      await transaction.execute(
        sql`select set_config('venturecite.outbox_user_id', ${userId}, true)`,
      );
      await transaction.execute(sql`set local statement_timeout = '5s'`);
      await transaction
        .insert(apiCosts)
        .values({
          userId,
          service: payload.service,
          model: payload.model ?? undefined,
          tokensIn: payload.tokensIn,
          tokensOut: payload.tokensOut,
          estCostCents: estimateCostCents(payload.model, payload.tokensIn, payload.tokensOut),
          idempotencyKey,
        })
        .onConflictDoNothing({ target: apiCosts.idempotencyKey });
    });
    return { providerReference: payload.providerResponseId };
  };
}
