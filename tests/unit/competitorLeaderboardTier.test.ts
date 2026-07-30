// The Rankings leaderboard is a COMPETITIVE SET: competitor brands, nothing
// else. These tests pin the two rules that keep it that way.
//
// Measured from production (brand "Apple", d795f32c…, read 2026-07-30):
//   tier=core        / discovered_by=ai                14 rows
//   tier=discovered  / citation_auto + citation_mining 82 rows
// The panel read all 96, so "iPhone", "iPad", "AirPods", "Apple Watch",
// "MacBook Air", "S Pen", "Samsung Galaxy Tab", "CNET", "PCMag" and two
// copies of Apple itself ranked as rival companies.

import { describe, it, expect } from "vitest";
import {
  buildCoreCompetitorRows,
  mergeLeaderboardByDomain,
} from "../../server/lib/leaderboardMerge";

// Verbatim slice of the live competitors table for the Apple brand.
const LIVE = [
  { id: "c-spotify-core", name: "Spotify", domain: "spotify.com", tier: "core" },
  { id: "c-spotify-disc", name: "Spotify", domain: "", tier: "discovered" },
  { id: "c-amazon-core", name: "Amazon", domain: "amazon.com", tier: "core" },
  { id: "c-amazon-disc", name: "Amazon", domain: "nationalpost.com", tier: "discovered" },
  { id: "c-iphone", name: "iPhone", domain: "", tier: "discovered" },
  { id: "c-spen", name: "S Pen", domain: "thecreatorinsider.com", tier: "discovered" },
  {
    id: "c-galaxytab",
    name: "Samsung Galaxy Tab",
    domain: "thecreatorinsider.com",
    tier: "discovered",
  },
  { id: "c-cnet", name: "CNET", domain: "cnet.com", tier: "discovered" },
  { id: "c-leica", name: "Leica", domain: "cnet.com", tier: "discovered" },
  { id: "c-apple-dup", name: "Apple", domain: "apple.com", tier: "discovered" },
];

const CITES = new Map<string, Map<string, number>>([
  ["c-spotify-core", new Map()],
  ["c-spotify-disc", new Map([["chatgpt", 11]])],
  ["c-amazon-core", new Map([["chatgpt", 5]])],
  ["c-amazon-disc", new Map([["perplexity", 4]])],
  ["c-iphone", new Map([["chatgpt", 124]])],
  ["c-spen", new Map([["chatgpt", 45]])],
  ["c-galaxytab", new Map([["chatgpt", 45]])],
  ["c-cnet", new Map([["chatgpt", 31]])],
  ["c-leica", new Map([["chatgpt", 7]])],
  ["c-apple-dup", new Map([["chatgpt", 82]])],
]);

describe("core competitor rows", () => {
  const rows = buildCoreCompetitorRows(LIVE, CITES);
  const byName = (n: string) => rows.find((r) => r.name === n);

  it("shows only core competitors — no products, publishers, or the brand itself", () => {
    expect(rows.map((r) => r.name).sort()).toEqual(["Amazon", "Spotify"]);
    for (const dropped of ["iPhone", "S Pen", "Samsung Galaxy Tab", "CNET", "Leica", "Apple"]) {
      expect(byName(dropped)).toBeUndefined();
    }
  });

  it("recovers citations stranded on a discovered row of the same company", () => {
    // The whole reason presentation and counting are separated: the core
    // Spotify row has zero citations of its own.
    expect(byName("Spotify")!.totalCitations).toBe(11);
  });

  it("sums a company that is cited under both of its rows", () => {
    expect(byName("Amazon")!.totalCitations).toBe(9);
    expect(byName("Amazon")!.platformBreakdown).toEqual({ chatgpt: 5, perplexity: 4 });
  });

  it("never credits a mined row's citations to a same-domain publisher", () => {
    // Leica is stored with domain cnet.com. Attributing on domain instead of
    // name would hand its 7 citations to CNET — and CNET is not core anyway.
    expect(byName("CNET")).toBeUndefined();
    expect(rows.reduce((s, r) => s + r.totalCitations, 0)).toBe(20);
  });
});

// Shapes lifted verbatim from the live rows.
const own = {
  name: "Apple",
  domain: "https://apple.com/",
  isOwn: true,
  totalCitations: 12,
  platformBreakdown: { chatgpt: 12 },
  shareOfVoice: 0,
};

describe("leaderboard row merging", () => {
  it("folds two core rows that share a domain into one", () => {
    // Both real, both tier=core, both on samsung.com. The uniqueness index is
    // (brand_id, name, domain), so nothing upstream prevents the pair.
    const out = mergeLeaderboardByDomain([
      own,
      {
        name: "Samsung Electronics",
        domain: "samsung.com",
        isOwn: false,
        totalCitations: 3,
        platformBreakdown: { chatgpt: 3 },
        shareOfVoice: 0,
      },
      {
        name: "Samsung",
        domain: "samsung.com",
        isOwn: false,
        totalCitations: 2,
        platformBreakdown: { perplexity: 2 },
        shareOfVoice: 0,
      },
    ]);

    const samsung = out.filter((r) => /samsung/i.test(r.name));
    expect(samsung).toHaveLength(1);
    expect(samsung[0].totalCitations).toBe(5);
    // Shorter label wins — the legal-suffix form is the noisier one.
    expect(samsung[0].name).toBe("Samsung");
    expect(samsung[0].platformBreakdown).toEqual({ chatgpt: 3, perplexity: 2 });
  });

  it("never merges rows that have no domain", () => {
    // An empty domain is not an identity. iPad and AirPods both store "" and
    // are entirely different things.
    const out = mergeLeaderboardByDomain([
      { ...own, isOwn: false, name: "iPad", domain: "", totalCitations: 7 },
      { ...own, isOwn: false, name: "AirPods", domain: "", totalCitations: 6 },
    ]);
    expect(out).toHaveLength(2);
  });

  it("does not merge on citation-source domains across different companies", () => {
    // The citation-mined pool stores the first cited URL's hostname, not the
    // entity's own site: Leica -> cnet.com. Merging that pool on domain would
    // fold Leica into CNET. Guarded by only ever merging core rows, but the
    // merge itself must still keep distinct names distinct when asked.
    const out = mergeLeaderboardByDomain([
      { ...own, isOwn: false, name: "Leica", domain: "cnet.com", totalCitations: 2 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Leica");
  });

  it("keeps the own-brand row authoritative and absorbs a competitor on the same domain", () => {
    // The Apple brand had accumulated `Apple / apple.com` as a competitor of
    // itself. If such a row ever reaches the leaderboard it must not appear
    // beside the brand's own row.
    const out = mergeLeaderboardByDomain([
      own,
      {
        name: "Apple",
        domain: "apple.com",
        isOwn: false,
        totalCitations: 6,
        platformBreakdown: { chatgpt: 6 },
        shareOfVoice: 0,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].isOwn).toBe(true);
    expect(out[0].totalCitations).toBe(18);
  });

  it("normalises scheme and www before comparing", () => {
    const out = mergeLeaderboardByDomain([
      { ...own, isOwn: false, name: "Sony", domain: "https://www.sony.com/x", totalCitations: 3 },
      { ...own, isOwn: false, name: "Sony Corp", domain: "sony.com", totalCitations: 1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].totalCitations).toBe(4);
  });
});
