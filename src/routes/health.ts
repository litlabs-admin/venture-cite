// Phase 2 Task 3 — forwards GET /health into the existing Express app
// (server/app.ts), unmodified. Not a splat: /health is registered in
// server/app.ts as a single exact route with no sub-paths, so an exact
// file route (no `$`) is correct — see src/routes/api/$.ts for why the
// other two prefixes (/api/*, /webhooks/*) need splat routes instead.
import { createFileRoute } from "@tanstack/react-router";
import { handleExpressRequest } from "../server/expressBridge";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      ANY: ({ request }) => handleExpressRequest(request),
    },
  },
});
