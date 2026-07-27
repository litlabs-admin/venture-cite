// tests/e2e/raw-html.spec.ts
//
// ============================================================================
// PRE-MIGRATION BASELINE — READ BEFORE "FIXING" A FAILURE HERE
// ============================================================================
// This app is a client-rendered Vite SPA today. Every route is served the
// SAME client/index.html: a static <head> (title, meta description,
// canonical, Open Graph, Twitter, JSON-LD) plus a hand-kept crawler-fallback
// mirror of the landing hero copy in <body>. Page-specific content (the
// privacy policy text, the glossary term definitions, etc.) only exists
// after React hydrates in the browser — it is NOT in the bytes the server
// actually sends.
//
// The existing suite (public-pages.spec.ts) only ever asserts against the
// POST-HYDRATION DOM via `page.goto()`, which runs full client JS. That
// means it cannot tell the difference between "server-rendered HTML" and
// "empty shell + JS did the rest" — if the upcoming TanStack Start migration
// shipped and these public routes were STILL client-only, that 63-test
// suite would stay green and nobody would notice.
//
// This spec closes that gap by fetching pages as RAW DOCUMENTS (Playwright's
// `request` fixture — a plain HTTP client that never parses or executes
// anything) and asserting on the literal served bytes.
//
// It pins the CURRENT, HONEST state:
//   - The static <head> tags from client/index.html ARE present (asserted).
//   - Page-specific body copy is ABSENT (asserted) — it only shows up once
//     React renders client-side.
//
// >>> WHEN TANSTACK START STARTS SERVER-RENDERING THESE ROUTES, THE
// >>> "ABSENCE" ASSERTIONS BELOW WILL START FAILING. THAT FAILURE IS THE
// >>> GOAL OF PHASE 2, NOT A REGRESSION.
// >>> The correct response is to INVERT each failing "does NOT contain"
// >>> assertion into a "DOES contain" assertion (and update the per-route
// >>> raw <title>/<meta description> expectations to the page-specific
// >>> values SSR should now be emitting) — never to delete or weaken this
// >>> spec to make it pass again.
// ============================================================================

import { test, expect } from "@playwright/test";

test.describe("Raw served HTML (pre-JS, pre-migration baseline)", () => {
  // Public, unauthenticated routes — opt out of the shared authenticated
  // storageState the same way public-pages.spec.ts does, so this never
  // accidentally depends on (or exercises) a logged-in session.
  test.use({ storageState: { cookies: [], origins: [] } });

  // Static tags shipped in client/index.html's <head>. These are identical
  // for every route today because every route resolves to the same
  // index.html — the dev/prod server has no per-route SSR yet.
  const STATIC_TITLE = "VentureCite — Get cited by AI search engines";
  const STATIC_DESCRIPTION =
    "VentureCite shows you where AI overlooks, misreads or undersells your brand, then fixes the pages and sources shaping every AI answer. Take control of how AI search engines cite you.";
  const STATIC_OG_DESCRIPTION =
    "Find where AI overlooks, misreads or undersells you, then fix the pages and sources shaping every answer.";

  /** Asserts the static, route-independent <head> markup from client/index.html is present. */
  function expectStaticHeadTags(html: string) {
    // <title>
    expect(html).toContain(`<title>${STATIC_TITLE}</title>`);

    // Static crawler-fallback meta description (name="description").
    expect(html).toContain(`content="${STATIC_DESCRIPTION}"`);

    // Canonical link.
    expect(html).toContain('<link rel="canonical" href="https://venturecite.com/" />');

    // Open Graph tags.
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:site_name" content="VentureCite" />');
    expect(html).toContain(`<meta property="og:title" content="${STATIC_TITLE}" />`);
    expect(html).toContain(`content="${STATIC_OG_DESCRIPTION}"`);
    expect(html).toContain('<meta property="og:url" content="https://venturecite.com/" />');
    expect(html).toContain(
      '<meta property="og:image" content="https://venturecite.com/favicon.png" />',
    );

    // Twitter tags.
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).toContain(`<meta name="twitter:title" content="${STATIC_TITLE}" />`);
    expect(html).toContain(
      '<meta name="twitter:image" content="https://venturecite.com/favicon.png" />',
    );

    // JSON-LD structured data block.
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type": "SoftwareApplication"');
    expect(html).toContain('"name": "VentureCite"');
  }

  test("/ raw HTML has the static head tags but not the landing sections — pre-SSR baseline, must flip in Phase 2", async ({
    request,
  }) => {
    // Fetch the raw document over HTTP directly — no browser page is ever
    // created, so no client JS (React, main.tsx, or anything else) runs.
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expectStaticHeadTags(html);

    // client/index.html DOES ship a hand-kept crawler-fallback mirror of the
    // hero copy inside <div id="root"> (see the "Crawler / no-JS fallback"
    // comment there), so a hero string alone would not prove hydration is
    // required. Use copy from further down the page — the WhyNow section's
    // headline (client/src/pages/landing/sections/WhyNow/WhyNow.tsx) — which
    // has no static mirror at all and only exists once React renders it.
    expect(html).not.toContain("make AI their first stop before buying");
  });

  test("/privacy raw HTML has no policy body — pre-SSR baseline, must flip in Phase 2", async ({
    request,
  }) => {
    const response = await request.get("/privacy");
    expect(response.status()).toBe(200);
    const html = await response.text();

    // Same document as "/" — the SPA has no per-route SSR yet, so it's still
    // the generic static head, not a page-specific one.
    expectStaticHeadTags(html);
    expect(html).not.toContain("<title>Privacy Policy - VentureCite</title>");
    expect(html).not.toContain('content="How VentureCite collects, uses, and protects your data."');

    // client/src/pages/privacy.tsx renders docs/privacy-policy.md (loaded via
    // Vite's ?raw import) through SafeMarkdown inside a useEffect-free React
    // tree — it only exists in the DOM after React mounts. This exact
    // sentence opens docs/privacy-policy.md.
    expect(html).not.toContain("This Privacy Policy describes how VentureCite");
  });

  test("/glossary raw HTML has no term definitions — pre-SSR baseline, must flip in Phase 2", async ({
    request,
  }) => {
    const response = await request.get("/glossary");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expectStaticHeadTags(html);
    expect(html).not.toContain("<title>GEO vs AEO vs SEO — VentureCite Glossary</title>");

    // client/src/pages/glossary.tsx sets its title and description via a
    // useEffect (client-side only, see its "Inline title + meta tag setter"
    // comment) and its JSON-LD DefinedTermSet via dangerouslySetInnerHTML
    // inside the React tree — none of it is in the raw document.
    expect(html).not.toContain('"@type": "DefinedTermSet"');

    // Distinctive body copy from the AEO term definition
    // (client/src/pages/glossary.tsx's TERMS array) — only rendered by React.
    expect(html).not.toContain("Reddit threads, Wikipedia summaries, FAQ snippets");
  });
});
