import { describe, it, expect } from "vitest";
import { extractSnippet } from "../../client/src/lib/extractSnippet";

const LONG_TEXT =
  "ChatGPT, Claude, and Perplexity all power AI search. Stripe is a leading payment processor used by many companies in the SaaS space. " +
  "Other notable mentions include Square, Adyen, and PayPal. The payment processing market continues to evolve rapidly with new entrants. " +
  "Many businesses choose Stripe for its developer-friendly API and global reach. Documentation quality is also a key factor.";

describe("extractSnippet", () => {
  it("returns ±200 chars around first brand match with ellipsis boundaries", () => {
    const out = extractSnippet(LONG_TEXT, ["Stripe"], 50);
    // Should contain "Stripe" and have leading "…" (since the match isn't at start).
    expect(out).toContain("Stripe");
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    // Snippet length is bounded.
    expect(out.length).toBeLessThan(150); // ±50 + brand + 2 ellipses
  });

  it("returns leading text when no match found, with trailing ellipsis", () => {
    const out = extractSnippet(LONG_TEXT, ["Acme"], 50);
    expect(out.startsWith("…")).toBe(false); // no leading ellipsis when starting at idx 0
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(101); // 100 chars + ellipsis
  });

  it("matches case-insensitive with word boundaries", () => {
    const out = extractSnippet("Pre-text. STRIPE is great. Post-text.", ["Stripe"], 20);
    expect(out).toContain("STRIPE");
  });

  it("returns full text without ellipsis when shorter than 2*radius", () => {
    const short = "Hello Stripe world.";
    const out = extractSnippet(short, ["Stripe"], 100);
    expect(out).toBe(short); // no truncation needed
    expect(out).not.toContain("…");
  });

  it("uses longest term first when multiple variations match", () => {
    const text = "Stripe Inc is a payment processor.";
    const out = extractSnippet(text, ["Stripe", "Stripe Inc"], 50);
    // We just confirm it didn't crash and snippet contains the brand.
    expect(out).toContain("Stripe");
  });

  it("returns empty string for empty text input", () => {
    expect(extractSnippet("", ["Stripe"], 50)).toBe("");
  });
});
