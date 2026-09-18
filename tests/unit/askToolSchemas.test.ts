// Guards server/ask/tools/registry.ts's toolDefinitionsForModel against the
// exact regression that shipped: a converter that silently produced
// `{"type":"string"}` for every tool because it read a zod-v3-only internal
// field on zod 4 schemas. The model could still call an argument-free tool
// but could never correctly call read_page, compare_competitor_prompts or
// propose_action - and nothing failed loudly, because every check the repo
// had only asserted "parameters is truthy", not its shape.
//
// Same DATABASE_URL/OPENAI_API_KEY stubbing as askLoop.test.ts - importing
// the registry pulls in server/db.ts and server/ask/modelClient.ts, neither
// of which is actually called here.
// Set BEFORE the dynamic import below, since a static import would be
// hoisted above any same-file assignment (same pattern as askLoop.test.ts).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";

import { describe, it, expect } from "vitest";

const { buildToolRegistry, toolDefinitionsForModel } =
  await import("../../server/ask/tools/registry");

const registry = buildToolRegistry({
  threadId: "thread-1",
  messageId: "message-1",
  userMessage: "why has our visibility moved?",
});
const defs = toolDefinitionsForModel(registry);
const byName = new Map(defs.map((d) => [d.function.name, d]));

describe("toolDefinitionsForModel", () => {
  it("registers every tool the loop can dispatch, each exactly once", () => {
    expect(defs).toHaveLength(registry.size);
    expect(new Set(defs.map((d) => d.function.name)).size).toBe(defs.length);
  });

  it("every tool's parameters describe a real JSON Schema object, not a bare string", () => {
    // This is the exact shape the old converter collapsed everything to -
    // asserting the negative keeps this test from silently regressing back
    // to it.
    for (const def of defs) {
      expect(def.function.parameters).not.toEqual({ type: "string" });
      expect(def.function.parameters.type).toBe("object");
      expect(def.function.parameters).toHaveProperty("properties");
    }
  });

  it("carries no $schema envelope - OpenAI/OpenRouter want a bare schema object", () => {
    for (const def of defs) {
      expect(def.function.parameters).not.toHaveProperty("$schema");
    }
  });

  it("read_page requires a url property, typed as a string", () => {
    const def = byName.get("read_page")!;
    const props = def.function.parameters.properties as Record<string, unknown>;
    expect(def.function.parameters.required).toEqual(["url"]);
    expect(props.url).toMatchObject({ type: "string" });
  });

  it("compare_competitor_prompts requires competitorName", () => {
    const def = byName.get("compare_competitor_prompts")!;
    expect(def.function.parameters.required).toEqual(["competitorName"]);
    const props = def.function.parameters.properties as Record<string, unknown>;
    expect(props.competitorName).toMatchObject({ type: "string" });
  });

  it("propose_action requires kind and rationale, with kind enumerated", () => {
    const def = byName.get("propose_action")!;
    expect(def.function.parameters.required).toEqual(expect.arrayContaining(["kind", "rationale"]));
    const props = def.function.parameters.properties as Record<string, unknown>;
    expect(props.kind).toMatchObject({
      type: "string",
      // remember_fact: business-context.md's Memory tab, decision 5 - a
      // learned memory is proposed as a card through this same tool.
      enum: ["track_prompt", "queue_article", "run_citation_check", "remember_fact"],
    });
  });

  it("get_visibility's optional sinceDays is NOT in required, and is numeric", () => {
    const def = byName.get("get_visibility")!;
    const required = (def.function.parameters.required as string[] | undefined) ?? [];
    expect(required).not.toContain("sinceDays");
    const props = def.function.parameters.properties as Record<string, unknown>;
    expect(props.sinceDays).toMatchObject({ type: "integer" });
  });

  it("an argument-free tool still gets an object schema with no required fields", () => {
    const def = byName.get("get_site_health")!;
    expect(def.function.parameters).toMatchObject({ type: "object", properties: {} });
    expect(def.function.parameters.required ?? []).toEqual([]);
  });
});
