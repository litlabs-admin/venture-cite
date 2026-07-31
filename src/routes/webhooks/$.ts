// Phase 2 Task 3 - forwards every /webhooks/* request into the existing
// Express app (server/app.ts), unmodified. See src/routes/api/$.ts for the
// shared rationale (splat routes are scoped to their own directory, so
// /api/*, /webhooks/*, and /health each need their own route file).
//
// vercel.json already declares `/webhooks/(.*) -> /api/index` as a distinct
// rewrite rule alongside `/api/(.*)`, even though today the only Express
// handler actually reachable under a bare /webhooks path is nested at
// /api/webhooks/resend (see server/app.ts). This route exists to keep the
// TanStack Start layer's routing surface matching production's declared
// contract, not because a live /webhooks/* Express handler exists yet.
import { createFileRoute } from "@tanstack/react-router";
import { handleExpressRequest } from "../../server/expressBridge";

export const Route = createFileRoute("/webhooks/$")({
  server: {
    handlers: {
      ANY: ({ request }) => handleExpressRequest(request),
    },
  },
});
