import { z } from "zod";

const identifier = z.string().trim().min(1).max(255);
const providerReference = z.string().trim().min(1).max(255);
const nonNegativeInteger = z.number().int().nonnegative();

export const outboxCommandPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("stripe.create_customer"),
    customerRequestId: identifier,
  }),
  z.object({
    kind: z.literal("resend.send_email"),
    emailIntentId: identifier,
  }),
  z.object({
    kind: z.literal("buffer.create_post"),
    publicationId: identifier,
    profileId: identifier,
  }),
  z.object({
    kind: z.literal("openai.create_response"),
    contentJobId: identifier,
    inputReference: identifier,
  }),
  z.object({
    kind: z.literal("openai.start_llm_job"),
    llmJobId: identifier,
  }),
  z.object({
    kind: z.literal("content_cost.record"),
    contentJobId: identifier,
    providerResponseId: providerReference,
    service: identifier,
    model: identifier.nullable(),
    tokensIn: nonNegativeInteger,
    tokensOut: nonNegativeInteger,
  }),
  // Ask action-card kinds (docs/ask-feature/04-implementation-plan.md §4).
  // agent_tasks is a shared platform table; these outbox kinds are the
  // "queue" half of "Add to queue" - approving a card enqueues one of
  // these, it never executes inline (01-trakkr-teardown.md R1).
  z.object({
    kind: z.literal("ask.track_prompt"),
    taskId: identifier, // agent_tasks.id - the proposal being approved
    promptId: identifier, // brand_prompts.id, status='suggested', validated at propose time
  }),
  z.object({
    kind: z.literal("ask.untrack_prompt"),
    taskId: identifier,
    promptId: identifier,
  }),
  z.object({
    kind: z.literal("ask.run_citation_check"),
    taskId: identifier,
    brandId: identifier,
    userId: identifier,
    promptIds: z.array(identifier).optional(),
  }),
  z.object({
    kind: z.literal("ask.cancel_citation_check"),
    taskId: identifier,
  }),
  // Memory action-card kinds (business-context.md's Memory tab, decision 5).
  // A learned memory is proposed as a card and only written to ask_memories
  // once approved - the same "propose -> queue -> execute" shape as every
  // other Ask action, not a special case.
  z.object({
    kind: z.literal("ask.remember_fact"),
    taskId: identifier,
  }),
  z.object({
    kind: z.literal("ask.forget_fact"),
    taskId: identifier,
  }),
]);

export type OutboxCommandPayload = z.infer<typeof outboxCommandPayloadSchema>;
export type OutboxCommandKind = OutboxCommandPayload["kind"];

export const outboxStatusSchema = z.enum([
  "pending",
  "processing",
  "succeeded",
  "dead_letter",
  "cancelled",
]);
export type OutboxStatus = z.infer<typeof outboxStatusSchema>;

export const outboxProviderResultSchema = z
  .object({
    providerReference: providerReference,
  })
  .strict();
export type OutboxProviderResult = z.infer<typeof outboxProviderResultSchema>;

export const outboxErrorCodeSchema = z.enum([
  "unknown_error",
  "attempts_exhausted",
  "provider_timeout",
  "provider_unavailable",
  "invalid_command",
  "recipient_rejected",
  "provider_rejected",
  "cancelled",
]);
export type OutboxErrorCode = z.infer<typeof outboxErrorCodeSchema>;

export function parseOutboxCommandPayload(value: unknown): OutboxCommandPayload {
  return outboxCommandPayloadSchema.parse(value);
}
