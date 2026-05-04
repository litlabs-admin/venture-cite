import { waitUntil } from "@vercel/functions";
import { Sentry } from "../instrument";

// Sentry's transport queues events in-process and flushes them
// asynchronously. On Vercel serverless that queue is at risk: the function
// can be frozen between sending the response and the next invocation, so
// queued events are dropped on the floor and never reach Sentry.
//
// captureAndFlush schedules a flush via Vercel's `waitUntil`, which keeps
// the function alive *after* the response is sent (no added request
// latency, bounded by the function's maxDuration). Outside Vercel
// (`vercel dev`, `npm run dev`, long-running Node server), `waitUntil` is
// a shim that runs the promise in the background without blocking — so
// the helper is safe in every environment.
//
// Use this everywhere a 5xx is captured. Direct Sentry.captureException
// calls still work but lose events under serverless suspension.
export function captureAndFlush(
  err: unknown,
  ctx: Parameters<typeof Sentry.captureException>[1] = {},
): void {
  Sentry.captureException(err, ctx);
  // 2s upper bound — long enough to clear a normal queue, short enough to
  // never approach the function's max duration. .catch swallows transport
  // errors so a Sentry hiccup never surfaces as an unhandled rejection.
  waitUntil(Sentry.flush(2000).catch(() => {}));
}
