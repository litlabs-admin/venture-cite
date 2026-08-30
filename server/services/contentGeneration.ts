// Content generation business logic extracted from server/routes/content.ts
// (phase B7-13). Pure functions: explicit parameters in, plain data out or
// throws. No Express types, no req/res.

import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import { runArticleSlice } from "../contentGenerationWorker";
import { waitUntil } from "@vercel/functions";
import { openai, MAX_CONTENT_LENGTH } from "../lib/routesShared";
import { captureAndFlush } from "../lib/sentryReport";
import { liveOpenAIEnabled } from "../lib/localFlowSafety";
import type {
  ContentRequestArticle,
  ContentRequestArticleRepository,
} from "../data/contentRequestArticleRepository";
import type { ContentRequestRevisionRepository } from "../data/contentRequestRevisionRepository";

// The previous time-driven "phase label"
// (Brainstorming → Drafting → Writing → Polishing) was theatre - the
// Responses API background mode doesn't expose intra-run progress, so
// those labels were uncorrelated with what the model was actually doing.
// We now show honest elapsed seconds only, plus a Cancel button.
export function computeJobStatePayload(job: {
  status: string;
  errorMessage: string | null;
  startedAt: Date | null;
}): {
  status: string;
  done: boolean;
  errorMessage: string | null;
  elapsedSeconds?: number;
} {
  const done = job.status !== "pending" && job.status !== "running";
  if (done) {
    return {
      status: job.status,
      done: true,
      errorMessage: job.errorMessage ?? null,
    };
  }
  const startMs = job.startedAt ? new Date(job.startedAt).getTime() : Date.now();
  const elapsedMs = Math.max(0, Date.now() - startMs);
  return {
    status: job.status,
    done: false,
    errorMessage: job.errorMessage ?? null,
    elapsedSeconds: Math.round(elapsedMs / 1000),
  };
}

export function contentLengthForResponse(article: { content: string | null } | undefined): number {
  return article?.content?.length ?? 0;
}

// Server-side drive: progress the job without requiring an open
// browser tab. Additive - the client /advance loop still runs as
// the fast path when a tab is open (Vercel Hobby has no frequent
// cron); the per-job slice lock (claimContentJobForSlice) makes
// client + server coexist (only one slice at a time). Whatever
// doesn't finish in this function's window is resumed by the
// daily cron's drainPendingContentJobs - same backstop as today,
// but a tab is no longer REQUIRED for progress.
export function driveArticleGenerationInBackground(jobId: string): void {
  const driveDeadlineMs = Date.now() + 50_000;
  waitUntil(
    (async () => {
      try {
        while (Date.now() < driveDeadlineMs) {
          const claimed = await storage.claimContentJobForSlice(jobId, 12);
          if (claimed) {
            const sliceDeadlineMs = Math.min(driveDeadlineMs, Date.now() + 10_000);
            const outcome = await runArticleSlice(jobId, sliceDeadlineMs, claimed.advanceToken);
            if (outcome.done) break;
          }
          // The OpenAI Responses run is background:true - it needs
          // wall-clock time on OpenAI's side; don't hot-poll.
          await new Promise((r) => setTimeout(r, 4_000));
        }
      } catch (err) {
        captureAndFlush(err, { tags: { source: "content.generate.serverDrive" } });
      }
    })(),
  );
}

export type AdvanceContentJobSliceResult =
  | { kind: "busy"; status: string }
  | {
      kind: "advanced";
      outcome: Awaited<ReturnType<typeof runArticleSlice>>;
      updatedArticle: ContentRequestArticle | undefined;
    };

// Per-job slice lock: prevents two browser tabs from concurrently
// streaming into the same buffer. Slice budget = 9s (deadline 8s +
// 1s safety so the lock window outlasts the slice itself).
export async function advanceContentJobSlice(
  job: { id: string; articleId: string | null; status: string },
  articles: ContentRequestArticleRepository,
): Promise<AdvanceContentJobSliceResult> {
  const claimed = await storage.claimContentJobForSlice(job.id, 9);
  if (!claimed) {
    // Another caller is mid-slice; tell client to keep polling /state.
    return { kind: "busy", status: job.status };
  }

  const deadlineMs = Date.now() + 8000;
  const outcome = await runArticleSlice(job.id, deadlineMs, claimed.advanceToken);
  const updatedArticle = job.articleId ? await articles.get(job.articleId) : undefined;
  return { kind: "advanced", outcome, updatedArticle };
}

export type AutoImproveResult =
  | { kind: "no_content" }
  | { kind: "too_long" }
  | { kind: "unavailable" }
  | { kind: "empty_response" }
  | { kind: "not_found" }
  | { kind: "version_conflict"; current: ContentRequestArticle }
  | { kind: "success"; article: ContentRequestArticle; improvedContent: string };

// ── Auto-Improve ────────────────────────────────────────────────────────────
//
// One rewrite pass. Creates an immutable revision row from the current
// content (so it's preserved for diff/restore), then writes the rewritten
// content back to the article and bumps version. The legacy 3-pass loop +
// human-score gating is gone.
export async function autoImproveArticle(params: {
  article: ContentRequestArticle;
  instructions: string | null;
  expectedVersion: number | undefined;
  articles: ContentRequestArticleRepository;
  revisions: ContentRequestRevisionRepository;
}): Promise<AutoImproveResult> {
  const { article, instructions, expectedVersion, articles, revisions } = params;

  if (!article.content) {
    return { kind: "no_content" };
  }
  if ((article.content || "").length > MAX_CONTENT_LENGTH) {
    return { kind: "too_long" };
  }
  if (!liveOpenAIEnabled(process.env)) {
    return { kind: "unavailable" };
  }

  // Snapshot the current content as a revision before we overwrite it.
  // The new content will get its own revision after the rewrite succeeds.
  // Doing it in this order means even if the LLM call fails, the revision
  // history is untouched (no orphan "rewrite I'm about to do" rows).
  const beforeContent = article.content;

  const systemPrompt = `You are an expert editor. Rewrite the user's article to be clearer, more authoritative, and more readable while preserving all factual content, structure, and markdown formatting. Return ONLY the rewritten markdown - no preamble, no commentary.${instructions ? `\n\nFollow these specific instructions: ${instructions}` : ""}`;

  const response = await openai.chat.completions.create({
    model: MODELS.contentHumanize,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: beforeContent },
    ],
    max_tokens: 4500,
    temperature: 0.7,
  });
  const improved = response.choices[0].message.content?.trim();
  if (!improved) {
    return { kind: "empty_response" };
  }

  // Optimistic-lock: if the caller passed expectedVersion, only write
  // when the row hasn't moved. Returns 409 otherwise.
  let updated;
  if (expectedVersion !== undefined) {
    updated = await articles.updateIfVersion(article.id, expectedVersion, {
      content: improved,
    });
    if (!updated) {
      const current = await articles.get(article.id);
      if (!current) {
        return { kind: "not_found" };
      }
      return { kind: "version_conflict", current };
    }
  } else {
    updated = await articles.update(article.id, { content: improved });
    if (!updated) {
      return { kind: "not_found" };
    }
  }

  // Persist both the before-snapshot (so users can revert) and the new
  // revision (so the diff viewer has both sides indexed).
  await revisions.create({
    articleId: article.id,
    content: beforeContent,
    source: "manual_edit",
  });
  await revisions.create({
    articleId: article.id,
    content: improved,
    source: "auto_improve",
  });

  return { kind: "success", article: updated, improvedContent: improved };
}
