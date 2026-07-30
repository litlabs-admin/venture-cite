// Web framework / platform detection for a brand's homepage.
//
// Used by the site-health dashboard card to show a friendly "Built on
// Next.js" / "Built on WordPress" label. Best-effort only: any fetch/parse
// failure degrades to null, never throws, and never adds a per-render
// network round-trip (the caller runs this inside the same 6-hour cached
// path as the discovery/robots checks — see server/routes/dashboard.ts).
//
// Fetches via the SAME SSRF-safe primitive as server/lib/crawlerAccess.ts
// (safeFetchTextWithLockedIp — the underlying fetch behind safeFetchText,
// with the same maxBytes/timeout conventions), but we also need response
// HEADERS (x-powered-by, x-generator, x-wix-request-id), which plain
// safeFetchText does not expose. NEVER use bare fetch() on a user-supplied
// URL — always go through this SSRF-checked path.
//
// ── Signature table, NOT a vendored fingerprint DB ──────────────────────
// This is a small, hand-curated table of markers we have personally
// verified (asset paths, JS globals, generator meta tags, response
// headers). It is NOT derived from and does not vendor Wappalyzer's
// fingerprint database (GPL-3.0 / commercial) or any other third-party
// technology-detection dataset. Every entry below must be added the same
// way: a marker someone actually confirmed on a real site, not a guess.

import { safeFetchTextWithLockedIp } from "./ssrf";
import { withOriginLimit } from "./originConcurrency";

export interface TechSignature {
  name: string;
  category: "framework" | "cms" | "ecommerce" | "builder" | "ssg" | "docs" | "backend";
  /** Substrings searched in the lowercased HTML. */
  html?: string[];
  /** header name -> substring that must appear in its lowercased value; empty string = header merely present. */
  headers?: Record<string, string>;
  /** matched against <meta name="generator"> content, lowercased substring */
  generator?: string[];
  /**
   * Higher wins. Evaluation order, not just tie-break:
   *  200 = unmistakable first-party build output (can only appear if the
   *        site was actually built with that tool).
   *  100 = strong platform markers (dedicated CDN/asset domain, definitive
   *        generator tag, platform-specific response header).
   *   50 = embeddable/third-party markers that a site built with something
   *        else can still carry (tracking snippets, embeddable widgets,
   *        CDN paths also used for merch/embeds).
   *   10 = generic underlying library markers (React/Vue/Angular/jQuery)
   *        that must never shadow a framework built on top of them.
   */
  priority: 200 | 100 | 50 | 10;
}

export const SIGNATURES: TechSignature[] = [
  // ══════════════════════ priority 200 — first-party build output ═══════
  {
    name: "Next.js",
    category: "framework",
    html: ["/_next/static", "__next_data__"],
    headers: { "x-powered-by": "next.js" },
    priority: 200,
  },
  {
    name: "Nuxt",
    category: "framework",
    html: ["__nuxt__", "/_nuxt/"],
    priority: 200,
  },
  {
    name: "Gatsby",
    category: "ssg",
    html: ["___gatsby", "/page-data/"],
    priority: 200,
  },
  {
    name: "SvelteKit",
    category: "framework",
    html: ["__sveltekit", "/_app/immutable/"],
    priority: 200,
  },
  // Remix / React Router. Remix folded into React Router v7, so modern
  // builds emit `__reactRouterContext` instead of `__remixContext`; both
  // are checked. The bare word "remix" is deliberately NOT a signal:
  // remix.run's own homepage no longer ships `__remixContext`, and
  // matching the word would report "Remix" for any page that merely
  // mentions it.
  {
    name: "Remix",
    category: "framework",
    html: ["__remixcontext", "__reactroutercontext"],
    priority: 200,
  },
  {
    name: "Astro",
    category: "framework",
    html: ["astro-island"],
    generator: ["astro"],
    priority: 200,
  },
  {
    name: "Qwik",
    category: "framework",
    html: ["q:container", "/build/q-"],
    priority: 200,
  },
  {
    name: "SolidStart",
    category: "framework",
    // `/_build/` was REMOVED: Remix v1, Phoenix and several bundlers emit it,
    // and at priority 200 it outranked every genuine signature. Only the
    // framework-specific attribute is trustworthy.
    html: ["data-solidstart"],
    priority: 200,
  },
  {
    name: "Docusaurus",
    category: "docs",
    html: ["docusaurus.config", "__docusaurus"],
    generator: ["docusaurus"],
    priority: 200,
  },
  {
    name: "VitePress",
    category: "docs",
    // Bare "vitepress" REMOVED from html: it matched any page that merely
    // writes the word (a blog post, a docs index). The generator tag is the
    // authoritative signal — vitepress.dev ships
    // <meta name="generator" content="vitepress v2.0.0-alpha.18">.
    html: ["/assets/vp-"],
    generator: ["vitepress"],
    priority: 200,
  },
  {
    name: "VuePress",
    category: "docs",
    html: ["__vuepress"],
    priority: 200,
  },
  {
    name: "Nextra",
    category: "docs",
    html: ["nextra-theme", '__next_data__":{"props":{"pageprops":{"pageopts"'],
    priority: 200,
  },
  {
    name: "Fresh",
    category: "framework",
    html: ["__frsh"],
    priority: 200,
  },
  {
    name: "RedwoodJS",
    category: "framework",
    html: ["__redwoodjs"],
    priority: 200,
  },
  {
    name: "Framer",
    category: "builder",
    html: ["framerusercontent.com"],
    priority: 200,
  },
  {
    name: "Wix",
    category: "builder",
    html: ["static.wixstatic.com"],
    headers: { "x-wix-request-id": "" },
    priority: 200,
  },

  // ══════════════════════ priority 100 — strong platform markers ═════════
  {
    // Evaluated BEFORE the generic WordPress entry: "/wp-content/plugins/woocommerce"
    // also contains the WordPress marker "/wp-content/", and the more
    // specific match must win within the same priority band (evaluation is
    // stable-sorted, so earlier array position wins a same-priority tie).
    name: "WooCommerce",
    category: "ecommerce",
    html: ["/wp-content/plugins/woocommerce"],
    priority: 100,
  },
  {
    name: "WordPress",
    category: "cms",
    html: ["/wp-content/", "/wp-includes/"],
    generator: ["wordpress"],
    priority: 100,
  },
  {
    name: "Drupal",
    category: "cms",
    html: ["/sites/default/files/"],
    headers: { "x-generator": "drupal", "x-drupal-cache": "" },
    priority: 100,
  },
  {
    name: "Joomla",
    category: "cms",
    html: ["/media/jui/", "/templates/system/"],
    generator: ["joomla"],
    priority: 100,
  },
  {
    name: "Ghost",
    category: "cms",
    // "ghost.io" REMOVED: linking to somebody else's Ghost blog is not
    // evidence that THIS site runs Ghost.
    html: ["/ghost/api/"],
    generator: ["ghost"],
    priority: 100,
  },
  {
    name: "TYPO3",
    category: "cms",
    html: ["/typo3conf/", "/typo3temp/"],
    generator: ["typo3"],
    priority: 100,
  },
  {
    name: "Umbraco",
    category: "cms",
    html: ["/umbraco/"],
    headers: { "x-umbraco-version": "" },
    priority: 100,
  },
  {
    name: "Sitecore",
    category: "cms",
    html: ["/sitecore/shell/", "/-/media/"],
    priority: 100,
  },
  {
    name: "Adobe Experience Manager",
    category: "cms",
    html: ["/etc.clientlibs/", "/content/dam/"],
    priority: 100,
  },
  {
    name: "Craft CMS",
    category: "cms",
    html: ["/cpresources/"],
    headers: { "x-powered-by": "craft cms" },
    priority: 100,
  },
  {
    name: "Statamic",
    category: "cms",
    html: ["/vendor/statamic/"],
    headers: { "x-statamic-version": "" },
    priority: 100,
  },
  {
    name: "Contentful",
    category: "cms",
    html: ["images.ctfassets.net"],
    priority: 100,
  },
  {
    name: "Sanity",
    category: "cms",
    html: ["cdn.sanity.io"],
    priority: 100,
  },
  {
    name: "Concrete CMS",
    category: "cms",
    html: ["/concrete/js/", "/application/files/"],
    generator: ["concrete5", "concretecms"],
    priority: 100,
  },
  {
    name: "MODX",
    category: "cms",
    generator: ["modx"],
    priority: 100,
  },
  {
    name: "SilverStripe",
    category: "cms",
    html: ["/framework/thirdparty/"],
    generator: ["silverstripe"],
    priority: 100,
  },
  {
    name: "Grav",
    category: "cms",
    generator: ["grav"],
    priority: 100,
  },
  {
    name: "ExpressionEngine",
    category: "cms",
    headers: { "x-powered-by": "expressionengine" },
    priority: 100,
  },
  {
    name: "Kentico",
    category: "cms",
    headers: { "x-cms": "kentico" },
    generator: ["kentico"],
    priority: 100,
  },
  {
    name: "Shopify",
    category: "ecommerce",
    // `Shopify.theme` / `myshopify.com` are definitive (only a Shopify
    // storefront defines/serves them). `cdn.shopify.com` alone is weaker —
    // any site can embed a Shopify buy-button or merch widget from it — but
    // it is still evaluated at this tier because nothing below outranks it
    // except the first-party site-builder markers above (Framer, Wix,
    // Squarespace, Webflow), which is the property the regression test
    // "Framer, not Shopify" exists to guard.
    html: ["shopify.theme", "myshopify.com", "cdn.shopify.com"],
    headers: { "x-shopify-stage": "" },
    priority: 100,
  },
  {
    name: "Magento",
    category: "ecommerce",
    html: ["/skin/frontend/", "mage/cookies.js"],
    headers: { "x-magento-cache-debug": "" },
    priority: 100,
  },
  {
    name: "BigCommerce",
    category: "ecommerce",
    html: ["cdn11.bigcommerce.com"],
    priority: 100,
  },
  {
    name: "PrestaShop",
    category: "ecommerce",
    html: ["/modules/ps_"],
    generator: ["prestashop"],
    priority: 100,
  },
  {
    name: "OpenCart",
    category: "ecommerce",
    html: ["route=product/", "catalog/view/theme"],
    priority: 100,
  },
  {
    name: "Salesforce Commerce Cloud",
    category: "ecommerce",
    html: ["/on/demandware.store/"],
    priority: 100,
  },
  {
    name: "SAP Commerce Cloud",
    category: "ecommerce",
    html: ["/hybris/"],
    priority: 100,
  },
  {
    name: "Ecwid",
    category: "ecommerce",
    html: ["app.ecwid.com", "d3fi9i0jj23cnq.cloudfront.net"],
    priority: 100,
  },
  {
    name: "Shopware",
    category: "ecommerce",
    html: ["/media/thumbnail/", "shopware"],
    generator: ["shopware"],
    priority: 100,
  },
  {
    name: "Hydrogen",
    category: "ecommerce",
    html: ["hydrogen.shopify.com", "createhydrogencontext"],
    priority: 100,
  },
  {
    name: "Webflow",
    category: "builder",
    html: [".webflow."],
    generator: ["webflow"],
    priority: 100,
  },
  {
    name: "Squarespace",
    category: "builder",
    html: ["static1.squarespace.com"],
    generator: ["squarespace"],
    priority: 100,
  },
  {
    name: "Weebly",
    category: "builder",
    html: ["cdn2.editmysite.com"],
    generator: ["weebly"],
    priority: 100,
  },
  {
    name: "Jimdo",
    category: "builder",
    html: ["jimdo.com/app/"],
    generator: ["jimdo"],
    priority: 100,
  },
  {
    name: "Duda",
    category: "builder",
    html: ["irp.cdn-website.com"],
    priority: 100,
  },
  {
    name: "Tilda",
    category: "builder",
    html: ["static.tildacdn.com"],
    priority: 100,
  },
  {
    name: "Carrd",
    category: "builder",
    html: ["cdn.carrd.co"],
    priority: 100,
  },
  {
    name: "Bubble",
    category: "builder",
    html: ["cdn.bubble.io"],
    priority: 100,
  },
  {
    name: "Softr",
    category: "builder",
    html: ["assets.softr.app"],
    priority: 100,
  },
  {
    name: "GoDaddy Website Builder",
    category: "builder",
    html: ["img1.wsimg.com"],
    priority: 100,
  },
  {
    name: "Strikingly",
    category: "builder",
    html: ["assets-cdn.strikingly.com"],
    priority: 100,
  },
  {
    name: "Readymag",
    category: "builder",
    html: ["readymag.com/rmk/"],
    priority: 100,
  },
  {
    name: "GitBook",
    category: "docs",
    html: ["gitbook.io", "/~gitbook/"],
    priority: 100,
  },
  {
    name: "ReadMe",
    category: "docs",
    html: ["readme.io", "static.readme.io"],
    priority: 100,
  },
  {
    name: "Mintlify",
    category: "docs",
    html: ["mintlify.com", "mintlify-assets"],
    priority: 100,
  },
  {
    name: "Substack",
    category: "docs",
    html: ["substackcdn.com"],
    priority: 100,
  },
  {
    name: "Kajabi",
    category: "docs",
    html: ["kajabi-cdn.com"],
    priority: 100,
  },
  {
    name: "Podia",
    category: "docs",
    html: ["podia.com/podia-static"],
    priority: 100,
  },
  {
    name: "Teachable",
    category: "docs",
    html: ["cloudfront.net/assets/teachable"],
    priority: 100,
  },
  {
    name: "Unbounce",
    category: "docs",
    html: ["unbounce.com", "static.unbounce.com"],
    priority: 100,
  },
  {
    name: "Instapage",
    category: "docs",
    html: ["instapage.com"],
    priority: 100,
  },
  {
    name: "ClickFunnels",
    category: "docs",
    html: ["clickfunnels.com"],
    priority: 100,
  },
  {
    name: "Leadpages",
    category: "docs",
    html: ["leadpages.net", "lp-assets.leadpages"],
    priority: 100,
  },
  {
    name: "Circle",
    category: "docs",
    html: ["circle.so"],
    priority: 100,
  },
  {
    name: "Beehiiv",
    category: "docs",
    html: ["media.beehiiv.com"],
    priority: 100,
  },
  {
    name: "Hugo",
    category: "ssg",
    generator: ["hugo"],
    priority: 100,
  },
  {
    name: "Jekyll",
    category: "ssg",
    generator: ["jekyll"],
    priority: 100,
  },
  {
    name: "Eleventy",
    category: "ssg",
    generator: ["eleventy"],
    priority: 100,
  },
  {
    name: "Hexo",
    category: "ssg",
    generator: ["hexo"],
    priority: 100,
  },
  {
    name: "Zola",
    category: "ssg",
    generator: ["zola"],
    priority: 100,
  },
  {
    name: "Pelican",
    category: "ssg",
    generator: ["pelican"],
    priority: 100,
  },
  {
    name: "Middleman",
    category: "ssg",
    generator: ["middleman"],
    priority: 100,
  },
  {
    name: "MkDocs",
    category: "docs",
    generator: ["mkdocs"],
    priority: 100,
  },
  {
    name: "Sphinx",
    category: "docs",
    html: ["sphinx-doc", "_static/sphinx_highlight.js"],
    priority: 100,
  },
  {
    name: "Ruby on Rails",
    category: "backend",
    headers: { "x-powered-by": "phusion passenger" },
    html: ["csrf-param", "data-turbo-track"],
    priority: 100,
  },
  {
    name: "Django",
    category: "backend",
    headers: { "x-powered-by": "django" },
    html: ["csrfmiddlewaretoken"],
    priority: 100,
  },
  {
    name: "Laravel",
    category: "backend",
    headers: { "x-powered-by": "php" },
    html: ["laravel_session"],
    priority: 100,
  },
  {
    name: "Symfony",
    category: "backend",
    html: ["symfony"],
    headers: { "x-debug-token": "" },
    priority: 100,
  },
  {
    name: "ASP.NET",
    category: "backend",
    headers: { "x-powered-by": "asp.net", "x-aspnet-version": "" },
    priority: 100,
  },
  {
    name: "Spring",
    category: "backend",
    headers: { "x-application-context": "" },
    priority: 100,
  },
  {
    name: "Phoenix",
    category: "backend",
    html: ["phoenix.liveview", "data-phx-main"],
    priority: 100,
  },
  {
    name: "Express",
    category: "backend",
    headers: { "x-powered-by": "express" },
    priority: 100,
  },
  {
    name: "CodeIgniter",
    category: "backend",
    headers: { "x-powered-by": "codeigniter" },
    priority: 100,
  },
  {
    name: "Angular",
    category: "framework",
    html: ["ng-version"],
    priority: 100,
  },
  {
    name: "Ember",
    category: "framework",
    html: ['id="ember'],
    priority: 100,
  },

  // ══════════════════════ priority 50 — embeddable / third-party ════════
  {
    name: "HubSpot",
    category: "docs",
    // Bare "hubspot" REMOVED: it matched any page that mentions the company.
    // These three are actual HubSpot-served asset hosts.
    html: ["hs-scripts.com", "hubspotusercontent", "hs-banner.com"],
    priority: 50,
  },
  {
    name: "Squarespace Commerce",
    category: "ecommerce",
    html: ["squarespace-cdn.com/commerce"],
    priority: 50,
  },

  // ══════════════════════ priority 10 — generic libraries ════════════════
  {
    name: "Vue",
    category: "framework",
    html: ["data-v-app", "__vue__"],
    priority: 10,
  },
  {
    name: "React",
    category: "framework",
    html: ["data-reactroot", "__react_devtools"],
    priority: 10,
  },
];

/**
 * Pure signature matcher — no network I/O, fully unit-testable.
 *
 * The table is evaluated in priority order (200 -> 10, stable within a
 * band), so unmistakable first-party build output always beats a generic
 * library marker or an embeddable third-party script. First confident
 * match wins.
 */
export function detectFromSignals(params: {
  html: string;
  headers: Record<string, string>;
}): string | null {
  const html = (params.html ?? "").toLowerCase();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.headers ?? {})) {
    headers[k.toLowerCase()] = (v ?? "").toLowerCase();
  }

  // <meta name="generator" content="...">
  const metaMatch = html.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i);
  const generator = (metaMatch?.[1] ?? "").toLowerCase();

  const ordered = [...SIGNATURES].sort((a, b) => b.priority - a.priority);

  for (const sig of ordered) {
    if (sig.html?.some((needle) => html.includes(needle.toLowerCase()))) {
      return sig.name;
    }
    if (sig.generator?.some((needle) => generator.includes(needle.toLowerCase()))) {
      return sig.name;
    }
    if (sig.headers) {
      for (const [headerName, needle] of Object.entries(sig.headers)) {
        const value = headers[headerName.toLowerCase()];
        if (value === undefined) continue;
        if (needle === "" || value.includes(needle.toLowerCase())) {
          return sig.name;
        }
      }
    }
  }

  return null;
}

/**
 * Fetch a website's homepage (SSRF-safe) and detect its platform. Never
 * throws — any failure (fetch error, invalid URL, timeout) resolves to
 * null.
 */
export async function detectPlatform(website: string): Promise<string | null> {
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    // truncateOnLimit: every signature we look for lives in <head> or the
    // first few KB of body (measured: wixstatic at byte 2753,
    // framerusercontent at byte 600). Real homepages are far bigger than the
    // cap — wix.com is 3.1 MB, framer.com 2.3 MB — and throwing on those made
    // "big site" indistinguishable from "unknown stack". Read the first 1 MB
    // and match on that; memory stays bounded exactly as before.
    const origin = new URL(url).origin;
    const { text, headers, contentType, status } = await withOriginLimit(origin, () =>
      safeFetchTextWithLockedIp(url, {
        maxBytes: 1 * 1024 * 1024,
        timeoutMs: 10_000,
        truncateOnLimit: true,
        headers: { "User-Agent": "GEO-Platform-Checker/1.0" },
      }),
    );
    // A 4xx/5xx body is an error page, not the site — detecting "WordPress"
    // off someone's 404 template would be worse than admitting we don't know.
    if (status < 200 || status >= 300) return null;
    // Non-HTML (a JSON API root, a PDF) carries no framework signature.
    if (contentType && !/html|xml|text\/plain/i.test(contentType)) return null;
    return detectFromSignals({ html: text, headers });
  } catch {
    return null;
  }
}
