// Private, per-user answer preferences (business-context.md's "Your
// preferences" tab). Keyed by userId alone - never brand-scoped, matching
// Trakkr's own "Only you" framing (01-trakkr-teardown.md §2.8).
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { AskPreferencesView, SaveAskPreferencesInput } from "@shared/ask/preferences";

export async function readPreferences(userId: string): Promise<AskPreferencesView> {
  const [row] = await db
    .select()
    .from(schema.askUserPreferences)
    .where(eq(schema.askUserPreferences.userId, userId))
    .limit(1);
  return {
    tone: (row?.tone as AskPreferencesView["tone"]) ?? null,
    language: row?.language ?? null,
    answerLength: (row?.answerLength as AskPreferencesView["answerLength"]) ?? null,
  };
}

export async function savePreferences(
  userId: string,
  input: SaveAskPreferencesInput,
): Promise<AskPreferencesView> {
  await db
    .insert(schema.askUserPreferences)
    .values({
      userId,
      tone: input.tone,
      language: input.language,
      answerLength: input.answerLength,
    })
    .onConflictDoUpdate({
      target: schema.askUserPreferences.userId,
      set: {
        tone: input.tone,
        language: input.language,
        answerLength: input.answerLength,
        updatedAt: new Date(),
      },
    });
  return readPreferences(userId);
}
