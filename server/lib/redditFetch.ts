import { logger } from "./logger";

// ─── Reddit fetch ────────────────────────────────────────────────────────────
// Unauthenticated only. This file replaces redditOAuth.ts, whose token
// exchange, credential check and authenticated fetch were removed along with
// the scanner's OAuth path — the mention scanner is unauthenticated by design
// and carries no Reddit credentials.
//
// Reddit aggressively rate-limits and blocks datacenter IPs on these public
// endpoints, so reliability is poor by construction: callers are expected to
// handle 403/429 by falling back to the RSS endpoint, and to report a source
// FAILURE rather than an empty result when both refuse.

export const REDDIT_USER_AGENT = "web:io.litlabs.venturecite:v1.0";

// Every outbound Reddit fetch is wrapped in an AbortController timeout so a
// hung upstream can't burn the entire serverless function budget. Mirrors the
// AbortController + setTimeout + clearTimeout pattern in server/lib/ssrf.ts.
const FETCH_TIMEOUT_MS = 10_000;

/** Unauthenticated fetch against www.reddit.com. */
export async function redditPublicFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.reddit.com${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        ...(init?.headers ?? {}),
        "User-Agent": REDDIT_USER_AGENT,
      },
    });
    if (res.status === 403 || res.status === 429) {
      logger.info({ path, status: res.status }, "reddit.public.blocked");
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
