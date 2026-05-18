import { describe, it, expect } from "vitest";

import { safeParseJson } from "../../server/lib/safeParseJson";

describe("safeParseJson — canonical dirty-LLM-JSON parser", () => {
  it("returns null for empty/nullish input", () => {
    expect(safeParseJson("")).toBeNull();
    expect(safeParseJson(null)).toBeNull();
    expect(safeParseJson(undefined)).toBeNull();
  });

  it("parses plain JSON objects and arrays", () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("strips ```json fences", () => {
    expect(safeParseJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(safeParseJson('```\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("extracts the first balanced object/array from surrounding prose", () => {
    expect(safeParseJson('Sure! Here you go:\n{"x":"y"}\nHope that helps.')).toEqual({
      x: "y",
    });
    expect(safeParseJson('The list is ["a","b"] as requested')).toEqual(["a", "b"]);
  });

  it("returns null (never throws) on unparseable input", () => {
    expect(safeParseJson("not json at all")).toBeNull();
    expect(safeParseJson("{ broken: ")).toBeNull();
  });

  it("honors an explicit generic type parameter", () => {
    const v = safeParseJson<{ prompts: string[] }>('{"prompts":["a","b"]}');
    expect(v?.prompts).toEqual(["a", "b"]);
  });
});
