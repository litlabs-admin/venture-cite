// find_prompt_gaps - tracked prompts with zero or weak citation, the read
// counterpart to compare_competitor_prompts's competitor-scoped version.
// Backs Trakkr's "Finding losing prompts" step (01-trakkr-teardown.md §3.2).
import { z } from "zod";
import { storage } from "../../storage";
import { citationRatePct } from "@shared/visibilityMetrics";
import { ASK_TOOL_MAX_ROWS } from "@shared/ask/constants";
import type { AskTool } from "./types";
import { runToolSafely } from "./types";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(ASK_TOOL_MAX_ROWS).optional(),
  minChecks: z.number().int().min(0).optional(),
});
type Input = z.infer<typeof inputSchema>;

type GapRow = {
  prompt: string;
  category: string | null;
  checks: number;
  cited: number;
  citationRate: number;
  platforms: string[];
};

export const findPromptGapsTool: AskTool<Input, { total: number; weak: GapRow[] }> = {
  name: "find_prompt_gaps",
  label: "Finding losing prompts",
  category: "prompts",
  description:
    "Returns tracked prompts sorted by weakest citation rate first (0% first). Use this to answer 'where are we losing' or 'which prompts should we fix'.",
  input: inputSchema,
  costHint: "cheap",
  run: (ctx, input) =>
    runToolSafely("find_prompt_gaps", async () => {
      const minChecks = input.minChecks ?? 1;
      const limit = input.limit ?? ASK_TOOL_MAX_ROWS;
      const prompts = await storage.getBrandPromptsByBrandId(ctx.brandId);
      if (prompts.length === 0) {
        return {
          data: { total: 0, weak: [] },
          summary: "Prompt gaps: no tracked prompts yet",
          status: "ok" as const,
        };
      }
      const promptIds = prompts.map((p) => p.id);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rankings = await storage.getGeoRankingsByBrandPromptIds(promptIds, since);

      const byPrompt = new Map<string, { checks: number; cited: number; platforms: Set<string> }>();
      for (const r of rankings) {
        if (!r.brandPromptId) continue;
        const entry = byPrompt.get(r.brandPromptId) ?? {
          checks: 0,
          cited: 0,
          platforms: new Set<string>(),
        };
        entry.checks += 1;
        if (r.isCited === 1) {
          entry.cited += 1;
          entry.platforms.add(r.aiPlatform);
        }
        byPrompt.set(r.brandPromptId, entry);
      }

      const rows: GapRow[] = prompts
        .map((p) => {
          const stats = byPrompt.get(p.id) ?? { checks: 0, cited: 0, platforms: new Set<string>() };
          return {
            prompt: p.prompt,
            category: p.category,
            checks: stats.checks,
            cited: stats.cited,
            citationRate: citationRatePct(stats.cited, stats.checks),
            platforms: Array.from(stats.platforms),
          };
        })
        .filter((r) => r.checks >= minChecks)
        .sort((a, b) => a.citationRate - b.citationRate);

      const weak = rows.slice(0, limit);

      return {
        data: { total: rows.length, weak },
        summary: `Prompt gaps: ${weak.filter((r) => r.citationRate === 0).length} weak of ${rows.length} tracked`,
        status: "ok" as const,
      };
    }),
};
