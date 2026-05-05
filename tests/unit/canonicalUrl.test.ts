import { describe, it, expect } from "vitest";
import { canonicalizeMentionUrl } from "../../server/lib/canonicalUrl";

describe("canonicalizeMentionUrl", () => {
  it("Reddit post: strips query + trailing slash", () => {
    expect(
      canonicalizeMentionUrl(
        "reddit",
        "https://reddit.com/r/saas/comments/abc123/some_title/?context=3",
      ),
    ).toBe("https://reddit.com/r/saas/comments/abc123");
  });

  it("Reddit comment: keeps comment id segment", () => {
    expect(
      canonicalizeMentionUrl("reddit", "https://reddit.com/r/saas/comments/abc123/title/cmt456/"),
    ).toBe("https://reddit.com/r/saas/comments/abc123/cmt456");
  });

  it("HN: PRESERVES the ?id= query (regression for audit A15)", () => {
    expect(
      canonicalizeMentionUrl("hackernews", "https://news.ycombinator.com/item?id=12345&p=2"),
    ).toBe("https://news.ycombinator.com/item?id=12345");
  });

  it("HN: distinct ids stay distinct", () => {
    const a = canonicalizeMentionUrl("hackernews", "https://news.ycombinator.com/item?id=1");
    const b = canonicalizeMentionUrl("hackernews", "https://news.ycombinator.com/item?id=2");
    expect(a).not.toBe(b);
  });

  it("Quora: lowercase slug, strip query, drop trailing slash", () => {
    expect(
      canonicalizeMentionUrl("quora", "https://www.quora.com/Some-Question-Title/?share=1"),
    ).toBe("https://www.quora.com/some-question-title");
  });

  it("returns input unchanged when URL is malformed", () => {
    expect(canonicalizeMentionUrl("reddit", "not a url")).toBe("not a url");
  });
});
