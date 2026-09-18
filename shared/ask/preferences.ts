// Your preferences (business-context.md's "Your preferences" tab). Trakkr
// names exactly three fields - tone, language, answer length
// (01-trakkr-teardown.md §2.8) - with no options ever shown (the tab reads
// "not available for this account" in every capture). The options below are
// this product's own, chosen because they cover the common cases without
// turning a "how should the Agent write" control into an open text field
// nobody will fill in consistently.
import { z } from "zod";

export const ASK_PREFERENCE_TONES = ["direct", "friendly", "formal"] as const;
export type AskPreferenceTone = (typeof ASK_PREFERENCE_TONES)[number];
export const ASK_PREFERENCE_TONE_LABELS: Record<AskPreferenceTone, string> = {
  direct: "Direct",
  friendly: "Friendly",
  formal: "Formal",
};

export const ASK_ANSWER_LENGTHS = ["short", "balanced", "detailed"] as const;
export type AskAnswerLength = (typeof ASK_ANSWER_LENGTHS)[number];
export const ASK_ANSWER_LENGTH_LABELS: Record<AskAnswerLength, string> = {
  short: "Short",
  balanced: "Balanced",
  detailed: "Detailed",
};

// A short, common list rather than every ISO language - this is "answer in
// X", not a locale setting. "" (Same as I write in) is the default: most
// threads should get no injected language instruction at all.
export const ASK_PREFERENCE_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Dutch",
  "Japanese",
  "Mandarin Chinese",
  "Hindi",
] as const;

export const saveAskPreferencesSchema = z.object({
  tone: z.enum(ASK_PREFERENCE_TONES).nullable(),
  language: z.string().trim().max(60).nullable(),
  answerLength: z.enum(ASK_ANSWER_LENGTHS).nullable(),
});
export type SaveAskPreferencesInput = z.infer<typeof saveAskPreferencesSchema>;

export type AskPreferencesView = {
  tone: AskPreferenceTone | null;
  language: string | null;
  answerLength: AskAnswerLength | null;
};
