// list_competitors and compare_competitor_prompts.
//
// list_competitors defaults to tier='core' - the curated, declared
// competitor set - never the raw 'discovered' citation-mining pool, which
// includes product lines and publishers (see the tier comment in
// shared/schema/competitors.ts). That distinction is exactly what lets the
// model draw 01-trakkr-teardown.md's headline insight: "your declared
// competitors are the right boutique set, but none of them are in the
// top-visibility threats list" (§3.4/§5, T1 in the round-2 evidence).
import { z } from "zod";
import { storage } from "../../storage";
import { ASK_TOOL_MAX_ROWS } from "@shared/ask/constants";
import type { AskTool } from "./types";
import { runToolSafely } from "./types";

const listInputSchema = z.object({
  tier: z.enum(["core", "discovered", "all"]).optional(),
  limit: z.number().int().min(1).max(ASK_TOOL_MAX_ROWS).optional(),
});
type ListInput = z.infer<typeof listInputSchema>;

type CompetitorRow = {
  name: string;
  domain: string;
  tier: string;
  totalCitations: number;
  shareOfVoice: number;
};

export const listCompetitorsTool: AskTool<ListInput, { competitors: CompetitorRow[] }> = {
  name: "list_competitors",
  label: "Mapping competitors",
  category: "competitors",
  description:
    "Lists the brand's competitors with their citation counts and share of voice. Defaults to the curated 'core' set (the brand's actually-declared rivals) - pass tier='discovered' only when explicitly asked about every entity AI engines have ever named, which includes product lines and publishers, not just competitor companies.",
  input: listInputSchema,
  costHint: "cheap",
  run: (ctx, input) =>
    runToolSafely("list_competitors", async () => {
      const tier = input.tier ?? "core";
      const limit = input.limit ?? ASK_TOOL_MAX_ROWS;
      // The default ("core") is exactly what server/ask/context.ts already
      // fetched once for the "# Declared competitors" prompt layer and
      // seeded into this run's memo - reuse it. Any other tier is a
      // different read and always goes to the database.
      const competitors =
        tier === "core"
          ? await ctx.memo.get("coreCompetitors", () =>
              storage.getCompetitors(ctx.brandId, { tier: "core" }),
            )
          : await storage.getCompetitors(ctx.brandId, tier === "all" ? undefined : { tier });
      const leaderboard = await storage.getCompetitorLeaderboard(ctx.brandId).catch(() => []);
      const byName = new Map(leaderboard.map((l) => [l.name.toLowerCase(), l]));

      const rows: CompetitorRow[] = competitors.slice(0, limit).map((c) => {
        const lb = byName.get(c.name.toLowerCase());
        return {
          name: c.name,
          domain: c.domain,
          tier: c.tier,
          totalCitations: lb?.totalCitations ?? 0,
          shareOfVoice: lb?.shareOfVoice ?? 0,
        };
      });
      rows.sort((a, b) => b.totalCitations - a.totalCitations);

      return {
        data: { competitors: rows },
        summary: `Competitors: ${rows.length} ${tier}`,
        status: "ok" as const,
        block:
          rows.length > 0
            ? {
                kind: "bar_chart" as const,
                unit: "citations",
                title: undefined,
                rows: rows.slice(0, 10).map((r) => ({ label: r.name, value: r.totalCitations })),
              }
            : undefined,
      };
    }),
};

const compareInputSchema = z.object({
  competitorName: z.string().min(1),
  limit: z.number().int().min(1).max(ASK_TOOL_MAX_ROWS).optional(),
});
type CompareInput = z.infer<typeof compareInputSchema>;

type ComparisonRow = {
  prompt: string;
  yourRank: number | null;
  yourCited: boolean;
  theirRank: number | null;
  theirCited: boolean;
};

export const compareCompetitorPromptsTool: AskTool<
  CompareInput,
  { competitorName: string; found: boolean; rows: ComparisonRow[] }
> = {
  name: "compare_competitor_prompts",
  label: "Finding losing prompts",
  category: "prompts",
  description:
    "Given a competitor's name, returns the tracked prompts where that competitor ranks and the brand does not (or ranks worse). Use this after list_competitors has identified a specific rival worth investigating.",
  input: compareInputSchema,
  costHint: "cheap",
  run: (ctx, input) =>
    runToolSafely<{ competitorName: string; found: boolean; rows: ComparisonRow[] }>(
      "compare_competitor_prompts",
      async () => {
        const allCompetitors = await storage.getCompetitors(ctx.brandId);
        const competitor = allCompetitors.find(
          (c) => c.name.toLowerCase() === input.competitorName.toLowerCase(),
        );
        if (!competitor) {
          return {
            data: { competitorName: input.competitorName, found: false, rows: [] },
            summary: `Competitor "${input.competitorName}" not tracked`,
            status: "ok" as const,
          };
        }

        const prompts = await storage.getBrandPromptsByBrandId(ctx.brandId);
        const promptById = new Map(prompts.map((p) => [p.id, p]));
        const promptIds = prompts.map((p) => p.id);

        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [yourRankings, theirRankings] = await Promise.all([
          promptIds.length > 0
            ? storage.getGeoRankingsByBrandPromptIds(promptIds, since)
            : Promise.resolve([]),
          storage.getCompetitorGeoRankingsForCompetitors([competitor.id], { since }),
        ]);

        const bestByPrompt = <
          T extends { brandPromptId: string | null; rank: number | null; isCited: number },
        >(
          rankings: T[],
        ) => {
          const map = new Map<string, { rank: number | null; cited: boolean }>();
          for (const r of rankings) {
            if (!r.brandPromptId) continue;
            const existing = map.get(r.brandPromptId);
            const cited = r.isCited === 1;
            const rank = cited ? r.rank : null;
            if (!existing) {
              map.set(r.brandPromptId, { rank, cited });
            } else if (
              cited &&
              (!existing.cited ||
                (rank !== null && (existing.rank === null || rank < existing.rank)))
            ) {
              map.set(r.brandPromptId, { rank, cited: true });
            }
          }
          return map;
        };

        const yourBest = bestByPrompt(yourRankings);
        const theirBest = bestByPrompt(theirRankings);

        const rows: ComparisonRow[] = [];
        for (const [promptId, their] of theirBest) {
          if (!their.cited) continue;
          const prompt = promptById.get(promptId);
          if (!prompt) continue;
          const yours = yourBest.get(promptId);
          // "Outranks" = they're cited and either you aren't, or your rank is
          // numerically worse (higher).
          const theyWin =
            !yours?.cited ||
            (yours.rank !== null && their.rank !== null && their.rank < yours.rank);
          if (!theyWin) continue;
          rows.push({
            prompt: prompt.prompt,
            yourRank: yours?.rank ?? null,
            yourCited: yours?.cited ?? false,
            theirRank: their.rank,
            theirCited: true,
          });
        }
        rows.sort((a, b) => (a.theirRank ?? 99) - (b.theirRank ?? 99));
        const limited = rows.slice(0, input.limit ?? ASK_TOOL_MAX_ROWS);

        return {
          data: { competitorName: competitor.name, found: true, rows: limited },
          summary: `Prompt gaps: ${limited.length} where ${competitor.name} outranks you`,
          status: "ok" as const,
          block:
            limited.length > 0
              ? {
                  kind: "table" as const,
                  title: `Prompts ${competitor.name} outranks you on`,
                  columns: [
                    { key: "prompt", label: "Prompt" },
                    { key: "you", label: "You", align: "right" as const },
                    { key: "them", label: competitor.name, align: "right" as const },
                  ],
                  rows: limited.map((r) => ({
                    prompt: r.prompt,
                    you: r.yourCited ? `#${r.yourRank}` : "Absent",
                    them: r.theirCited ? `#${r.theirRank}` : "Absent",
                  })),
                }
              : undefined,
        };
      },
    ),
};
