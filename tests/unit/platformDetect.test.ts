import { describe, it, expect } from "vitest";
import { detectFromSignals, SIGNATURES } from "../../server/lib/platformDetect";

describe("detectFromSignals", () => {
  it("detects Next.js from an html marker", () => {
    const result = detectFromSignals({
      html: `<html><body><script src="/_next/static/chunks/main.js"></script></body></html>`,
      headers: {},
    });
    expect(result).toBe("Next.js");
  });

  it("detects Next.js from the x-powered-by header", () => {
    const result = detectFromSignals({
      html: `<html><body>hello</body></html>`,
      headers: { "X-Powered-By": "Next.js" },
    });
    expect(result).toBe("Next.js");
  });

  it("detects WordPress from /wp-content/", () => {
    const result = detectFromSignals({
      html: `<html><head><link rel="stylesheet" href="/wp-content/themes/foo/style.css"></head></html>`,
      headers: {},
    });
    expect(result).toBe("WordPress");
  });

  it("detects Shopify from cdn.shopify.com", () => {
    const result = detectFromSignals({
      html: `<html><body><img src="https://cdn.shopify.com/s/files/1/logo.png"></body></html>`,
      headers: {},
    });
    expect(result).toBe("Shopify");
  });

  it("detects a platform from a meta generator tag", () => {
    const result = detectFromSignals({
      html: `<html><head><meta name="generator" content="WordPress 6.4"></head></html>`,
      headers: {},
    });
    expect(result).toBe("WordPress");
  });

  it("precedence: a Next.js site that also contains React markers reports Next.js", () => {
    const result = detectFromSignals({
      html: `<html><body data-reactroot=""><script src="/_next/static/chunks/main.js"></script></body></html>`,
      headers: {},
    });
    expect(result).toBe("Next.js");
  });

  it("returns null when nothing matches", () => {
    const result = detectFromSignals({
      html: `<html><body><h1>Just a plain site</h1></body></html>`,
      headers: {},
    });
    expect(result).toBeNull();
  });
});

// ─── Regressions found by testing against live sites ────────────────────────
describe("detectFromSignals precedence regressions", () => {
  it("reports Framer, not Shopify, for a Framer site that embeds a Shopify merch store", () => {
    // Measured on framer.com: it serves framerusercontent.com AND links
    // cdn.shopify.com for merch. With Shopify checked first it was misreported.
    const html = `<html><head><link href="https://framerusercontent.com/x.css">
      <script src="https://cdn.shopify.com/s/files/buy-button.js"></script></head></html>`;
    expect(detectFromSignals({ html, headers: {} })).toBe("Framer");
  });

  it("reports Wix from the x-wix-request-id header even with no HTML marker", () => {
    expect(
      detectFromSignals({ html: "<html></html>", headers: { "x-wix-request-id": "123" } }),
    ).toBe("Wix");
  });

  it("detects modern Remix builds via __reactRouterContext", () => {
    // Remix folded into React Router v7; shopify.com matches on this alone.
    expect(
      detectFromSignals({ html: "<script>window.__reactRouterContext={}</script>", headers: {} }),
    ).toBe("Remix");
  });

  it("does NOT report Remix for a page that merely mentions the word", () => {
    // remix.run's own homepage no longer ships the context global.
    expect(detectFromSignals({ html: "<p>We love Remix and Rails</p>", headers: {} })).toBeNull();
  });

  it("does NOT report HubSpot for a Next.js site carrying a HubSpot tracking snippet", () => {
    const html = `<html><head><script src="/_next/static/a.js"></script>
      <script src="https://js.hs-scripts.com/123.js"></script></head></html>`;
    expect(detectFromSignals({ html, headers: {} })).toBe("Next.js");
  });
});

// ─── Table integrity ─────────────────────────────────────────────────────
describe("SIGNATURES table integrity", () => {
  it("has unique names", () => {
    const names = SIGNATURES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every entry has at least one of html/headers/generator", () => {
    for (const sig of SIGNATURES) {
      const hasSomething =
        (sig.html && sig.html.length > 0) ||
        (sig.headers && Object.keys(sig.headers).length > 0) ||
        (sig.generator && sig.generator.length > 0);
      expect(hasSomething, `${sig.name} has no markers`).toBeTruthy();
    }
  });

  it("all priorities are within the documented bands", () => {
    for (const sig of SIGNATURES) {
      expect([200, 100, 50, 10], `${sig.name} has invalid priority ${sig.priority}`).toContain(
        sig.priority,
      );
    }
  });

  it("no entry has an empty-string html marker", () => {
    for (const sig of SIGNATURES) {
      for (const needle of sig.html ?? []) {
        expect(needle.length, `${sig.name} has an empty html marker`).toBeGreaterThan(0);
      }
    }
  });

  it("has at least 60 entries", () => {
    expect(SIGNATURES.length).toBeGreaterThanOrEqual(60);
  });

  // Every row is reachable: build a minimal document from the entry's own
  // first marker and confirm detectFromSignals returns that entry's name,
  // OR a higher-priority entry's name (overlap with a higher band is
  // intentional - e.g. a Shopify cdn.shopify.com fixture that happens to
  // also look like something else higher-priority is not a bug here, but
  // in practice each fixture below is built to be unambiguous).
  for (const sig of SIGNATURES) {
    it(`reaches "${sig.name}" from its own first marker`, () => {
      let html = "<html><head>";
      const headers: Record<string, string> = {};

      if (sig.html && sig.html.length > 0) {
        html += `<!-- ${sig.html[0]} -->`;
      } else if (sig.generator && sig.generator.length > 0) {
        html += `<meta name="generator" content="${sig.generator[0]}">`;
      } else if (sig.headers && Object.keys(sig.headers).length > 0) {
        const [headerName, needle] = Object.entries(sig.headers)[0];
        headers[headerName] = needle === "" ? "present" : needle;
      }
      html += "</head><body></body></html>";

      const result = detectFromSignals({ html, headers });
      expect(result).not.toBeNull();

      const resultSig = SIGNATURES.find((s) => s.name === result);
      const ownSig = sig;
      const acceptable = result === sig.name || (resultSig && resultSig.priority > ownSig.priority);
      expect(
        acceptable,
        `expected "${sig.name}" (priority ${sig.priority}) or a higher-priority match, got "${result}"`,
      ).toBeTruthy();
    });
  }
});
