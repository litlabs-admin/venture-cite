// get_visibility - wraps the same service the dashboard hero tile uses, so
// the number Ask reports is byte-identical to the number the user already
// sees (02-platform-analysis.md §3.1).
import { z } from "zod";
import { getDashboardHero } from "../../services/dashboardVisibility";
import { storage } from "../../storage";
import type { AskTool } from "./types";
import { runToolSafely } from "./types";

const inputSchema = z.object({
  sinceDays: z.number().int().min(1).max(365).optional(),
});
type Input = z.infer<typeof inputSchema>;

type PlatformBreakdown = { platform: string; visibilityScore: number; shareOfVoice: number };

type Output = {
  visibilityScore: number;
  visibilityDelta: number;
  citedChecks: number;
  totalChecks: number;
  citationRate: number;
  lastScanAt: string | null;
  empty: boolean;
  byPlatform: PlatformBreakdown[];
};

export const getVisibilityTool: AskTool<Input, Output> = {
  name: "get_visibility",
  label: "Checking visibility",
  category: "visibility",
  description:
    "Returns the brand's current AI-visibility score, citation rate, per-AI-platform breakdown, and the date of the last measurement run. Use this to answer 'how visible are we' or 'why did our score move'.",
  input: inputSchema,
  costHint: "cheap",
  run: (ctx, input) =>
    runToolSafely("get_visibility", async () => {
      const since = input.sinceDays
        ? new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000)
        : null;
      // Unwindowed ("all time") is exactly what server/ask/context.ts
      // already computed once for the "# Current measurement state" prompt
      // layer and seeded into this run's memo under "hero" - reuse it
      // instead of re-querying. A windowed request (sinceDays given) is a
      // different read and always goes to the database.
      const hero = since
        ? await getDashboardHero(ctx.brand, since)
        : await ctx.memo.get("hero", () => getDashboardHero(ctx.brand, null));
      const empty = hero.totalChecks === 0;

      // Per-platform breakdown, matching 01-trakkr-teardown.md R5's observed
      // "ChatGPT 24.1, Perplexity 15.8 ... others 0" style answer - this is
      // what lets the model draw that comparison honestly instead of only
      // reporting a composite.
      let byPlatform: PlatformBreakdown[] = [];
      try {
        const snapshots = await storage.getBrandVisibilitySnapshots(ctx.brandId, 20);
        const latestByPlatform = new Map<string, (typeof snapshots)[number]>();
        for (const s of snapshots) {
          const existing = latestByPlatform.get(s.aiPlatform);
          if (!existing || s.snapshotDate > existing.snapshotDate) {
            latestByPlatform.set(s.aiPlatform, s);
          }
        }
        byPlatform = Array.from(latestByPlatform.values()).map((s) => ({
          platform: s.aiPlatform,
          visibilityScore: s.visibilityScore,
          shareOfVoice: Number(s.shareOfVoice ?? 0),
        }));
      } catch {
        byPlatform = [];
      }

      const data: Output = {
        visibilityScore: hero.visibilityScore,
        visibilityDelta: hero.visibilityDelta,
        citedChecks: hero.citedChecks,
        totalChecks: hero.totalChecks,
        citationRate: hero.citationRate,
        lastScanAt: hero.lastScanAt ? hero.lastScanAt.toISOString() : null,
        empty,
        byPlatform,
      };

      const summary = empty
        ? "Visibility: no completed runs yet"
        : `Visibility: ${hero.visibilityScore}/100, ${hero.citationRate}% cited`;

      return {
        data,
        summary,
        status: "ok" as const,
        block: empty
          ? undefined
          : {
              kind: "stat_row" as const,
              items: [
                { label: "Visibility score", value: `${hero.visibilityScore}/100` },
                { label: "Citation rate", value: `${hero.citationRate}%` },
                { label: "Checks", value: `${hero.citedChecks}/${hero.totalChecks}` },
              ],
            },
      };
    }),
};
