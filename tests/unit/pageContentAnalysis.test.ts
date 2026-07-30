import { describe, it, expect } from "vitest";
import { analysePageHtml, fleschReadingEase } from "../../server/lib/pageContentAnalysis";

const URL = "https://ex.com/page";

function wrap(head: string, body: string): string {
  return `<html><head>${head}</head><body>${body}</body></html>`;
}

describe("analysePageHtml — meta title", () => {
  it("flags metaTitleMissing when there is no <title>", () => {
    const f = analysePageHtml(wrap("", "<p>hi</p>"), URL);
    expect(f.metaTitleMissing).toBe(true);
    expect(f.metaTitleTooShort).toBe(false);
    expect(f.metaTitleTooLong).toBe(false);
  });

  it("flags metaTitleTooShort for a title under 15 chars", () => {
    const f = analysePageHtml(wrap("<title>Home</title>", "<p>hi</p>"), URL);
    expect(f.metaTitleMissing).toBe(false);
    expect(f.metaTitleTooShort).toBe(true);
  });

  it("flags metaTitleTooLong for a title over 60 chars", () => {
    const longTitle = "A".repeat(65);
    const f = analysePageHtml(wrap(`<title>${longTitle}</title>`, "<p>hi</p>"), URL);
    expect(f.metaTitleTooLong).toBe(true);
  });

  it("does not flag a well-sized title", () => {
    const f = analysePageHtml(
      wrap("<title>A Well Sized Page Title Here</title>", "<p>hi</p>"),
      URL,
    );
    expect(f.metaTitleMissing).toBe(false);
    expect(f.metaTitleTooShort).toBe(false);
    expect(f.metaTitleTooLong).toBe(false);
  });
});

describe("analysePageHtml — meta description", () => {
  it("flags metaDescriptionMissing when absent", () => {
    const f = analysePageHtml(wrap("<title>Some Title Here</title>", "<p>hi</p>"), URL);
    expect(f.metaDescriptionMissing).toBe(true);
  });

  it("flags metaDescriptionTooShort under 50 chars", () => {
    const html = wrap(
      `<title>Some Title Here</title><meta name="description" content="Too short.">`,
      "<p>hi</p>",
    );
    const f = analysePageHtml(html, URL);
    expect(f.metaDescriptionMissing).toBe(false);
    expect(f.metaDescriptionTooShort).toBe(true);
  });

  it("flags metaDescriptionTooLong over 160 chars", () => {
    const desc = "A".repeat(200);
    const html = wrap(`<meta name="description" content="${desc}">`, "<p>hi</p>");
    const f = analysePageHtml(html, URL);
    expect(f.metaDescriptionTooLong).toBe(true);
  });

  it("does not flag a well-sized description", () => {
    const desc =
      "This is a nicely sized meta description that sits comfortably between fifty and one-sixty characters long.";
    const html = wrap(`<meta name="description" content="${desc}">`, "<p>hi</p>");
    const f = analysePageHtml(html, URL);
    expect(f.metaDescriptionMissing).toBe(false);
    expect(f.metaDescriptionTooShort).toBe(false);
    expect(f.metaDescriptionTooLong).toBe(false);
  });
});

describe("analysePageHtml — open graph", () => {
  it("flags ogMissing when neither og:title nor og:image is present", () => {
    const f = analysePageHtml(wrap("", "<p>hi</p>"), URL);
    expect(f.ogMissing).toBe(true);
  });

  it("does not flag ogMissing when og:title is present", () => {
    const html = wrap(`<meta property="og:title" content="Hello">`, "<p>hi</p>");
    expect(analysePageHtml(html, URL).ogMissing).toBe(false);
  });

  it("does not flag ogMissing when og:image is present", () => {
    const html = wrap(`<meta property="og:image" content="https://ex.com/img.png">`, "<p>hi</p>");
    expect(analysePageHtml(html, URL).ogMissing).toBe(false);
  });
});

describe("analysePageHtml — heading structure", () => {
  it("flags headingNoH1 when there is no H1", () => {
    const f = analysePageHtml(wrap("", "<h2>Sub</h2><p>hi</p>"), URL);
    expect(f.headingNoH1).toBe(true);
    expect(f.headingMultipleH1).toBe(false);
  });

  it("flags headingMultipleH1 when there are 2+ H1s", () => {
    const f = analysePageHtml(wrap("", "<h1>One</h1><h1>Two</h1>"), URL);
    expect(f.headingMultipleH1).toBe(true);
    expect(f.headingNoH1).toBe(false);
  });

  it("flags headingSkippedLevel when a level is skipped (h2 -> h4)", () => {
    const f = analysePageHtml(wrap("", "<h1>Title</h1><h2>Section</h2><h4>Skipped</h4>"), URL);
    expect(f.headingSkippedLevel).toBe(true);
  });

  it("does not flag a clean h1->h2->h3 hierarchy", () => {
    const f = analysePageHtml(wrap("", "<h1>Title</h1><h2>Section</h2><h3>Sub</h3>"), URL);
    expect(f.headingNoH1).toBe(false);
    expect(f.headingMultipleH1).toBe(false);
    expect(f.headingSkippedLevel).toBe(false);
  });
});

describe("analysePageHtml — structured answer formats", () => {
  it("flags jsonLdAnswerFormatMissing when there is no JSON-LD", () => {
    const f = analysePageHtml(wrap("", "<p>hi</p>"), URL);
    expect(f.jsonLdAnswerFormatMissing).toBe(true);
  });

  it("does not flag when an FAQPage JSON-LD node is present", () => {
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [],
    });
    const html = wrap(`<script type="application/ld+json">${jsonLd}</script>`, "<p>hi</p>");
    expect(analysePageHtml(html, URL).jsonLdAnswerFormatMissing).toBe(false);
  });

  it("does not flag when an unrelated JSON-LD type (Organization) is combined with HowTo", () => {
    const jsonLd = JSON.stringify([
      { "@type": "Organization", name: "Ex" },
      { "@type": "HowTo", name: "Do a thing" },
    ]);
    const html = wrap(`<script type="application/ld+json">${jsonLd}</script>`, "<p>hi</p>");
    expect(analysePageHtml(html, URL).jsonLdAnswerFormatMissing).toBe(false);
  });

  it("still flags when JSON-LD exists but is only Organization/other types", () => {
    const jsonLd = JSON.stringify({ "@type": "Organization", name: "Ex" });
    const html = wrap(`<script type="application/ld+json">${jsonLd}</script>`, "<p>hi</p>");
    expect(analysePageHtml(html, URL).jsonLdAnswerFormatMissing).toBe(true);
  });
});

describe("analysePageHtml — FAQ content", () => {
  it("flags faqContentMissing when no Q&A pattern is present", () => {
    const f = analysePageHtml(wrap("", "<p>Just some prose with no questions.</p>"), URL);
    expect(f.faqContentMissing).toBe(true);
  });

  it("does not flag when dt/dd pairs are present", () => {
    const html = wrap("", "<dl><dt>What is this?</dt><dd>An answer.</dd></dl>");
    expect(analysePageHtml(html, URL).faqContentMissing).toBe(false);
  });

  it("does not flag when Q:/A: markers are present", () => {
    const html = wrap("", "<p>Q: What is this? A: An answer.</p>");
    expect(analysePageHtml(html, URL).faqContentMissing).toBe(false);
  });

  it("does not flag when 2+ question-style headings are present", () => {
    const html = wrap("", "<h2>What is this?</h2><h2>How does it work?</h2>");
    expect(analysePageHtml(html, URL).faqContentMissing).toBe(false);
  });

  it("still flags with only 1 question-style heading", () => {
    const html = wrap("", "<h1>Title</h1><h2>What is this?</h2>");
    expect(analysePageHtml(html, URL).faqContentMissing).toBe(true);
  });
});

describe("analysePageHtml — content density", () => {
  it("flags thinContent under 300 chars of body text", () => {
    const f = analysePageHtml(wrap("", "<p>Short.</p>"), URL);
    expect(f.thinContent).toBe(true);
  });

  it("does not flag thinContent with 300+ chars of body text", () => {
    const longText = "This is a sentence with real words in it. ".repeat(10);
    const f = analysePageHtml(wrap("", `<p>${longText}</p>`), URL);
    expect(f.thinContent).toBe(false);
  });

  it("flags lowTextRatio when markup dwarfs visible text", () => {
    const bloatedMarkup = `<div class="a b c d e" data-x="${"y".repeat(2000)}"><p>Hi</p></div>`;
    const f = analysePageHtml(wrap("", bloatedMarkup), URL);
    expect(f.lowTextRatio).toBe(true);
  });

  it("does not flag lowTextRatio for a normal text-to-markup ratio", () => {
    const longText = "This is a sentence with real words in it. ".repeat(20);
    const f = analysePageHtml(wrap("", `<p>${longText}</p>`), URL);
    expect(f.lowTextRatio).toBe(false);
  });
});

describe("fleschReadingEase", () => {
  it("scores simple, short-word text as easy (higher score)", () => {
    const easy = "The cat sat on the mat. It was a hot day. The dog ran fast.";
    const score = fleschReadingEase(easy);
    expect(score).not.toBeNull();
    expect(score as number).toBeGreaterThan(70);
  });

  it("scores dense, multi-syllable, long-sentence text as hard (lower score)", () => {
    const hard =
      "Notwithstanding the aforementioned considerations, the multifaceted interdependencies inherent " +
      "within contemporary organizational infrastructures necessitate comprehensive reconceptualization " +
      "of institutionalized methodological paradigms across heterogeneous operational jurisdictions.";
    const score = fleschReadingEase(hard);
    expect(score).not.toBeNull();
    expect(score as number).toBeLessThan(30);
  });

  it("returns null for empty text", () => {
    expect(fleschReadingEase("")).toBeNull();
    expect(fleschReadingEase("   ")).toBeNull();
  });

  it("hardToRead flag follows the score < 50 threshold", () => {
    const hard =
      "Notwithstanding the aforementioned considerations, the multifaceted interdependencies inherent " +
      "within contemporary organizational infrastructures necessitate comprehensive reconceptualization.";
    const html = wrap("", `<p>${hard}</p>`);
    const f = analysePageHtml(html, URL);
    expect(f.fleschScore).not.toBeNull();
    expect(f.hardToRead).toBe(true);
  });

  it("hardToRead is false for easy body text", () => {
    const easy =
      "The cat sat on the mat. It was a hot day. The dog ran fast. We had fun. It was a good day.";
    const html = wrap("", `<p>${easy}</p>`);
    const f = analysePageHtml(html, URL);
    expect(f.hardToRead).toBe(false);
  });
});
