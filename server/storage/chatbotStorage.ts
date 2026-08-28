import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { ChatbotMessage, ChatbotThread } from "@shared/schema";
import type { IStorage } from "../storage";

export const chatbotStorage = {
  async listChatbotThreads(
    userId: string,
    limit = 50,
  ): Promise<Array<ChatbotThread & { messageCount: number }>> {
    const rows = await db.execute(sql`
      select t.*, coalesce(m.cnt, 0)::int as message_count
      from public.chatbot_threads t
      left join (
        select thread_id, count(*) as cnt
        from public.chatbot_messages
        group by thread_id
      ) m on m.thread_id = t.id
      where t.user_id = ${userId} and t.archived_at is null
      order by t.updated_at desc
      limit ${limit}
    `);
    const data = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      brandId: (r.brand_id as string | null) ?? null,
      title: r.title as string,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
      archivedAt: r.archived_at ? new Date(r.archived_at as string) : null,
      messageCount: (r.message_count as number) ?? 0,
    }));
  },

  async getChatbotThread(threadId: string): Promise<ChatbotThread | undefined> {
    const [row] = await db
      .select()
      .from(schema.chatbotThreads)
      .where(eq(schema.chatbotThreads.id, threadId))
      .limit(1);
    return row;
  },

  async createChatbotThread(userId: string, brandId?: string | null): Promise<ChatbotThread> {
    const [row] = await db
      .insert(schema.chatbotThreads)
      .values({
        userId,
        brandId: brandId ?? null,
      })
      .returning();
    return row;
  },

  async archiveChatbotThread(threadId: string): Promise<void> {
    await db
      .update(schema.chatbotThreads)
      .set({ archivedAt: new Date() })
      .where(eq(schema.chatbotThreads.id, threadId));
  },

  async restoreChatbotThread(threadId: string): Promise<void> {
    await db
      .update(schema.chatbotThreads)
      .set({ archivedAt: null })
      .where(eq(schema.chatbotThreads.id, threadId));
  },

  async setChatbotThreadTitle(threadId: string, title: string): Promise<void> {
    await db
      .update(schema.chatbotThreads)
      .set({ title })
      .where(eq(schema.chatbotThreads.id, threadId));
  },

  async touchChatbotThread(threadId: string): Promise<void> {
    await db
      .update(schema.chatbotThreads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.chatbotThreads.id, threadId));
  },

  async getChatbotThreadMessages(threadId: string, limit = 200): Promise<ChatbotMessage[]> {
    return db
      .select()
      .from(schema.chatbotMessages)
      .where(eq(schema.chatbotMessages.threadId, threadId))
      .orderBy(schema.chatbotMessages.createdAt)
      .limit(limit);
  },

  async insertChatbotMessage(msg: {
    userId: string;
    threadId: string;
    brandId?: string | null;
    role: "user" | "assistant";
    content: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    model?: string | null;
  }): Promise<ChatbotMessage> {
    const [row] = await db
      .insert(schema.chatbotMessages)
      .values({
        userId: msg.userId,
        threadId: msg.threadId,
        brandId: msg.brandId ?? null,
        role: msg.role,
        content: msg.content,
        inputTokens: msg.inputTokens ?? null,
        outputTokens: msg.outputTokens ?? null,
        model: msg.model ?? null,
      })
      .returning();
    return row;
  },

  async pruneChatbotMessages(): Promise<{ deletedByAge: number; deletedByCap: number }> {
    // 30-day TTL on messages.
    const ageRes = await db.execute(sql`
      delete from public.chatbot_messages
      where created_at < now() - interval '30 days'
      returning id
    `);
    const ageR = ageRes as unknown as { rows?: unknown[] } & unknown[];
    const deletedByAge = ageR.rows?.length ?? ageR.length ?? 0;

    // Per-user soft cap of 500 messages across threads, keeping newest.
    const capRes = await db.execute(sql`
      with ranked as (
        select id, row_number() over (partition by user_id order by created_at desc) as rn
        from public.chatbot_messages
      )
      delete from public.chatbot_messages
      where id in (select id from ranked where rn > 500)
      returning id
    `);
    const capR = capRes as unknown as { rows?: unknown[] } & unknown[];
    const deletedByCap = capR.rows?.length ?? capR.length ?? 0;

    // Hard-delete threads archived more than 30 days ago.
    await db.execute(sql`
      delete from public.chatbot_threads
      where archived_at is not null and archived_at < now() - interval '30 days'
    `);

    return { deletedByAge, deletedByCap };
  },
} satisfies Partial<IStorage> & ThisType<IStorage>;
