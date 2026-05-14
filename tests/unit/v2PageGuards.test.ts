import { describe, it, expect } from "vitest";
import {
  isWafBlocked,
  isSoft404,
  isCookieWall,
  isHollowShell,
  isNonHtml,
  detectCanonicalRedirect,
} from "../../server/lib/factAgent/v2/pageGuards";

describe("pageGuards", () => {
  describe("isWafBlocked", () => {
    it("detects 403 + cf-ray header", () => {
      expect(isWafBlocked(403, { "cf-ray": "abc123", server: "cloudflare" })).toBe(true);
    });
    it("detects 503 + server: cloudflare", () => {
      expect(isWafBlocked(503, { server: "cloudflare" })).toBe(true);
    });
    it("does not flag a 200 with cf-ray (CDN-fronted real content)", () => {
      expect(isWafBlocked(200, { "cf-ray": "abc" })).toBe(false);
    });
    it("does not flag a 403 without WAF markers (real 403)", () => {
      expect(isWafBlocked(403, {})).toBe(false);
    });
  });

  describe("isSoft404", () => {
    it("flags pages with 'Page Not Found' prominent + no hydration", () => {
      const text = "Page Not Found — the page you requested does not exist.";
      expect(isSoft404(text, false)).toBe(true);
    });
    it("flags pages with 'coming soon' prominent + no hydration", () => {
      expect(isSoft404("Coming soon. We're launching shortly.", false)).toBe(true);
    });
    it("does not flag a real article that mentions 'page not found' inside content", () => {
      expect(
        isSoft404("This article discusses Page Not Found errors. " + "Filler. ".repeat(200), true),
      ).toBe(false);
    });
  });

  describe("isCookieWall", () => {
    it("flags short pages with consent keywords", () => {
      const text = "We use cookies. Please accept our GDPR consent to continue.";
      expect(isCookieWall(text, false)).toBe(true);
    });
    it("does not flag a real page that incidentally mentions cookies", () => {
      const text = "Our recipe site has 1200 cookie recipes. " + "Filler ".repeat(500);
      expect(isCookieWall(text, false)).toBe(false);
    });
  });

  describe("isHollowShell", () => {
    it("flags pages with no hydration + tiny body + no structured data", () => {
      expect(
        isHollowShell({
          hadHydration: false,
          hadRsc: false,
          hasStructuredData: false,
          bodyTextLength: 50,
        }),
      ).toBe(true);
    });
    it("does not flag if structured data exists (head has meta tags)", () => {
      expect(
        isHollowShell({
          hadHydration: false,
          hadRsc: false,
          hasStructuredData: true,
          bodyTextLength: 50,
        }),
      ).toBe(false);
    });
    it("does not flag if RSC payload exists", () => {
      expect(
        isHollowShell({
          hadHydration: false,
          hadRsc: true,
          hasStructuredData: false,
          bodyTextLength: 50,
        }),
      ).toBe(false);
    });
    it("does not flag if body has enough text", () => {
      expect(
        isHollowShell({
          hadHydration: false,
          hadRsc: false,
          hasStructuredData: false,
          bodyTextLength: 5000,
        }),
      ).toBe(false);
    });
  });

  describe("isNonHtml", () => {
    it("flags application/pdf", () => {
      expect(isNonHtml("application/pdf")).toBe(true);
    });
    it("flags image/jpeg", () => {
      expect(isNonHtml("image/jpeg")).toBe(true);
    });
    it("allows text/html", () => {
      expect(isNonHtml("text/html; charset=utf-8")).toBe(false);
    });
    it("allows text/plain", () => {
      expect(isNonHtml("text/plain")).toBe(false);
    });
    it("treats missing content-type as html (browsers do too)", () => {
      expect(isNonHtml("")).toBe(false);
      expect(isNonHtml(null)).toBe(false);
    });
  });

  describe("detectCanonicalRedirect", () => {
    it("returns the canonical URL when it differs from the request", () => {
      const html = `<link rel="canonical" href="https://www.example.com/p" />`;
      expect(detectCanonicalRedirect(html, "https://example.com/p?utm=x")).toBe(
        "https://www.example.com/p",
      );
    });
    it("returns null when canonical matches request (ignoring tracking params)", () => {
      const html = `<link rel="canonical" href="https://example.com/p" />`;
      expect(detectCanonicalRedirect(html, "https://example.com/p?utm_source=x")).toBeNull();
    });
    it("returns null when no canonical tag exists", () => {
      expect(detectCanonicalRedirect("<html></html>", "https://x.com/")).toBeNull();
    });
  });
});
