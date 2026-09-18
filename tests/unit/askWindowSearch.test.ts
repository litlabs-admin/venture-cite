// Guards the exact regression the owner reported: typing "monitor" (a real
// page in this app) into the Ask window found nothing, because matching
// only ever looked at a row's own label/description/keywords, never the
// SECTION it was filed under - every tab under Monitor is named
// "Citations", "Competitors", etc., none of them contain the word
// "monitor" anywhere in their own text. See client/src/lib/
// askWindowSearch.ts's header for the two-part fix this tests.
import { describe, it, expect } from "vitest";
import { NAV, QUICK_ACTIONS, matchesQuery, containsAllWords } from "@/lib/askWindowSearch";

describe("matchesQuery", () => {
  it('"monitor" matches the Monitor page itself AND every tab filed under it', () => {
    const hits = NAV.filter((n) => matchesQuery("monitor", n)).map((n) => n.label);
    expect(hits).toContain("Monitor");
    expect(hits).toContain("Citations");
    expect(hits).toContain("Competitors");
    expect(hits).toContain("Trends");
    expect(hits).toContain("Mentions");
    // Pages under a DIFFERENT section must not show up.
    expect(hits).not.toContain("Hallucinations");
    expect(hits).not.toContain("Create");
  });

  it('"diagnose" / "act" / "setup" each match their own page plus their tabs, the same way', () => {
    const diagnose = NAV.filter((n) => matchesQuery("diagnose", n)).map((n) => n.label);
    expect(diagnose).toEqual(
      expect.arrayContaining(["Diagnose", "Hallucinations", "Signals", "Crawler"]),
    );

    const act = NAV.filter((n) => matchesQuery("act", n)).map((n) => n.label);
    expect(act).toEqual(
      expect.arrayContaining([
        "Act",
        "Create",
        "Library",
        "Keywords",
        "GEO Assets",
        "FAQ",
        "Community",
      ]),
    );

    const setup = NAV.filter((n) => matchesQuery("setup", n)).map((n) => n.label);
    expect(setup).toEqual(
      expect.arrayContaining(["Setup", "Brands", "Fact Sheet", "Visibility Checklist"]),
    );
  });

  it('"prompt" matches the Add prompt quick action', () => {
    const hits = QUICK_ACTIONS.filter((a) => matchesQuery("prompt", a)).map((a) => a.label);
    expect(hits).toContain("Add prompt");
  });

  it('"competitor" matches both the Competitors page and the Add competitor quick action', () => {
    const pages = NAV.filter((n) => matchesQuery("competitor", n)).map((n) => n.label);
    expect(pages).toContain("Competitors");
    const actions = QUICK_ACTIONS.filter((a) => matchesQuery("competitor", a)).map((a) => a.label);
    expect(actions).toContain("Add competitor");
  });

  it("is token-based: word order doesn't matter, and every word must match", () => {
    // "prompt add" (reversed from the label "Add prompt") still matches.
    expect(matchesQuery("prompt add", { label: "Add prompt" })).toBe(true);
    // A word that appears nowhere in the row means no match, even though
    // the other word does.
    expect(matchesQuery("prompt xyz123", { label: "Add prompt" })).toBe(false);
  });

  it("an empty or whitespace-only query matches everything", () => {
    expect(matchesQuery("", { label: "Anything" })).toBe(true);
    expect(matchesQuery("   ", { label: "Anything" })).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesQuery("MONITOR", { label: "Citations", section: "Monitor" })).toBe(true);
  });
});

describe("containsAllWords", () => {
  it("matches a multi-word tracked-prompt text against a multi-word query", () => {
    expect(containsAllWords("top PR agencies in the US for tech startups", "PR agencies")).toBe(
      true,
    );
    expect(containsAllWords("top PR agencies in the US for tech startups", "PR france")).toBe(
      false,
    );
  });
});
