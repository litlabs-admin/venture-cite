import { describe, it, expect } from "vitest";
import { hasEnoughBrandProfile } from "../../server/lib/brandProfileCompleteness";

// B7-06 consolidation: content.ts (keyword discovery), contentTypes.ts
// (listicle discovery), and contentTypes.ts (Wikipedia scan) each had their
// own "does this brand have enough profile data" predicate, and the three
// were NOT identical - keyword discovery also accepts targetAudience, and
// the Wikipedia scan additionally requires a non-empty name. These tests
// pin the exact original behaviour of all three variants so the
// consolidated function can't silently drift toward one shared rule.
describe("hasEnoughBrandProfile", () => {
  describe("base rule (listicle discovery: industry OR products)", () => {
    it("passes with only industry set", () => {
      expect(hasEnoughBrandProfile({ industry: "SaaS" })).toBe(true);
    });

    it("passes with only products set", () => {
      expect(hasEnoughBrandProfile({ products: ["Widget"] })).toBe(true);
    });

    it("fails when industry and products are both empty", () => {
      expect(hasEnoughBrandProfile({ industry: "", products: [] })).toBe(false);
      expect(hasEnoughBrandProfile({})).toBe(false);
    });

    it("does not treat targetAudience as sufficient on its own", () => {
      // This is the original listicleHasProfile behaviour: targetAudience
      // was never part of that check, unlike keyword discovery's.
      expect(hasEnoughBrandProfile({ targetAudience: "Enterprises" })).toBe(false);
    });

    it("treats whitespace-only strings and an empty products array as absent", () => {
      expect(hasEnoughBrandProfile({ industry: "   ", products: [] })).toBe(false);
    });

    it("does not require a name by default", () => {
      expect(hasEnoughBrandProfile({ industry: "SaaS", name: "" })).toBe(true);
    });
  });

  describe("includeAudience (keyword discovery)", () => {
    it("passes on targetAudience alone", () => {
      expect(
        hasEnoughBrandProfile({ targetAudience: "Enterprises" }, { includeAudience: true }),
      ).toBe(true);
    });

    it("still passes on industry or products alone", () => {
      expect(hasEnoughBrandProfile({ industry: "SaaS" }, { includeAudience: true })).toBe(true);
      expect(hasEnoughBrandProfile({ products: ["Widget"] }, { includeAudience: true })).toBe(true);
    });

    it("fails when industry, products, and targetAudience are all empty", () => {
      expect(hasEnoughBrandProfile({}, { includeAudience: true })).toBe(false);
    });
  });

  describe("requireName (Wikipedia scan)", () => {
    it("fails when name is missing even if industry is set", () => {
      expect(hasEnoughBrandProfile({ industry: "SaaS" }, { requireName: true })).toBe(false);
    });

    it("fails when name is present but industry/products are both empty", () => {
      expect(hasEnoughBrandProfile({ name: "Acme" }, { requireName: true })).toBe(false);
    });

    it("passes when name and industry are both set", () => {
      expect(hasEnoughBrandProfile({ name: "Acme", industry: "SaaS" }, { requireName: true })).toBe(
        true,
      );
    });

    it("passes when name and products are both set", () => {
      expect(
        hasEnoughBrandProfile({ name: "Acme", products: ["Widget"] }, { requireName: true }),
      ).toBe(true);
    });

    it("does not accept targetAudience even with requireName+includeAudience both set, unless requested", () => {
      // requireName ignores audience unless includeAudience is also passed -
      // no current caller combines them, but the option composition should
      // stay honest about what it checks.
      expect(
        hasEnoughBrandProfile(
          { name: "Acme", targetAudience: "Enterprises" },
          { requireName: true },
        ),
      ).toBe(false);
      expect(
        hasEnoughBrandProfile(
          { name: "Acme", targetAudience: "Enterprises" },
          { requireName: true, includeAudience: true },
        ),
      ).toBe(true);
    });
  });
});
