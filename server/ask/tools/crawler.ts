// check_crawler_access - "Can AI crawlers reach our site?"
//
// This is the palette-suggestion-4 substitution from 04-implementation-plan.md
// §6: Trakkr's observed wording ("what AI bots are crawling our site this
// week?") asks for a TRAFFIC LOG we do not store (03-gap-analysis.md C7,
// docs/ask-feature/06-crawler-worker-spec.md). checkCrawlerPermissions
// answers a real, different, answerable question - robots.txt PERMISSION,
// not observed traffic - and the tool/label/description below are worded to
// match exactly what it can honestly say.
import { z } from "zod";
import { checkCrawlerPermissions } from "../../services/crawlerPermissions";
import type { AskTool } from "./types";
import { runToolSafely } from "./types";

const inputSchema = z.object({});
type Input = z.infer<typeof inputSchema>;

type Output = {
  checked: boolean;
  url: string | null;
  allowed: number;
  blocked: number;
  unknown: number;
  blockedCrawlers: string[];
};

export const checkCrawlerAccessTool: AskTool<Input, Output> = {
  name: "check_crawler_access",
  label: "Checking crawler access",
  category: "crawler",
  description:
    "Checks the brand's robots.txt against every known AI crawler (GPTBot, ClaudeBot, PerplexityBot, etc) and reports which are explicitly blocked. This is a permission check, not a traffic log - it cannot say how often a bot has actually visited.",
  input: inputSchema,
  costHint: "network",
  run: (ctx) =>
    runToolSafely("check_crawler_access", async () => {
      if (!ctx.brand.website) {
        return {
          data: {
            checked: false,
            url: null,
            allowed: 0,
            blocked: 0,
            unknown: 0,
            blockedCrawlers: [],
          },
          summary: "Crawler access: no website set on this brand",
          status: "ok" as const,
        };
      }
      const result = await checkCrawlerPermissions(ctx.brand.website);
      const blockedCrawlers = result.crawlers
        .filter((c) => c.status === "blocked")
        .map((c) => c.name);
      const data: Output = {
        checked: true,
        url: result.url,
        allowed: result.summary.allowed,
        blocked: result.summary.blocked,
        unknown: result.summary.unknown,
        blockedCrawlers,
      };
      return {
        data,
        summary:
          data.blocked > 0
            ? `Crawler access: ${data.blocked} AI crawler${data.blocked === 1 ? "" : "s"} blocked`
            : `Crawler access: all ${data.allowed} known AI crawlers allowed`,
        status: "ok" as const,
      };
    }),
};
