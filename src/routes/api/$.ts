// Phase 2 Task 3 — forwards every /api/* request into the existing Express
// app (server/app.ts), unmodified. A splat/catch-all server route: file
// named `$.ts` inside routes/api/ generates route id `/api/$`, matching
// `/api/*` for any depth of sub-path (confirmed live in the Phase 2 spike,
// scratchpad/p2/api-unknowns-resolved.md Q1/Q2).
//
// /webhooks/* and /health are NOT covered by this route — see
// src/routes/webhooks/$.ts and src/routes/health.ts. A splat route only
// matches within its own directory's path prefix, so three separate
// prefixes need three separate route files; see task-3-report.md for the
// full reasoning (mirrors vercel.json's three distinct rewrite rules for
// the same three prefixes).
//
// `ANY` forwards every HTTP method (GET/POST/PUT/PATCH/DELETE/etc.) to
// Express in one handler — Express does its own internal per-method
// routing once the request reaches it, so there's no need to enumerate
// methods here.
import { createFileRoute } from "@tanstack/react-router";
import { handleExpressRequest } from "../../server/expressBridge";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => handleExpressRequest(request),
    },
  },
});
