// Brand facts writes read only by the /v2/ Facts workspace (board 34).
//
// Every other brand-fact write (accept, dismiss, amend, add) already has a
// user-facing route under server/routes/factSheet.ts and
// server/routes/intelligence.ts, and the v2 workspace calls those directly.
// Re-verification is the one action that did not: `reverifyFact()`
// (server/lib/factAgent/v2/reverifyFact.ts) is only reachable today through
// `POST /api/admin/scrape/fact/:factId/reverify`, which is gated `isAdmin` -
// internal diagnostics, not a brand owner checking their own fact sheet. This
// route wraps the same call, scoped to the requesting user's own brand
// instead of admin status, so the workspace's "Recheck" action has something
// real to call.

import type { Express } from "express";
import { requireUser, requireBrand } from "../lib/ownership";
import { sendError, asyncHandler } from "../lib/routesShared";
import { getFactSheetFactById } from "../services/factSheetFacts";

export function setupV2BrandFactsRoutes(app: Express): void {
  // ==========================================================================
  // POST /api/v2/brand-facts/:factId/recheck
  // Re-fetch the fact's source and compare it against the stored value.
  // Returns the reverify outcome and the fact row as it stands afterward -
  // `reverifyFact` writes `verificationStatus`/`lastVerified` itself, so the
  // caller needs the row re-read, not just the outcome.
  // ==========================================================================
  app.post(
    "/api/v2/brand-facts/:factId/recheck",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const fact = await getFactSheetFactById(req.params.factId);
        if (!fact) {
          return res.status(404).json({ success: false, error: "Fact not found" });
        }
        await requireBrand(fact.brandId, user.id);

        const { reverifyFact } = await import("../lib/factAgent/v2/reverifyFact");
        const { LLM_CALL_TIMEOUT_MS } = await import("../lib/factAgent/v2/vercelBudget");
        const { MODELS } = await import("../lib/modelConfig");
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: LLM_CALL_TIMEOUT_MS,
          maxRetries: 0,
        });
        const llm = async (prompt: unknown) => {
          const messages =
            typeof prompt === "string"
              ? [{ role: "user" as const, content: prompt }]
              : [
                  { role: "system" as const, content: (prompt as { system: string }).system },
                  { role: "user" as const, content: (prompt as { user: string }).user },
                ];
          const responseFormat =
            typeof prompt === "object" &&
            prompt &&
            "responseFormat" in prompt &&
            (prompt as { responseFormat?: unknown }).responseFormat
              ? (prompt as { responseFormat: unknown }).responseFormat
              : { type: "json_object" as const };
          const completion = await openai.chat.completions.create({
            model: MODELS.misc,
            response_format: responseFormat as never,
            messages,
          });
          return completion.choices?.[0]?.message?.content ?? "";
        };

        const outcome = await reverifyFact({ factId: fact.id, llm });
        const updated = await getFactSheetFactById(fact.id);
        res.json({ success: true, data: { outcome: outcome.outcome, fact: updated ?? null } });
      } catch (error) {
        sendError(res, error, "Failed to recheck fact");
      }
    }),
  );
}
