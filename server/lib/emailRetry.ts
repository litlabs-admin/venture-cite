// Email retry helper (Wave 3.6).
//
// Wraps the Resend send call with bounded retries + exponential backoff.
// On final failure, the caller is expected to write a row to
// public.email_failures so we can inspect / requeue / surface in admin.
//
// Why retry only some failures? Resend can throw for genuinely
// recipient-side errors (invalid address, bounced before) where retrying
// is pointless and harmful (each retry adds bounce stats to our domain
// reputation). The classifier below distinguishes "transient" (5xx,
// timeouts, network) from "permanent" (4xx with a clear "address" hint).

const DEFAULT_DELAYS_MS = [1_000, 2_000, 4_000];

export interface RetryAttemptResult<T> {
  ok: true;
  value: T;
  attempts: number;
}

export interface RetryFailureResult {
  ok: false;
  error: unknown;
  attempts: number;
}

export type RetryResult<T> = RetryAttemptResult<T> | RetryFailureResult;

// True when an error is worth retrying. False = permanent — give up
// immediately (e.g. invalid address) so we don't keep hitting the API
// for a recipient that will never accept mail.
export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const message = err instanceof Error ? err.message : String(err);
  // Resend SDK includes the HTTP status in the error message text. We
  // also need to handle bare network failures (no status).
  const m = message.toLowerCase();
  if (/\b(invalid|malformed|forbidden|unsubscribed|complained)\b/.test(m)) {
    return false;
  }
  if (/\b(401|403|404|410|422)\b/.test(m)) {
    return false;
  }
  // Default: treat as transient. Better to over-retry a real fail than
  // give up on a genuine network blip.
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run `fn` with retries. delays defaults to 1s/2s/4s; pass a custom
// array to override (length = number of post-failure waits, so 3 entries
// means up to 4 attempts total).
export async function withEmailRetry<T>(
  fn: () => Promise<T>,
  delays: number[] = DEFAULT_DELAYS_MS,
): Promise<RetryResult<T>> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const value = await fn();
      return { ok: true, value, attempts: attempt + 1 };
    } catch (err) {
      lastError = err;
      if (!isTransientError(err)) {
        return { ok: false, error: err, attempts: attempt + 1 };
      }
      if (attempt === delays.length) break;
      await sleep(delays[attempt]);
    }
  }
  return { ok: false, error: lastError, attempts: delays.length + 1 };
}
