// get_site_health - wraps the same service the Site Health tab uses.
import { z } from "zod";
import { getSiteHealthDashboard } from "../../services/dashboardSiteHealth";
import type { AskTool } from "./types";
import { runToolSafely } from "./types";

const inputSchema = z.object({});
type Input = z.infer<typeof inputSchema>;

export const getSiteHealthTool: AskTool<Input, unknown> = {
  name: "get_site_health",
  label: "Checking site health",
  category: "site_health",
  description:
    "Returns the brand's site health score and its contributing factors (crawler access, schema markup, content findings). Use this for questions about technical GEO readiness.",
  input: inputSchema,
  costHint: "network",
  run: (ctx) =>
    runToolSafely("get_site_health", async () => {
      const result = await getSiteHealthDashboard(ctx.brand);
      const score = (result as { overallScore?: number }).overallScore;
      return {
        data: result,
        summary: typeof score === "number" ? `Site health: ${score}/100` : "Site health: checked",
        status: "ok" as const,
      };
    }),
};
