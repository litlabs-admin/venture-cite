// get_recommendations - surfaces the same prioritised P0/P1/P2 engine the
// dashboard uses (server/lib/recommendationsEngine.ts), so Ask's "what
// should I do next" answers agree with what the dashboard already tells the
// user, rather than inventing a second opinion.
//
// Fields the engine can score are gathered from real storage reads. Fields
// this tool cannot cheaply gather yet (signals-scan recency/score, FAQ and
// community-post counts, the visibility checklist) are left at their
// "unmeasured" default (null/0), which is honest: getRecommendations is a
// pure function, so an unmeasured field simply means the rules gated on it
// don't fire - it never fabricates a value.
import { z } from "zod";
import { storage } from "../../storage";
import { getRecommendations, type RecommendationState } from "../../lib/recommendationsEngine";
import { citationRatePct } from "@shared/visibilityMetrics";
import type { AskTool } from "./types";
import { runToolSafely } from "./types";

const inputSchema = z.object({});
type Input = z.infer<typeof inputSchema>;

export const getRecommendationsTool: AskTool<
  Input,
  { recommendations: ReturnType<typeof getRecommendations> }
> = {
  name: "get_recommendations",
  label: "Checking recommendations",
  category: "recommendations",
  description:
    "Returns the brand's next 3-5 prioritised recommendations (P0 blockers first), the same list shown on the dashboard. Use this for 'what should I do next' questions.",
  input: inputSchema,
  costHint: "cheap",
  run: (ctx) =>
    runToolSafely("get_recommendations", async () => {
      const [prompts, citationRuns, competitors, articles] = await Promise.all([
        storage.getBrandPromptsByBrandId(ctx.brandId),
        storage.getCitationRunsByBrandId(ctx.brandId, 30),
        storage.getCompetitors(ctx.brandId, { tier: "core" }),
        storage
          .getArticlesByUserIdWithStatus(ctx.userId, { brandId: ctx.brandId, limit: 1, offset: 0 })
          .catch(() => []),
      ]);
      const latestCompleted = citationRuns.find(
        (r) => r.status === "completed" || r.status === "succeeded",
      );
      const citationRate =
        latestCompleted && (latestCompleted.totalChecks ?? 0) > 0
          ? citationRatePct(latestCompleted.totalCited ?? 0, latestCompleted.totalChecks!) / 100
          : null;

      const state: RecommendationState = {
        brand: ctx.brand,
        articleCount: articles.length,
        promptCount: prompts.length,
        citationRunCount: citationRuns.length,
        citationRate,
        lastSignalsScanAt: null,
        lastSignalsScore: null,
        visibilityChecklistCompleted: 0,
        visibilityChecklistTotal: 0,
        competitorCount: competitors.length,
        communityPostCount: 0,
        faqCount: 0,
      };

      const recommendations = getRecommendations(state);

      return {
        data: { recommendations },
        summary: `Recommendations: ${recommendations.length} next step${recommendations.length === 1 ? "" : "s"}`,
        status: "ok" as const,
      };
    }),
};
