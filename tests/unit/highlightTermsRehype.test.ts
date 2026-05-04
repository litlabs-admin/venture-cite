import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

import { createHighlightPlugin } from "../../client/src/lib/highlightTermsRehype";

async function process(markdown: string, terms: string[]): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(createHighlightPlugin(terms))
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

describe("highlightTermsRehype", () => {
  it("wraps case-insensitive, word-boundary brand-name matches in <mark>", async () => {
    const html = await process(
      "Stripe is a payment processor. STRIPE leads the space. Don't confuse with stripeling.",
      ["Stripe"],
    );
    // 2 matches: "Stripe" + "STRIPE" (case-insensitive). "stripeling" must NOT match (word boundary).
    expect(html.match(/<mark>/g)?.length ?? 0).toBe(2);
    expect(html).toContain("<mark>Stripe</mark>");
    expect(html).toContain("<mark>STRIPE</mark>");
    expect(html).toContain("stripeling"); // present, not wrapped
    expect(html).not.toContain("<mark>stripeling</mark>");
  });

  it("does NOT highlight matches inside <code> or <a>", async () => {
    const html = await process(
      "Visit [Stripe](https://stripe.com) or call `Stripe.createPayment()`. Stripe is great.",
      ["Stripe"],
    );
    // Only the bare-text "Stripe" (last sentence) should be wrapped.
    // The link text "Stripe" inside <a> is skipped; "Stripe.createPayment" inside <code> is skipped.
    expect(html.match(/<mark>/g)?.length ?? 0).toBe(1);
    // The link's href and text are intact.
    expect(html).toContain('href="https://stripe.com"');
    expect(html).toContain(">Stripe</a>");
    // The code content is intact.
    expect(html).toContain("<code>Stripe.createPayment()</code>");
  });

  it("escapes regex special chars in brand names (e.g. C++)", async () => {
    const html = await process("I love C++ programming.", ["C++"]);
    expect(html).toContain("<mark>C++</mark>");
  });

  it("highlights multiple terms, preferring the longest match (no overlap)", async () => {
    const html = await process("Stripe Inc owns Stripe.", ["Stripe", "Stripe Inc"]);
    // "Stripe Inc" (longer) wins for the first occurrence; standalone "Stripe" wraps the second.
    expect(html).toContain("<mark>Stripe Inc</mark>");
    expect(html).toContain("<mark>Stripe</mark>");
    // Make sure we didn't double-wrap "Stripe Inc" as <mark>Stripe</mark> Inc</mark>.
    expect(html).not.toContain("<mark><mark>");
  });

  it("no-ops cleanly when terms array is empty", async () => {
    const html = await process("Stripe is a payment processor.", []);
    expect(html).not.toContain("<mark>");
    expect(html).toContain("Stripe is a payment processor.");
  });

  it("caps the term list at 50 to bound regex compile cost", async () => {
    const manyTerms = Array.from({ length: 100 }, (_, i) => `Brand${i}`);
    // Should not throw or hang. The first 50 terms are used; remainder ignored.
    const html = await process("Brand0 and Brand49 and Brand50 mentioned.", manyTerms);
    expect(html).toContain("<mark>Brand0</mark>");
    expect(html).toContain("<mark>Brand49</mark>");
    expect(html).toContain("Brand50"); // beyond cap → not wrapped
    expect(html).not.toContain("<mark>Brand50</mark>");
  });
});
