// Shared brand memory persistence (business-context.md Memory tab; the
// "What I know" drawer's Memory section). Every read filters out
// forgotten_at rows - "forget" is a soft delete (01-trakkr-teardown.md
// §2.7's "ask it to forget" reads as an instruction, not a row delete), so
// a forgotten memory is recoverable in the database even though nothing in
// the product surfaces that yet.
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { AskMemoryType, AskMemoryView } from "@shared/ask/memory";

function toView(row: schema.AskMemoryRow): AskMemoryView {
  return {
    id: row.id,
    type: row.type as AskMemoryType,
    content: row.content,
    origin: row.origin as AskMemoryView["origin"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Total active-memory count for the drawer's "Remembered · N" heading - the
// list call below is capped to 5 for the drawer, so the heading's count
// needs its own unlimited query rather than `results.length`.
export async function countMemories(brandId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.askMemories)
    .where(and(eq(schema.askMemories.brandId, brandId), isNull(schema.askMemories.forgottenAt)));
  return row?.value ?? 0;
}

export async function listMemories(brandId: string, limit?: number): Promise<AskMemoryView[]> {
  const rows = await db
    .select()
    .from(schema.askMemories)
    .where(and(eq(schema.askMemories.brandId, brandId), isNull(schema.askMemories.forgottenAt)))
    .orderBy(desc(schema.askMemories.createdAt))
    .limit(limit ?? 500);
  return rows.map(toView);
}

export async function createMemory(input: {
  brandId: string;
  type: AskMemoryType;
  content: string;
  origin: "manual" | "learned";
  createdBy: string | null;
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
}): Promise<AskMemoryView> {
  const [row] = await db
    .insert(schema.askMemories)
    .values({
      brandId: input.brandId,
      type: input.type,
      content: input.content,
      origin: input.origin,
      createdBy: input.createdBy,
      sourceThreadId: input.sourceThreadId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
    })
    .returning();
  return toView(row);
}

export class MemoryNotFoundError extends Error {}

async function requireOwnedMemory(id: string, brandId: string): Promise<schema.AskMemoryRow> {
  const [row] = await db
    .select()
    .from(schema.askMemories)
    .where(
      and(
        eq(schema.askMemories.id, id),
        eq(schema.askMemories.brandId, brandId),
        isNull(schema.askMemories.forgottenAt),
      ),
    )
    .limit(1);
  if (!row) throw new MemoryNotFoundError("Memory not found");
  return row;
}

export async function updateMemory(
  id: string,
  brandId: string,
  patch: { type?: AskMemoryType; content?: string },
): Promise<AskMemoryView> {
  await requireOwnedMemory(id, brandId);
  const [row] = await db
    .update(schema.askMemories)
    .set({
      ...(patch.type ? { type: patch.type } : {}),
      ...(patch.content ? { content: patch.content } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.askMemories.id, id))
    .returning();
  return toView(row);
}

// Soft delete. Idempotent - forgetting an already-forgotten memory (e.g. a
// retried undo, see outboxAdapter.ts's ask.forget_fact handler) is a no-op,
// not an error, matching every other Ask undo executor's contract
// (07-integration-and-hardening.md §2).
export async function forgetMemory(id: string, brandId: string): Promise<void> {
  await db
    .update(schema.askMemories)
    .set({ forgottenAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.askMemories.id, id),
        eq(schema.askMemories.brandId, brandId),
        isNull(schema.askMemories.forgottenAt),
      ),
    );
}

// Un-forget - the inverse of forgetMemory, used only by the remember_fact
// action card's OWN undo path never needing this (forgetting IS its undo);
// kept for symmetry/tests. Not currently called from a route.
export async function restoreMemory(id: string, brandId: string): Promise<void> {
  await db
    .update(schema.askMemories)
    .set({ forgottenAt: null, updatedAt: new Date() })
    .where(and(eq(schema.askMemories.id, id), eq(schema.askMemories.brandId, brandId)));
}

// Context-assembly layer (server/ask/context.ts) - active memories only,
// oldest-priority-neutral (no ranking yet; every active memory is shown,
// capped so one brand with many memories can't blow the prompt budget).
export async function listActiveMemoriesForContext(
  brandId: string,
  limit = 30,
): Promise<AskMemoryView[]> {
  return listMemories(brandId, limit);
}
