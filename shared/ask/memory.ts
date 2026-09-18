// Memory types (business-context.md Memory tab, screenshot: the "Type"
// dropdown - Business context, Constraint, Audience, Point of difference,
// Brand fact, Topic, verbatim and in that order). Shared between the
// server (validation, prompt rendering) and the client (the type select,
// the row's type pill, per-type placeholder copy).
import { z } from "zod";

export const ASK_MEMORY_TYPES = [
  "business_context",
  "constraint",
  "audience",
  "point_of_difference",
  "brand_fact",
  "topic",
] as const;
export type AskMemoryType = (typeof ASK_MEMORY_TYPES)[number];

export const ASK_MEMORY_TYPE_LABELS: Record<AskMemoryType, string> = {
  business_context: "Business context",
  constraint: "Constraint",
  audience: "Audience",
  point_of_difference: "Point of difference",
  brand_fact: "Brand fact",
  topic: "Topic",
};

// One example per type, matching the screenshot's placeholder register
// ("A useful fact the Agent should know about this business.") but tailored
// so the box hints at what belongs in THAT type before anything is typed.
export const ASK_MEMORY_TYPE_PLACEHOLDERS: Record<AskMemoryType, string> = {
  business_context: "A useful fact the Agent should know about this business.",
  constraint: 'A limit the Agent should always respect, e.g. "No paid placements."',
  audience: 'Who this applies to, e.g. "Enterprise security buyers, not SMB."',
  point_of_difference: 'What sets this brand apart, e.g. "Only agency with in-house data science."',
  brand_fact: 'A fact worth remembering, e.g. "Founded 2019, HQ in Austin."',
  topic: 'A subject to track, e.g. "Always mention our SOC 2 certification."',
};

export const ASK_MEMORY_ORIGINS = ["manual", "learned"] as const;
export type AskMemoryOrigin = (typeof ASK_MEMORY_ORIGINS)[number];

export const askMemoryContentSchema = z.string().trim().min(1).max(600);

export const createAskMemorySchema = z.object({
  brandId: z.string().min(1),
  type: z.enum(ASK_MEMORY_TYPES),
  content: askMemoryContentSchema,
});

export const updateAskMemorySchema = z.object({
  type: z.enum(ASK_MEMORY_TYPES).optional(),
  content: askMemoryContentSchema.optional(),
});

export type AskMemoryView = {
  id: string;
  type: AskMemoryType;
  content: string;
  origin: AskMemoryOrigin;
  createdAt: string;
  updatedAt: string;
};
