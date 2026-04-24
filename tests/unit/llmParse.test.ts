import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseLLMJson, LLMParseError } from "../../server/lib/llmParse";

const schema = z.object({ foo: z.string(), bar: z.number().optional() });

describe("parseLLMJson", () => {
  it("parses raw JSON", () => {
    expect(parseLLMJson('{"foo":"hi"}', schema)).toEqual({ foo: "hi" });
  });

  it("parses fenced JSON", () => {
    expect(parseLLMJson('```json\n{"foo":"hi"}\n```', schema)).toEqual({ foo: "hi" });
  });

  it("parses JSON surrounded by prose", () => {
    expect(parseLLMJson('Sure! {"foo":"hi"} hope that helps', schema)).toEqual({
      foo: "hi",
    });
  });

  it("parses nested objects", () => {
    const s = z.object({ competitors: z.array(z.object({ name: z.string() })) });
    expect(parseLLMJson('{"competitors":[{"name":"Acme"},{"name":"Beta"}]}', s)).toEqual({
      competitors: [{ name: "Acme" }, { name: "Beta" }],
    });
  });

  it("throws LLMParseError on empty input", () => {
    expect(() => parseLLMJson("", schema)).toThrow(LLMParseError);
    expect(() => parseLLMJson(null, schema)).toThrow(LLMParseError);
  });

  it("throws LLMParseError on malformed JSON that doesn't match schema", () => {
    expect(() => parseLLMJson('{"wrong":123}', schema)).toThrow(LLMParseError);
  });

  it("throws LLMParseError on non-JSON", () => {
    expect(() => parseLLMJson("this is not json at all", schema)).toThrow(LLMParseError);
  });

  it("attaches raw snippet to the error", () => {
    try {
      parseLLMJson("garbage", schema);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(LLMParseError);
      expect((err as LLMParseError).raw).toBe("garbage");
    }
  });

  it("ignores braces inside strings when balancing", () => {
    expect(parseLLMJson('{"foo":"a } b { c"}', schema)).toEqual({ foo: "a } b { c" });
  });
});
