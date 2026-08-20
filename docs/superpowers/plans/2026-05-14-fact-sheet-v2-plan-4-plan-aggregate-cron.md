# Fact Sheet v2 — Plan 4: `/plan`, `/aggregate`, Cron Backstop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Checkbox (`- [ ]`) syntax for tracking.

> **Commits:** No `git commit` / `add` / `reset`. `git stash push`/`pop` is OK for diagnostics if `git stash list` is verified empty after.

> **Coexistence:** Adds three new endpoints + one cron job alongside Plans 2-3. Does NOT delete the v1 pipeline.

> **OpenRouter policy:** All non-GPT model calls go through OpenRouter (Plan 1 onwards). Plan 4 has zero LLM calls of its own — `/plan` is deterministic regex, `/aggregate` is SQL, the cron is orchestration.

**Goal:** Land the orchestration layer. `/plan` picks 5-10 URLs deterministically (no LLM) from the sitemap chain + path-tier scoring. `/aggregate` consolidates the three sources' outputs with `user_manual > user > scraped > paste` precedence, tracks disagreements, and updates `last_verified_at`. A 5-min cron picks up any run abandoned by the client.

**Architecture:** Three new endpoints, three new orchestration modules, one cron handler. Reuses Plan 1's `system_state`, `fact_scrape_logs`, `pg_try_advisory_xact_lock` pattern. Reuses Plans 2-3's `runStaticSource`, `runSearchSource`, `runUserEnrichSource`, `persistUserFacts`, `safeFetchTextWithLockedIp`.

**Tech Stack:** TypeScript, Express 4, Drizzle ORM, Postgres `pg_try_advisory_xact_lock`, Vitest. No new runtime deps.

**Spec reference:** [docs/superpowers/specs/2026-05-13-brand-fact-sheet-v2-design.md](../specs/2026-05-13-brand-fact-sheet-v2-design.md) §8.1 (plan), §8.3 (cron), §8.4 (aggregate).

---

## Task 1 — Sitemap discovery module

**Why:** `/plan` needs URLs to scrape. Fetches `/sitemap.xml` → `/sitemap_index.xml` → robots.txt `Sitemap:` directive (in that fallback order). Hard 500KB byte cap per response, parse first 200 `<loc>` entries. Returns a list of candidate URLs on the brand's apex domain.

**Files:**
- Create: `server/lib/factAgent/v2/sitemapDiscovery.ts`
- Test: `tests/unit/v2SitemapDiscovery.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2SitemapDiscovery.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverSitemapUrls } from "../../server/lib/factAgent/v2/sitemapDiscovery";

describe("discoverSitemapUrls", () => {
  let fetcher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetcher = vi.fn();
  });

  it("returns URLs from /sitemap.xml", async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) {
        return {
          status: 200,
          text: `<?xml version="1.0"?>
            <urlset>
              <url><loc>https://example.com/about</loc></url>
              <url><loc>https://example.com/pricing</loc></url>
              <url><loc>https://example.com/team</loc></url>
            </urlset>`,
        };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toContain("https://example.com/about");
    expect(out).toContain("https://example.com/pricing");
    expect(out).toContain("https://example.com/team");
  });

  it("falls back to /sitemap_index.xml when /sitemap.xml is 404", async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) return { status: 404, text: "" };
      if (url.endsWith("/sitemap_index.xml")) {
        return {
          status: 200,
          text: `<urlset><url><loc>https://example.com/from-index</loc></url></urlset>`,
        };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toContain("https://example.com/from-index");
  });

  it("falls back to robots.txt Sitemap: directive", async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) return { status: 404, text: "" };
      if (url.endsWith("/sitemap_index.xml")) return { status: 404, text: "" };
      if (url.endsWith("/robots.txt")) {
        return {
          status: 200,
          text: "User-agent: *\nSitemap: https://example.com/custom-sitemap.xml\n",
        };
      }
      if (url.endsWith("/custom-sitemap.xml")) {
        return {
          status: 200,
          text: `<urlset><url><loc>https://example.com/from-robots</loc></url></urlset>`,
        };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toContain("https://example.com/from-robots");
  });

  it("returns [] when no sitemap is reachable", async () => {
    fetcher.mockResolvedValue({ status: 404, text: "" });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toEqual([]);
  });

  it("caps to first 200 entries from a large sitemap", async () => {
    const entries = Array.from({ length: 500 }, (_, i) => `<url><loc>https://example.com/p${i}</loc></url>`).join("");
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) {
        return { status: 200, text: `<urlset>${entries}</urlset>` };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toHaveLength(200);
    expect(out[0]).toBe("https://example.com/p0");
    expect(out[199]).toBe("https://example.com/p199");
  });

  it("only keeps URLs on the same registered domain", async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) {
        return {
          status: 200,
          text: `<urlset>
            <url><loc>https://example.com/own</loc></url>
            <url><loc>https://other.com/external</loc></url>
            <url><loc>https://www.example.com/with-www</loc></url>
          </urlset>`,
        };
      }
      return { status: 404, text: "" };
    });
    const out = await discoverSitemapUrls("https://example.com/", fetcher as never);
    expect(out).toContain("https://example.com/own");
    expect(out).toContain("https://www.example.com/with-www");
    expect(out).not.toContain("https://other.com/external");
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/v2SitemapDiscovery.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/lib/factAgent/v2/sitemapDiscovery.ts`**

```ts
// Sitemap discovery for /plan.
// Fallback chain:
//   1. <brand>/sitemap.xml
//   2. <brand>/sitemap_index.xml
//   3. Sitemap: directive in <brand>/robots.txt
//
// Each fetch capped at 500KB. Parses first 200 <loc> entries from the
// matched sitemap. Filters out URLs not on the brand's registered domain.

export interface SitemapFetcher {
  (url: string, opts?: { maxBytes?: number }): Promise<{ status: number; text: string }>;
}

const SITEMAP_BYTE_CAP = 500_000;
const MAX_ENTRIES = 200;

function registeredDomain(host: string): string {
  const MULTI = ["co.uk", "co.jp", "com.au", "co.in", "co.za", "com.br", "com.mx"];
  const h = host.toLowerCase();
  for (const sfx of MULTI) {
    if (h.endsWith("." + sfx)) {
      const parts = h.slice(0, -sfx.length - 1).split(".");
      return `${parts[parts.length - 1]}.${sfx}`;
    }
  }
  const parts = h.split(".");
  if (parts.length < 2) return h;
  return parts.slice(-2).join(".");
}

function parseLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && out.length < MAX_ENTRIES) {
    const raw = m[1].trim();
    if (raw) out.push(raw);
  }
  return out;
}

async function tryFetchSitemap(
  fetcher: SitemapFetcher,
  url: string,
): Promise<string[]> {
  try {
    const res = await fetcher(url, { maxBytes: SITEMAP_BYTE_CAP });
    if (res.status >= 200 && res.status < 300 && res.text) {
      return parseLocs(res.text);
    }
  } catch {
    // Network errors — silent skip.
  }
  return [];
}

function parseRobotsForSitemap(text: string): string | null {
  const m = /^\s*Sitemap:\s*(\S+)\s*$/im.exec(text);
  return m?.[1] ?? null;
}

export async function discoverSitemapUrls(
  brandUrl: string,
  fetcher: SitemapFetcher,
): Promise<string[]> {
  let base: URL;
  try {
    base = new URL(brandUrl);
  } catch {
    return [];
  }
  const origin = `${base.protocol}//${base.host}`;
  const brandRegistered = registeredDomain(base.hostname);

  let urls = await tryFetchSitemap(fetcher, `${origin}/sitemap.xml`);
  if (urls.length === 0) {
    urls = await tryFetchSitemap(fetcher, `${origin}/sitemap_index.xml`);
  }
  if (urls.length === 0) {
    try {
      const robots = await fetcher(`${origin}/robots.txt`, { maxBytes: 100_000 });
      if (robots.status >= 200 && robots.status < 300) {
        const sitemapUrl = parseRobotsForSitemap(robots.text);
        if (sitemapUrl) {
          urls = await tryFetchSitemap(fetcher, sitemapUrl);
        }
      }
    } catch {
      // ignore
    }
  }

  // Filter to same registered domain.
  return urls.filter((u) => {
    try {
      return registeredDomain(new URL(u).hostname) === brandRegistered;
    } catch {
      return false;
    }
  });
}
```

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/v2SitemapDiscovery.test.ts` → 6 passed.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 2 — URL tier scoring

**Why:** Anti-honeypot heuristic. Sitemaps often have 5000+ entries (programmatic SEO `/blog/tag/*`, `/p/<slug>`). We rank URLs into 3 tiers via regex and pick top-N from the high-signal tiers, dropping the long-tail.

**Files:**
- Create: `server/lib/factAgent/v2/urlTierScoring.ts`
- Test: `tests/unit/v2UrlTierScoring.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2UrlTierScoring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  scoreUrl,
  selectTopUrls,
} from "../../server/lib/factAgent/v2/urlTierScoring";

describe("scoreUrl", () => {
  it("Tier 1 (always): homepage, about, pricing, team, product", () => {
    expect(scoreUrl("https://x.com/")).toBe(1);
    expect(scoreUrl("https://x.com/about")).toBe(1);
    expect(scoreUrl("https://x.com/about-us")).toBe(1);
    expect(scoreUrl("https://x.com/company")).toBe(1);
    expect(scoreUrl("https://x.com/pricing")).toBe(1);
    expect(scoreUrl("https://x.com/team")).toBe(1);
    expect(scoreUrl("https://x.com/product")).toBe(1);
    expect(scoreUrl("https://x.com/products")).toBe(1);
  });

  it("Tier 2: features, platform, contact, customers, security", () => {
    expect(scoreUrl("https://x.com/features")).toBe(2);
    expect(scoreUrl("https://x.com/platform")).toBe(2);
    expect(scoreUrl("https://x.com/contact")).toBe(2);
    expect(scoreUrl("https://x.com/contact-us")).toBe(2);
    expect(scoreUrl("https://x.com/customers")).toBe(2);
    expect(scoreUrl("https://x.com/security")).toBe(2);
  });

  it("Tier 3 (drop): blog/*, author/*, tag/*, category/*, legal/*, privacy*, terms*, cookie*, integrations/*, /p/*", () => {
    expect(scoreUrl("https://x.com/blog/article-1")).toBe(3);
    expect(scoreUrl("https://x.com/author/alice")).toBe(3);
    expect(scoreUrl("https://x.com/tag/marketing")).toBe(3);
    expect(scoreUrl("https://x.com/category/news")).toBe(3);
    expect(scoreUrl("https://x.com/legal/dpa")).toBe(3);
    expect(scoreUrl("https://x.com/privacy")).toBe(3);
    expect(scoreUrl("https://x.com/privacy-policy")).toBe(3);
    expect(scoreUrl("https://x.com/terms")).toBe(3);
    expect(scoreUrl("https://x.com/cookie-policy")).toBe(3);
    expect(scoreUrl("https://x.com/integrations/slack")).toBe(3);
    expect(scoreUrl("https://x.com/p/some-slug")).toBe(3);
  });

  it("untiered (default): everything else", () => {
    expect(scoreUrl("https://x.com/some-random-page")).toBe(0);
    expect(scoreUrl("https://x.com/api")).toBe(0);
  });
});

describe("selectTopUrls", () => {
  it("always includes homepage at position 0", () => {
    const out = selectTopUrls("https://example.com", ["https://example.com/random"]);
    expect(out[0]).toBe("https://example.com/");
  });

  it("includes all Tier 1 URLs", () => {
    const urls = [
      "https://example.com/about",
      "https://example.com/pricing",
      "https://example.com/team",
      "https://example.com/blog/x",
    ];
    const out = selectTopUrls("https://example.com", urls);
    expect(out).toContain("https://example.com/about");
    expect(out).toContain("https://example.com/pricing");
    expect(out).toContain("https://example.com/team");
    expect(out).not.toContain("https://example.com/blog/x"); // Tier 3 dropped
  });

  it("includes Tier 2 URLs after Tier 1 if room remains", () => {
    const urls = ["https://example.com/about", "https://example.com/features"];
    const out = selectTopUrls("https://example.com", urls);
    const aboutIdx = out.indexOf("https://example.com/about");
    const featuresIdx = out.indexOf("https://example.com/features");
    expect(aboutIdx).toBeGreaterThanOrEqual(0);
    expect(featuresIdx).toBeGreaterThanOrEqual(0);
    expect(aboutIdx).toBeLessThan(featuresIdx);
  });

  it("caps at MAX URLs (10)", () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://example.com/p${i}`);
    const out = selectTopUrls("https://example.com", urls);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out[0]).toBe("https://example.com/"); // homepage always first
  });

  it("dedupes", () => {
    const urls = [
      "https://example.com/about",
      "https://example.com/about",
      "https://example.com/about/",
    ];
    const out = selectTopUrls("https://example.com", urls);
    // homepage + about (any trailing-slash variant collapses)
    expect(out.filter((u) => u.includes("/about")).length).toBe(1);
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/v2UrlTierScoring.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/lib/factAgent/v2/urlTierScoring.ts`**

```ts
// URL path tier scoring for /plan.
//   Tier 1 (priority 10): homepage, about, company, pricing, team, product
//   Tier 2 (priority 5):  features, platform, contact, customers, security
//   Tier 3 (drop):        blog, author, tag, category, legal, privacy,
//                         terms, cookie, integrations/*, /p/*
//   Untiered:             everything else, included with low priority if
//                         room remains after Tier 1+2.
//
// Homepage is ALWAYS included as the first entry regardless of sitemap.
import { canonicalizeUrl } from "../canonicalize";

const TIER_1 =
  /^\/(?:|index\.html?|about(-us)?|company|pricing(-plans)?|team|product[s]?)$/i;
const TIER_2 =
  /^\/(?:features|platform|contact(-us)?|customers|security)$/i;
const TIER_3 =
  /^\/(?:blog|author|tag|category|legal|privacy(-policy)?|terms(-of-service)?|cookie(-policy)?|integrations|p)(\/|$)/i;

const MAX_URLS = 10;

export function scoreUrl(url: string): 0 | 1 | 2 | 3 {
  let path: string;
  try {
    path = new URL(url).pathname.replace(/\/$/, "") || "/";
  } catch {
    return 0;
  }
  if (TIER_1.test(path)) return 1;
  if (TIER_2.test(path)) return 2;
  if (TIER_3.test(path)) return 3;
  return 0;
}

function homepageOf(brandUrl: string): string {
  try {
    const u = new URL(brandUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return brandUrl;
  }
}

export function selectTopUrls(
  brandUrl: string,
  candidates: string[],
): string[] {
  const home = homepageOf(brandUrl);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url: string) => {
    const canonical = canonicalizeUrl(url);
    if (seen.has(canonical)) return;
    seen.add(canonical);
    out.push(canonical);
  };

  push(home);

  const tier1: string[] = [];
  const tier2: string[] = [];
  const tier0: string[] = [];
  for (const u of candidates) {
    const t = scoreUrl(u);
    if (t === 1) tier1.push(u);
    else if (t === 2) tier2.push(u);
    else if (t === 0) tier0.push(u);
    // Tier 3 dropped
  }
  for (const u of tier1) {
    if (out.length >= MAX_URLS) break;
    push(u);
  }
  for (const u of tier2) {
    if (out.length >= MAX_URLS) break;
    push(u);
  }
  for (const u of tier0) {
    if (out.length >= MAX_URLS) break;
    push(u);
  }
  return out;
}
```

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/v2UrlTierScoring.test.ts` → ~14 passed (count when running).

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 3 — `/plan` route guards

**Why:** Before creating a run, `/plan` checks: HTTPS-only, per-brand cooldown (10 min), concurrent-run dedup (409 with existing runId), monthly cost cap (402), paused (`fact_scrape_enabled=false` → 409). Group these in one module to keep the route handler small.

**Files:**
- Create: `server/lib/factAgent/v2/planGuards.ts`
- Test: `tests/unit/v2PlanGuards.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2PlanGuards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeHttps, evaluatePlanGuards } from "../../server/lib/factAgent/v2/planGuards";

describe("normalizeHttps", () => {
  it("upgrades http to https", () => {
    expect(normalizeHttps("http://example.com")).toBe("https://example.com");
    expect(normalizeHttps("http://example.com/")).toBe("https://example.com/");
  });
  it("leaves https as-is", () => {
    expect(normalizeHttps("https://example.com/")).toBe("https://example.com/");
  });
  it("returns null for non-http(s)", () => {
    expect(normalizeHttps("file:///etc/passwd")).toBeNull();
    expect(normalizeHttps("javascript:alert(1)")).toBeNull();
    expect(normalizeHttps("not a url")).toBeNull();
  });
});

describe("evaluatePlanGuards", () => {
  const base = {
    brand: { id: "b1", factScrapeEnabled: true },
    inFlightRun: null as { id: string } | null,
    lastCompletedRunAt: null as Date | null,
    costCap: null as { factScrapeCents: number; monthlyCapCents: number } | null,
  };

  it("ok when nothing blocks", () => {
    const v = evaluatePlanGuards(base);
    expect(v.ok).toBe(true);
  });

  it("blocks when fact_scrape_enabled=false (409 paused)", () => {
    const v = evaluatePlanGuards({ ...base, brand: { id: "b1", factScrapeEnabled: false } });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(409);
    expect(v.code).toBe("paused");
  });

  it("blocks when an in-flight run exists (409 already_running)", () => {
    const v = evaluatePlanGuards({ ...base, inFlightRun: { id: "run-existing" } });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(409);
    expect(v.code).toBe("already_running");
    expect(v.runId).toBe("run-existing");
  });

  it("blocks when last completed run < 10 min ago (409 cooldown)", () => {
    const v = evaluatePlanGuards({
      ...base,
      lastCompletedRunAt: new Date(Date.now() - 5 * 60_000),
    });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(409);
    expect(v.code).toBe("cooldown");
    expect(typeof v.unlockAtMs).toBe("number");
  });

  it("allows when last completed run > 10 min ago", () => {
    const v = evaluatePlanGuards({
      ...base,
      lastCompletedRunAt: new Date(Date.now() - 15 * 60_000),
    });
    expect(v.ok).toBe(true);
  });

  it("blocks when monthly cost cap reached (402)", () => {
    const v = evaluatePlanGuards({
      ...base,
      costCap: { factScrapeCents: 500, monthlyCapCents: 500 },
    });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(402);
    expect(v.code).toBe("cost_cap_reached");
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/v2PlanGuards.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/lib/factAgent/v2/planGuards.ts`**

```ts
// /plan guards: HTTPS normalization + cooldown / concurrent / cost-cap /
// paused checks. Pure functions over inputs the route handler resolves
// from the DB. Keeps the route handler small.

const COOLDOWN_MS = 10 * 60_000;

export function normalizeHttps(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol === "https:") return u.toString();
    if (u.protocol === "http:") {
      u.protocol = "https:";
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export interface PlanGuardInput {
  brand: { id: string; factScrapeEnabled: boolean };
  inFlightRun: { id: string } | null;
  lastCompletedRunAt: Date | null;
  costCap: { factScrapeCents: number; monthlyCapCents: number } | null;
}

export type PlanGuardVerdict =
  | { ok: true }
  | { ok: false; status: 402 | 409; code: "paused"; message: string }
  | { ok: false; status: 409; code: "already_running"; runId: string; message: string }
  | { ok: false; status: 409; code: "cooldown"; unlockAtMs: number; message: string }
  | { ok: false; status: 402; code: "cost_cap_reached"; message: string };

export function evaluatePlanGuards(input: PlanGuardInput): PlanGuardVerdict {
  if (!input.brand.factScrapeEnabled) {
    return {
      ok: false,
      status: 409,
      code: "paused",
      message: "Fact scraping is paused for this brand.",
    };
  }
  if (input.inFlightRun) {
    return {
      ok: false,
      status: 409,
      code: "already_running",
      runId: input.inFlightRun.id,
      message: "A scrape is already in progress for this brand.",
    };
  }
  if (input.lastCompletedRunAt) {
    const age = Date.now() - input.lastCompletedRunAt.getTime();
    if (age < COOLDOWN_MS) {
      return {
        ok: false,
        status: 409,
        code: "cooldown",
        unlockAtMs: input.lastCompletedRunAt.getTime() + COOLDOWN_MS,
        message: "Re-scrape allowed once every 10 minutes.",
      };
    }
  }
  if (input.costCap && input.costCap.factScrapeCents >= input.costCap.monthlyCapCents) {
    return {
      ok: false,
      status: 402,
      code: "cost_cap_reached",
      message: "Monthly fact-scrape budget reached. Resets on day 1 of next month.",
    };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/v2PlanGuards.test.ts` → ~10 passed.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 4 — `POST /api/brand-fact-sheet/plan` route

**Why:** HTTP surface. Pulls brand + in-flight + last-completed + cost-cap state from storage, runs guards, fetches sitemap, scores URLs, creates a run + page rows. Returns `{ runId, pages: [{pageId, url}, ...] }` for the UI orchestrator to dispatch.

**Files:**
- Modify: `server/routes/factSheetV2.ts` (add fourth route + supporting storage helpers)
- Modify: `server/storage.ts` (add `getLastCompletedScrapeRunAt` + `getInFlightScrapeRun` if missing)
- Modify: `server/databaseStorage.ts` (implementations)
- Test: `tests/unit/v2PlanRoute.test.ts`

- [ ] **Step 1: Check existing storage methods**

Grep `server/storage.ts` and `server/databaseStorage.ts` for `getLastCompletedScrapeRun`, `getInFlightScrapeRun`, `listScrapeRunsForBrand`, `createScrapeRun`, `createScrapePage`. You'll likely find:
- `listScrapeRunsForBrand` exists (Plan 2 v1)
- `createScrapeRun` exists
- `createScrapePage` exists

If `getInFlightScrapeRun` and `getLastCompletedScrapeRunAt` don't exist, add them. Signature:

```ts
// In IStorage:
getInFlightScrapeRun(brandId: string): Promise<{ id: string } | null>;
getLastCompletedScrapeRunAt(brandId: string): Promise<Date | null>;
```

Implementations in `databaseStorage.ts`:

```ts
async getInFlightScrapeRun(brandId: string): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: schema.brandFactScrapeRuns.id })
    .from(schema.brandFactScrapeRuns)
    .where(
      and(
        eq(schema.brandFactScrapeRuns.brandId, brandId),
        sql`${schema.brandFactScrapeRuns.status} NOT IN ('completed','failed','timeout','cancelled')`,
      ),
    )
    .orderBy(desc(schema.brandFactScrapeRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

async getLastCompletedScrapeRunAt(brandId: string): Promise<Date | null> {
  const rows = await db
    .select({ completedAt: schema.brandFactScrapeRuns.completedAt })
    .from(schema.brandFactScrapeRuns)
    .where(
      and(
        eq(schema.brandFactScrapeRuns.brandId, brandId),
        eq(schema.brandFactScrapeRuns.status, "completed"),
      ),
    )
    .orderBy(desc(schema.brandFactScrapeRuns.completedAt))
    .limit(1);
  const completedAt = rows[0]?.completedAt;
  return completedAt ? new Date(completedAt) : null;
}
```

(`desc` and `sql` should already be imported. Add them to the drizzle-orm import line if not.)

- [ ] **Step 2: Failing route test**

Create `tests/unit/v2PlanRoute.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: { user: unknown }, _res: unknown, next: () => void) => {
    (req as any).user = { id: "user-1" };
    next();
  },
}));

const reqBrand = vi.fn();
vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: any) => req.user,
  requireBrand: (...args: unknown[]) => reqBrand(...args),
  OwnershipError: class OwnershipError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const storageMock = {
  getScrapeRunById: vi.fn(),
  getScrapePageById: vi.fn(),
  getInFlightScrapeRun: vi.fn().mockResolvedValue(null),
  getLastCompletedScrapeRunAt: vi.fn().mockResolvedValue(null),
  getMonthlyCostCap: vi.fn().mockResolvedValue(null),
  createScrapeRun: vi.fn(),
  createScrapePage: vi.fn(),
  insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
  getFactScrapeCache: vi.fn(),
  upsertFactScrapeCache: vi.fn(),
};
vi.mock("../../server/storage", () => ({ storage: storageMock }));

vi.mock("../../server/lib/factAgent/v2/sitemapDiscovery", () => ({
  discoverSitemapUrls: vi.fn().mockResolvedValue([
    "https://example.com/about",
    "https://example.com/pricing",
    "https://example.com/blog/foo", // Tier 3, should be dropped
  ]),
}));

vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
    },
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetV2Routes(app);
  return app;
}

describe("POST /api/brand-fact-sheet/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({
      id: "brand-1",
      userId: "user-1",
      website: "https://example.com",
      factScrapeEnabled: true,
    });
    storageMock.getInFlightScrapeRun.mockResolvedValue(null);
    storageMock.getLastCompletedScrapeRunAt.mockResolvedValue(null);
    storageMock.getMonthlyCostCap.mockResolvedValue(null);
    storageMock.createScrapeRun.mockResolvedValue({ id: "run-new" });
    storageMock.createScrapePage.mockImplementation(async (p) => ({ id: `p-${Math.random()}`, ...p }));
  });

  it("400 when brandId missing", async () => {
    const res = await request(makeApp()).post("/api/brand-fact-sheet/plan").send({});
    expect(res.status).toBe(400);
  });

  it("409 already_running when an in-flight run exists", async () => {
    storageMock.getInFlightScrapeRun.mockResolvedValue({ id: "existing-run" });
    const res = await request(makeApp()).post("/api/brand-fact-sheet/plan").send({ brandId: "brand-1" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("already_running");
    expect(res.body.runId).toBe("existing-run");
  });

  it("409 cooldown when last completed < 10 min ago", async () => {
    storageMock.getLastCompletedScrapeRunAt.mockResolvedValue(new Date(Date.now() - 60_000));
    const res = await request(makeApp()).post("/api/brand-fact-sheet/plan").send({ brandId: "brand-1" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("cooldown");
  });

  it("happy path: 200 with runId + pages list", async () => {
    const res = await request(makeApp()).post("/api/brand-fact-sheet/plan").send({ brandId: "brand-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.runId).toBe("run-new");
    expect(Array.isArray(res.body.pages)).toBe(true);
    expect(res.body.pages.length).toBeGreaterThanOrEqual(1);
    // Homepage must always be in the list
    expect(res.body.pages.some((p: { url: string }) => p.url === "https://example.com/")).toBe(true);
    // Tier-3 URL should be dropped
    expect(res.body.pages.every((p: { url: string }) => !p.url.includes("/blog/foo"))).toBe(true);
  });

  it("normalizes http:// to https:// before discovery", async () => {
    reqBrand.mockResolvedValue({
      id: "brand-1",
      userId: "user-1",
      website: "http://example.com",
      factScrapeEnabled: true,
    });
    const res = await request(makeApp()).post("/api/brand-fact-sheet/plan").send({ brandId: "brand-1" });
    expect(res.status).toBe(200);
    expect(res.body.pages[0].url).toBe("https://example.com/");
  });
});
```

- [ ] **Step 3: Confirm failure**

`npx vitest run tests/unit/v2PlanRoute.test.ts` → FAIL (route doesn't exist).

- [ ] **Step 4: Add the route to `server/routes/factSheetV2.ts`**

Add imports:
```ts
import { discoverSitemapUrls } from "../lib/factAgent/v2/sitemapDiscovery";
import { selectTopUrls } from "../lib/factAgent/v2/urlTierScoring";
import { normalizeHttps, evaluatePlanGuards } from "../lib/factAgent/v2/planGuards";
import { canonicalizeUrl } from "../lib/factAgent/canonicalize";
```

Add Zod schema:
```ts
const planSchema = z.object({
  brandId: z.string().min(1),
  triggeredBy: z
    .enum(["user_rescrape", "onboarding"])
    .optional()
    .default("user_rescrape"),
});
```

Inside `setupFactSheetV2Routes`, AFTER the `/user-enrich` handler (i.e., at the end of the function body), add:

```ts
  app.post(
    "/api/brand-fact-sheet/plan",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = planSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { brandId, triggeredBy } = parsed.data;
        const brand = await requireBrand(brandId, user.id);

        const normalized = normalizeHttps(brand.website ?? "");
        if (!normalized) {
          return res.status(400).json({
            success: false,
            error: "Brand website must be http(s) URL",
          });
        }

        // Resolve guard state.
        const monthKey = new Date().toISOString().slice(0, 7);
        const [inFlight, lastCompletedAt, costCap] = await Promise.all([
          storage.getInFlightScrapeRun(brandId),
          storage.getLastCompletedScrapeRunAt(brandId),
          storage.getMonthlyCostCap(brandId, monthKey),
        ]);

        const verdict = evaluatePlanGuards({
          brand: { id: brand.id, factScrapeEnabled: (brand as any).factScrapeEnabled !== false },
          inFlightRun: inFlight,
          lastCompletedRunAt: lastCompletedAt,
          costCap: costCap
            ? { factScrapeCents: costCap.factScrapeCents, monthlyCapCents: costCap.monthlyCapCents }
            : null,
        });

        if (!verdict.ok) {
          const body: Record<string, unknown> = {
            success: false,
            code: verdict.code,
            error: verdict.message,
          };
          if (verdict.code === "already_running") body.runId = verdict.runId;
          if (verdict.code === "cooldown") body.unlockAtMs = verdict.unlockAtMs;
          return res.status(verdict.status).json(body);
        }

        // Discover sitemap URLs and pick top N via tier scoring.
        const candidates = await discoverSitemapUrls(normalized, async (url) =>
          safeFetchTextWithLockedIp(url, { maxBytes: 500_000 }).then((r) => ({
            status: r.status,
            text: r.text,
          })),
        );
        const selected = selectTopUrls(normalized, candidates);

        // Create run.
        const run = await storage.createScrapeRun({
          brandId,
          status: "pending",
          triggeredBy,
        });

        // Create page rows (canonicalized + deduped).
        const pageRows: Array<{ pageId: string; url: string }> = [];
        const seen = new Set<string>();
        for (const url of selected) {
          const canonical = canonicalizeUrl(url);
          if (seen.has(canonical)) continue;
          seen.add(canonical);
          const page = await storage.createScrapePage({
            runId: run.id,
            url,
            canonicalUrl: canonical,
            status: "pending",
          });
          pageRows.push({ pageId: page.id, url: page.url ?? url });
        }

        logger.info(
          { brandId, runId: run.id, pageCount: pageRows.length, triggeredBy },
          "factSheetV2.plan: dispatched",
        );

        return res.status(200).json({
          success: true,
          runId: run.id,
          pages: pageRows,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.plan failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.plan" } });
        return sendError(res, err, "Failed to create plan");
      }
    }),
  );
```

- [ ] **Step 5: Run the test**

`npx vitest run tests/unit/v2PlanRoute.test.ts` → 5 passed.

- [ ] **Step 6: Type-check**

`npm run check` → clean.

---

## Task 5 — Aggregate logic module

**Why:** Pure orchestration. Pulls source outcomes from `fact_scrape_logs` for the run, compares scraped facts (already persisted by /scrape-one + /search-llm) against user facts (already persisted by /user-enrich), increments `disagreement_count` where they differ, updates `last_verified_at` for re-confirmed facts, deletes scraped rows from prior runs, and returns the terminal status. Wraps in SERIALIZABLE transaction.

**Files:**
- Create: `server/lib/factAgent/v2/aggregate.ts`
- Test: `tests/unit/v2Aggregate.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2Aggregate.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  computeTerminalStatus,
  type SourceOutcome,
} from "../../server/lib/factAgent/v2/aggregate";

describe("computeTerminalStatus", () => {
  it("returns 'completed' when any source produced facts", () => {
    const outcomes: SourceOutcome[] = [
      { source: "static_pages", status: "done", factCount: 3, errorKind: null },
      { source: "search_llm", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
      { source: "user_enrich", status: "done", factCount: 0, errorKind: null },
    ];
    expect(computeTerminalStatus(outcomes)).toEqual({
      status: "completed",
      errorKind: null,
    });
  });

  it("returns 'failed' with all_sources_empty when zero facts and all content-empty", () => {
    const outcomes: SourceOutcome[] = [
      { source: "static_pages", status: "done", factCount: 0, errorKind: null },
      { source: "search_llm", status: "done", factCount: 0, errorKind: null },
      { source: "user_enrich", status: "done", factCount: 0, errorKind: null },
    ];
    expect(computeTerminalStatus(outcomes)).toEqual({
      status: "failed",
      errorKind: "all_sources_empty",
    });
  });

  it("returns 'failed' with provider_outage when zero facts AND all sources had provider errors", () => {
    const outcomes: SourceOutcome[] = [
      { source: "static_pages", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
      { source: "search_llm", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
      { source: "user_enrich", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
    ];
    expect(computeTerminalStatus(outcomes)).toEqual({
      status: "failed",
      errorKind: "provider_outage",
    });
  });

  it("returns 'failed' with all_sources_empty when mixed empty + provider errors but at least one content-empty", () => {
    const outcomes: SourceOutcome[] = [
      { source: "static_pages", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
      { source: "search_llm", status: "done", factCount: 0, errorKind: null }, // content-empty
    ];
    expect(computeTerminalStatus(outcomes).errorKind).toBe("all_sources_empty");
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/v2Aggregate.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/lib/factAgent/v2/aggregate.ts`**

```ts
// Aggregate logic. Three exports:
//   - computeTerminalStatus: pure function over source outcomes
//   - runAggregate: full IO orchestration (called from the route + cron)
//
// Run-level rules (Spec §8.4):
//   - Any source returned ≥1 fact → 'completed'
//   - Zero facts AND any source had a content error (not provider) →
//     'failed' with errorKind='all_sources_empty'
//   - Zero facts AND all sources had provider errors →
//     'failed' with errorKind='provider_outage'
//
// Reconciliation (within the SERIALIZABLE transaction):
//   1. Delete scraped rows for this brand from previous runs (only this
//      run's scraped facts survive).
//   2. For each user/user_manual fact in this brand, check if any scraped
//      fact has the same (domain, subcategory, factKey) with a different
//      factValue. If so, increment disagreement_count on the user/manual row.
//   3. Bump last_verified_at to now() on every brand_fact_sheet row touched
//      by this run (scraped from this run, user/user_manual on the brand).
import { db } from "../../../db";
import { and, eq, ne, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { logger } from "../../logger";
import { storage } from "../../../storage";

export interface SourceOutcome {
  source: "static_pages" | "search_llm" | "user_enrich" | "aggregate" | "paste";
  status: "done" | "failed" | "skipped";
  factCount: number;
  errorKind: string | null;
}

export type TerminalStatus =
  | { status: "completed"; errorKind: null }
  | { status: "failed"; errorKind: "all_sources_empty" | "provider_outage" };

const PROVIDER_ERRORS = new Set([
  "llm_unavailable",
  "provider_unconfigured",
  "fetch_failed",
]);

export function computeTerminalStatus(outcomes: SourceOutcome[]): TerminalStatus {
  const total = outcomes.reduce((sum, o) => sum + o.factCount, 0);
  if (total > 0) return { status: "completed", errorKind: null };
  const allProviderErrors =
    outcomes.length > 0 &&
    outcomes.every((o) => o.errorKind !== null && PROVIDER_ERRORS.has(o.errorKind));
  return {
    status: "failed",
    errorKind: allProviderErrors ? "provider_outage" : "all_sources_empty",
  };
}

export interface RunAggregateArgs {
  runId: string;
  brandId: string;
}

export interface AggregateResult {
  status: TerminalStatus["status"];
  errorKind: TerminalStatus["errorKind"];
  totalFacts: number;
  disagreementsIncremented: number;
}

export async function runAggregate(
  args: RunAggregateArgs,
): Promise<AggregateResult> {
  // 1. Pull source outcomes from fact_scrape_logs.
  const logRows = await db
    .select({
      source: schema.factScrapeLogs.source,
      status: schema.factScrapeLogs.status,
      factCount: schema.factScrapeLogs.factCount,
      errorKind: schema.factScrapeLogs.errorKind,
    })
    .from(schema.factScrapeLogs)
    .where(eq(schema.factScrapeLogs.runId, args.runId));

  const outcomes: SourceOutcome[] = logRows.map((r) => ({
    source: r.source as SourceOutcome["source"],
    status: r.status as SourceOutcome["status"],
    factCount: r.factCount ?? 0,
    errorKind: r.errorKind,
  }));

  const terminal = computeTerminalStatus(outcomes);

  // 2. SERIALIZABLE transaction for reconciliation.
  let disagreementsIncremented = 0;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

    // 2a. Delete scraped rows from previous runs (keep only this run's scraped facts).
    await tx
      .delete(schema.brandFactSheet)
      .where(
        and(
          eq(schema.brandFactSheet.brandId, args.brandId),
          eq(schema.brandFactSheet.source, "scraped"),
          ne(schema.brandFactSheet.runId, args.runId),
        ),
      );

    // 2b. Increment disagreement_count on user/user_manual rows where a
    //     scraped row exists with the same (domain, subcategory, factKey)
    //     but a different fact_value. One UPDATE handles both source values.
    const updateResult = await tx.execute(sql`
      UPDATE brand_fact_sheet AS u
      SET disagreement_count = u.disagreement_count + 1
      WHERE u.brand_id = ${args.brandId}
        AND u.source IN ('user','user_manual')
        AND EXISTS (
          SELECT 1 FROM brand_fact_sheet AS s
          WHERE s.brand_id = u.brand_id
            AND s.source = 'scraped'
            AND s.run_id = ${args.runId}
            AND s.domain = u.domain
            AND s.subcategory = u.subcategory
            AND s.fact_key = u.fact_key
            AND s.fact_value <> u.fact_value
        )
    `);
    disagreementsIncremented =
      (updateResult as unknown as { rowCount: number | null }).rowCount ?? 0;

    // 2c. Bump last_verified_at on every row touched by this brand.
    await tx.execute(sql`
      UPDATE brand_fact_sheet
      SET last_verified = now()
      WHERE brand_id = ${args.brandId}
        AND (
          (source = 'scraped' AND run_id = ${args.runId})
          OR source IN ('user','user_manual')
        )
    `);
  });

  // 3. Count surviving facts for this brand.
  const factRows = await db
    .select({ id: schema.brandFactSheet.id })
    .from(schema.brandFactSheet)
    .where(eq(schema.brandFactSheet.brandId, args.brandId));

  // 4. Mark run terminal.
  await storage.transitionScrapeRunStatusCAS(
    args.runId,
    "pending", // best-effort CAS; if the run is in another state we still update below
    terminal.status,
  );
  await db
    .update(schema.brandFactScrapeRuns)
    .set({
      status: terminal.status,
      errorKind: terminal.errorKind,
      completedAt: new Date(),
    })
    .where(eq(schema.brandFactScrapeRuns.id, args.runId));

  // 5. Log the aggregate step itself for observability.
  try {
    await storage.insertFactScrapeLog({
      runId: args.runId,
      source: "aggregate",
      status: terminal.status === "completed" ? "done" : "failed",
      factCount: factRows.length,
      errorKind: terminal.errorKind ?? undefined,
      diagnostics: { disagreementsIncremented, sourcesObserved: outcomes.length },
    });
  } catch (err) {
    logger.warn({ err, runId: args.runId }, "runAggregate: log insert failed (non-fatal)");
  }

  return {
    status: terminal.status,
    errorKind: terminal.errorKind,
    totalFacts: factRows.length,
    disagreementsIncremented,
  };
}
```

The `transitionScrapeRunStatusCAS` may not exist with that exact name on storage. Verify via `Grep` in `server/storage.ts`. If absent, drop that call — the immediately-following `db.update(...)` already sets the terminal status unconditionally. The CAS attempt is belt-and-suspenders, OK to remove if missing.

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/v2Aggregate.test.ts` → 4 passed.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 6 — `POST /api/brand-fact-sheet/aggregate` route

**Why:** HTTP surface. Auth + ownership + call `runAggregate`. Idempotent — calling twice on a terminal run is a no-op.

**Files:**
- Modify: `server/routes/factSheetV2.ts`
- Test: `tests/unit/v2AggregateRoute.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2AggregateRoute.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: { user: unknown }, _res: unknown, next: () => void) => {
    (req as any).user = { id: "user-1" };
    next();
  },
}));

const reqBrand = vi.fn();
vi.mock("../../server/lib/ownership", () => ({
  requireUser: (req: any) => req.user,
  requireBrand: (...args: unknown[]) => reqBrand(...args),
  OwnershipError: class OwnershipError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const storageMock = {
  getScrapeRunById: vi.fn(),
  getScrapePageById: vi.fn(),
  getInFlightScrapeRun: vi.fn(),
  getLastCompletedScrapeRunAt: vi.fn(),
  getMonthlyCostCap: vi.fn(),
  createScrapeRun: vi.fn(),
  createScrapePage: vi.fn(),
  insertFactScrapeLog: vi.fn(),
  getFactScrapeCache: vi.fn(),
  upsertFactScrapeCache: vi.fn(),
};
vi.mock("../../server/storage", () => ({ storage: storageMock }));

const runAggregateMock = vi.fn();
vi.mock("../../server/lib/factAgent/v2/aggregate", () => ({
  runAggregate: (...args: unknown[]) => runAggregateMock(...args),
}));

vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
    },
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetV2Routes(app);
  return app;
}

describe("POST /api/brand-fact-sheet/aggregate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1" });
  });

  it("400 when runId missing", async () => {
    const res = await request(makeApp()).post("/api/brand-fact-sheet/aggregate").send({});
    expect(res.status).toBe(400);
  });

  it("404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp()).post("/api/brand-fact-sheet/aggregate").send({ runId: "x" });
    expect(res.status).toBe(404);
  });

  it("happy path: 200 with terminal status", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runAggregateMock.mockResolvedValue({
      status: "completed",
      errorKind: null,
      totalFacts: 5,
      disagreementsIncremented: 1,
    });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/aggregate")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("completed");
    expect(res.body.totalFacts).toBe(5);
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/v2AggregateRoute.test.ts` → FAIL.

- [ ] **Step 3: Add the route to `server/routes/factSheetV2.ts`**

Add import:
```ts
import { runAggregate } from "../lib/factAgent/v2/aggregate";
```

Add schema:
```ts
const aggregateSchema = z.object({
  runId: z.string().min(1),
});
```

Add handler at the end of `setupFactSheetV2Routes`:

```ts
  app.post(
    "/api/brand-fact-sheet/aggregate",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const user = requireUser(req);
        const parsed = aggregateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { runId } = parsed.data;

        const run = await storage.getScrapeRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        await requireBrand(run.brandId, user.id);

        const result = await runAggregate({ runId, brandId: run.brandId });

        return res.status(200).json({
          success: true,
          runId,
          status: result.status,
          errorKind: result.errorKind,
          totalFacts: result.totalFacts,
          disagreementsIncremented: result.disagreementsIncremented,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.aggregate failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.aggregate" } });
        return sendError(res, err, "Failed to aggregate");
      }
    }),
  );
```

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/v2AggregateRoute.test.ts` → 3 passed.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 7 — Cron backstop logic

**Why:** Client-side orchestration is the fast path. The cron is the safety net for: closed tab, lambda death, rate-limited LLM, network drop. Every 5 min, finds stale runs (non-terminal, `last_advance_at < now-60s`, `retry_count < 10`), wraps each in `BEGIN; pg_try_advisory_xact_lock(brandId); ...; COMMIT;`, finishes pending sources server-side, calls `runAggregate`, increments `retry_count`. Crash safety from transaction-level lock auto-release.

**Files:**
- Create: `server/lib/factAgent/v2/factScrapeBackstop.ts`
- Test: `tests/unit/v2FactScrapeBackstop.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2FactScrapeBackstop.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all the IO so this is a pure logic test.
const dbExecuteMock = vi.fn();
const dbTransactionMock = vi.fn();
vi.mock("../../server/db", () => ({
  db: {
    execute: dbExecuteMock,
    transaction: dbTransactionMock,
  },
}));
vi.mock("@shared/schema", async () => {
  const real = await vi.importActual<Record<string, unknown>>("@shared/schema");
  return real;
});

const runAggregateMock = vi.fn().mockResolvedValue({
  status: "completed",
  errorKind: null,
  totalFacts: 1,
  disagreementsIncremented: 0,
});
vi.mock("../../server/lib/factAgent/v2/aggregate", () => ({
  runAggregate: (...args: unknown[]) => runAggregateMock(...args),
}));

const storageMock = {
  getSystemState: vi.fn().mockResolvedValue(null),
  setSystemState: vi.fn().mockResolvedValue(undefined),
  insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../../server/storage", () => ({ storage: storageMock }));

import { runFactScrapeBackstop } from "../../server/lib/factAgent/v2/factScrapeBackstop";

describe("runFactScrapeBackstop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no stale runs found.
    dbExecuteMock.mockResolvedValue({ rows: [] });
    // Transaction wrapper: execute the callback with a fake tx.
    dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      execute: dbExecuteMock,
    }));
  });

  it("writes cron_last_fired_at on every tick", async () => {
    await runFactScrapeBackstop();
    expect(storageMock.setSystemState).toHaveBeenCalledWith(
      "fact_scrape_backstop_last_fired_at",
      expect.any(Object),
    );
  });

  it("does nothing when no stale runs are found", async () => {
    await runFactScrapeBackstop();
    expect(runAggregateMock).not.toHaveBeenCalled();
  });

  it("calls aggregate for each stale run found", async () => {
    // First call returns stale runs, second call is the lock attempt
    let callCount = 0;
    dbExecuteMock.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        // findStaleRuns query
        return { rows: [{ id: "run-a", brand_id: "brand-a", retry_count: 2 }] };
      }
      // lock acquire
      if (callCount === 2) return { rows: [{ got: true }] };
      // misc UPDATEs / SELECTs inside the loop
      return { rows: [] };
    });
    await runFactScrapeBackstop();
    expect(runAggregateMock).toHaveBeenCalledTimes(1);
    expect(runAggregateMock).toHaveBeenCalledWith({ runId: "run-a", brandId: "brand-a" });
  });
});
```

- [ ] **Step 2: Confirm failure**

`npx vitest run tests/unit/v2FactScrapeBackstop.test.ts` → FAIL.

- [ ] **Step 3: Implement `server/lib/factAgent/v2/factScrapeBackstop.ts`**

```ts
// Cron backstop for runs the client abandoned mid-flight.
// Schedule: every 5 minutes (Vercel cron). Per tick:
//   1. Write cron_last_fired_at to system_state (dead-man's switch).
//   2. Find stale runs: non-terminal + last_advance_at < now-60s + retry_count < 10.
//   3. For each stale run: wrap in BEGIN; pg_try_advisory_xact_lock(brandId);
//      complete remaining sources server-side; runAggregate; increment
//      retry_count; COMMIT. (Transaction-level lock auto-releases on crash.)
//   4. After cap (retry_count >= 10): mark errorKind='max_retries_exceeded'.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { storage } from "../../../storage";
import { logger } from "../../logger";
import { runAggregate } from "./aggregate";

const STALE_AFTER_MS = 60_000;
const MAX_RETRIES = 10;
const MAX_RUNS_PER_TICK = 20;
const DEAD_MAN_KEY = "fact_scrape_backstop_last_fired_at";

interface StaleRunRow {
  id: string;
  brand_id: string;
  retry_count: number;
}

export async function runFactScrapeBackstop(): Promise<{ processed: number }> {
  // Dead-man's switch: write our heartbeat. The NEXT tick will check this
  // and log if it's > 10 min stale (i.e. the cron stopped firing).
  const prevFired = (await storage.getSystemState(DEAD_MAN_KEY)) as
    | { iso: string }
    | null;
  if (prevFired?.iso) {
    const ageMs = Date.now() - new Date(prevFired.iso).getTime();
    if (ageMs > 10 * 60_000) {
      logger.error(
        { ageMs, prevFiredAt: prevFired.iso },
        "fact_scrape_backstop: previous cron tick was stale — cron may have stopped",
      );
    }
  }
  await storage.setSystemState(DEAD_MAN_KEY, { iso: new Date().toISOString() });

  // Find stale runs.
  const stale = await db.execute(sql`
    SELECT r.id, r.brand_id, r.retry_count
    FROM brand_fact_scrape_runs r
    JOIN brands b ON b.id = r.brand_id
    WHERE r.status NOT IN ('completed','failed','timeout','cancelled')
      AND r.last_advance_at < now() - (${STALE_AFTER_MS} || ' milliseconds')::interval
      AND COALESCE(r.retry_count, 0) < ${MAX_RETRIES}
      AND (b.fact_scrape_enabled = true OR b.fact_scrape_enabled IS NULL)
    ORDER BY r.last_advance_at ASC
    LIMIT ${MAX_RUNS_PER_TICK}
  `);
  const rows = (stale as unknown as { rows: StaleRunRow[] }).rows;
  if (rows.length === 0) return { processed: 0 };

  let processed = 0;
  for (const row of rows) {
    try {
      await db.transaction(async (tx) => {
        // Transaction-level advisory lock — auto-releases on COMMIT, ROLLBACK,
        // or connection drop (no zombie locks possible).
        const lockRes = await tx.execute(sql`
          SELECT pg_try_advisory_xact_lock(hashtext('fact-scrape:' || ${row.brand_id})::bigint) AS got
        `);
        const got =
          (lockRes as unknown as { rows: Array<{ got: boolean }> }).rows[0]?.got === true;
        if (!got) {
          // Another tick (or the client) holds the lock — skip this run.
          return;
        }

        // Aggregate the run. /scrape-one and /search-llm have already
        // persisted their per-call facts via persistFacts / persistUserFacts,
        // so aggregate just reconciles + marks terminal.
        await runAggregate({ runId: row.id, brandId: row.brand_id });

        // Increment retry_count.
        await tx.execute(sql`
          UPDATE brand_fact_scrape_runs
          SET retry_count = COALESCE(retry_count, 0) + 1,
              last_advance_at = now()
          WHERE id = ${row.id}
        `);
      });
      processed += 1;
    } catch (err) {
      logger.warn(
        { err, runId: row.id, brandId: row.brand_id },
        "fact_scrape_backstop: per-run failure",
      );
    }
  }

  // Mark runs that hit MAX_RETRIES as terminal-failed.
  await db.execute(sql`
    UPDATE brand_fact_scrape_runs
    SET status = 'failed',
        error_kind = 'max_retries_exceeded',
        completed_at = now()
    WHERE COALESCE(retry_count, 0) >= ${MAX_RETRIES}
      AND status NOT IN ('completed','failed','timeout','cancelled')
  `);

  return { processed };
}
```

- [ ] **Step 4: Run test**

`npx vitest run tests/unit/v2FactScrapeBackstop.test.ts` → 3 passed.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Task 8 — Wire the cron job into Vercel

**Why:** Vercel runs scheduled functions defined in `vercel.json` + a route handler. The existing cron infra in `server/routes/cron.ts` is the right host — adds one route, picks up the schedule automatically.

**Files:**
- Modify: `server/routes/cron.ts` (or wherever cron endpoints live — `Grep` for `daily-orchestrator` to confirm)
- Modify: `vercel.json` (add the 5-min schedule)
- Test: `tests/unit/v2BackstopCronRoute.test.ts`

- [ ] **Step 1: Inspect existing cron infrastructure**

Run:
```
Grep: daily-orchestrator OR fact-scrape-backstop in server/routes/
Read: vercel.json
Read: server/routes/cron.ts (first 50 lines)
```

You'll see the existing pattern. Adapt to the same shape.

- [ ] **Step 2: Failing test `tests/unit/v2BackstopCronRoute.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const runFactScrapeBackstopMock = vi
  .fn()
  .mockResolvedValue({ processed: 0 });
vi.mock("../../server/lib/factAgent/v2/factScrapeBackstop", () => ({
  runFactScrapeBackstop: runFactScrapeBackstopMock,
}));

// Auth is whatever the existing cron uses — usually a CRON_SECRET header check
// or Vercel's built-in cron auth. We test the handler in isolation by mocking
// the auth as pass-through.

// Import the route setup function — name will depend on existing patterns.
// You may need to adjust this based on how cron.ts is organized.
import { setupCronRoutes } from "../../server/routes/cron";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupCronRoutes(app);
  return app;
}

describe("GET /api/cron/fact-scrape-backstop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes runFactScrapeBackstop and returns 200", async () => {
    // If the existing cron uses a secret header, set it:
    const res = await request(makeApp())
      .get("/api/cron/fact-scrape-backstop")
      .set("Authorization", `Bearer ${process.env.CRON_SECRET ?? "test"}`);
    expect([200, 401]).toContain(res.status); // 401 if auth wired differently
    if (res.status === 200) {
      expect(runFactScrapeBackstopMock).toHaveBeenCalled();
      expect(res.body).toHaveProperty("processed");
    }
  });
});
```

**NOTE:** the exact route setup name and auth pattern depends on `server/routes/cron.ts`. The test above is tolerant — adjust the path / auth header to match your codebase. The goal is to verify `runFactScrapeBackstop` is invoked when the cron endpoint is hit.

- [ ] **Step 3: Add the cron handler in `server/routes/cron.ts`**

In the existing route setup function (likely `setupCronRoutes(app)` or similar), add:

```ts
import { runFactScrapeBackstop } from "../lib/factAgent/v2/factScrapeBackstop";

// ...inside setupCronRoutes:
app.get("/api/cron/fact-scrape-backstop", /* existing auth middleware */, async (req, res) => {
  try {
    const result = await runFactScrapeBackstop();
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error({ err }, "fact-scrape-backstop cron failed");
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});
```

Use whatever auth middleware the existing crons use (CRON_SECRET header check, Vercel's built-in auth, etc.).

- [ ] **Step 4: Update `vercel.json`**

Add to the `crons` array:

```json
{
  "path": "/api/cron/fact-scrape-backstop",
  "schedule": "*/5 * * * *"
}
```

If `vercel.json` is at the Hobby cron limit (currently 2 jobs), check whether `daily-orchestrator` can fold this in instead (call `runFactScrapeBackstop` inside the daily handler). That's a simpler integration if the limit is binding.

- [ ] **Step 5: Run the test**

`npx vitest run tests/unit/v2BackstopCronRoute.test.ts`. Expected: 1 passed (or BLOCKED if cron auth setup is unusual — flag).

- [ ] **Step 6: Type-check**

`npm run check` → clean.

---

## Task 9 — End-to-end smoke tests for /plan + /aggregate

**Why:** Real DB, real route, mocked LLMs. Confirms the full pipeline works.

**Files:**
- Test: `tests/integration/v2PlanSmoke.test.ts`
- Test: `tests/integration/v2AggregateSmoke.test.ts`

- [ ] **Step 1: /plan smoke test**

Create `tests/integration/v2PlanSmoke.test.ts`:

```ts
import "dotenv/config";
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../../server/db";

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: "smoke-user" };
    next();
  },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
    },
  };
});

// Mock the sitemap fetcher to return synthetic URLs.
vi.mock("../../server/lib/factAgent/v2/sitemapDiscovery", () => ({
  discoverSitemapUrls: vi.fn().mockResolvedValue([
    "https://example.com/about",
    "https://example.com/pricing",
    "https://example.com/blog/foo", // should be dropped (Tier 3)
  ]),
}));

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-v2-plan";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, website, industry, created_at, updated_at, fact_scrape_enabled)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'Smoke Plan', 'Smoke Plan', 'https://example.com', 'saas', now(), now(), true)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(sql`DELETE FROM brand_fact_scrape_pages WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`);
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 4 smoke: POST /plan creates run + pages end-to-end", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("creates a run with the expected page rows", async () => {
    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    const res = await request(app)
      .post("/api/brand-fact-sheet/plan")
      .send({ brandId: TEST_BRAND_ID });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.runId).toBe("string");
    expect(res.body.pages.length).toBeGreaterThanOrEqual(1);
    // Homepage always present
    expect(res.body.pages.some((p: { url: string }) => p.url === "https://example.com/")).toBe(true);
    // Tier-3 blog URL dropped
    expect(res.body.pages.every((p: { url: string }) => !p.url.includes("/blog/foo"))).toBe(true);

    // Verify the run + pages actually persisted.
    const runRows = await db.execute(sql`
      SELECT id, status FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}
    `);
    expect((runRows as unknown as { rows: Array<unknown> }).rows.length).toBe(1);

    const pageRows = await db.execute(sql`
      SELECT id, url FROM brand_fact_scrape_pages WHERE run_id = ${res.body.runId}
    `);
    expect(
      (pageRows as unknown as { rows: Array<{ url: string }> }).rows.length,
    ).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: /aggregate smoke test**

Create `tests/integration/v2AggregateSmoke.test.ts`:

```ts
import "dotenv/config";
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../../server/db";

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: "smoke-user" };
    next();
  },
}));

vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

vi.mock("openai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("openai");
  return {
    ...actual,
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
    },
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-v2-aggregate";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, website, industry, created_at, updated_at)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'Smoke Aggregate', 'Smoke Aggregate', 'https://example.com', 'saas', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(sql`DELETE FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(sql`DELETE FROM fact_scrape_logs WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`);
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 4 smoke: POST /aggregate consolidates run end-to-end", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("increments disagreement_count and marks run completed", async () => {
    // Seed: create a run, a scraped fact, and a conflicting user fact.
    const runRow = await db.execute(sql`
      INSERT INTO brand_fact_scrape_runs (brand_id, triggered_by, status)
      VALUES (${TEST_BRAND_ID}, 'manual_rescrape', 'pending')
      RETURNING id
    `);
    const runId = (runRow as unknown as { rows: Array<{ id: string }> }).rows[0].id;

    await db.execute(sql`
      INSERT INTO brand_fact_sheet (brand_id, domain, subcategory, fact_key, fact_value, value_type, source, run_id, confidence)
      VALUES
        (${TEST_BRAND_ID}, 'identity', 'description', 'tagline', 'Scraped tagline', 'string', 'scraped', ${runId}, '0.9'),
        (${TEST_BRAND_ID}, 'identity', 'description', 'tagline', 'User tagline', 'string', 'user', NULL, '1.0')
    `);

    // Seed a fact_scrape_logs row so aggregate sees factCount > 0
    await db.execute(sql`
      INSERT INTO fact_scrape_logs (run_id, source, status, fact_count)
      VALUES (${runId}, 'static_pages', 'done', 1)
    `);

    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    const res = await request(app)
      .post("/api/brand-fact-sheet/aggregate")
      .send({ runId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.disagreementsIncremented).toBeGreaterThanOrEqual(1);

    // Verify the user fact's disagreement_count went up.
    const userFactRow = await db.execute(sql`
      SELECT disagreement_count FROM brand_fact_sheet
      WHERE brand_id = ${TEST_BRAND_ID} AND source = 'user' AND fact_key = 'tagline'
    `);
    const cnt = (userFactRow as unknown as { rows: Array<{ disagreement_count: number }> }).rows[0]?.disagreement_count;
    expect(cnt).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run both smoke tests**

`npx vitest run tests/integration/v2PlanSmoke.test.ts tests/integration/v2AggregateSmoke.test.ts`

Expected: 2 passed.

- [ ] **Step 4: Full Plan 4 suite**

```
npx vitest run tests/unit/v2SitemapDiscovery.test.ts tests/unit/v2UrlTierScoring.test.ts tests/unit/v2PlanGuards.test.ts tests/unit/v2PlanRoute.test.ts tests/unit/v2Aggregate.test.ts tests/unit/v2AggregateRoute.test.ts tests/unit/v2FactScrapeBackstop.test.ts tests/unit/v2BackstopCronRoute.test.ts tests/integration/v2PlanSmoke.test.ts tests/integration/v2AggregateSmoke.test.ts
```

Expected: all green.

- [ ] **Step 5: Type-check**

`npm run check` → clean.

---

## Done. What Plan 4 produced

- `POST /api/brand-fact-sheet/plan` — deterministic URL discovery (no LLM)
- `POST /api/brand-fact-sheet/aggregate` — SERIALIZABLE merge + disagreement tracking
- `GET /api/cron/fact-scrape-backstop` — 5-min cron, transaction-level advisory locks, retry cap, dead-man's switch
- 5 new modules in `server/lib/factAgent/v2/`: `sitemapDiscovery`, `urlTierScoring`, `planGuards`, `aggregate`, `factScrapeBackstop`
- 2 new storage methods: `getInFlightScrapeRun`, `getLastCompletedScrapeRunAt`
- 8 unit test files + 2 integration smoke tests

**Endpoint surface now:**
- ✅ `/scrape-one` (Plan 2)
- ✅ `/search-llm` (Plan 3)
- ✅ `/user-enrich` (Plan 3)
- ✅ `/plan` (Plan 4)
- ✅ `/aggregate` (Plan 4)
- 🚧 `/paste` (Plan 5 — UI orchestration)

**Plan 5 next:** the client orchestrator (`useScrapeOrchestration` hook with `p-limit(3)` + `AbortController` + offline detection), three-lane progress card, manual-paste card, onboarding step 2 refactor to share the pipeline, and the missing `POST /runs/:runId/paste` endpoint.
