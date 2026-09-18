// Action-kind registry (04-implementation-plan.md §4.2, §5.3 in
// 07-integration-and-hardening.md). One entry per ACTION_KINDS value. Every
// kind MUST declare an inverse and an isReversible check - a kind with
// neither cannot be added to this file without a type error, which is the
// compiler enforcing 04 §4.2's rule instead of relying on review.
//
// validate() is where structural parameter validation happens (07 §6.1):
// every propose_action parameter must trace to a database row or the user's
// OWN message text - never to fetched page text. This is the real control
// against prompt injection; the untrusted-content delimiter in
// server/ask/prompt.ts is defence in depth only.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { TRACKED_PROMPTS_CAP } from "@shared/constants";
import type { ActionKind, ReversibilityCheck } from "@shared/ask/actions";
import { ASK_MEMORY_TYPES, askMemoryContentSchema } from "@shared/ask/memory";

export type ValidateResult =
  | { ok: true; title: string; inputEcho: string; params: Record<string, string> }
  | { ok: false; reason: string };

export type ActionKindDef = {
  kind: ActionKind;
  kindLabel: string; // "Track prompt" - matches Trakkr wording verbatim
  // Validates the model's raw tool-call input against trusted sources
  // BEFORE a card is created. brandId is from ctx, never from input.
  validate(ctx: { brandId: string; userMessage: string }, input: unknown): Promise<ValidateResult>;
  isReversible(task: schema.AgentTask): Promise<ReversibilityCheck>;
};

// Expected propose_action input for kind='track_prompt': { promptId: string }.
async function validateTrackPrompt(
  ctx: { brandId: string; userMessage: string },
  input: unknown,
): Promise<ValidateResult> {
  const promptId = typeof (input as any)?.promptId === "string" ? (input as any).promptId : null;
  if (!promptId) return { ok: false, reason: "propose_action(track_prompt) requires promptId" };

  // Structural validation: the promptId must be a real, currently-suggested
  // brand_prompts row belonging to THIS brand. Fetched page text can never
  // satisfy this - it has no way to produce a valid UUID that also passes
  // the ownership + status check below.
  const [row] = await db
    .select()
    .from(schema.brandPrompts)
    .where(eq(schema.brandPrompts.id, promptId))
    .limit(1);
  if (!row || row.brandId !== ctx.brandId) {
    return { ok: false, reason: "promptId does not belong to this brand" };
  }
  if (row.status !== "suggested") {
    return { ok: false, reason: `prompt is already '${row.status}', not a pending suggestion` };
  }

  const existing = await db
    .select({ status: schema.brandPrompts.status })
    .from(schema.brandPrompts)
    .where(eq(schema.brandPrompts.brandId, ctx.brandId));
  const activeCount = existing.filter((p) => p.status === "tracked").length;
  if (activeCount >= TRACKED_PROMPTS_CAP) {
    return {
      ok: false,
      reason: `Tracking this would exceed the ${TRACKED_PROMPTS_CAP}-prompt tracked limit`,
    };
  }

  return {
    ok: true,
    title: `Track "${row.prompt}"`,
    inputEcho: row.prompt,
    params: { promptId },
  };
}

async function validateRunCitationCheck(
  ctx: { brandId: string; userMessage: string },
  input: unknown,
): Promise<ValidateResult> {
  const rawIds = (input as any)?.promptIds;
  const promptIds = Array.isArray(rawIds) ? rawIds.filter((x) => typeof x === "string") : [];

  if (promptIds.length > 0) {
    // Every id must be a real tracked prompt on THIS brand - structural
    // validation exactly like track_prompt above.
    const rows = await db
      .select()
      .from(schema.brandPrompts)
      .where(eq(schema.brandPrompts.brandId, ctx.brandId));
    const validIds = new Set(rows.filter((r) => r.status === "tracked").map((r) => r.id));
    const invalid = promptIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return { ok: false, reason: "One or more promptIds are not tracked prompts on this brand" };
    }
  }

  return {
    ok: true,
    title:
      promptIds.length > 0
        ? `Re-check ${promptIds.length} prompt${promptIds.length === 1 ? "" : "s"}`
        : "Run a full citation check",
    inputEcho: promptIds.length > 0 ? promptIds.join(", ") : "all tracked prompts",
    params: promptIds.length > 0 ? { promptIds: promptIds.join(",") } : {},
  };
}

// Expected propose_action input for kind='remember_fact':
// { type: AskMemoryType, content: string }. Free text (07 §6.1's table: "Free
// text (title, rationale) - model-authored, rendered as text only, never
// executed") - the memory's content is never an executable parameter, so it
// needs no database trace, only shape and length validation.
async function validateRememberFact(
  _ctx: { brandId: string; userMessage: string },
  input: unknown,
): Promise<ValidateResult> {
  const rawType = (input as any)?.type;
  const type =
    typeof rawType === "string" && (ASK_MEMORY_TYPES as readonly string[]).includes(rawType)
      ? rawType
      : null;
  if (!type) {
    return { ok: false, reason: `propose_action(remember_fact) requires a valid type` };
  }
  const contentResult = askMemoryContentSchema.safeParse((input as any)?.content);
  if (!contentResult.success) {
    return { ok: false, reason: "propose_action(remember_fact) requires non-empty content" };
  }
  const content = contentResult.data;
  const truncatedTitle = content.length > 60 ? `${content.slice(0, 57)}...` : content;

  return {
    ok: true,
    title: `Remember: "${truncatedTitle}"`,
    inputEcho: content,
    params: { type, content },
  };
}

export const ACTION_KIND_DEFS: Record<ActionKind, ActionKindDef> = {
  track_prompt: {
    kind: "track_prompt",
    kindLabel: "Track prompt",
    validate: validateTrackPrompt,
    isReversible: async (task) => {
      if (task.status !== "completed") return { ok: false, reason: "Not yet completed" };
      const promptId = (task.inputData as any)?.promptId as string | undefined;
      if (!promptId) return { ok: false, reason: "No prompt reference on this task" };
      const [row] = await db
        .select()
        .from(schema.brandPrompts)
        .where(eq(schema.brandPrompts.id, promptId))
        .limit(1);
      if (!row) return { ok: false, reason: "Already archived" };
      if (row.status !== "tracked") return { ok: false, reason: "Already archived" };
      return { ok: true };
    },
  },
  queue_article: {
    kind: "queue_article",
    kindLabel: "Queue article",
    // Deferred (see docs/ask-feature/04-implementation-plan.md build notes):
    // article generation needs a fuller brief (industry/type/target
    // customers/geography/content style) than a single Ask parameter can
    // safely assemble without guessing at required fields. Rather than ship
    // a content-generation payload we are not certain is correct, this kind
    // is registered (so the type system enforces every OTHER kind has a
    // validate+isReversible pair) but always rejects at validation time.
    // Wiring it up is follow-on work, not a silent gap: propose_action
    // reports the rejection reason back to the model, which then does not
    // offer the action to the user.
    validate: async () => ({
      ok: false,
      reason: "queue_article is not available yet - not wired to the content generation pipeline",
    }),
    isReversible: async () => ({ ok: false, reason: "Not available" }),
  },
  run_citation_check: {
    kind: "run_citation_check",
    kindLabel: "Run citation check",
    validate: validateRunCitationCheck,
    isReversible: async (task) => {
      // A completed citation run cannot be meaningfully "undone" - the
      // measurement happened. The only reversible state is before it starts:
      // cancel a still-queued run. Once running/completed, undo is
      // permanently unavailable (not merely temporarily).
      if (task.status === "proposed" || task.status === "queued") {
        return { ok: true };
      }
      return { ok: false, reason: "Run has already started" };
    },
  },
  remember_fact: {
    kind: "remember_fact",
    kindLabel: "Remember",
    validate: validateRememberFact,
    isReversible: async (task) => {
      if (task.status !== "completed") return { ok: false, reason: "Not yet completed" };
      const memoryId = task.artifactId;
      if (!memoryId) return { ok: false, reason: "No memory reference on this task" };
      const [row] = await db
        .select()
        .from(schema.askMemories)
        .where(and(eq(schema.askMemories.id, memoryId), isNull(schema.askMemories.forgottenAt)))
        .limit(1);
      if (!row) return { ok: false, reason: "Already forgotten" };
      return { ok: true };
    },
  },
};
