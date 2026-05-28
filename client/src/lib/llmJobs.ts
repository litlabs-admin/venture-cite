// Client-side polling helper for background LLM jobs.
//
// Server pattern: mutation routes (POST /api/keyword-research/discover,
// POST /api/faqs/generate, etc.) enqueue an OpenAI Responses background
// run and return 202 + { jobId }. The client then polls
// GET /api/llm-jobs/:jobId until status='succeeded' or 'failed'.
//
// This helper hides the polling loop behind a single async function so
// React mutations can stay as one-liner mutationFn/onSuccess pairs.

import { apiRequest } from "./queryClient";

export interface LlmJobPollResult {
  jobId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  result?: unknown;
  errorKind?: string;
  errorMessage?: string;
  kind: string;
  createdAt: string;
}

export interface PollOptions {
  /** Initial wait before the first poll (default 800ms — let the
   *  OpenAI run get past kickoff). */
  initialDelayMs?: number;
  /** Min poll interval — increases with each consecutive 'running'
   *  response, capped at maxPollIntervalMs. */
  minPollIntervalMs?: number;
  /** Max poll interval to avoid hammering the server when the job
   *  takes a long time. Default 4s. */
  maxPollIntervalMs?: number;
  /** Hard timeout in ms. Throws after this. Default 120s (twice the
   *  Pro function limit). */
  timeoutMs?: number;
  /** Optional cancellation: if this returns true, polling stops and
   *  rejects with `cancelled`. */
  shouldCancel?: () => boolean;
  /** Optional progress callback for the loading UI to react to each
   *  poll. Called with the latest poll result, including intermediate
   *  'running' states. */
  onTick?: (result: LlmJobPollResult) => void;
}

/** Poll an LLM job until it terminates. Resolves with the final result
 *  (status='succeeded' includes the parsed product-side result). Throws
 *  on status='failed' / 'cancelled' / network errors / hard timeout. */
export async function pollLlmJob(jobId: string, opts: PollOptions = {}): Promise<LlmJobPollResult> {
  const initialDelay = opts.initialDelayMs ?? 800;
  const minInterval = opts.minPollIntervalMs ?? 1_200;
  const maxInterval = opts.maxPollIntervalMs ?? 4_000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  // Initial pause: most jobs need 1-3s on OpenAI, so a delay before the
  // first poll avoids two pointless retrieves.
  await sleep(initialDelay);

  let interval = minInterval;
  for (;;) {
    if (opts.shouldCancel?.()) {
      const err = new Error("Polling cancelled by caller");
      err.name = "AbortError";
      throw err;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `LLM job ${jobId} did not complete within ${Math.round(timeoutMs / 1000)}s. ` +
          `The cron will finish it in the background — refresh later to see the result.`,
      );
    }

    let poll: LlmJobPollResult & { success: boolean; error?: string };
    try {
      const response = await apiRequest("GET", `/api/llm-jobs/${jobId}`);
      poll = await response.json();
    } catch (err) {
      // Transient network failures shouldn't abort — back off and retry.
      await sleep(Math.min(maxInterval, interval * 1.5));
      interval = Math.min(maxInterval, interval * 1.5);
      continue;
    }

    if (!poll.success) {
      throw new Error(poll.error || "Polling endpoint returned failure.");
    }

    opts.onTick?.(poll);

    if (poll.status === "succeeded") return poll;
    if (poll.status === "failed" || poll.status === "cancelled") {
      const err = new Error(
        poll.errorMessage ||
          (poll.status === "cancelled" ? "Job was cancelled." : "AI job failed."),
      );
      (err as Error & { errorKind?: string }).errorKind = poll.errorKind;
      throw err;
    }

    // pending | running — wait and retry. Linear back-off keeps the
    // first few polls snappy while easing pressure on long jobs.
    await sleep(interval);
    interval = Math.min(maxInterval, interval + 400);
  }
}

/** Convenience for kick-off-then-poll mutations. Hides the two-step
 *  pattern behind a single Promise that resolves with the final result. */
export async function runLlmJob<TPayload, TResult>(
  endpoint: string,
  body: TPayload,
  opts?: PollOptions,
): Promise<TResult> {
  const kickoff = await apiRequest("POST", endpoint, body);
  const kickoffJson = (await kickoff.json()) as {
    success: boolean;
    jobId?: string;
    data?: TResult;
    error?: string;
    message?: string;
    // Inline (Pro-tier path) shape: { success, data, count }
    count?: number;
  };
  if (!kickoffJson.success) {
    throw new Error(kickoffJson.error || "Failed to start job");
  }
  if (!kickoffJson.jobId) {
    // Backward-compat: server returned the inline result instead of a
    // job handle. Caller's onSuccess sees the same shape either way.
    return kickoffJson as unknown as TResult;
  }
  const poll = await pollLlmJob(kickoffJson.jobId, opts);
  return poll.result as TResult;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
