// tests/e2e/raw-html.spec.ts
//
// ============================================================================
// SERVER-RENDERED HTML — THE MIGRATION'S REASON FOR EXISTING
// ============================================================================
// The public routes (/, /privacy, /glossary) are server-rendered by TanStack
// Start. Page-specific body copy and page-specific <head> metadata are in the
// bytes the server actually sends, before any JavaScript runs.
//
// The rest of the E2E suite asserts against the POST-HYDRATION DOM via
// `page.goto()`, which runs full client JS. That cannot tell the difference
// between "server-rendered" and "empty shell + JS did the rest" — if SSR
// silently regressed, those specs would stay green and nobody would notice.
//
// This spec closes that gap by fetching pages as RAW DOCUMENTS (Playwright's
// `request` fixture — a plain HTTP client that never parses or executes
// anything) and asserting on the literal served bytes.
//
// This file previously pinned the PRE-migration state, asserting that page
// copy was ABSENT. Those assertions were inverted here once Start began
// server-rendering these routes, exactly as that version's own header
// instructed. Verified against a real production build and server before
// being written — every literal below was copied from actual served output,
// not from the source components.
//
// >>> IF AN ASSERTION HERE FAILS, SSR OR PER-ROUTE METADATA HAS REGRESSED.
// >>> Do not weaken or delete this spec to make it pass.
// ============================================================================

import { test, expect } from "@playwright/test";

test.describe("Raw served HTML (pre-JS, server-rendered)", () => {
  // Public, unauthenticated routes — opt out of the shared authenticated
  // storageState the same way public-pages.spec.ts does, so this never
  // accidentally depends on (or exercises) a logged-in session.
  test.use({ storageState: { cookies: [], origins: [] } });

  // Site-wide defaults from the root route's head() (src/routes/__root.tsx).
  // Child routes override title/description; everything below is inherited.
  const SITE_TITLE = "VentureCite — Get cited by AI search engines";
  const SHARED_SOCIAL_DESCRIPTION =
    "Find where AI overlooks, misreads or undersells you, then fix the pages and sources shaping every answer.";

  /** Asserts the inherited, route-independent <head> markup is present. */
  function expectSharedHeadTags(html: string) {
    expect(html).toContain('<link rel="canonical" href="https://venturecite.com/"/>');
    expect(html).toContain(
      '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"/>',
    );

    // Open Graph.
    expect(html).toContain('<meta property="og:type" content="website"');
    expect(html).toContain('<meta property="og:site_name" content="VentureCite"');
    expect(html).toContain(`<meta property="og:title" content="${SITE_TITLE}"`);
    expect(html).toContain(
      `<meta property="og:description" content="${SHARED_SOCIAL_DESCRIPTION}"`,
    );
    expect(html).toContain('<meta property="og:url" content="https://venturecite.com/"');
    expect(html).toContain(
      '<meta property="og:image" content="https://venturecite.com/favicon.png"',
    );

    // Twitter.
    expect(html).toContain('<meta name="twitter:card" content="summary"');
    expect(html).toContain(`<meta name="twitter:title" content="${SITE_TITLE}"`);
    expect(html).toContain(
      '<meta name="twitter:image" content="https://venturecite.com/favicon.png"',
    );

    // JSON-LD structured data, emitted via the root route's head().scripts.
    expect(html).toContain('"@type":"SoftwareApplication"');
    expect(html).toContain('"@type":"Offer"');
  }

  /**
   * Asserts EXACTLY ONE <title> and ONE <meta name="description"> inside
   * <head>.
   *
   * This is a regression guard, not a formality. An earlier state of this
   * migration rendered site-wide defaults as raw JSX in the root component
   * AND page-specific tags in each page component. React 19 hoists both and
   * does NOT dedupe, so every public route silently shipped two titles and
   * two descriptions — invisible in a browser, harmful to exactly the
   * crawlability this migration exists to deliver. The fix was to move all
   * metadata into route head() options so HeadContent merges them with
   * defined precedence. This assertion is what keeps it that way.
   *
   * Scoped to <head> deliberately: the landing hero chart renders an SVG
   * <title> ("Visibility over time") in <body> for accessibility, which is
   * correct and must not be counted.
   */
  function expectSingleHeadMetadata(html: string) {
    const head = html.slice(html.indexOf("<head"), html.indexOf("</head>"));
    expect(head.match(/<title[ >]/g) ?? []).toHaveLength(1);
    expect(head.match(/name="description"/g) ?? []).toHaveLength(1);
    expect(head.match(/rel="canonical"/g) ?? []).toHaveLength(1);
  }

  test("/ is server-rendered with the landing sections and its own metadata", async ({
    request,
  }) => {
    // Fetch the raw document over HTTP directly — no browser page is ever
    // created, so no client JS (React, main.tsx, or anything else) runs.
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expectSharedHeadTags(html);
    expectSingleHeadMetadata(html);

    expect(html).toContain(`<title>${SITE_TITLE}</title>`);
    expect(html).toContain(`<meta name="description" content="${SHARED_SOCIAL_DESCRIPTION}"`);

    // Copy from the WhyNow section (client/src/pages/landing/sections/WhyNow/
    // WhyNow.tsx), chosen deliberately over hero copy: client/index.html used
    // to ship a hand-kept crawler-fallback mirror of the hero, so a hero
    // string could pass without SSR running at all. This string has never had
    // a static mirror.
    expect(html).toContain("make AI their first stop before buying");
  });

  test("/privacy is server-rendered with the policy body and its own metadata", async ({
    request,
  }) => {
    const response = await request.get("/privacy");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expectSharedHeadTags(html);
    expectSingleHeadMetadata(html);

    // Page-specific, overriding the root defaults.
    expect(html).toContain("<title>Privacy Policy - VentureCite</title>");
    expect(html).toContain(
      '<meta name="description" content="How VentureCite collects, uses, and protects your data."',
    );

    // client/src/pages/privacy.tsx renders docs/privacy-policy.md (loaded via
    // Vite's ?raw import) through SafeMarkdown. This exact sentence opens
    // docs/privacy-policy.md.
    expect(html).toContain("This Privacy Policy describes how VentureCite");
  });

  test("/glossary is server-rendered with the term definitions and its own metadata", async ({
    request,
  }) => {
    const response = await request.get("/glossary");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expectSharedHeadTags(html);
    expectSingleHeadMetadata(html);

    expect(html).toContain("<title>GEO vs AEO vs SEO — VentureCite Glossary</title>");
    expect(html).toContain(
      '<meta name="description" content="Plain-English definitions of GEO (Generative Engine Optimization), AEO (Answer Engine Optimization), and SEO (Search Engine Optimization), and how they layer."',
    );

    // Distinctive body copy from the AEO term definition
    // (client/src/pages/glossary.tsx's TERMS array).
    expect(html).toContain("Reddit threads, Wikipedia summaries, FAQ snippets");
  });

  test("the dashboard is NOT server-rendered — ssr:false must keep holding", async ({
    request,
  }) => {
    // The counterpart to the assertions above. Authenticated routes sit under
    // the pathless _app layout carrying `ssr: false` (src/routes/_app.tsx), so
    // the server must return a shell and never the dashboard's contents.
    // Without this, a future change flipping the whole tree to SSR would go
    // unnoticed — and would start server-rendering auth-gated pages.
    const response = await request.get("/dashboard");
    expect(response.status()).toBe(200);
    const html = await response.text();

    // "Add Your Brand" is unconditional markup in client/src/pages/brands.tsx,
    // reached through the dashboard shell once React mounts client-side.
    expect(html).not.toContain("Add Your Brand");
  });

  test("crawler files are served — robots, sitemap and llms", async ({ request }) => {
    // These live in client/public. Nitro resolves public assets relative to
    // `rootDir`, which this migration repointed at the repo root, so they were
    // briefly dropped from the build entirely — a silent failure that a
    // browser check would never surface. This is the guard for that.
    for (const [path, expectedType] of [
      ["/robots.txt", "text/plain"],
      ["/sitemap.xml", "application/xml"],
      ["/llms.txt", "text/plain"],
    ] as const) {
      const response = await request.get(path);
      expect(response.status(), `${path} must be served`).toBe(200);
      expect(response.headers()["content-type"] ?? "").toContain(expectedType);
    }

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Sitemap: https://venturecite.com/sitemap.xml");
  });
});
