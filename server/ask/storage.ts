// Ask's own persistence layer. Mirrors server/storage/chatbotStorage.ts's
// shape - same problem, same idiom - but reads/writes exclusively
// ask_threads/ask_messages/ask_steps. Not part of the shared `storage`
// facade (server/storage.ts): Ask's persistence is intentionally its own
// module so the independence boundary (07 §0) is a file boundary, not a
// convention someone has to remember.
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { AskBlock, EvidenceItem } from "@shared/ask/blocks";

export type AskRunStatus = "ok" | "degraded" | "stopped" | "error";

export async function listAskThreads(
  userId: string,
  opts: { brandId?: string; limit?: number } = {},
): Promise<Array<schema.AskThread & { messageCount: number; pendingActionCount: number }>> {
  const limit = opts.limit ?? 50;
  // The pending-count join mirrors toActionCard's own status mapping
  // (server/ask/actions/execute.ts): 'proposed'/'queued'/'scheduled'/
  // 'in_progress' are the agent_tasks statuses that render as a "pending"
  // action card - i.e. the ones the thread-list "Waiting on you" group
  // (AskThreadList.tsx) counts as "N things to decide".
  const rows = await db.execute(sql`
    select t.*,
      coalesce(m.cnt, 0)::int as message_count,
      coalesce(p.cnt, 0)::int as pending_action_count
    from public.ask_threads t
    left join (
      select thread_id, count(*) as cnt
      from public.ask_messages
      group by thread_id
    ) m on m.thread_id = t.id
    left join (
      select ask_thread_id, count(*) as cnt
      from public.agent_tasks
      where ask_thread_id is not null
        and status in ('proposed', 'queued', 'scheduled', 'in_progress')
      group by ask_thread_id
    ) p on p.ask_thread_id = t.id
    where t.user_id = ${userId}
      and t.archived_at is null
      ${opts.brandId ? sql`and t.brand_id = ${opts.brandId}` : sql``}
    order by t.updated_at desc
    limit ${limit}
  `);
  const data = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    brandId: (r.brand_id as string | null) ?? null,
    title: r.title as string,
    temporaryInstructions: (r.temporary_instructions as string | null) ?? null,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
    archivedAt: r.archived_at ? new Date(r.archived_at as string) : null,
    messageCount: (r.message_count as number) ?? 0,
    pendingActionCount: (r.pending_action_count as number) ?? 0,
  }));
}

export async function createAskThread(
  userId: string,
  brandId: string | null,
  // "Just for one conversation" (business-context.md's Your preferences
  // tab): set once at creation, read every turn of THIS thread by
  // context.ts's assemblePersonalContextBlock, never promoted into
  // ask_memories.
  temporaryInstructions: string | null = null,
): Promise<schema.AskThread> {
  const [row] = await db
    .insert(schema.askThreads)
    .values({ userId, brandId, temporaryInstructions })
    .returning();
  return row;
}

export async function touchAskThread(threadId: string): Promise<void> {
  await db
    .update(schema.askThreads)
    .set({ updatedAt: new Date() })
    .where(eq(schema.askThreads.id, threadId));
}

export async function setAskThreadTitle(threadId: string, title: string): Promise<void> {
  await db.update(schema.askThreads).set({ title }).where(eq(schema.askThreads.id, threadId));
}

export async function archiveAskThread(threadId: string): Promise<void> {
  await db
    .update(schema.askThreads)
    .set({ archivedAt: new Date() })
    .where(eq(schema.askThreads.id, threadId));
}

export async function restoreAskThread(threadId: string): Promise<void> {
  await db
    .update(schema.askThreads)
    .set({ archivedAt: null })
    .where(eq(schema.askThreads.id, threadId));
}

export async function getAskThreadMessages(
  threadId: string,
  limit = 200,
): Promise<Array<schema.AskMessage & { steps: schema.AskStep[] }>> {
  const messages = await db
    .select()
    .from(schema.askMessages)
    .where(eq(schema.askMessages.threadId, threadId))
    .orderBy(schema.askMessages.createdAt)
    .limit(limit);
  if (messages.length === 0) return [];
  const messageIds = messages.map((m) => m.id);
  const steps = await db
    .select()
    .from(schema.askSteps)
    .where(inArray(schema.askSteps.messageId, messageIds))
    .orderBy(schema.askSteps.ordinal);
  const stepsByMessage = new Map<string, schema.AskStep[]>();
  for (const s of steps) {
    const arr = stepsByMessage.get(s.messageId) ?? [];
    arr.push(s);
    stepsByMessage.set(s.messageId, arr);
  }
  return messages.map((m) => ({ ...m, steps: stepsByMessage.get(m.id) ?? [] }));
}

export type InsertAskMessageInput = {
  threadId: string;
  userId: string;
  brandId: string | null;
  role: "user" | "assistant";
  content: string;
  blocks?: AskBlock[] | null;
  evidence?: EvidenceItem[] | null;
  suggestions?: string[] | null;
  durationMs?: number | null;
  pagesRead?: number;
  runStatus?: AskRunStatus | null;
  degradedReasons?: string[] | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  model?: string | null;
};

export async function insertAskMessage(input: InsertAskMessageInput): Promise<schema.AskMessage> {
  const [row] = await db
    .insert(schema.askMessages)
    .values({
      threadId: input.threadId,
      userId: input.userId,
      brandId: input.brandId,
      role: input.role,
      content: input.content,
      blocks: input.blocks ?? null,
      evidence: input.evidence ?? null,
      suggestions: input.suggestions ?? null,
      durationMs: input.durationMs ?? null,
      pagesRead: input.pagesRead ?? 0,
      runStatus: input.runStatus ?? null,
      degradedReasons: input.degradedReasons ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      model: input.model ?? null,
    })
    .returning();
  return row;
}

export type InsertAskStepInput = {
  messageId: string;
  ordinal: number;
  toolName: string;
  label: string;
  category?: string | null;
  summary?: string | null;
  durationMs?: number | null;
  status: "ok" | "failed";
};

export async function insertAskSteps(steps: InsertAskStepInput[]): Promise<void> {
  if (steps.length === 0) return;
  await db.insert(schema.askSteps).values(
    steps.map((s) => ({
      messageId: s.messageId,
      ordinal: s.ordinal,
      toolName: s.toolName,
      label: s.label,
      category: s.category ?? null,
      summary: s.summary ?? null,
      durationMs: s.durationMs ?? null,
      status: s.status,
    })),
  );
}

// GDPR sweep target (07 §3.3): delete every Ask row for a user. ask_steps and
// ask_messages cascade from ask_threads via ON DELETE CASCADE, so deleting
// the threads is sufficient - listed explicitly so the delete order is
// obvious to a future reader, not because the FKs require it.
export async function deleteAllAskDataForUser(userId: string): Promise<void> {
  await db.delete(schema.askThreads).where(eq(schema.askThreads.userId, userId));
}
