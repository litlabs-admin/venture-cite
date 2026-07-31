// Phase 2 Task 3 - bridges TanStack Start's server routes into the
// existing Express app, unmodified (server/app.ts is untouched).
//
// srvx's `toFetchHandler` (Node adapter) turns the Express app - a
// `(req, res) => void` Node handler - into a `(Request) => Promise<Response>`
// Fetch-style handler. Confirmed in the Phase 2 spike (see
// scratchpad/p2/api-unknowns-resolved.md, Q2) that raw bodies survive this
// path unmolested: `express.raw()` still sees a real Node `Buffer`, which
// the Stripe/Resend webhook handlers in server/app.ts require for signature
// verification.
//
// `prepareApp()` is what actually calls `registerRoutes(app)` - without
// awaiting it, only the handlers registered inline in server/app.ts (the
// webhooks and /health) would exist; everything mounted via registerRoutes
// (auth, brands, billing, etc.) would 404. This is now the ONLY path into
// the Express app on both hosts - the separate server/vercelEntry.ts that
// used to serve Vercel was deleted once Nitro's vercel preset took over.
import { toFetchHandler } from "srvx/node";
import { app, prepareApp } from "../../server/app";

const fetchHandler = toFetchHandler(app);

// Cached across warm invocations/requests: prepareApp() is internally
// idempotent (returns the same in-flight/resolved promise), so capturing it
// once here just avoids an extra await indirection per request.
const ready = prepareApp();

// Conditional requests (If-None-Match / If-Modified-Since) never reach here:
// server/nitroConditionalRequests.ts strips them in Nitro's `request` hook,
// before routing. That is deliberate and load-bearing - a 304 cannot be
// constructed as a Response with a body, so any conditional request through
// this bridge became a 500. See that file for the full reasoning and for why
// the fix does not belong in this function.
export async function handleExpressRequest(request: Request): Promise<Response> {
  await ready;
  return fetchHandler(request);
}
