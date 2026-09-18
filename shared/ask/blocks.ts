// Rich-block schema for Ask answers (04-implementation-plan.md §3.5).
//
// Rendered ONLY by typed React components in client/src/components/ask/ -
// never dangerouslySetInnerHTML, per AGENTS.md. Validated with Zod on both
// the server (before emitting a `block` SSE event) and the client (before
// rendering); an invalid block is dropped and reported, never rendered raw.
//
// Authorship split (04 §3.5, following from 01-trakkr-teardown.md §3.4):
// a TOOL supplies rows/values (numeric fidelity), the MODEL supplies only
// `title` (framing). This is why every block's rows/values live on a
// tool-authored payload and `title` is a separate, optional string the loop
// fills in from the model's tool-call reasoning or a template fallback.

import { z } from "zod";

export const barChartBlockSchema = z.object({
  kind: z.literal("bar_chart"),
  title: z.string().optional(),
  unit: z.string(), // required - 01 I5: never ship a chart without its caption
  rows: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
        highlight: z.boolean().optional(), // marks the user's own brand
      }),
    )
    .max(40),
});

export const tableBlockSchema = z.object({
  kind: z.literal("table"),
  title: z.string(),
  columns: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        align: z.enum(["left", "right"]).optional(),
      }),
    )
    .max(12),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).max(40),
});

export const statRowBlockSchema = z.object({
  kind: z.literal("stat_row"),
  items: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        delta: z.number().optional(),
      }),
    )
    .max(8),
});

export const askBlockSchema = z.discriminatedUnion("kind", [
  barChartBlockSchema,
  tableBlockSchema,
  statRowBlockSchema,
]);

export type AskBlock = z.infer<typeof askBlockSchema>;

export const evidenceItemSchema = z.object({
  url: z.string(),
  outlet: z.string().optional(),
  title: z.string().optional(),
  authority: z.number().optional(),
  kind: z.enum(["citation", "fetched_page"]),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

// Client-side guard: parse an unknown value as a block, returning null (never
// throwing) on failure so the caller can drop the block and keep the rest of
// the message rendering. Server-side callers use askBlockSchema.parse
// directly since they control the shape at the source.
export function safeParseAskBlock(value: unknown): AskBlock | null {
  const parsed = askBlockSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
