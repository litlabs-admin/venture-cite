# Fact Sheet v2 — Plan 3: Search-LLM + User-Enrich Sources

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

> **Commits:** The project owner manages git directly. No `git commit`/`add`/`reset`/etc. in this plan. Edits land on disk; the reviewer stages.

> **Coexistence:** Adds two NEW endpoints (`POST /search-llm`, `POST /user-enrich`) alongside Plan 2's `/scrape-one`. Does NOT delete anything from the v1 pipeline.

> **MANDATORY policy:** Every non-GPT model call MUST go through OpenRouter via the OpenAI SDK pointed at `OPENROUTER_BASE_URL`. No direct Anthropic / Google / Perplexity SDKs. See `feedback_openrouter_for_non_gpt.md` and §6.5 of the spec.

**Goal:** Add the remaining two of the three parallel sources from the v2 architecture. Search-LLM uses Perplexity Sonar (via OpenRouter) to extract facts from a brand URL with built-in browsing + Cloudflare bypass. User-enrich uses GPT (direct) to restructure the user's onboarding answers into the 8-domain schema. Both endpoints are idempotent, observability-logged, and concurrency-gated.

**Architecture:** Five new modules + two new endpoints. Reuses Plan 1's `fact_scrape_cache`, `fact_scrape_logs`, `llmConcurrencySlots`, `FactsResponseSchema`. Reuses Plan 2's `extractionPrompt.parseFactsWithRepair`, `llmFailover.callWithFailover`, `ProviderClient`.

**Tech Stack:** TypeScript, Express 4, Drizzle ORM, OpenAI SDK (pointed at OpenRouter for non-GPT), Zod, Vitest.

**Spec reference:** [docs/superpowers/specs/2026-05-13-brand-fact-sheet-v2-design.md](../specs/2026-05-13-brand-fact-sheet-v2-design.md) §6 (Search-LLM), §7 (User-enrich), §6.5 (Provider-routing policy).

---

## Task 1 — OpenRouter client singleton

**Why:** Centralize the lazy OpenRouter client construction so every non-GPT source (search-LLM today, future Gemini fallback, etc.) shares one configured instance. Mirrors the existing pattern in `server/citationChecker.ts:29-40` but module-scoped for the v2 surface.

**Files:**
- Create: `server/lib/factAgent/v2/openrouterClient.ts`
- Test: `tests/unit/v2OpenrouterClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/v2OpenrouterClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("getOpenrouterClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null when OPENROUTER_API_KEY is not set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const { getOpenrouterClient } = await import(
      "../../server/lib/factAgent/v2/openrouterClient"
    );
    expect(getOpenrouterClient()).toBeNull();
    vi.unstubAllEnvs();
  });

  it("returns a singleton OpenAI-shaped client when the key is set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key-abc");
    const { getOpenrouterClient } = await import(
      "../../server/lib/factAgent/v2/openrouterClient"
    );
    const a = getOpenrouterClient();
    const b = getOpenrouterClient();
    expect(a).not.toBeNull();
    expect(a).toBe(b); // same instance
    expect(typeof (a as { chat: unknown })?.chat).toBe("object");
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run tests/unit/v2OpenrouterClient.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/lib/factAgent/v2/openrouterClient.ts`:

```ts
// Shared OpenRouter client for v2 sources. PROJECT POLICY: every non-GPT
// model call goes through OpenRouter via the OpenAI SDK pointed at
// OPENROUTER_BASE_URL. We do not install direct Anthropic / Google /
// Perplexity SDKs.
//
// Lazy + singleton: built on first call, cached for the process lifetime.
// Returns null when OPENROUTER_API_KEY is unset (callers gracefully skip).
import OpenAI from "openai";
import { OPENROUTER_BASE_URL } from "../../modelConfig";

let cached: OpenAI | null | undefined;

export function getOpenrouterClient(): OpenAI | null {
  if (cached !== undefined) return cached;
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    cached = null;
    return null;
  }
  cached = new OpenAI({
    apiKey: key,
    baseURL: OPENROUTER_BASE_URL,
    timeout: 45_000,
    maxRetries: 1,
  });
  return cached;
}

// Test-only: clear the cache so module re-imports pick up a new env.
export function _resetOpenrouterClientForTests(): void {
  cached = undefined;
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/unit/v2OpenrouterClient.test.ts`. Expected: 2 passed.

If the second test fails because the singleton was cached during the first test's run, that's why `_resetOpenrouterClientForTests` exists. The test uses `vi.resetModules()` in `beforeEach` to re-import the module fresh, which gives a new module-scoped `cached` each time. If that doesn't work for any vitest reason, the test can also call `_resetOpenrouterClientForTests()` manually before each `getOpenrouterClient` call.

- [ ] **Step 5: Type-check**

Run: `npm run check`. Expected: clean.

---

## Task 2 — Brand-confusion guard (domain validator)

**Why:** Perplexity may confidently return facts for the wrong company when the brand name is common ("Linear" the SaaS vs "Linear" the algebra library). We validate that each fact's `sourceUrl` is on the brand's apex domain OR on a known allowlist (LinkedIn, Crunchbase, Twitter/X, reputable news). Off-allowlist → drop OR cap confidence at 0.5.

**Files:**
- Create: `server/lib/factAgent/v2/domainAllowlist.ts`
- Test: `tests/unit/v2DomainAllowlist.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2DomainAllowlist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isAllowedSourceUrl,
  filterByBrandDomain,
} from "../../server/lib/factAgent/v2/domainAllowlist";
import type { Fact } from "@shared/factAgent/schema";

describe("isAllowedSourceUrl", () => {
  it("allows URLs on the brand's apex domain", () => {
    expect(isAllowedSourceUrl("https://example.com/about", "https://example.com")).toBe("apex");
    expect(isAllowedSourceUrl("https://www.example.com/team", "https://example.com")).toBe("apex");
    expect(isAllowedSourceUrl("https://blog.example.com/p", "https://example.com")).toBe("apex");
  });

  it("allows LinkedIn company pages, Crunchbase orgs, Twitter/X profiles", () => {
    expect(isAllowedSourceUrl("https://www.linkedin.com/company/example", "https://example.com")).toBe("social");
    expect(isAllowedSourceUrl("https://www.crunchbase.com/organization/example", "https://example.com")).toBe("social");
    expect(isAllowedSourceUrl("https://twitter.com/example", "https://example.com")).toBe("social");
    expect(isAllowedSourceUrl("https://x.com/example", "https://example.com")).toBe("social");
  });

  it("rejects unrelated domains", () => {
    expect(isAllowedSourceUrl("https://wikipedia.org/wiki/Example", "https://example.com")).toBe(false);
    expect(isAllowedSourceUrl("https://reddit.com/r/example", "https://example.com")).toBe(false);
    expect(isAllowedSourceUrl("https://medium.com/@blogger/example", "https://example.com")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedSourceUrl("not a url", "https://example.com")).toBe(false);
    expect(isAllowedSourceUrl("", "https://example.com")).toBe(false);
  });
});

describe("filterByBrandDomain", () => {
  const makeFact = (sourceUrl: string, confidence = 0.9): Fact => ({
    domain: "identity",
    subcategory: "x",
    factKey: "y",
    factValue: "z",
    valueType: "string",
    confidence,
    sourceExcerpt: "",
    sourceUrl,
  });

  it("keeps apex-domain facts at their original confidence", () => {
    const out = filterByBrandDomain(
      [makeFact("https://example.com/p", 0.9)],
      "https://example.com",
    );
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(0.9);
  });

  it("caps confidence at 0.5 for social-allowlist facts above 0.5", () => {
    const out = filterByBrandDomain(
      [makeFact("https://linkedin.com/company/example", 0.95)],
      "https://example.com",
    );
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(0.5);
  });

  it("preserves social-allowlist facts whose confidence is already ≤ 0.5", () => {
    const out = filterByBrandDomain(
      [makeFact("https://linkedin.com/company/example", 0.3)],
      "https://example.com",
    );
    expect(out[0].confidence).toBe(0.3);
  });

  it("drops facts whose sourceUrl is off-allowlist", () => {
    const out = filterByBrandDomain(
      [
        makeFact("https://example.com/p"),
        makeFact("https://random-blog.com/p"),
      ],
      "https://example.com",
    );
    expect(out).toHaveLength(1);
    expect(out[0].sourceUrl).toBe("https://example.com/p");
  });

  it("drops facts with no sourceUrl (Perplexity wouldn't have grounded)", () => {
    const f: Fact = {
      domain: "identity",
      subcategory: "x",
      factKey: "y",
      factValue: "z",
      valueType: "string",
      confidence: 0.9,
      sourceExcerpt: "",
    };
    expect(filterByBrandDomain([f], "https://example.com")).toEqual([]);
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run tests/unit/v2DomainAllowlist.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/lib/factAgent/v2/domainAllowlist.ts`:

```ts
// Brand-confusion guard for the search-LLM source.
//
// Perplexity browses the open web. For a common-name brand ("Linear" the
// SaaS vs "Linear" the algebra library), it may confidently return facts
// from the wrong entity. We mitigate by requiring every fact's sourceUrl
// to be:
//   - on the brand's apex domain (any subdomain OK), OR
//   - on a known social/press allowlist (LinkedIn, Crunchbase, Twitter/X,
//     a few reputable news domains).
//
// Apex matches keep their LLM-assigned confidence. Social matches are
// CAPPED at 0.5 — they're real but not first-hand. Off-allowlist facts
// are dropped entirely.
import type { Fact } from "@shared/factAgent/schema";

const SOCIAL_ALLOWLIST: Array<{ host: string; pathPrefix?: string }> = [
  { host: "linkedin.com", pathPrefix: "/company/" },
  { host: "www.linkedin.com", pathPrefix: "/company/" },
  { host: "crunchbase.com", pathPrefix: "/organization/" },
  { host: "www.crunchbase.com", pathPrefix: "/organization/" },
  { host: "twitter.com" },
  { host: "www.twitter.com" },
  { host: "x.com" },
  { host: "www.x.com" },
];

const SOCIAL_CONFIDENCE_CAP = 0.5;

function registeredDomain(host: string): string {
  // Same heuristic as urlDiscovery.ts: handle co.uk-style 2-level TLDs,
  // fall back to last-2-segments for everything else.
  const MULTI_PUBLIC_SUFFIXES = ["co.uk", "co.jp", "com.au", "co.in", "co.za", "com.br", "com.mx"];
  const h = host.toLowerCase();
  for (const sfx of MULTI_PUBLIC_SUFFIXES) {
    if (h.endsWith("." + sfx)) {
      const parts = h.slice(0, -sfx.length - 1).split(".");
      const apex = parts[parts.length - 1];
      return `${apex}.${sfx}`;
    }
  }
  const parts = h.split(".");
  if (parts.length < 2) return h;
  return parts.slice(-2).join(".");
}

export function isAllowedSourceUrl(
  url: string | undefined,
  brandUrl: string,
): "apex" | "social" | false {
  if (!url) return false;
  let u: URL;
  let b: URL;
  try {
    u = new URL(url);
    b = new URL(brandUrl);
  } catch {
    return false;
  }
  const uReg = registeredDomain(u.hostname);
  const bReg = registeredDomain(b.hostname);
  if (uReg === bReg) return "apex";
  for (const entry of SOCIAL_ALLOWLIST) {
    if (u.hostname.toLowerCase() === entry.host) {
      if (!entry.pathPrefix || u.pathname.startsWith(entry.pathPrefix)) {
        return "social";
      }
    }
  }
  return false;
}

export function filterByBrandDomain(facts: Fact[], brandUrl: string): Fact[] {
  const out: Fact[] = [];
  for (const f of facts) {
    const verdict = isAllowedSourceUrl(f.sourceUrl, brandUrl);
    if (verdict === false) continue;
    if (verdict === "apex") {
      out.push(f);
    } else {
      // social — cap confidence
      out.push({
        ...f,
        confidence: Math.min(f.confidence, SOCIAL_CONFIDENCE_CAP),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/unit/v2DomainAllowlist.test.ts`. Expected: ~9-10 passed (count when running).

- [ ] **Step 5: Type-check**

Run: `npm run check`. Expected: clean.

---

## Task 3 — Search-LLM source composer

**Why:** Orchestrates a single search-grounded LLM call: cache lookup → Perplexity-via-OpenRouter call (concurrency-gated) → Zod parse + repair retry → domain-confusion guard → cache write. Returns `Fact[]` + diagnostics for the route handler.

**Files:**
- Create: `server/lib/factAgent/v2/sourceSearch.ts`
- Test: `tests/unit/v2SourceSearch.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2SourceSearch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock concurrency wrapper to pass-through (we test composer logic).
vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: vi.fn(
    async (_p: string, _r: string | undefined, fn: () => Promise<unknown>) => fn(),
  ),
  PROVIDER_LIMITS: { openai: 20, anthropic: 20, perplexity: 10, gemini: 30 },
}));

// Mock OpenRouter client builder.
const mockOpenrouter = {
  chat: { completions: { create: vi.fn() } },
};
vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({
  getOpenrouterClient: () => mockOpenrouter,
}));

// Mock storage cache methods.
const storageMock = {
  getFactScrapeCache: vi.fn(),
  upsertFactScrapeCache: vi.fn(),
};
vi.mock("../../server/storage", () => ({ storage: storageMock }));

import { runSearchSource } from "../../server/lib/factAgent/v2/sourceSearch";

const baseArgs = {
  brandId: "brand-1",
  brandUrl: "https://example.com",
  brandName: "Example",
  industry: "saas" as string | null,
  runId: "run-1",
};

describe("runSearchSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.getFactScrapeCache.mockResolvedValue(null);
  });

  it("returns cache hit without calling OpenRouter", async () => {
    storageMock.getFactScrapeCache.mockResolvedValue({
      cacheKey: "x",
      valueJson: {
        facts: [
          { domain: "identity", subcategory: "x", factKey: "y", factValue: "z", valueType: "string", confidence: 0.9, sourceExcerpt: "", sourceUrl: "https://example.com/about" },
        ],
      },
      expiresAt: new Date(Date.now() + 1000),
    });
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("done");
    expect(out.facts).toHaveLength(1);
    expect(out.diagnostics.cacheHit).toBe(true);
    expect(mockOpenrouter.chat.completions.create).not.toHaveBeenCalled();
  });

  it("calls Perplexity via OpenRouter on cache miss, drops off-allowlist facts", async () => {
    mockOpenrouter.chat.completions.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              facts: [
                { domain: "identity", subcategory: "x", factKey: "real", factValue: "v", valueType: "string", confidence: 0.9, sourceExcerpt: "", sourceUrl: "https://example.com/about" },
                { domain: "identity", subcategory: "x", factKey: "fake", factValue: "v", valueType: "string", confidence: 0.9, sourceExcerpt: "", sourceUrl: "https://wikipedia.org/wiki/Example" },
              ],
            }),
          },
        },
      ],
    });
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("done");
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0].factKey).toBe("real");
    expect(out.diagnostics.cacheHit).toBe(false);
    expect(storageMock.upsertFactScrapeCache).toHaveBeenCalled();
  });

  it("caps social-allowlist facts at confidence 0.5", async () => {
    mockOpenrouter.chat.completions.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              facts: [
                { domain: "team", subcategory: "founders", factKey: "ceo", factValue: "Alice", valueType: "string", confidence: 0.95, sourceExcerpt: "", sourceUrl: "https://www.linkedin.com/company/example" },
              ],
            }),
          },
        },
      ],
    });
    const out = await runSearchSource(baseArgs);
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0].confidence).toBe(0.5);
  });

  it("returns done with empty facts and short TTL on no-grounded-results", async () => {
    mockOpenrouter.chat.completions.create.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ facts: [] }) } }],
    });
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("done");
    expect(out.facts).toEqual([]);
    // Cache write happens with the empty result so we don't re-hit Perplexity
    // for an hour.
    const call = storageMock.upsertFactScrapeCache.mock.calls[0][0];
    expect(call.expiresAt.getTime()).toBeLessThan(Date.now() + 2 * 60 * 60 * 1000);
  });

  it("returns status=failed on OpenRouter provider error (no cache write)", async () => {
    mockOpenrouter.chat.completions.create.mockRejectedValueOnce(
      Object.assign(new Error("Service unavailable"), { status: 503 }),
    );
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("failed");
    expect(out.errorKind).toBe("llm_unavailable");
    expect(storageMock.upsertFactScrapeCache).not.toHaveBeenCalled();
  });

  it("returns status=skipped when OPENROUTER client is unavailable", async () => {
    const { getOpenrouterClient } = await import(
      "../../server/lib/factAgent/v2/openrouterClient"
    );
    (getOpenrouterClient as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    const out = await runSearchSource(baseArgs);
    expect(out.status).toBe("skipped");
    expect(out.errorKind).toBe("provider_unconfigured");
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run tests/unit/v2SourceSearch.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/lib/factAgent/v2/sourceSearch.ts`:

```ts
// Source 2: search-grounded LLM. Single Perplexity Sonar call via OpenRouter
// with brand-confusion guard + 24h cache.
//
// Inputs: brand context. Output: facts in the canonical 8-domain schema.
// Idempotent: cache key = "search-llm:<brandId>:<urlHash>:v<schemaVersion>".
// TTL: 24h on ≥1-fact response, 1h on empty, no cache on provider error.
import crypto from "node:crypto";
import { withSlot } from "../../llmConcurrency";
import { storage } from "../../../storage";
import { logger } from "../../logger";
import { MODELS } from "../../modelConfig";
import {
  CURRENT_SCHEMA_VERSION,
  FactsResponseSchema,
  type Fact,
} from "@shared/factAgent/schema";
import { getOpenrouterClient } from "./openrouterClient";
import { filterByBrandDomain } from "./domainAllowlist";

export interface RunSearchSourceArgs {
  brandId: string;
  brandUrl: string;
  brandName?: string;
  industry?: string | null;
  runId?: string;
}

export type SearchSourceStatus = "done" | "failed" | "skipped";

export interface SearchSourceOutcome {
  status: SearchSourceStatus;
  facts: Fact[];
  errorKind: string | null;
  errorMessage: string | null;
  diagnostics: {
    cacheHit: boolean;
    provider: "perplexity" | null;
    repairUsed?: boolean;
    droppedOffAllowlist?: number;
    cappedToSocial?: number;
  };
}

const CACHE_TTL_SUCCESS_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_EMPTY_MS = 60 * 60 * 1000;

function cacheKey(brandId: string, brandUrl: string): string {
  const urlHash = crypto.createHash("sha256").update(brandUrl.toLowerCase().replace(/\/$/, "")).digest("hex").slice(0, 16);
  return `search-llm:${brandId}:${urlHash}:v${CURRENT_SCHEMA_VERSION}`;
}

const SYSTEM_PROMPT = `You are a brand-facts researcher.

Visit the brand's URL and closely-linked pages (about, team, pricing, contact, blog, press) and extract structured facts about the company. Return JSON only.

CRITICAL RULES:
1. Every fact MUST have a sourceUrl. Use the URL of the page you took the fact from.
2. Use only first-hand sources: the brand's own pages or their official social / press profiles (LinkedIn company page, Crunchbase organization, X/Twitter handle). Do not use Wikipedia, Reddit, or random blog posts.
3. Confidence 1.0 only for facts that appear verbatim in a source. 0.7-0.9 for paraphrased. ≤0.5 for inferred.
4. If you cannot find the brand or cannot verify any facts, return facts=[]. Do not invent.

Return JSON in exactly this shape:
{
  "facts": [
    {
      "domain": "identity"|"offerings"|"positioning"|"team"|"operations"|"credentials"|"growth"|"contact",
      "subcategory": "<short label>",
      "factKey": "<short label>",
      "factValue": "<value>",
      "valueType": "string"|"number"|"array",
      "valuePayload": null|object,
      "confidence": 0.0..1.0,
      "sourceExcerpt": "<verbatim snippet>",
      "sourceUrl": "<page URL>"
    }
  ]
}`;

function buildUserPrompt(args: RunSearchSourceArgs): string {
  const lines = [
    `Brand URL: ${args.brandUrl}`,
    args.brandName ? `Brand name: ${args.brandName}` : null,
    args.industry ? `Industry hint: ${args.industry}` : null,
    "",
    "Visit the URL above and extract facts about THIS specific company (not other companies with similar names). Return JSON only.",
  ].filter(Boolean);
  return lines.join("\n");
}

export async function runSearchSource(
  args: RunSearchSourceArgs,
): Promise<SearchSourceOutcome> {
  // 1. Cache lookup
  const key = cacheKey(args.brandId, args.brandUrl);
  const cached = await storage.getFactScrapeCache(key);
  if (cached) {
    const parsed = FactsResponseSchema.safeParse(cached.valueJson);
    if (parsed.success) {
      return {
        status: "done",
        facts: parsed.data.facts,
        errorKind: null,
        errorMessage: null,
        diagnostics: { cacheHit: true, provider: "perplexity" },
      };
    }
    // Bad cache row (schema changed?) — fall through and re-fetch.
    logger.warn({ key }, "sourceSearch: cached row failed schema, refetching");
  }

  // 2. Build the OpenRouter client. If missing, skip cleanly.
  const client = getOpenrouterClient();
  if (!client) {
    return {
      status: "skipped",
      facts: [],
      errorKind: "provider_unconfigured",
      errorMessage: "OPENROUTER_API_KEY not set; search-LLM source disabled",
      diagnostics: { cacheHit: false, provider: null },
    };
  }

  // 3. Call Perplexity via OpenRouter, concurrency-gated.
  let raw: string;
  try {
    raw = await withSlot("perplexity", args.runId, async () => {
      const res = await client.chat.completions.create({
        model: MODELS.citationPerplexity,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(args) },
        ],
      });
      return res.choices?.[0]?.message?.content ?? "";
    });
  } catch (err) {
    logger.warn({ err, brandId: args.brandId, runId: args.runId }, "sourceSearch: provider error");
    return {
      status: "failed",
      facts: [],
      errorKind: "llm_unavailable",
      errorMessage: (err as Error).message,
      diagnostics: { cacheHit: false, provider: "perplexity" },
    };
  }

  // 4. Parse + repair retry inline (Plan 2's parseFactsWithRepair takes an
  // LLM callable; here we just retry once on schema-fail to avoid a second
  // round-trip through withSlot for a separate model call).
  let parsed: { facts: Fact[]; repairUsed: boolean };
  try {
    const json = JSON.parse(raw);
    const v = FactsResponseSchema.safeParse(json);
    if (v.success) {
      parsed = { facts: v.data.facts, repairUsed: false };
    } else {
      // Repair: send the error back to the same model.
      const repairRaw = await withSlot("perplexity", args.runId, async () => {
        const res = await client.chat.completions.create({
          model: MODELS.citationPerplexity,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(args) },
            { role: "assistant", content: raw },
            {
              role: "user",
              content: `Your previous response failed schema validation: ${v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}\nFix the JSON and return the same data in the required shape. JSON only.`,
            },
          ],
        });
        return res.choices?.[0]?.message?.content ?? "";
      });
      const json2 = JSON.parse(repairRaw);
      const v2 = FactsResponseSchema.safeParse(json2);
      parsed = v2.success
        ? { facts: v2.data.facts, repairUsed: true }
        : { facts: [], repairUsed: true };
    }
  } catch (err) {
    logger.warn({ err, brandId: args.brandId }, "sourceSearch: response unparseable");
    parsed = { facts: [], repairUsed: true };
  }

  // 5. Brand-confusion guard
  const before = parsed.facts.length;
  const filtered = filterByBrandDomain(parsed.facts, args.brandUrl);
  const dropped = before - filtered.length;
  const capped = filtered.filter((f) => f.confidence === 0.5).length;

  // 6. Cache write — only on parseable response (not on provider error).
  const expiresAt = new Date(
    Date.now() + (filtered.length > 0 ? CACHE_TTL_SUCCESS_MS : CACHE_TTL_EMPTY_MS),
  );
  try {
    await storage.upsertFactScrapeCache({
      cacheKey: key,
      source: "search_llm",
      brandId: args.brandId,
      valueJson: { facts: filtered },
      expiresAt,
    });
  } catch (err) {
    logger.warn({ err, key }, "sourceSearch: cache write failed (non-fatal)");
  }

  return {
    status: "done",
    facts: filtered,
    errorKind: null,
    errorMessage: null,
    diagnostics: {
      cacheHit: false,
      provider: "perplexity",
      repairUsed: parsed.repairUsed,
      droppedOffAllowlist: dropped,
      cappedToSocial: capped,
    },
  };
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/unit/v2SourceSearch.test.ts`. Expected: 6 passed.

If a test fails because of the `getOpenrouterClient` mock pattern (the `mockReturnValueOnce` test): the cleanest fix is to grab the mock via `vi.mocked(...)` and call its mock methods directly. If the test still doesn't isolate correctly, restructure as a separate `describe` block with its own `vi.mock` that returns `null` for that case.

- [ ] **Step 5: Type-check**

Run: `npm run check`. Expected: clean.

---

## Task 4 — Route: `POST /api/brand-fact-sheet/search-llm`

**Why:** HTTP surface for Source 2. Auth + ownership + call `runSearchSource` + persist facts + log to `fact_scrape_logs`.

**Files:**
- Modify: `server/routes/factSheetV2.ts` (add a second route in the same `setupFactSheetV2Routes` function)
- Test: `tests/unit/v2SearchLlmRoute.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2SearchLlmRoute.test.ts`:

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
  updateScrapePageStatus: vi.fn(),
  incrementScrapeRunCounters: vi.fn(),
  insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
  getFactScrapeCache: vi.fn(),
  upsertFactScrapeCache: vi.fn(),
};
vi.mock("../../server/storage", () => ({ storage: storageMock }));

vi.mock("../../server/lib/factAgent/persistFacts", () => ({
  persistFacts: vi.fn().mockResolvedValue({ inserted: 1 }),
}));

const runSearchSourceMock = vi.fn();
vi.mock("../../server/lib/factAgent/v2/sourceSearch", () => ({
  runSearchSource: (...args: unknown[]) => runSearchSourceMock(...args),
}));

vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetV2Routes(app);
  return app;
}

describe("POST /api/brand-fact-sheet/search-llm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({ id: "brand-1", userId: "user-1", website: "https://example.com", name: "Example", industry: "saas" });
  });

  it("400 when runId missing", async () => {
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/search-llm")
      .send({});
    expect(res.status).toBe(400);
  });

  it("404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId: "run-1" });
    expect(res.status).toBe(404);
  });

  it("happy path: 200, facts persisted, log written", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runSearchSourceMock.mockResolvedValue({
      status: "done",
      facts: [{ domain: "identity", subcategory: "x", factKey: "y", factValue: "z", valueType: "string", confidence: 0.9, sourceExcerpt: "", sourceUrl: "https://example.com/about" }],
      errorKind: null,
      errorMessage: null,
      diagnostics: { cacheHit: false, provider: "perplexity" },
    });

    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", source: "search_llm", status: "done", factCount: 1 }),
    );
  });

  it("returns provider error info on failure", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runSearchSourceMock.mockResolvedValue({
      status: "failed",
      facts: [],
      errorKind: "llm_unavailable",
      errorMessage: "Service unavailable",
      diagnostics: { cacheHit: false, provider: "perplexity" },
    });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(0);
    expect(res.body.errorKind).toBe("llm_unavailable");
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", source: "search_llm", status: "failed" }),
    );
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run tests/unit/v2SearchLlmRoute.test.ts`. Expected: FAIL — route handler doesn't exist yet.

- [ ] **Step 3: Add the route to `server/routes/factSheetV2.ts`**

Open `server/routes/factSheetV2.ts`. Add at the top of imports:

```ts
import { runSearchSource } from "../lib/factAgent/v2/sourceSearch";
```

Add a new Zod schema near the existing `scrapeOneSchema`:

```ts
const searchLlmSchema = z.object({
  runId: z.string().min(1),
});
```

Inside `setupFactSheetV2Routes(app)`, after the existing `/scrape-one` handler (i.e. AFTER the closing `);` of `app.post("/api/brand-fact-sheet/scrape-one", ...)`), add:

```ts
  app.post(
    "/api/brand-fact-sheet/search-llm",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const startedAt = Date.now();
      try {
        const user = requireUser(req);
        const parsed = searchLlmSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { runId } = parsed.data;

        const run = await storage.getScrapeRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const outcome = await runSearchSource({
          brandId: brand.id,
          brandUrl: brand.website ?? "",
          brandName: brand.name,
          industry: brand.industry ?? null,
          runId,
        });

        if (outcome.facts.length > 0) {
          await persistFacts(outcome.facts as never, {
            brandId: brand.id,
            runId,
            sourceUrl: brand.website ?? "",
          });
        }

        await storage.insertFactScrapeLog({
          runId,
          source: "search_llm",
          status: outcome.status,
          factCount: outcome.facts.length,
          latencyMs: Date.now() - startedAt,
          errorKind: outcome.errorKind ?? undefined,
          diagnostics: outcome.diagnostics,
        });

        return res.status(200).json({
          success: true,
          runId,
          status: outcome.status,
          factCount: outcome.facts.length,
          errorKind: outcome.errorKind,
          diagnostics: outcome.diagnostics,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.search-llm failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.search-llm" } });
        return sendError(res, err, "Failed to search-LLM");
      }
    }),
  );
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/v2SearchLlmRoute.test.ts`. Expected: 4 passed.

- [ ] **Step 5: Type-check**

Run: `npm run check`. Expected: clean.

---

## Task 5 — User-enrich source composer

**Why:** Source 3. Takes the user's onboarding fields + any existing `source IN ('user','user_manual')` rows and reshapes them into the 8-domain schema with `confidence=1.0`. Falls back to deterministic field-to-fact mapping if the LLM is unavailable — this source must never fail.

**Files:**
- Create: `server/lib/factAgent/v2/sourceUserEnrich.ts`
- Test: `tests/unit/v2SourceUserEnrich.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2SourceUserEnrich.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/lib/llmConcurrency", () => ({
  withSlot: vi.fn(
    async (_p: string, _r: string | undefined, fn: () => Promise<unknown>) => fn(),
  ),
  PROVIDER_LIMITS: { openai: 20, anthropic: 20, perplexity: 10, gemini: 30 },
}));

const openaiMock = { chat: { completions: { create: vi.fn() } } };
vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    openai: openaiMock,
  };
});

import { runUserEnrichSource } from "../../server/lib/factAgent/v2/sourceUserEnrich";

const baseBrand = {
  id: "brand-1",
  name: "Acme",
  description: "We build AI for SMBs.",
  industry: "saas",
  website: "https://example.com",
  products: ["AI Assistant", "AI Analytics"],
  targetAudience: "SMB founders",
  uniqueSellingPoints: ["Fast setup", "No-code"],
  keyValues: "Customer obsession",
  brandVoice: "Friendly + technical",
  tone: "Casual",
};

describe("runUserEnrichSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns LLM-reshaped facts on happy path", async () => {
    openaiMock.chat.completions.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              facts: [
                { domain: "identity", subcategory: "description", factKey: "description", factValue: "We build AI for SMBs.", valueType: "string", confidence: 1.0, sourceExcerpt: "" },
                { domain: "offerings", subcategory: "products", factKey: "products", factValue: "AI Assistant, AI Analytics", valueType: "array", valuePayload: { items: ["AI Assistant", "AI Analytics"] }, confidence: 1.0, sourceExcerpt: "" },
              ],
            }),
          },
        },
      ],
    });
    const out = await runUserEnrichSource({ brand: baseBrand, runId: "run-1" });
    expect(out.status).toBe("done");
    expect(out.facts.length).toBeGreaterThanOrEqual(2);
    expect(out.facts.every((f) => f.confidence === 1.0)).toBe(true);
    expect(out.diagnostics.usedFallback).toBe(false);
  });

  it("falls back to deterministic mapping when LLM throws", async () => {
    openaiMock.chat.completions.create.mockRejectedValueOnce(
      Object.assign(new Error("openai down"), { status: 503 }),
    );
    const out = await runUserEnrichSource({ brand: baseBrand, runId: "run-1" });
    expect(out.status).toBe("done");
    expect(out.diagnostics.usedFallback).toBe(true);
    // Description from baseBrand should land verbatim
    expect(out.facts.some((f) => f.factKey === "description" && f.factValue.includes("AI for SMBs"))).toBe(true);
    // Products should be present
    expect(out.facts.some((f) => f.factKey === "products")).toBe(true);
  });

  it("returns empty facts when the brand record is entirely blank", async () => {
    const blank = { id: "brand-2", name: "", description: null, industry: null, website: "", products: null, targetAudience: null, uniqueSellingPoints: null, keyValues: null, brandVoice: null, tone: null };
    // LLM also returns empty — but in practice the deterministic fallback
    // is what matters for "never fail"; force the LLM path to throw so we
    // hit the fallback.
    openaiMock.chat.completions.create.mockRejectedValueOnce(new Error("simulate"));
    const out = await runUserEnrichSource({ brand: blank as never, runId: "run-1" });
    expect(out.status).toBe("done");
    expect(out.facts).toEqual([]);
    expect(out.diagnostics.usedFallback).toBe(true);
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run tests/unit/v2SourceUserEnrich.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

Create `server/lib/factAgent/v2/sourceUserEnrich.ts`:

```ts
// Source 3: user-enrich. Reshapes the brand's user-provided fields into the
// canonical 8-domain fact schema with confidence=1.0 (user is authoritative).
//
// Two paths:
//   1. LLM (GPT direct) — semantically maps free-form fields to schema slots.
//      Concurrency-gated, JSON-mode response.
//   2. Deterministic fallback — straight column-to-fact mapping. Runs when
//      the LLM is unavailable. Source 3 must never fail the run.
import { withSlot } from "../../llmConcurrency";
import { openai } from "../../routesShared";
import { MODELS } from "../../modelConfig";
import { logger } from "../../logger";
import { FactsResponseSchema, type Fact } from "@shared/factAgent/schema";

export interface UserEnrichBrand {
  id: string;
  name?: string | null;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
  products?: string[] | null;
  targetAudience?: string | null;
  uniqueSellingPoints?: string[] | null;
  keyValues?: string | null;
  brandVoice?: string | null;
  tone?: string | null;
}

export interface RunUserEnrichArgs {
  brand: UserEnrichBrand;
  runId?: string;
}

export type UserEnrichStatus = "done" | "failed";

export interface UserEnrichOutcome {
  status: UserEnrichStatus;
  facts: Fact[];
  errorKind: string | null;
  errorMessage: string | null;
  diagnostics: { usedFallback: boolean };
}

const SYSTEM_PROMPT = `You are reshaping a brand's self-provided fields into a canonical fact schema.

The user typed these fields themselves during onboarding. Treat them as authoritative — confidence MUST be 1.0 on every fact. Do not invent or paraphrase beyond minimal cleanup.

Map fields to the 8-domain schema:
  identity:    name, description, tagline, mission
  offerings:   products, services, pricing_plans, integrations
  positioning: target_audience, unique_selling_points, brand_voice, tone
  team:        founders, leadership
  operations:  regions, locations
  credentials: certifications, awards, press
  growth:      funding_rounds, notable_customers
  contact:     email, phone, channels

Return JSON in exactly this shape:
{
  "facts": [
    {
      "domain": "identity"|"offerings"|"positioning"|"team"|"operations"|"credentials"|"growth"|"contact",
      "subcategory": "<short label matching the field>",
      "factKey": "<short label>",
      "factValue": "<the user's value, cleaned of whitespace only>",
      "valueType": "string"|"number"|"array",
      "valuePayload": null|object,
      "confidence": 1.0,
      "sourceExcerpt": ""
    }
  ]
}

Skip fields that are null, undefined, or empty strings/arrays. Return facts=[] if the brand has nothing populated.`;

function buildUserPrompt(brand: UserEnrichBrand): string {
  return [
    `Brand record (JSON):`,
    JSON.stringify(
      {
        name: brand.name ?? null,
        description: brand.description ?? null,
        industry: brand.industry ?? null,
        website: brand.website ?? null,
        products: brand.products ?? null,
        targetAudience: brand.targetAudience ?? null,
        uniqueSellingPoints: brand.uniqueSellingPoints ?? null,
        keyValues: brand.keyValues ?? null,
        brandVoice: brand.brandVoice ?? null,
        tone: brand.tone ?? null,
      },
      null,
      2,
    ),
  ].join("\n");
}

function deterministicFallback(brand: UserEnrichBrand): Fact[] {
  const out: Fact[] = [];
  const push = (
    domain: Fact["domain"],
    subcategory: string,
    factKey: string,
    factValue: string,
    valueType: Fact["valueType"] = "string",
    valuePayload: Fact["valuePayload"] = null,
  ) => {
    if (!factValue) return;
    out.push({
      domain,
      subcategory,
      factKey,
      factValue,
      valueType,
      valuePayload,
      confidence: 1.0,
      sourceExcerpt: "",
    });
  };
  if (brand.name) push("identity", "description", "name", brand.name);
  if (brand.description) push("identity", "description", "description", brand.description);
  if (brand.industry) push("identity", "description", "industry", brand.industry);
  if (brand.products?.length) {
    push("offerings", "products", "products", brand.products.join(", "), "array", { items: brand.products });
  }
  if (brand.targetAudience) push("positioning", "target_audience", "target_audience", brand.targetAudience);
  if (brand.uniqueSellingPoints?.length) {
    push("positioning", "unique_selling_points", "unique_selling_points", brand.uniqueSellingPoints.join(", "), "array", { items: brand.uniqueSellingPoints });
  }
  if (brand.keyValues) push("positioning", "values", "key_values", brand.keyValues);
  if (brand.brandVoice) push("positioning", "brand_voice", "brand_voice", brand.brandVoice);
  if (brand.tone) push("positioning", "brand_voice", "tone", brand.tone);
  return out;
}

export async function runUserEnrichSource(
  args: RunUserEnrichArgs,
): Promise<UserEnrichOutcome> {
  // 1. Try LLM path first
  try {
    const raw = await withSlot("openai", args.runId, async () => {
      const res = await openai.chat.completions.create({
        model: MODELS.misc,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(args.brand) },
        ],
      });
      return res.choices?.[0]?.message?.content ?? "";
    });
    const parsed = JSON.parse(raw);
    const v = FactsResponseSchema.safeParse(parsed);
    if (v.success) {
      // Force confidence=1.0 even if the LLM strayed (cheap insurance).
      const facts = v.data.facts.map((f) => ({ ...f, confidence: 1.0 }));
      return {
        status: "done",
        facts,
        errorKind: null,
        errorMessage: null,
        diagnostics: { usedFallback: false },
      };
    }
    logger.warn({ brandId: args.brand.id, issues: v.error.issues }, "sourceUserEnrich: LLM schema invalid, falling back");
  } catch (err) {
    logger.warn({ err, brandId: args.brand.id }, "sourceUserEnrich: LLM call failed, falling back");
  }

  // 2. Deterministic fallback — must never fail.
  return {
    status: "done",
    facts: deterministicFallback(args.brand),
    errorKind: null,
    errorMessage: null,
    diagnostics: { usedFallback: true },
  };
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/unit/v2SourceUserEnrich.test.ts`. Expected: 3 passed.

- [ ] **Step 5: Type-check**

Run: `npm run check`. Expected: clean.

---

## Task 6 — Route: `POST /api/brand-fact-sheet/user-enrich`

**Why:** HTTP surface for Source 3. Auth + ownership + call `runUserEnrichSource` + persist facts (with `source='user'`) + log.

**Files:**
- Modify: `server/routes/factSheetV2.ts` (third route in the same setup)
- Test: `tests/unit/v2UserEnrichRoute.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/v2UserEnrichRoute.test.ts`:

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
  insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
  getFactScrapeCache: vi.fn(),
  upsertFactScrapeCache: vi.fn(),
  updateScrapePageStatus: vi.fn(),
  incrementScrapeRunCounters: vi.fn(),
};
vi.mock("../../server/storage", () => ({ storage: storageMock }));

const persistUserFactsMock = vi.fn().mockResolvedValue({ inserted: 2 });
vi.mock("../../server/lib/factAgent/v2/persistUserFacts", () => ({
  persistUserFacts: persistUserFactsMock,
}));

const runUserEnrichMock = vi.fn();
vi.mock("../../server/lib/factAgent/v2/sourceUserEnrich", () => ({
  runUserEnrichSource: (...args: unknown[]) => runUserEnrichMock(...args),
}));

vi.mock("../../server/lib/routesShared", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../../server/lib/routesShared");
  return {
    ...real,
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    openai: { chat: { completions: { create: vi.fn() } } },
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupFactSheetV2Routes(app);
  return app;
}

describe("POST /api/brand-fact-sheet/user-enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reqBrand.mockResolvedValue({
      id: "brand-1",
      userId: "user-1",
      name: "Acme",
      description: "We build.",
      industry: "saas",
      website: "https://example.com",
      products: ["X"],
      targetAudience: null,
      uniqueSellingPoints: null,
      keyValues: null,
      brandVoice: null,
      tone: null,
    });
  });

  it("400 when runId missing", async () => {
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/user-enrich")
      .send({});
    expect(res.status).toBe(400);
  });

  it("404 when run not found", async () => {
    storageMock.getScrapeRunById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId: "run-1" });
    expect(res.status).toBe(404);
  });

  it("happy path: 200, facts persisted with source=user, log written", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runUserEnrichMock.mockResolvedValue({
      status: "done",
      facts: [
        { domain: "identity", subcategory: "description", factKey: "description", factValue: "We build.", valueType: "string", confidence: 1.0, sourceExcerpt: "" },
      ],
      errorKind: null,
      errorMessage: null,
      diagnostics: { usedFallback: false },
    });

    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);

    // persistUserFacts call gets brandId + runId (no source — the function
    // only writes source='user' rows by construction).
    const persistCall = persistUserFactsMock.mock.calls[0];
    expect(persistCall[1]).toEqual(
      expect.objectContaining({ brandId: "brand-1", runId: "run-1" }),
    );
    expect(storageMock.insertFactScrapeLog).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", source: "user_enrich", status: "done", factCount: 1 }),
    );
  });

  it("returns the fallback flag in diagnostics", async () => {
    storageMock.getScrapeRunById.mockResolvedValue({ id: "run-1", brandId: "brand-1" });
    runUserEnrichMock.mockResolvedValue({
      status: "done",
      facts: [],
      errorKind: null,
      errorMessage: null,
      diagnostics: { usedFallback: true },
    });
    const res = await request(makeApp())
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId: "run-1" });
    expect(res.status).toBe(200);
    expect(res.body.diagnostics.usedFallback).toBe(true);
  });
});
```

- [ ] **Step 2: Confirm failure**

Run: `npx vitest run tests/unit/v2UserEnrichRoute.test.ts`. Expected: FAIL.

- [ ] **Step 3: Add route to `server/routes/factSheetV2.ts`**

Add imports:
```ts
import { runUserEnrichSource } from "../lib/factAgent/v2/sourceUserEnrich";
import { persistUserFacts } from "../lib/factAgent/v2/persistUserFacts";
```

Add Zod schema near the others:
```ts
const userEnrichSchema = z.object({
  runId: z.string().min(1),
});
```

**NOTE on persisting user-source facts.** The existing `persistFacts` in `server/lib/factAgent/persistFacts.ts` is hardcoded to `source='scraped'` and relies on the partial unique index `(brand_id, domain, subcategory, fact_key) WHERE source='scraped' AND dismissed_at IS NULL`. User-source rows are outside that index and need different upsert semantics. Don't try to retrofit `persistFacts` — add a sibling helper alongside it.

Create `server/lib/factAgent/v2/persistUserFacts.ts`:

```ts
// Persist user-source facts (from /user-enrich). Replaces all existing
// source='user' rows for this brand in a single transaction so the latest
// onboarding-derived fact set is always authoritative. Does NOT touch
// source='user_manual' rows — those are user-edited overrides that survive
// every re-run.
import { db } from "../../../db";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Fact } from "@shared/factAgent/schema";
import { logger } from "../../logger";

interface PersistUserArgs {
  brandId: string;
  runId: string;
}

export async function persistUserFacts(
  facts: Fact[],
  args: PersistUserArgs,
): Promise<{ inserted: number }> {
  return await db.transaction(async (tx) => {
    // 1. Wipe existing source='user' rows for this brand. user_manual
    //    rows are explicitly untouched.
    await tx
      .delete(schema.brandFactSheet)
      .where(
        and(
          eq(schema.brandFactSheet.brandId, args.brandId),
          eq(schema.brandFactSheet.source, "user"),
        ),
      );

    if (facts.length === 0) return { inserted: 0 };

    // 2. Bulk insert the new set.
    const rows = facts.map((f) => ({
      brandId: args.brandId,
      domain: f.domain,
      subcategory: f.subcategory,
      factKey: f.factKey,
      factValue: f.factValue,
      valueType: f.valueType,
      valuePayload: f.valuePayload ?? null,
      confidence: String(f.confidence) as never, // numeric column accepts string
      sourceExcerpt: f.sourceExcerpt ?? "",
      sourceUrl: f.sourceUrl ?? null,
      source: "user",
      runId: args.runId,
    }));
    await tx.insert(schema.brandFactSheet).values(rows as never);
    return { inserted: rows.length };
  }).catch((err) => {
    logger.warn({ err, brandId: args.brandId, runId: args.runId }, "persistUserFacts failed");
    return { inserted: 0 };
  });
}
```

Then in the route below, replace the `persistFacts` call with `persistUserFacts(outcome.facts, { brandId: brand.id, runId })`. Don't import `persistFacts` for this route — it's only for scraped facts.

Inside `setupFactSheetV2Routes`, after the `/search-llm` handler, add:

```ts
  app.post(
    "/api/brand-fact-sheet/user-enrich",
    isAuthenticated,
    aiLimitMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const startedAt = Date.now();
      try {
        const user = requireUser(req);
        const parsed = userEnrichSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            success: false,
            error: parsed.error.errors[0]?.message ?? "Invalid request",
          });
        }
        const { runId } = parsed.data;

        const run = await storage.getScrapeRunById(runId);
        if (!run) return res.status(404).json({ success: false, error: "Run not found" });
        const brand = await requireBrand(run.brandId, user.id);

        const outcome = await runUserEnrichSource({
          brand: {
            id: brand.id,
            name: brand.name,
            description: brand.description,
            industry: brand.industry,
            website: brand.website,
            products: brand.products as string[] | null,
            targetAudience: brand.targetAudience,
            uniqueSellingPoints: brand.uniqueSellingPoints as string[] | null,
            keyValues: brand.keyValues,
            brandVoice: brand.brandVoice,
            tone: brand.tone,
          },
          runId,
        });

        // Always call persistUserFacts even on 0 facts so existing
        // source='user' rows get cleared when the user empties their
        // onboarding fields.
        await persistUserFacts(outcome.facts, {
          brandId: brand.id,
          runId,
        });

        await storage.insertFactScrapeLog({
          runId,
          source: "user_enrich",
          status: outcome.status,
          factCount: outcome.facts.length,
          latencyMs: Date.now() - startedAt,
          errorKind: outcome.errorKind ?? undefined,
          diagnostics: outcome.diagnostics,
        });

        return res.status(200).json({
          success: true,
          runId,
          status: outcome.status,
          factCount: outcome.facts.length,
          diagnostics: outcome.diagnostics,
        });
      } catch (err) {
        if (err instanceof OwnershipError) {
          return res.status(err.status).json({ success: false, error: err.message });
        }
        logger.warn({ err }, "factSheetV2.user-enrich failed");
        captureAndFlush(err, { tags: { source: "factSheetV2.user-enrich" } });
        return sendError(res, err, "Failed to user-enrich");
      }
    }),
  );
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/v2UserEnrichRoute.test.ts`. Expected: 4 passed.

- [ ] **Step 5: Type-check**

Run: `npm run check`. Expected: clean.

---

## Task 7 — End-to-end smoke tests for both new endpoints

**Why:** Confirm the full pipeline persists facts when given real DB + mocked LLM. Mirrors `tests/integration/v2ScrapeOneSmoke.test.ts` from Plan 2.

**Files:**
- Test: `tests/integration/v2SearchLlmSmoke.test.ts`
- Test: `tests/integration/v2UserEnrichSmoke.test.ts`

- [ ] **Step 1: Write the search-LLM smoke test**

Create `tests/integration/v2SearchLlmSmoke.test.ts`:

```ts
// End-to-end search-LLM: real DB, mocked OpenRouter Perplexity.
// Verifies cache write + facts persistence + log row.
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

// Mock the OpenRouter client at the v2 module level.
vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({
  getOpenrouterClient: () => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  facts: [
                    {
                      domain: "identity",
                      subcategory: "description",
                      factKey: "tagline",
                      factValue: "Smoke search-LLM result.",
                      valueType: "string",
                      confidence: 0.95,
                      sourceExcerpt: "",
                      sourceUrl: "https://example.com/about",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      },
    },
  }),
}));

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-v2-search";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, website, industry, created_at, updated_at)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'Smoke Search', 'Smoke Search', 'https://example.com', 'saas', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(sql`DELETE FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(sql`DELETE FROM fact_scrape_cache WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(sql`DELETE FROM fact_scrape_logs WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`);
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 3 smoke: POST /search-llm persists end-to-end", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("calls Perplexity-via-OpenRouter, persists 1 fact, writes cache + log", async () => {
    const runRow = await db.execute(sql`
      INSERT INTO brand_fact_scrape_runs (brand_id, triggered_by, status)
      VALUES (${TEST_BRAND_ID}, 'manual_rescrape', 'pending')
      RETURNING id
    `);
    const runId = (runRow as unknown as { rows: Array<{ id: string }> }).rows[0].id;

    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    const res = await request(app)
      .post("/api/brand-fact-sheet/search-llm")
      .send({ runId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.factCount).toBe(1);

    const factRows = await db.execute(sql`
      SELECT fact_key, fact_value FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID} AND source = 'scraped'
    `);
    const facts = (factRows as unknown as { rows: Array<{ fact_key: string; fact_value: string }> }).rows;
    expect(facts.some((f) => f.fact_key === "tagline" && f.fact_value === "Smoke search-LLM result.")).toBe(true);

    const cacheRows = await db.execute(sql`
      SELECT cache_key FROM fact_scrape_cache WHERE brand_id = ${TEST_BRAND_ID}
    `);
    expect((cacheRows as unknown as { rows: Array<unknown> }).rows.length).toBeGreaterThanOrEqual(1);

    const logRows = await db.execute(sql`
      SELECT source, status, fact_count FROM fact_scrape_logs WHERE run_id = ${runId}
    `);
    const logs = (logRows as unknown as { rows: Array<{ source: string; status: string; fact_count: number }> }).rows;
    expect(logs.some((l) => l.source === "search_llm" && l.status === "done" && l.fact_count === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Write the user-enrich smoke test**

Create `tests/integration/v2UserEnrichSmoke.test.ts`:

```ts
// End-to-end user-enrich: real DB, mocked OpenAI.
// Verifies facts persist with source='user'.
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
    openai: {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    facts: [
                      {
                        domain: "identity",
                        subcategory: "description",
                        factKey: "description",
                        factValue: "Smoke user-enrich brand.",
                        valueType: "string",
                        confidence: 1.0,
                        sourceExcerpt: "",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        },
      },
    },
  };
});

import { setupFactSheetV2Routes } from "../../server/routes/factSheetV2";

const TEST_USER_ID = "smoke-user";
const TEST_BRAND_ID = "smoke-brand-v2-enrich";

async function seed() {
  await db.execute(sql`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (${TEST_USER_ID}, 'smoke@test.local', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO brands (id, user_id, name, company_name, description, website, industry, created_at, updated_at)
    VALUES (${TEST_BRAND_ID}, ${TEST_USER_ID}, 'Smoke Enrich', 'Smoke Enrich', 'Smoke user-enrich brand.', 'https://example.com', 'saas', now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function cleanup() {
  await db.execute(sql`DELETE FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}`);
  await db.execute(sql`DELETE FROM fact_scrape_logs WHERE run_id IN (SELECT id FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID})`);
  await db.execute(sql`DELETE FROM brand_fact_scrape_runs WHERE brand_id = ${TEST_BRAND_ID}`);
}

describe("Plan 3 smoke: POST /user-enrich persists with source=user", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  it("calls GPT, persists fact with source=user, writes log", async () => {
    const runRow = await db.execute(sql`
      INSERT INTO brand_fact_scrape_runs (brand_id, triggered_by, status)
      VALUES (${TEST_BRAND_ID}, 'manual_rescrape', 'pending')
      RETURNING id
    `);
    const runId = (runRow as unknown as { rows: Array<{ id: string }> }).rows[0].id;

    const app = express();
    app.use(express.json());
    setupFactSheetV2Routes(app);

    const res = await request(app)
      .post("/api/brand-fact-sheet/user-enrich")
      .send({ runId });

    expect(res.status).toBe(200);
    expect(res.body.factCount).toBe(1);

    const factRows = await db.execute(sql`
      SELECT fact_key, fact_value, source FROM brand_fact_sheet WHERE brand_id = ${TEST_BRAND_ID}
    `);
    const facts = (factRows as unknown as { rows: Array<{ fact_key: string; fact_value: string; source: string }> }).rows;
    expect(facts.some((f) => f.fact_key === "description" && f.source === "user")).toBe(true);

    const logRows = await db.execute(sql`
      SELECT source, status FROM fact_scrape_logs WHERE run_id = ${runId}
    `);
    expect(
      (logRows as unknown as { rows: Array<{ source: string; status: string }> }).rows
        .some((l) => l.source === "user_enrich" && l.status === "done"),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run both smoke tests**

Run:
```
npx vitest run tests/integration/v2SearchLlmSmoke.test.ts tests/integration/v2UserEnrichSmoke.test.ts
```

Expected: 2 passed (one per file).

Common fixes if either fails:
- `persistFacts` doesn't accept a `source` parameter → extend it (see Task 6 Step 3 note).
- `brands` table columns differ from the seed → inspect `information_schema.columns` and adjust.
- The `user_enrich` source value isn't in any CHECK constraint on `fact_scrape_logs` — Plan 1's migration 0065 allows it; if not, that's the bug.

- [ ] **Step 4: Final full-Plan-3-suite run**

Run:
```
npx vitest run tests/unit/v2OpenrouterClient.test.ts tests/unit/v2DomainAllowlist.test.ts tests/unit/v2SourceSearch.test.ts tests/unit/v2SearchLlmRoute.test.ts tests/unit/v2SourceUserEnrich.test.ts tests/unit/v2UserEnrichRoute.test.ts tests/integration/v2SearchLlmSmoke.test.ts tests/integration/v2UserEnrichSmoke.test.ts
```

Expected: all green.

- [ ] **Step 5: Type-check**

`npm run check`. Expected: clean.

---

## Done. What Plan 3 produced

- `server/lib/factAgent/v2/openrouterClient.ts`: shared lazy OpenRouter singleton (every non-GPT call routes through this per policy)
- `server/lib/factAgent/v2/domainAllowlist.ts`: brand-confusion guard
- `server/lib/factAgent/v2/sourceSearch.ts`: search-LLM composer with 24h cache + domain validation
- `server/lib/factAgent/v2/sourceUserEnrich.ts`: user-enrich composer with deterministic fallback
- `server/routes/factSheetV2.ts`: two new endpoints (`POST /search-llm`, `POST /user-enrich`) added inline
- 6 new unit test files (~25 tests) + 2 new integration smoke tests

**Endpoints now live:** `/scrape-one`, `/search-llm`, `/user-enrich`. All three sources can be invoked independently by the eventual UI orchestrator (Plan 5).

**Plan 4 next:** `POST /plan` (deterministic URL discovery with tier scoring + sitemap chain), `POST /aggregate` (SERIALIZABLE merge with disagreement tracking + last_verified_at update), and the cron backstop (every 5 min, `pg_try_advisory_xact_lock`, retry cap, dead-man's switch).
