import { describe, it, expect } from "vitest";
import { buildScanQueries } from "../../server/lib/mentionQueryBuilder";

const brand = { name: "Linear", nameVariations: ["linear app", "linear.app"] };

describe("buildScanQueries", () => {
  it("Reddit: field-scoped exact-phrase per variation", () => {
    const q = buildScanQueries(brand).reddit;
    expect(q).toBe(
      `(title:"Linear" OR selftext:"Linear" OR title:"linear app" OR selftext:"linear app" OR title:"linear.app" OR selftext:"linear.app")`,
    );
  });
  it("HN: unquoted primary brand name (gate handles variations)", () => {
    expect(buildScanQueries(brand).hackernews).toBe("Linear");
  });
  it("dedupes case-variant variations", () => {
    const q = buildScanQueries({ name: "Linear", nameVariations: ["LINEAR", "Linear"] });
    expect(q.reddit).toBe(`(title:"Linear" OR selftext:"Linear")`);
  });
  it("empty variations + valid name = name only", () => {
    const q = buildScanQueries({ name: "Linear", nameVariations: [] });
    expect(q.reddit).toBe(`(title:"Linear" OR selftext:"Linear")`);
  });
  it("returns null for each source when no usable name", () => {
    const q = buildScanQueries({ name: "", nameVariations: [] });
    expect(q).toEqual({ reddit: null, hackernews: null, variations: [] });
  });
});
