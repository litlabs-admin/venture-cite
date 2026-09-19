import { describe, expect, it } from "vitest";
import type { Probe } from "@shared/onboarding/session";
import { competitorSummary, tallyProbe } from "../../client/src/components/onboarding/probeTally";

const result = (brandCited: boolean, names: string[]): Probe["results"][number] => ({
  prompt: "best pr firms for startups",
  engine: "Gemini",
  brandCited,
  brandRank: brandCited ? 1 : null,
  mentioned: names.map((name, i) => ({ name, domain: null, rank: i + 1 })),
  snippet: "",
});

const probe = (results: Probe["results"]): Probe => ({
  results,
  promptsTested: 3,
  brandAppearances: results.filter((r) => r.brandCited).length,
  competitorAppearances: results.filter((r) => r.mentioned.length > 0).length,
});

describe("tallyProbe", () => {
  // Regression: the First read panel once hardcoded "0 / 6" for every brand
  // while five of six real answers named a competitor.
  it("counts competitor mentions per name from the results, not a constant", () => {
    const t = tallyProbe(
      probe([
        result(false, ["Highwire", "Bospar", "LaunchSquad"]),
        result(false, ["Highwire"]),
        result(false, []),
      ]),
    );
    expect(t.answers).toBe(3);
    expect(t.brandNamed).toBe(0);
    expect(t.competitorAnswers).toBe(2);
    expect(t.byCompetitor.get("Highwire")).toBe(2);
    expect(t.byCompetitor.get("Bospar")).toBe(1);
  });

  it("uses the answers that came back as the denominator, not prompts x engines", () => {
    // One engine call failed: 3 prompts tested, but only 5 answers exist.
    const t = tallyProbe(
      probe([result(true, []), ...Array.from({ length: 4 }, () => result(false, []))]),
    );
    expect(t.answers).toBe(5);
    expect(t.brandNamed).toBe(1);
  });

  it("counts a competitor once per answer even if the answer names it twice", () => {
    const t = tallyProbe(probe([result(false, ["Highwire", "Highwire"])]));
    expect(t.byCompetitor.get("Highwire")).toBe(1);
  });
});

describe("competitorSummary", () => {
  it("only says nobody was named when no competitor was named", () => {
    expect(competitorSummary(tallyProbe(probe([result(false, [])])))).toMatch(
      /weren't named either/,
    );
  });

  it("reports the measured counts and the most-named competitor", () => {
    const text = competitorSummary(
      tallyProbe(
        probe([
          result(false, ["Highwire"]),
          result(false, ["Highwire", "Bospar"]),
          result(false, []),
        ]),
      ),
    );
    expect(text).toBe("Competitors were named in 2 of 3 answers. Highwire came up most, in 2.");
  });

  it("says there is nothing to compare when no answer came back", () => {
    expect(competitorSummary(tallyProbe(probe([])))).toMatch(/nothing to compare/);
  });
});
