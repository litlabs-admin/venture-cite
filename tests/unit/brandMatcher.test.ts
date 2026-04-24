import { describe, it, expect } from "vitest";
import {
  detectBrandAndCompetitors,
  matchEntity,
  compileEntityPatterns,
  extractDomain,
  type TrackedEntity,
} from "../../server/lib/brandMatcher";

// Default test brand uses a clearly-unambiguous name ("Acme Widgets" — not
// in English dictionary, not in AMBIGUOUS_WORDS). Tests for the ambiguous
// gate use real ambiguous names like "Notion" or "PR" with a dedicated
// describe block that exercises the signal-word requirement.
const makeBrand = (overrides: Partial<TrackedEntity> = {}): TrackedEntity => ({
  id: "brand-1",
  name: "Acme Widgets",
  nameVariations: [],
  website: null,
  domain: null,
  ...overrides,
});

describe("matchEntity — name variants", () => {
  it("matches the brand name whole-word", () => {
    const r = matchEntity("Acme Widgets is great for builders.", makeBrand());
    expect(r.matched).toBe(true);
    expect(r.hitVariants).toContain("Acme Widgets");
  });

  it("matches case-insensitively", () => {
    const r = matchEntity("acme widgets is great", makeBrand());
    expect(r.matched).toBe(true);
  });

  it("does not match substring inside another word", () => {
    // "mousetrap" should NOT match a "trap" variant because of word boundary.
    const r = matchEntity("the mousetrap caught one", makeBrand({ name: "Trap" }));
    expect(r.matched).toBe(false);
  });

  it("matches possessive with straight apostrophe", () => {
    const r = matchEntity("Acme Widgets's update shipped", makeBrand());
    expect(r.matched).toBe(true);
  });

  it("matches possessive with curly apostrophe", () => {
    const r = matchEntity("Acme Widgets’s update shipped", makeBrand());
    expect(r.matched).toBe(true);
  });

  it("matches user-supplied variant", () => {
    const r = matchEntity(
      "Acme Industries shipped a new feature",
      makeBrand({ nameVariations: ["Acme Industries"] }),
    );
    expect(r.matched).toBe(true);
    expect(r.hitVariants).toContain("Acme Industries");
  });

  it("matches multi-word variant across multiple whitespace", () => {
    const r = matchEntity(
      "Acme  Industries released an update",
      makeBrand({ nameVariations: ["Acme Industries"] }),
    );
    expect(r.matched).toBe(true);
  });

  it("matches multi-word variant across a newline", () => {
    const r = matchEntity(
      "Acme\nIndustries released an update",
      makeBrand({ nameVariations: ["Acme Industries"] }),
    );
    expect(r.matched).toBe(true);
  });

  it("does not match multi-word variant when words are separated by commas", () => {
    // "Acme Industries" shouldn't match "Acme, an industries" — words are interrupted.
    const r = matchEntity(
      "Acme, an industries outfit",
      makeBrand({ nameVariations: ["Acme Industries"] }),
    );
    expect(r.hitVariants).not.toContain("Acme Industries");
  });

  it("diacritic-folds the haystack to match plain-ASCII variant", () => {
    const r = matchEntity("Nestle is a brand", makeBrand({ name: "Nestlé" }));
    expect(r.matched).toBe(true);
  });

  it("diacritic-folds the variant to match plain-ASCII text", () => {
    const r = matchEntity("Nestle is a brand", makeBrand({ name: "Nestle" }));
    expect(r.matched).toBe(true);
  });

  it("returns the first hit position for each variant", () => {
    const text = "Other stuff. Acme Widgets shipped. Also Acme Widgets again.";
    const r = matchEntity(text, makeBrand());
    expect(r.matched).toBe(true);
    expect(r.positions[0]).toBe(text.indexOf("Acme Widgets"));
  });
});

describe("matchEntity — ambiguous short / common-word variants", () => {
  it("short variant (≤3 chars) requires a signal word nearby", () => {
    const brand = makeBrand({ name: "PR", nameVariations: ["PR"] });
    const r = matchEntity("PR is a company founded in 2017.", brand);
    expect(r.matched).toBe(true);
  });

  it("short variant rejects when no signal word nearby", () => {
    const brand = makeBrand({ name: "PR", nameVariations: ["PR"] });
    const r = matchEntity("That PR push was annoying.", brand);
    expect(r.matched).toBe(false);
  });

  it("common-word variant (e.g. 'apple') requires a signal word", () => {
    const r = matchEntity("I ate an apple today", makeBrand({ name: "Apple" }));
    expect(r.matched).toBe(false);
  });

  it("common-word variant passes when signal word is nearby", () => {
    const r = matchEntity(
      "Apple is a company headquartered in Cupertino",
      makeBrand({ name: "Apple" }),
    );
    expect(r.matched).toBe(true);
  });

  it("'venture' requires a signal word even inside natural prose", () => {
    const brand = makeBrand({ name: "Venture", nameVariations: ["Venture"] });
    const r = matchEntity("the adventure was fun — a new venture begins", brand);
    expect(r.matched).toBe(false);
  });
});

describe("matchEntity — domain variants", () => {
  it("matches the bare domain inside a URL with subdomain prefix", () => {
    const brand = makeBrand({ website: "https://acme.com" });
    const r = matchEntity("Check https://docs.acme.com/abc for details", brand);
    expect(r.matched).toBe(true);
  });

  it("matches with www. prefix", () => {
    const brand = makeBrand({ website: "acme.com" });
    const r = matchEntity("Visit www.acme.com", brand);
    expect(r.matched).toBe(true);
  });

  it("does not match an embedded fake domain", () => {
    const brand = makeBrand({ website: "acme.com" });
    const r = matchEntity("the site anacme.com.store is fake", brand);
    expect(r.matched).toBe(false);
  });

  it("matches user-supplied domain variant", () => {
    const brand = makeBrand({
      nameVariations: ["acme.com"],
    });
    const r = matchEntity("go to https://acme.com/product", brand);
    expect(r.matched).toBe(true);
  });

  it("extractDomain normalizes URL-ish inputs", () => {
    expect(extractDomain("https://www.acme.com/")).toBe("acme.com");
    expect(extractDomain("acme.com")).toBe("acme.com");
    expect(extractDomain("http://docs.acme.com/blah")).toBe("docs.acme.com");
    expect(extractDomain("not a url")).toBe(null);
  });
});

describe("matchEntity — edge cases", () => {
  it("empty variant list returns not-matched", () => {
    const brand: TrackedEntity = {
      id: "x",
      name: "",
      nameVariations: [],
      website: null,
      domain: null,
    };
    const r = matchEntity("anything at all", brand);
    expect(r.matched).toBe(false);
  });

  it("empty text returns not-matched", () => {
    const r = matchEntity("", makeBrand());
    expect(r.matched).toBe(false);
  });

  it("strips legal suffixes so 'Acme, Inc.' variant matches 'Acme'", () => {
    const r = matchEntity("Acme shipped today", makeBrand({ name: "Acme, Inc." }));
    expect(r.matched).toBe(true);
  });

  it("compileEntityPatterns exposes the variant set for debugging", () => {
    const compiled = compileEntityPatterns(
      makeBrand({
        name: "Acme Widgets",
        nameVariations: ["Acme Industries", "acme.com"],
      }),
    );
    const display = compiled.map((c) => c.display);
    expect(display).toContain("acme widgets");
    expect(display).toContain("acme industries");
    expect(display).toContain("acme.com");
  });

  it("isDomain flag set for domain variants", () => {
    const compiled = compileEntityPatterns(makeBrand({ nameVariations: ["acme.com"] }));
    const dom = compiled.find((c) => c.display === "acme.com");
    expect(dom?.isDomain).toBe(true);
    const name = compiled.find((c) => c.display === "acme widgets");
    expect(name?.isDomain).toBe(false);
  });
});

describe("detectBrandAndCompetitors", () => {
  const brand = makeBrand({
    name: "Acme Widgets",
    nameVariations: ["Acme Industries"],
  });
  const competitors: TrackedEntity[] = [
    { id: "c1", name: "Obsidian", nameVariations: [], website: null },
    { id: "c2", name: "Roam Research", nameVariations: ["Roam"], website: null },
  ];

  it("reports matches for brand and competitors separately", () => {
    const text = "Acme Widgets and Obsidian are popular, but Roam Research pioneered backlinks.";
    const result = detectBrandAndCompetitors(text, brand, competitors);
    expect(result.brand.matched).toBe(true);
    expect(result.competitors[0].result.matched).toBe(true); // Obsidian
    expect(result.competitors[1].result.matched).toBe(true); // Roam Research
  });

  it("matches competitor via variant alone", () => {
    // "Roam" is 4 chars and not in AMBIGUOUS_WORDS, so no signal word needed.
    const text = "Roam shipped a sync feature";
    const result = detectBrandAndCompetitors(text, brand, competitors);
    expect(result.competitors[1].result.matched).toBe(true);
    expect(result.competitors[1].result.hitVariants).toContain("Roam");
  });

  it("returns unmatched competitors explicitly", () => {
    const text = "Only Acme Widgets here.";
    const result = detectBrandAndCompetitors(text, brand, competitors);
    expect(result.brand.matched).toBe(true);
    expect(result.competitors[0].result.matched).toBe(false);
    expect(result.competitors[1].result.matched).toBe(false);
  });
});
