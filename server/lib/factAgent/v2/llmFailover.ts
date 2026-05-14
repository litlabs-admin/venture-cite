// Runtime provider failover for the static-page LLM call.
// Iterates providers in order, retrying on transient errors (5xx, 429,
// timeouts) but NOT on caller errors (4xx other than 429). Each call is
// concurrency-gated via the Postgres token bucket so the global RPM cap
// is respected.
import { withSlot, type LlmProvider } from "../../llmConcurrency";

export interface ProviderClient {
  name: LlmProvider;
  /** Plain-text call: takes a prompt (string or {system, user}), returns
   *  the model's raw response body. JSON-mode response_format is the
   *  caller's responsibility — we just shuttle bytes. */
  call(prompt: string | { system: string; user: string }): Promise<string>;
}

function isTransient(err: unknown): boolean {
  const e = err as { status?: number; code?: string; name?: string };
  if (!e) return false;
  if (typeof e.status === "number") {
    if (e.status === 429) return true;
    if (e.status >= 500 && e.status < 600) return true;
    return false; // 4xx is a caller error — don't fail over
  }
  // Network errors typically lack a status code
  return true;
}

export async function callWithFailover(
  providers: ProviderClient[],
  prompt: string | { system: string; user: string },
  runId: string | undefined,
): Promise<string> {
  if (providers.length === 0) throw new Error("callWithFailover: no providers");
  let lastErr: unknown;
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      return await withSlot(p.name, runId, () => p.call(prompt));
    } catch (err) {
      lastErr = err;
      const transient = isTransient(err);
      const hasMore = i < providers.length - 1;
      if (!transient || !hasMore) throw err;
    }
  }
  throw lastErr;
}
