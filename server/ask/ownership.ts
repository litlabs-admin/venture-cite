// Ask's own ownership check. Deliberately NOT requireChatbotThread - the
// independence decision (docs/ask-feature/07-integration-and-hardening.md
// §0) means Ask never reads or writes chatbot_threads. OwnershipError is a
// shared platform type (server/lib/ownership.ts belongs to neither product;
// see the isolation ESLint rule in eslint.config.js, which allows exactly
// this one import).
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import { OwnershipError } from "../lib/ownership";

export async function requireAskThread(id: string, userId: string): Promise<schema.AskThread> {
  const [row] = await db
    .select()
    .from(schema.askThreads)
    .where(and(eq(schema.askThreads.id, id), eq(schema.askThreads.userId, userId)))
    .limit(1);
  if (!row) throw new OwnershipError(404, "Thread not found");
  return row;
}
