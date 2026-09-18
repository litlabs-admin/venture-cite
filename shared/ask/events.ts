// SSE event protocol for an Ask run (04-implementation-plan.md §3.4).
//
// Extends the tutor's three-event shape (delta/error/done in
// server/routes/assistant.ts) with step, block, evidence, action-card and
// suggestion events. This schema is COPIED conceptually from the tutor's
// stream, not imported - server/ask/stream.ts and client/src/hooks/
// useAskRun.ts each duplicate the small amount of transport code that
// touches it, per the independence decision (07 §0).
//
// Zod-parsed on the client so a protocol drift between server and client
// fails loudly instead of silently rendering nothing.

import { z } from "zod";
import { askBlockSchema, evidenceItemSchema } from "./blocks";
import { askActionCardSchema } from "./actions";

export const askEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run_started"),
    runId: z.string(),
    startedAt: z.string(),
  }),
  z.object({
    type: z.literal("status"),
    verb: z.string(), // "Writing" - matches Trakkr's two-tone label (01 §2.3)
    object: z.string(), // "final answer"
  }),
  z.object({
    type: z.literal("step_started"),
    stepId: z.string(),
    ordinal: z.number(),
    label: z.string(),
    category: z.string(),
  }),
  z.object({
    type: z.literal("step_result"),
    stepId: z.string(),
    summary: z.string(),
    durationMs: z.number(),
    status: z.enum(["ok", "failed"]),
  }),
  z.object({
    type: z.literal("block"),
    block: askBlockSchema,
  }),
  z.object({
    type: z.literal("evidence"),
    items: z.array(evidenceItemSchema),
  }),
  z.object({
    type: z.literal("action_card"),
    card: askActionCardSchema,
  }),
  z.object({
    type: z.literal("text_delta"),
    content: z.string(),
  }),
  // Real streaming (server/ask/modelClient.ts, server/ask/loop.ts) means the
  // loop learns a turn's final kind only once its stream ends - so if the
  // model emitted lead-in text before deciding to call a tool, that text
  // already reached the client before the loop knew to discard it. This
  // tells the client to clear the message's accumulated text and carry on;
  // the step trace that follows explains what happened instead.
  z.object({
    type: z.literal("text_reset"),
  }),
  z.object({
    type: z.literal("suggestions"),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal("done"),
    messageId: z.string(),
    durationMs: z.number(),
    stepCount: z.number(),
    pagesRead: z.number(),
    runStatus: z.enum(["ok", "degraded", "stopped", "error"]),
    degradedReasons: z.array(z.string()),
    truncated: z.boolean(),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);

export type AskEvent = z.infer<typeof askEventSchema>;

export function safeParseAskEvent(value: unknown): AskEvent | null {
  const parsed = askEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
