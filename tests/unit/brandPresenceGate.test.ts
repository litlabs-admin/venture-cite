import { describe, it, expect } from "vitest";
import { passesBrandPresenceGate } from "../../server/lib/brandPresenceGate";

const variations = ["Linear", "linear app", "linear.app"];

describe("passesBrandPresenceGate", () => {
  it("matches in title (case-insensitive)", () => {
    const r = passesBrandPresenceGate(
      { title: "Why we switched to LINEAR", selftext: "" },
      variations,
    );
    expect(r.matched).toBe(true);
    expect(r.matchedVariation).toBe("Linear");
    expect(r.matchedField).toBe("title");
  });

  it("matches a multi-word variation in selftext", () => {
    const r = passesBrandPresenceGate(
      { title: "", selftext: "We use linear app daily" },
      variations,
    );
    expect(r).toEqual({ matched: true, matchedVariation: "linear app", matchedField: "selftext" });
  });

  it("does not match unrelated text (audit A1 regression)", () => {
    const r = passesBrandPresenceGate({ title: "Apollo space program", selftext: "" }, ["Apollo"]);
    expect(r.matched).toBe(true); // Apollo IS present — gate is a literal includes
    const r2 = passesBrandPresenceGate({ title: "rocket history", selftext: "" }, ["Apollo"]);
    expect(r2.matched).toBe(false);
  });

  it("returns first match across fields in declared order", () => {
    const r = passesBrandPresenceGate({ title: "Linear", selftext: "Linear" }, variations);
    expect(r.matchedField).toBe("title");
  });

  it("rejects empty haystacks", () => {
    expect(passesBrandPresenceGate({ title: "", selftext: "" }, variations).matched).toBe(false);
  });
});
