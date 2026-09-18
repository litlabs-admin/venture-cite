// Tool registry - the ONLY place a tool is named (04-implementation-plan.md
// §3.1). The loop calls tools exclusively through here, never by importing a
// tool module directly, so adding a tool is "one file, one line" (07 §5.2).
import { z } from "zod";
import type { AskTool } from "./types";
import { getVisibilityTool } from "./visibility";
import { listCompetitorsTool, compareCompetitorPromptsTool } from "./competitors";
import { findPromptGapsTool } from "./prompts";
import { getCitationSourcesTool } from "./sources";
import { checkCrawlerAccessTool } from "./crawler";
import { getSiteHealthTool } from "./siteHealth";
import { getRecommendationsTool } from "./recommendations";
import { readPageTool } from "./readPage";
import { createProposeActionTool } from "./propose";

// The eight read tools, fixed for every run.
export function readOnlyTools(): AskTool<any, any>[] {
  return [
    getVisibilityTool,
    listCompetitorsTool,
    compareCompetitorPromptsTool,
    findPromptGapsTool,
    getCitationSourcesTool,
    checkCrawlerAccessTool,
    getSiteHealthTool,
    getRecommendationsTool,
    readPageTool,
  ];
}

// propose_action needs per-run context (thread/message id, the user's raw
// message for structural validation) that no other tool needs, so it is
// built per-run rather than held in the fixed list above.
export function buildToolRegistry(extra: {
  threadId: string;
  messageId: string;
  userMessage: string;
}): Map<string, AskTool<any, any>> {
  const tools = [...readOnlyTools(), createProposeActionTool(extra)];
  const map = new Map<string, AskTool<any, any>>();
  for (const tool of tools) {
    if (map.has(tool.name)) {
      throw new Error(`Duplicate Ask tool name: ${tool.name}`);
    }
    map.set(tool.name, tool);
  }
  return map;
}

// JSON schema the model sees, one entry per tool.
//
// THIS USED TO BE A HAND-ROLLED CONVERTER that read `schema._def.typeName`
// - a zod v3 internal shape. This project is on zod 4.4.3, where that field
// is `undefined` on every schema, so every tool's `parameters` silently
// collapsed to `{"type":"string"}` no matter what the tool actually
// declared. The model could still call an argument-free tool (get_visibility
// with defaults, list_competitors with defaults, ...) but could never
// correctly call one that needed a real argument - read_page's `url`,
// compare_competitor_prompts's `competitorName`, propose_action's `kind` -
// because the schema it was given carried no property list at all. Nothing
// caught this: no test exercised the converter's output shape, only that it
// returned *a* string.
//
// zod 4 ships a real JSON Schema compiler; use it instead of maintaining a
// second, narrower one. `io: "input"` reads the pre-transform (parse-input)
// shape, matching what the model must produce. `$schema` is stripped -
// OpenAI/OpenRouter's function-calling format wants a bare schema object,
// not a standalone document.
export function toolDefinitionsForModel(tools: Map<string, AskTool<any, any>>): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return Array.from(tools.values()).map((tool) => {
    const { $schema: _$schema, ...parameters } = z.toJSONSchema(tool.input, { io: "input" }) as {
      $schema?: string;
      [key: string]: unknown;
    };
    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
    };
  });
}
