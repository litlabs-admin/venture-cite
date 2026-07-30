// Live-corpus test for server/lib/platformDetect.ts.
//
// This suite fetches REAL public homepages over the network and asserts
// detectPlatform() reports the expected technology. It is intentionally
// excluded from normal test runs (`npm test`) and CI: network-dependent
// assertions are flaky by nature (a site redesign, a CDN migration, or a
// transient network failure would break unrelated PRs). It only runs when
// explicitly invoked via `npm run test:detect-live`, which sets
// LIVE_DETECT=1.
import { describe, it, expect } from "vitest";
import { detectPlatform } from "../../server/lib/platformDetect";

// technology name -> a real public URL we've confirmed reports that name.
const LIVE_CORPUS: Record<string, string> = {
  "Next.js": "https://nextjs.org",
  Nuxt: "https://nuxt.com",
  Gatsby: "https://www.gatsbyjs.com",
  Astro: "https://astro.build",
  Remix: "https://shopify.com",
  Framer: "https://www.framer.com",
  Wix: "https://www.wix.com",
  Webflow: "https://webflow.com",
  Squarespace: "https://www.squarespace.com",
  WordPress: "https://wordpress.org",
  Shopify: "https://www.allbirds.com",
  Ghost: "https://ghost.org",
  GitBook: "https://www.gitbook.com",
  Docusaurus: "https://docusaurus.io",
  Hugo: "https://gohugo.io",
  Contentful: "https://www.contentful.com",
};

describe.skipIf(!process.env.LIVE_DETECT)("detectPlatform (live corpus)", () => {
  for (const [expected, url] of Object.entries(LIVE_CORPUS)) {
    it(`detects ${expected} from ${url}`, async () => {
      const result = await detectPlatform(url);
      expect(result).toBe(expected);
    }, 20_000);
  }
});
