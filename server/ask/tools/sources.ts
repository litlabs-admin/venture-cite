// get_citation_sources - which pages/outlets are winning citations for the
// brand's tracked prompts, backing 01-trakkr-teardown.md R5's "Which pages
// win the citations on '...'" follow-up and feeding the Evidence block.
import { z } from "zod";
import { storage } from "../../storage";
import { ASK_TOOL_MAX_ROWS } from "@shared/ask/constants";
import type { AskTool } from "./types";
import { runToolSafely } from "./types";

const inputSchema = z.object({
  promptText: z.string().optional(),
  limit: z.number().int().min(1).max(ASK_TOOL_MAX_ROWS).optional(),
});
type Input = z.infer<typeof inputSchema>;

type SourceRow = {
  url: string;
  outlet: string | null;
  authority: number | null;
  prompt: string;
  platform: string;
};

export const getCitationSourcesTool: AskTool<Input, { sources: SourceRow[] }> = {
  name: "get_citation_sources",
  label: "Checking citation sources",
  category: "sources",
  description:
    "Returns the outlets/URLs AI engines actually cited for the brand's tracked prompts, with an authority score where available. Optionally filter to prompts matching promptText.",
  input: inputSchema,
  costHint: "cheap",
  run: (ctx, input) =>
    runToolSafely("get_citation_sources", async () => {
      const prompts = await storage.getBrandPromptsByBrandId(ctx.brandId);
      const promptById = new Map(prompts.map((p) => [p.id, p]));
      let scopedIds = prompts.map((p) => p.id);
      if (input.promptText) {
        const needle = input.promptText.toLowerCase();
        scopedIds = prompts.filter((p) => p.prompt.toLowerCase().includes(needle)).map((p) => p.id);
      }
      if (scopedIds.length === 0) {
        return {
          data: { sources: [] },
          summary: "Sources: none found",
          status: "ok" as const,
        };
      }
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rankings = await storage.getGeoRankingsByBrandPromptIds(scopedIds, since);
      const limit = input.limit ?? ASK_TOOL_MAX_ROWS;

      const rows: SourceRow[] = rankings
        .filter((r) => r.isCited === 1 && r.citingOutletUrl)
        .map((r) => ({
          url: r.citingOutletUrl as string,
          outlet: r.citingOutletName ?? null,
          authority: r.authorityScore ?? null,
          prompt: r.brandPromptId ? (promptById.get(r.brandPromptId)?.prompt ?? "") : "",
          platform: r.aiPlatform,
        }))
        .slice(0, limit);

      return {
        data: { sources: rows },
        summary:
          rows.length > 0
            ? `Sources: ${rows.length} citing page${rows.length === 1 ? "" : "s"} found`
            : "Sources: none found",
        status: "ok" as const,
        evidence: rows.map((r) => ({
          url: r.url,
          outlet: r.outlet ?? undefined,
          authority: r.authority ?? undefined,
          kind: "citation" as const,
        })),
      };
    }),
};
