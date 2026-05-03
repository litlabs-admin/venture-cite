// Vercel function entry — single function handles all /api/* routes plus
// /health (per the rewrites in vercel.json). Falls back to the same
// Express app the local dev / Render server uses, so behavior is
// identical except for the boot side-effects (which Vercel handles via
// the daily cron orchestrator instead of in-process schedulers).

import type { IncomingMessage, ServerResponse } from "http";
import { app, prepareApp } from "../server/app";

// Cache the readiness promise across warm invocations on the same
// lambda. prepareApp is idempotent internally (returns the same Promise
// once started) but capturing it here is one less await on every hot
// request.
const ready = prepareApp();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await ready;
  // Express's app function signature (req, res, next?) is compatible
  // with Vercel's Node handler signature.
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
