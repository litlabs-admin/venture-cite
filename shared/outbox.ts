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
