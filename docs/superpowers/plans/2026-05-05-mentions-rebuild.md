# Mentions Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the buggy GEO Tools → Mentions sub-feature with a precise, production-grade brand-mention monitor across Reddit (OAuth), Hacker News, and Quora (best-effort).

**Architecture:** Field-scoped exact-phrase queries → server-side brand-presence gate → batched gpt-4o-mini sentiment with content-hash cache → three-layer dedup (canonical URL + DB unique index + presence gate). Manual scans run via `waitUntil` detachment with client polling every 2s. Cron runs daily for opted-in brands. New routes file owns all `/api/brand-mentions/*`. Frontend extracted into `MentionsTab` + `useMentions` hook.

**Tech Stack:** TypeScript (server: Express + Drizzle + raw `pg.Pool`; client: React 18 + TanStack Query + Wouter + Radix + Tailwind). Tests: Vitest + happy-dom + axe-core. OpenAI SDK for sentiment. No new top-level dependencies; Reddit OAuth implemented with `fetch`.

**Reference:** Spec at `docs/superpowers/specs/2026-05-05-mentions-rebuild-design.md`. Read it before starting.

---

## Phase 0 — Migration & schema

### Task 1: Database migration `0050_mentions_rebuild.sql`

**Files:**
- Create: `migrations/0050_mentions_rebuild.sql`
- Modify: `shared/schema.ts` (brandMentions, brands, plus three new tables)

- [ ] **Step 1.1: Write the migration SQL**

Create `migrations/0050_mentions_rebuild.sql`:

```sql
-- 0050_mentions_rebuild.sql
-- Mentions rebuild: drop conflicting indexes, add new columns,
-- backfill, delete junk + ai:* rows, create new tables, disable RLS.
-- See docs/superpowers/specs/2026-05-05-mentions-rebuild-design.md §3.16.

BEGIN;

-- Pre-delete observability (visible in migration logs).
DO $$
DECLARE ai_count INT; junk_count INT;
BEGIN
  SELECT COUNT(*) INTO ai_count FROM brand_mentions WHERE platform LIKE 'ai:%';
  SELECT COUNT(*) INTO junk_count FROM brand_mentions
    WHERE platform IN ('reddit','hackernews','quora')
      AND (status = 'new' OR status IS NULL);
  RAISE NOTICE '[0050] pre-delete ai_rows=% junk_rows=%', ai_count, junk_count;
END $$;

-- Drop the two conflicting unique indexes (B16 in spec).
DROP INDEX IF EXISTS brand_mentions_dedup_idx;
DROP INDEX IF EXISTS brand_mentions_brand_id_source_url_uniq;

-- Add new columns (idempotent).
ALTER TABLE brand_mentions
  ADD COLUMN IF NOT EXISTS mention_location text DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS link_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamp,
  ADD COLUMN IF NOT EXISTS matched_variation text,
  ADD COLUMN IF NOT EXISTS matched_field text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'scanner',
  ADD COLUMN IF NOT EXISTS scanner_version smallint DEFAULT 2,
  ADD COLUMN IF NOT EXISTS sentiment_source text DEFAULT 'llm',
  ADD COLUMN IF NOT EXISTS engagement_normalized smallint;

-- Mark all pre-existing rows as legacy (scanner_version=1).
UPDATE brand_mentions SET scanner_version = 1
  WHERE created_at < '2026-05-05'::date;

-- Q7: AI-citation rows leave this table entirely.
DELETE FROM brand_mentions WHERE platform LIKE 'ai:%';

-- Q6 + Q17: delete untouched legacy junk; preserve user-curated rows.
DELETE FROM brand_mentions
WHERE platform IN ('reddit','hackernews','quora')
  AND (status = 'new' OR status IS NULL)
  AND scanner_version = 1;

-- Unified unique index for canonical-URL dedup.
CREATE UNIQUE INDEX IF NOT EXISTS brand_mentions_brand_canonical_url_uniq
  ON brand_mentions (brand_id, lower(source_url));

-- Composite filter indexes.
CREATE INDEX IF NOT EXISTS brand_mentions_brand_status_discovered_idx
  ON brand_mentions (brand_id, status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS brand_mentions_brand_sentiment_idx
  ON brand_mentions (brand_id, sentiment, discovered_at DESC);
CREATE INDEX IF NOT EXISTS brand_mentions_brand_platform_idx
  ON brand_mentions (brand_id, platform, discovered_at DESC);

-- App-level scoping only (CLAUDE.md).
ALTER TABLE brand_mentions DISABLE ROW LEVEL SECURITY;

-- Per-brand opt-in for daily auto-scans.
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS monitor_mentions boolean NOT NULL DEFAULT false;

-- New tables.
CREATE TABLE IF NOT EXISTS scan_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger       text NOT NULL,
  status        text NOT NULL DEFAULT 'queued',
  per_source    jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals        jsonb NOT NULL DEFAULT '{}'::jsonb,
  error         text,
  started_at    timestamp,
  completed_at  timestamp,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scan_jobs_brand_status_idx ON scan_jobs (brand_id, status);
CREATE INDEX IF NOT EXISTS scan_jobs_user_active_idx
  ON scan_jobs (user_id, status) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS scan_jobs_completed_at_idx
  ON scan_jobs (completed_at) WHERE status IN ('complete','failed');

CREATE TABLE IF NOT EXISTS source_health (
  brand_id        uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  source          text NOT NULL,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_failure_at timestamp,
  last_failure_reason text,
  paused_until    timestamp,
  last_successful_scan_at timestamp,
  PRIMARY KEY (brand_id, source)
);

CREATE TABLE IF NOT EXISTS sentiment_cache (
  content_hash    text PRIMARY KEY,
  sentiment       text NOT NULL,
  sentiment_score numeric(3, 2) NOT NULL,
  cached_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sentiment_cache_cached_at_idx
  ON sentiment_cache (cached_at);

COMMIT;
```

- [ ] **Step 1.2: Update `shared/schema.ts`**

Add the new columns to `brandMentions`, the new boolean to `brands`, and the three new tables. Open `shared/schema.ts` and:

In `brandMentions` (existing definition), add after the existing columns:
```ts
mentionLocation: text("mention_location").default("post"),
linkStatus: text("link_status").default("unknown"),
lastVerifiedAt: timestamp("last_verified_at"),
matchedVariation: text("matched_variation"),
matchedField: text("matched_field"),
source: text("source").default("scanner"),
scannerVersion: integer("scanner_version").default(2),
sentimentSource: text("sentiment_source").default("llm"),
engagementNormalized: integer("engagement_normalized"),
```

In `brands` (existing definition), add:
```ts
monitorMentions: boolean("monitor_mentions").notNull().default(false),
```

Add three new tables at the bottom (alongside existing definitions):
```ts
export const scanJobs = pgTable("scan_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trigger: text("trigger").notNull(),       // 'manual' | 'cron'
  status: text("status").notNull().default("queued"), // 'queued' | 'running' | 'complete' | 'failed'
  perSource: jsonb("per_source").notNull().default({}),
  totals: jsonb("totals").notNull().default({}),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sourceHealth = pgTable("source_health", {
  brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastFailureAt: timestamp("last_failure_at"),
  lastFailureReason: text("last_failure_reason"),
  pausedUntil: timestamp("paused_until"),
  lastSuccessfulScanAt: timestamp("last_successful_scan_at"),
}, (t) => ({
  pk: primaryKey({ columns: [t.brandId, t.source] }),
}));

export const sentimentCache = pgTable("sentiment_cache", {
  contentHash: text("content_hash").primaryKey(),
  sentiment: text("sentiment").notNull(),
  sentimentScore: decimal("sentiment_score", { precision: 3, scale: 2 }).notNull(),
  cachedAt: timestamp("cached_at").notNull().defaultNow(),
});

export type ScanJob = typeof scanJobs.$inferSelect;
export type InsertScanJob = typeof scanJobs.$inferInsert;
export type SourceHealth = typeof sourceHealth.$inferSelect;
export type InsertSourceHealth = typeof sourceHealth.$inferInsert;
export type SentimentCache = typeof sentimentCache.$inferSelect;
```

Also export the existing helper if `primaryKey` isn't already imported from `drizzle-orm/pg-core`.

- [ ] **Step 1.3: Apply the migration locally**

Run: `npm run dev` (the boot-time auto-applier in `server/index.ts:181-236` runs it).
Expected log: `[0050] pre-delete ai_rows=N junk_rows=M` then "migration 0050 applied".

- [ ] **Step 1.4: Verify schema**

Run via Drizzle Studio or psql:
```sql
\d brand_mentions
\d scan_jobs
\d source_health
\d sentiment_cache
SELECT COUNT(*) FROM brand_mentions WHERE platform LIKE 'ai:%'; -- expect 0
SELECT COUNT(*) FROM brand_mentions WHERE scanner_version = 1;
```

- [ ] **Step 1.5: typecheck + lint + commit**

```
npm run check
npm run lint
git add migrations/0050_mentions_rebuild.sql shared/schema.ts
git commit -m "feat(mentions): migration 0050 — schema rebuild"
```

---

## Phase 1 — Pure helper modules (no I/O)

These have no DB or HTTP dependencies, so we TDD them first.

### Task 2: Canonical URL normalizer

**Files:**
- Create: `server/lib/canonicalUrl.ts`
- Test: `tests/unit/canonicalUrl.test.ts`

- [ ] **Step 2.1: Write failing tests**

`tests/unit/canonicalUrl.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { canonicalizeMentionUrl } from "../../server/lib/canonicalUrl";

describe("canonicalizeMentionUrl", () => {
  it("Reddit post: strips query + trailing slash", () => {
    expect(canonicalizeMentionUrl(
      "reddit",
      "https://reddit.com/r/saas/comments/abc123/some_title/?context=3"
    )).toBe("https://reddit.com/r/saas/comments/abc123");
  });

  it("Reddit comment: keeps comment id segment", () => {
    expect(canonicalizeMentionUrl(
      "reddit",
      "https://reddit.com/r/saas/comments/abc123/title/cmt456/"
    )).toBe("https://reddit.com/r/saas/comments/abc123/cmt456");
  });

  it("HN: PRESERVES the ?id= query (regression for audit A15)", () => {
    expect(canonicalizeMentionUrl(
      "hackernews",
      "https://news.ycombinator.com/item?id=12345&p=2"
    )).toBe("https://news.ycombinator.com/item?id=12345");
  });

  it("HN: distinct ids stay distinct", () => {
    const a = canonicalizeMentionUrl("hackernews", "https://news.ycombinator.com/item?id=1");
    const b = canonicalizeMentionUrl("hackernews", "https://news.ycombinator.com/item?id=2");
    expect(a).not.toBe(b);
  });

  it("Quora: lowercase slug, strip query, drop trailing slash", () => {
    expect(canonicalizeMentionUrl(
      "quora",
      "https://www.quora.com/Some-Question-Title/?share=1"
    )).toBe("https://www.quora.com/some-question-title");
  });

  it("returns input unchanged when URL is malformed", () => {
    expect(canonicalizeMentionUrl("reddit", "not a url")).toBe("not a url");
  });
});
```

- [ ] **Step 2.2: Run — expect FAIL** (`npx vitest run tests/unit/canonicalUrl.test.ts`)

- [ ] **Step 2.3: Implement**

`server/lib/canonicalUrl.ts`:
```ts
export type MentionPlatform = "reddit" | "hackernews" | "quora";

export function canonicalizeMentionUrl(platform: MentionPlatform, raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }

  if (platform === "reddit") {
    // Path forms:
    //   /r/<sub>/comments/<postId>/<slug>/        → /r/<sub>/comments/<postId>
    //   /r/<sub>/comments/<postId>/<slug>/<cmt>/  → /r/<sub>/comments/<postId>/<cmt>
    const segs = u.pathname.split("/").filter(Boolean);
    const cIdx = segs.indexOf("comments");
    if (cIdx >= 0 && segs.length >= cIdx + 2) {
      const postId = segs[cIdx + 1];
      const cmt = segs[cIdx + 3]; // slug at +2, comment id at +3
      const sub = segs.slice(0, cIdx).join("/");
      const tail = cmt ? `${postId}/${cmt}` : postId;
      return `https://reddit.com/${sub}/comments/${tail}`;
    }
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  }

  if (platform === "hackernews") {
    const id = u.searchParams.get("id");
    if (!id) return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}?id=${id}`;
  }

  if (platform === "quora") {
    return `${u.origin}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  }

  return raw;
}
```

- [ ] **Step 2.4: Run — expect PASS**, **Step 2.5: lint + commit**
```
npm run lint
git add server/lib/canonicalUrl.ts tests/unit/canonicalUrl.test.ts
git commit -m "feat(mentions): canonical URL normalizer"
```

---

### Task 3: Brand-presence gate

**Files:**
- Create: `server/lib/brandPresenceGate.ts`
- Test: `tests/unit/brandPresenceGate.test.ts`

- [ ] **Step 3.1: Write failing tests**

`tests/unit/brandPresenceGate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { passesBrandPresenceGate } from "../../server/lib/brandPresenceGate";

const variations = ["Linear", "linear app", "linear.app"];

describe("passesBrandPresenceGate", () => {
  it("matches in title (case-insensitive)", () => {
    const r = passesBrandPresenceGate({ title: "Why we switched to LINEAR", selftext: "" }, variations);
    expect(r.matched).toBe(true);
    expect(r.matchedVariation).toBe("Linear");
    expect(r.matchedField).toBe("title");
  });

  it("matches a multi-word variation in selftext", () => {
    const r = passesBrandPresenceGate({ title: "", selftext: "We use linear app daily" }, variations);
    expect(r).toEqual({ matched: true, matchedVariation: "linear app", matchedField: "selftext" });
  });

  it("does not match unrelated text (audit A1 regression)", () => {
    const r = passesBrandPresenceGate({ title: "Apollo space program", selftext: "" }, ["Apollo"]);
    expect(r.matched).toBe(true); // Apollo IS present — gate is a literal includes
    const r2 = passesBrandPresenceGate({ title: "rocket history", selftext: "" }, ["Apollo"]);
    expect(r2.matched).toBe(false);
  });

  it("returns first match across fields in declared order", () => {
    const r = passesBrandPresenceGate({ title: "Linear", selftext: "Linear" }, variations);
    expect(r.matchedField).toBe("title");
  });

  it("rejects empty haystacks", () => {
    expect(passesBrandPresenceGate({ title: "", selftext: "" }, variations).matched).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run — expect FAIL**

- [ ] **Step 3.3: Implement**

`server/lib/brandPresenceGate.ts`:
```ts
export type GateInput = {
  title?: string | null;
  selftext?: string | null;
  body?: string | null;
  comment?: string | null;
};

export type GateResult =
  | { matched: false }
  | { matched: true; matchedVariation: string; matchedField: "title" | "selftext" | "body" | "comment" };

export function passesBrandPresenceGate(text: GateInput, variations: string[]): GateResult {
  const fields: Array<{ field: GateResult extends { matchedField: infer F } ? F : never; text: string }> = [
    { field: "title" as const,    text: (text.title    ?? "").toLowerCase() },
    { field: "selftext" as const, text: (text.selftext ?? "").toLowerCase() },
    { field: "body" as const,     text: (text.body     ?? "").toLowerCase() },
    { field: "comment" as const,  text: (text.comment  ?? "").toLowerCase() },
  ];
  for (const v of variations) {
    if (!v) continue;
    const needle = v.toLowerCase();
    for (const f of fields) {
      if (f.text.length > 0 && f.text.includes(needle)) {
        return { matched: true, matchedVariation: v, matchedField: f.field };
      }
    }
  }
  return { matched: false };
}
```

- [ ] **Step 3.4: Run — expect PASS**, **3.5: commit**
```
git add server/lib/brandPresenceGate.ts tests/unit/brandPresenceGate.test.ts
git commit -m "feat(mentions): brand-presence gate"
```

---

### Task 4: Engagement normalization

**Files:**
- Create: `server/lib/engagementScore.ts`
- Test: `tests/unit/engagementScore.test.ts`

- [ ] **Step 4.1: Write failing tests**

`tests/unit/engagementScore.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeEngagement } from "../../server/lib/engagementScore";

describe("normalizeEngagement", () => {
  it("Reddit: zero engagement = 0", () => {
    expect(normalizeEngagement("reddit", { ups: 0, comments: 0 })).toBe(0);
  });
  it("Reddit: log-scaled", () => {
    const small = normalizeEngagement("reddit", { ups: 10, comments: 2 });
    const big = normalizeEngagement("reddit", { ups: 10000, comments: 200 });
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(100);
  });
  it("HN: zero = 0", () => {
    expect(normalizeEngagement("hackernews", { points: 0, comments: 0 })).toBe(0);
  });
  it("HN: caps at 100", () => {
    expect(normalizeEngagement("hackernews", { points: 1_000_000, comments: 1_000_000 })).toBe(100);
  });
  it("Quora: returns null (not available)", () => {
    expect(normalizeEngagement("quora", {})).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run — expect FAIL**

- [ ] **Step 4.3: Implement**

`server/lib/engagementScore.ts`:
```ts
import type { MentionPlatform } from "./canonicalUrl";

type RedditInputs = { ups: number; comments: number };
type HNInputs = { points: number; comments: number };

export function normalizeEngagement(platform: MentionPlatform, raw: RedditInputs | HNInputs | object): number | null {
  if (platform === "reddit") {
    const { ups = 0, comments = 0 } = raw as RedditInputs;
    const score = Math.log10(Math.max(0, ups) + Math.max(0, comments) * 2 + 1) * 25;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  if (platform === "hackernews") {
    const { points = 0, comments = 0 } = raw as HNInputs;
    const score = Math.log10(Math.max(0, points) + Math.max(0, comments) + 1) * 30;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  return null; // Quora has no engagement data we can read
}
```

- [ ] **Step 4.4: Run — expect PASS**, **4.5: commit**
```
git add server/lib/engagementScore.ts tests/unit/engagementScore.test.ts
git commit -m "feat(mentions): per-platform engagement normalization"
```

---

### Task 5: Auto-built query construction

**Files:**
- Create: `server/lib/mentionQueryBuilder.ts`
- Test: `tests/unit/mentionQueryBuilder.test.ts`

- [ ] **Step 5.1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { buildScanQueries } from "../../server/lib/mentionQueryBuilder";

const brand = { name: "Linear", nameVariations: ["linear app", "linear.app"] };

describe("buildScanQueries", () => {
  it("Reddit: field-scoped exact-phrase per variation", () => {
    const q = buildScanQueries(brand).reddit;
    expect(q).toBe(`(title:"Linear" OR selftext:"Linear" OR title:"linear app" OR selftext:"linear app" OR title:"linear.app" OR selftext:"linear.app")`);
  });
  it("HN: space-separated quoted phrases", () => {
    expect(buildScanQueries(brand).hackernews).toBe(`"Linear" "linear app" "linear.app"`);
  });
  it("Quora: OR-joined quoted phrases", () => {
    expect(buildScanQueries(brand).quora).toBe(`"Linear" OR "linear app" OR "linear.app"`);
  });
  it("dedupes case-variant variations", () => {
    const q = buildScanQueries({ name: "Linear", nameVariations: ["LINEAR", "Linear"] });
    expect(q.reddit).toBe(`(title:"Linear" OR selftext:"Linear")`);
  });
  it("empty variations + valid name = name only", () => {
    const q = buildScanQueries({ name: "Linear", nameVariations: [] });
    expect(q.reddit).toBe(`(title:"Linear" OR selftext:"Linear")`);
  });
  it("returns null for each source when no usable name", () => {
    const q = buildScanQueries({ name: "", nameVariations: [] });
    expect(q).toEqual({ reddit: null, hackernews: null, quora: null, variations: [] });
  });
});
```

- [ ] **Step 5.2: Run — expect FAIL**

- [ ] **Step 5.3: Implement**

`server/lib/mentionQueryBuilder.ts`:
```ts
export type BrandQueryInput = {
  name: string | null | undefined;
  nameVariations: string[] | null | undefined;
};

export type ScanQueries = {
  reddit: string | null;
  hackernews: string | null;
  quora: string | null;
  variations: string[];
};

export function collectVariations(brand: BrandQueryInput): string[] {
  const all = [brand.name, ...(Array.isArray(brand.nameVariations) ? brand.nameVariations : [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of all) {
    if (typeof raw !== "string") continue;
    const v = raw.trim();
    if (v.length < 2) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function buildScanQueries(brand: BrandQueryInput): ScanQueries {
  const variations = collectVariations(brand);
  if (variations.length === 0) {
    return { reddit: null, hackernews: null, quora: null, variations: [] };
  }
  const reddit = `(${variations.map((v) => `title:"${v}" OR selftext:"${v}"`).join(" OR ")})`;
  const hackernews = variations.map((v) => `"${v}"`).join(" ");
  const quora = variations.map((v) => `"${v}"`).join(" OR ");
  return { reddit, hackernews, quora, variations };
}
```

- [ ] **Step 5.4: Run — expect PASS**, **5.5: commit**
```
git add server/lib/mentionQueryBuilder.ts tests/unit/mentionQueryBuilder.test.ts
git commit -m "feat(mentions): auto query builder"
```

---

## Phase 2 — Reddit OAuth client

### Task 6: Reddit OAuth token manager

**Files:**
- Create: `server/lib/redditOAuth.ts`
- Test: `tests/unit/redditOAuth.test.ts`
- Modify: `server/env.ts` (add 4 new env vars)

- [ ] **Step 6.1: Add env vars**

In `server/env.ts`, add to the Zod schema:
```ts
REDDIT_CLIENT_ID: z.string().min(1).optional(),
REDDIT_CLIENT_SECRET: z.string().min(1).optional(),
REDDIT_USERNAME: z.string().min(1).optional(),
REDDIT_PASSWORD: z.string().min(1).optional(),
```
Add to `.env.example` with empty values + a comment "Create a Reddit script app at https://www.reddit.com/prefs/apps; required for the Mentions feature".

- [ ] **Step 6.2: Write failing tests**

`tests/unit/redditOAuth.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getRedditAccessToken, _resetRedditTokenCacheForTests } from "../../server/lib/redditOAuth";

describe("getRedditAccessToken", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    _resetRedditTokenCacheForTests();
    process.env.REDDIT_CLIENT_ID = "id";
    process.env.REDDIT_CLIENT_SECRET = "secret";
    process.env.REDDIT_USERNAME = "u";
    process.env.REDDIT_PASSWORD = "p";
  });

  it("requests token then returns cached value within TTL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "tok-1", expires_in: 3600, token_type: "bearer" }),
    });
    const a = await getRedditAccessToken();
    const b = await getRedditAccessToken();
    expect(a).toBe("tok-1");
    expect(b).toBe("tok-1");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes after TTL expiry", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "tok-1", expires_in: 1, token_type: "bearer" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "tok-2", expires_in: 3600, token_type: "bearer" }) });
    expect(await getRedditAccessToken()).toBe("tok-1");
    await new Promise((r) => setTimeout(r, 1100));
    expect(await getRedditAccessToken()).toBe("tok-2");
  });

  it("throws when env not configured", async () => {
    delete process.env.REDDIT_CLIENT_ID;
    await expect(getRedditAccessToken()).rejects.toThrow(/REDDIT_CLIENT_ID/);
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "unauthorized" });
    await expect(getRedditAccessToken()).rejects.toThrow(/reddit oauth.*401/i);
  });
});
```

- [ ] **Step 6.3: Run — expect FAIL**

- [ ] **Step 6.4: Implement**

`server/lib/redditOAuth.ts`:
```ts
import { logger } from "./logger";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
export const REDDIT_USER_AGENT =
  `web:io.litlabs.venturecite:v1.0 (by /u/${process.env.REDDIT_USERNAME ?? "unknown"})`;

let cached: { token: string; expiresAt: number } | null = null;

export function _resetRedditTokenCacheForTests() { cached = null; }

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured. Create a Reddit script app and set env vars.`);
  return v;
}

export async function getRedditAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 30_000) return cached.token;

  const id = requireEnv("REDDIT_CLIENT_ID");
  const secret = requireEnv("REDDIT_CLIENT_SECRET");
  const username = requireEnv("REDDIT_USERNAME");
  const password = requireEnv("REDDIT_PASSWORD");

  const body = new URLSearchParams({ grant_type: "password", username, password });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_USER_AGENT,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`reddit oauth ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: now + Math.max(60, json.expires_in - 60) * 1000 };
  logger.info({ expiresIn: json.expires_in }, "reddit.oauth.token_refreshed");
  return cached.token;
}

export async function redditFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getRedditAccessToken();
  return fetch(`https://oauth.reddit.com${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "User-Agent": REDDIT_USER_AGENT,
    },
  });
}
```

- [ ] **Step 6.5: Run — expect PASS**, **6.6: commit**
```
git add server/lib/redditOAuth.ts tests/unit/redditOAuth.test.ts server/env.ts .env.example
git commit -m "feat(mentions): reddit OAuth token manager"
```

---

## Phase 3 — Source-health, scan-job, sentiment-cache storage

### Task 7: Storage methods

**Files:**
- Modify: `server/storage.ts` (add interface methods)
- Modify: `server/databaseStorage.ts` (implement)
- Test: `tests/unit/mentionsStorage.test.ts`

- [ ] **Step 7.1: Extend `IStorage` in `server/storage.ts`**

Add to the interface:
```ts
// Scan jobs
createScanJob(input: { brandId: string; userId: string; trigger: "manual" | "cron" }): Promise<ScanJob>;
getScanJob(id: string): Promise<ScanJob | undefined>;
getActiveScanJobForBrand(brandId: string): Promise<ScanJob | undefined>;
getActiveScanJobsForUser(userId: string): Promise<ScanJob[]>;
updateScanJob(id: string, patch: Partial<{ status: string; perSource: any; totals: any; startedAt: Date; completedAt: Date; error: string }>): Promise<void>;
pruneOldScanJobs(beforeDays: number): Promise<number>;
getMostRecentManualScanForBrand(brandId: string): Promise<ScanJob | undefined>;

// Source health
getSourceHealth(brandId: string, source: string): Promise<SourceHealth | undefined>;
upsertSourceHealth(input: InsertSourceHealth): Promise<void>;

// Sentiment cache
getCachedSentiment(contentHash: string): Promise<SentimentCache | undefined>;
upsertCachedSentiment(input: { contentHash: string; sentiment: string; sentimentScore: string }): Promise<void>;
pruneOldSentimentCache(beforeDays: number): Promise<number>;

// Brand
setBrandMonitorMentions(brandId: string, enabled: boolean): Promise<void>;
listBrandsWithMentionMonitoring(): Promise<{ id: string; userId: string }[]>;
```

- [ ] **Step 7.2: Write failing tests** that exercise each method against `mockDatabaseStorage` or a real test pool. Mirror the patterns in `tests/unit/chatbotThreads.test.ts` (uses real Drizzle calls with a setup/teardown).

(The agent should look at `tests/unit/chatbotThreads.test.ts` for the established pattern for storage-method tests in this repo.)

- [ ] **Step 7.3: Implement in `server/databaseStorage.ts`**

For each method, write the Drizzle-based implementation. Patterns to use (search the file for live examples):
- `db.insert(scanJobs).values(...).returning()` for create.
- `db.select().from(scanJobs).where(eq(scanJobs.id, id)).limit(1)` for getById.
- `db.update(scanJobs).set({...}).where(eq(scanJobs.id, id))` for update.
- `db.execute(sql\`...\`)` for the DELETE-with-COUNT prune queries.
- For `upsertSourceHealth`: `INSERT ... ON CONFLICT (brand_id, source) DO UPDATE SET ...` — use `sql` template since Drizzle's `onConflictDoUpdate` requires the conflict target.
- `getActiveScanJobForBrand`: `WHERE brand_id = $1 AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1`.
- `listBrandsWithMentionMonitoring`: `SELECT id, user_id FROM brands WHERE monitor_mentions = true`.

- [ ] **Step 7.4: Add storage method to also delete one mention by id with ownership scope**

Required by the new routes. If `deleteBrandMention(id)` doesn't exist with the right semantics, add it:
```ts
async deleteBrandMention(id: string): Promise<void> {
  await db.delete(brandMentions).where(eq(brandMentions.id, id));
}
async getBrandMention(id: string): Promise<BrandMention | undefined> {
  const rows = await db.select().from(brandMentions).where(eq(brandMentions.id, id)).limit(1);
  return rows[0];
}
```

- [ ] **Step 7.5: Update `getBrandMentions` in databaseStorage.ts** to support cursor + filters

Find the existing method. Replace its body to accept a filter object:
```ts
async listMentionsForBrand(brandId: string, opts: {
  cursor?: { discoveredAt: Date; id: string };
  limit?: number;
  status?: string;
  platform?: string;
  sentiment?: string;
  from?: Date;
  to?: Date;
  q?: string;
  sort?: "newest" | "oldest" | "engagement";
}): Promise<{ rows: BrandMention[]; nextCursor: { discoveredAt: Date; id: string } | null; }>
```

The cursor is `(discoveredAt, id)` tuple keyset pagination: `WHERE (discovered_at, id) < (cursor.discoveredAt, cursor.id)` (sort=newest). For `engagement` sort use `(engagement_normalized DESC NULLS LAST, id)`. Free-text search uses `ILIKE %q%` against `source_title || mention_context`. Add the corresponding interface entry too.

- [ ] **Step 7.6: Run tests, lint, commit**

```
npx vitest run tests/unit/mentionsStorage.test.ts
npm run lint
git add server/storage.ts server/databaseStorage.ts tests/unit/mentionsStorage.test.ts
git commit -m "feat(mentions): storage methods for scan_jobs, source_health, sentiment_cache, paginated list"
```

---

## Phase 4 — Sentiment batcher

### Task 8: Sentiment batcher with cache + cap

**Files:**
- Create: `server/lib/sentimentBatcher.ts`
- Test: `tests/unit/sentimentBatcher.test.ts`

- [ ] **Step 8.1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const storageMock = {
  getCachedSentiment: vi.fn(),
  upsertCachedSentiment: vi.fn(),
};
const openaiMock = { chat: { completions: { create: vi.fn() } } };

vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("openai", () => ({ default: vi.fn().mockImplementation(() => openaiMock) }));

import { judgeSentimentBatch } from "../../server/lib/sentimentBatcher";

describe("judgeSentimentBatch", () => {
  beforeEach(() => {
    storageMock.getCachedSentiment.mockReset();
    storageMock.upsertCachedSentiment.mockReset();
    openaiMock.chat.completions.create.mockReset();
  });

  it("returns cached sentiment without calling OpenAI", async () => {
    storageMock.getCachedSentiment.mockResolvedValue({ sentiment: "positive", sentimentScore: "0.80" });
    const out = await judgeSentimentBatch("Linear", [{ key: "k1", text: "I love Linear" }]);
    expect(out["k1"]).toEqual({ sentiment: "positive", sentimentScore: 0.8, source: "llm" });
    expect(openaiMock.chat.completions.create).not.toHaveBeenCalled();
  });

  it("batches uncached entries 10/call", async () => {
    storageMock.getCachedSentiment.mockResolvedValue(undefined);
    openaiMock.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ verdicts: Array.from({length: 10}, (_,i)=>({key:`k${i}`, sentiment:"neutral", sentimentScore:0})) }) } }],
    });
    const inputs = Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, text: `text ${i}` }));
    await judgeSentimentBatch("Linear", inputs);
    expect(openaiMock.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it("returns neutral fallback on OpenAI error", async () => {
    storageMock.getCachedSentiment.mockResolvedValue(undefined);
    openaiMock.chat.completions.create.mockRejectedValue(new Error("boom"));
    const out = await judgeSentimentBatch("Linear", [{ key: "k1", text: "hi" }]);
    expect(out["k1"]).toEqual({ sentiment: "neutral", sentimentScore: 0, source: "fallback" });
  });

  it("respects daily cap — over-cap entries get source 'capped'", async () => {
    storageMock.getCachedSentiment.mockResolvedValue(undefined);
    const inputs = Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, text: `t${i}` }));
    // remaining=2 means only 2 of 5 should go to OpenAI
    openaiMock.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ verdicts: [{key:"k0", sentiment:"neutral", sentimentScore:0},{key:"k1", sentiment:"neutral", sentimentScore:0}] }) } }],
    });
    const out = await judgeSentimentBatch("Linear", inputs, { remainingBudget: 2 });
    expect(out["k0"].source).toBe("llm");
    expect(out["k1"].source).toBe("llm");
    expect(out["k2"].source).toBe("capped");
    expect(out["k3"].source).toBe("capped");
    expect(out["k4"].source).toBe("capped");
  });
});
```

- [ ] **Step 8.2: Run — expect FAIL**

- [ ] **Step 8.3: Implement**

`server/lib/sentimentBatcher.ts`:
```ts
import OpenAI from "openai";
import { createHash } from "crypto";
import { storage } from "../storage";
import { MODELS } from "./modelConfig";
import { attachAiLogger } from "./aiLogger";
import { logger } from "./logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
attachAiLogger(openai);

export type SentimentInput = { key: string; text: string };
export type SentimentOutput = { sentiment: "positive" | "neutral" | "negative"; sentimentScore: number; source: "llm" | "fallback" | "capped" };

const BATCH_SIZE = 10;

export function contentHash(brandName: string, text: string): string {
  return createHash("sha256").update(`${brandName}::${text}`).digest("hex");
}

export async function judgeSentimentBatch(
  brandName: string,
  inputs: SentimentInput[],
  opts: { remainingBudget?: number } = {},
): Promise<Record<string, SentimentOutput>> {
  const out: Record<string, SentimentOutput> = {};
  const cacheKeyByInputKey = new Map<string, string>();

  // 1. Look up cache for everyone.
  const uncached: SentimentInput[] = [];
  for (const inp of inputs) {
    const h = contentHash(brandName, inp.text);
    cacheKeyByInputKey.set(inp.key, h);
    const hit = await storage.getCachedSentiment(h);
    if (hit) {
      out[inp.key] = { sentiment: hit.sentiment as SentimentOutput["sentiment"], sentimentScore: Number(hit.sentimentScore), source: "llm" };
    } else {
      uncached.push(inp);
    }
  }

  // 2. Apply budget. The first `remainingBudget` uncached entries get LLM; rest get 'capped'.
  let budget = opts.remainingBudget ?? Number.POSITIVE_INFINITY;
  const llmTargets: SentimentInput[] = [];
  for (const inp of uncached) {
    if (budget > 0) {
      llmTargets.push(inp);
      budget -= 1;
    } else {
      out[inp.key] = { sentiment: "neutral", sentimentScore: 0, source: "capped" };
    }
  }

  // 3. Call OpenAI in batches of 10.
  for (let i = 0; i < llmTargets.length; i += BATCH_SIZE) {
    const batch = llmTargets.slice(i, i + BATCH_SIZE);
    try {
      const completion = await openai.chat.completions.create({
        model: MODELS.misc,
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: `You are a sentiment analyst. For each entry, decide how it talks about the brand specifically. Return JSON: {"verdicts":[{"key":"...","sentiment":"positive"|"neutral"|"negative","sentimentScore":-1..1}]}.`,
          },
          {
            role: "user",
            content: `Brand: ${brandName}\n\nEntries:\n${batch.map((b) => `- key=${b.key}\n  text: """${b.text.slice(0, 2000)}"""`).join("\n")}`,
          },
        ],
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { verdicts?: Array<{ key: string; sentiment: string; sentimentScore: number }> };
      const verdictsByKey = new Map((parsed.verdicts ?? []).map((v) => [v.key, v]));
      for (const inp of batch) {
        const v = verdictsByKey.get(inp.key);
        if (!v) {
          out[inp.key] = { sentiment: "neutral", sentimentScore: 0, source: "fallback" };
          continue;
        }
        const sentiment = (["positive", "neutral", "negative"] as const).includes(v.sentiment as any) ? (v.sentiment as SentimentOutput["sentiment"]) : "neutral";
        const score = Math.max(-1, Math.min(1, Number(v.sentimentScore) || 0));
        out[inp.key] = { sentiment, sentimentScore: Number(score.toFixed(2)), source: "llm" };
        await storage.upsertCachedSentiment({ contentHash: cacheKeyByInputKey.get(inp.key)!, sentiment, sentimentScore: score.toFixed(2) });
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "sentiment.batch.fallback");
      for (const inp of batch) {
        out[inp.key] = { sentiment: "neutral", sentimentScore: 0, source: "fallback" };
      }
    }
  }

  return out;
}
```

- [ ] **Step 8.4: Run — expect PASS**, **8.5: commit**
```
git add server/lib/sentimentBatcher.ts tests/unit/sentimentBatcher.test.ts
git commit -m "feat(mentions): batched sentiment with content-hash cache + cap"
```

---

## Phase 5 — Source health gate + per-source scanners

### Task 9: Source health gate helper

**Files:**
- Create: `server/lib/sourceHealth.ts`
- Test: `tests/unit/sourceHealth.test.ts`

- [ ] **Step 9.1-9.5: TDD pattern**

Implement and test:
```ts
export type HealthDecision = { skip: boolean; reason?: string };

export async function shouldSkipSource(brandId: string, source: string, now = new Date()): Promise<HealthDecision>;
export async function recordSourceSuccess(brandId: string, source: string): Promise<void>;
export async function recordSourceFailure(brandId: string, source: string, reason: string, now = new Date()): Promise<void>;
```

Logic:
- `shouldSkipSource`: read `source_health`; if `paused_until > now`, skip with `paused_until` reason.
- `recordSourceSuccess`: upsert with `consecutive_failures=0`, `last_successful_scan_at=now`, `paused_until=null`.
- `recordSourceFailure`: increment `consecutive_failures`; if >=3, set `paused_until = now + 24h`.

Tests cover: fresh brand (no health row → don't skip), paused state, success resets counter, 3rd failure triggers pause.

Commit: `feat(mentions): source health backoff`

---

### Task 10: Reddit source scanner (with comment-tree expansion)

**Files:**
- Create: `server/lib/sources/redditSource.ts`
- Test: `tests/unit/redditSource.test.ts`

- [ ] **Step 10.1-10.5: TDD pattern**

Public API:
```ts
export type RedditScanInput = {
  query: string;
  variations: string[];
  sinceUnix?: number;        // null/undefined on first scan; uses t=year, no after filter
};
export type RedditMention = {
  platform: "reddit";
  sourceUrl: string;          // canonical
  sourceTitle: string;
  mentionContext: string;
  authorUsername?: string;
  mentionedAt?: Date;
  mentionLocation: "post" | "comment";
  matchedVariation: string;
  matchedField: "title" | "selftext" | "body" | "comment";
  engagementInputs: { ups: number; comments: number };
};

export async function scanRedditSource(input: RedditScanInput): Promise<{ mentions: RedditMention[]; failed?: string }>;
```

Implementation:
1. `redditFetch('/search?...')` with `q=<query>`, `sort=new`, `t=year` (first scan) or `t=week` (subsequent), `limit=25`, `restrict_sr=false`.
2. For each `t3` post: run `passesBrandPresenceGate({ title, selftext })`. If pass, push as `mentionLocation: "post"` with canonical URL.
3. For each `t3` post that DID NOT pass (or did, doesn't matter): fetch the comment tree via `redditFetch(`${permalink}.json?limit=50&depth=2`)`. For each comment body, run gate against `{ comment: body }`. On match, push as `mentionLocation: "comment"` with canonical URL using `${postCanonical}/${commentId}`.
4. NSFW skip: `over_18`, `removed_by_category`, `author === "[deleted]"` → exclude.
5. Token-bucket via existing `acquireOrWait("reddit", ...)`.
6. Catch + return `{ mentions: [], failed: errorMessage }` on failure.

Tests use a fixture-driven approach:
- `tests/fixtures/reddit-search.json` — minimal response with 3 posts (one matches, one doesn't, one NSFW).
- `tests/fixtures/reddit-comments.json` — comment tree with one comment that matches.
- Mock `fetch` to return these.
- Assert: 1 post mention + 1 comment mention; NSFW excluded; canonical URL correct; matched fields recorded.

Commit: `feat(mentions): reddit source scanner with OAuth + comment-tree`

---

### Task 11: Hacker News source scanner

**Files:**
- Create: `server/lib/sources/hackerNewsSource.ts`
- Test: `tests/unit/hackerNewsSource.test.ts`
- Fixture: `tests/fixtures/hn-search.json`

- [ ] **Step 11.1-11.5: TDD pattern**

```ts
export type HNScanInput = { query: string; variations: string[]; sinceUnix?: number };
export type HNMention = { /* same shape as RedditMention but platform: "hackernews" */ };
export async function scanHackerNewsSource(input: HNScanInput): Promise<{ mentions: HNMention[]; failed?: string }>;
```

Implementation:
1. `https://hn.algolia.com/api/v1/search?query=${q}&tags=story,comment&hitsPerPage=25` with `numericFilters=created_at_i>${sinceUnix}` when subsequent.
2. Run gate against `{ title, selftext: story_text, comment: comment_text }` per hit.
3. Canonical URL: `https://news.ycombinator.com/item?id=${objectID}` (preserves `?id=` — the audit's A15 regression).
4. `mentionLocation`: `"comment"` if hit had `comment_text`, else `"post"`.
5. Engagement: `{ points, comments: num_comments }`.

Tests: fixture-driven. Critical regression test — two distinct HN hits with different `objectID` produce **distinct** canonical URLs (caught by Task 2's tests but worth re-asserting at the source level).

Commit: `feat(mentions): hackernews source scanner`

---

### Task 12: Quora source scanner (best-effort)

**Files:**
- Create: `server/lib/sources/quoraSource.ts`
- Test: `tests/unit/quoraSource.test.ts`
- Fixture: `tests/fixtures/quora-search.html`

- [ ] **Step 12.1-12.5: TDD pattern**

```ts
export async function scanQuoraSource(input: QuoraScanInput): Promise<{ mentions: QuoraMention[]; failed?: string }>;
```

Implementation:
1. `safeFetchText('https://www.quora.com/search?q=${q}', { timeoutMs: 15_000, maxBytes: 2_000_000 })`.
2. Anchor regex extracts question slugs `^/[^/]+(-[^/]+)+$` (avoiding `/topic/`, `/profile/`).
3. **Brand-presence gate runs against the link TEXT** (not the broader HTML — the text is what shows in results). If no match, skip.
4. Document UI honestly that "Quora results may be limited" because the SPA returns minimal static HTML.
5. Engagement: not available — `engagementInputs: undefined`.
6. Failure handling: if `status >= 400` or zero results, return `{ mentions: [], failed: "quora returned no results — likely blocked or empty" }` (the failure flag is shown only when status is non-2xx; zero results from a 200 is not a failure).

Tests: fixture-driven HTML with 5 anchors (3 match, 1 is `/topic/`, 1 has no brand text). Expect 3 mentions.

Commit: `feat(mentions): quora source scanner (best-effort)`

---

## Phase 6 — Scanner orchestrator + scan runner

### Task 13: New scanner orchestrator (replaces `mentionScanner.ts`)

**Files:**
- Modify: `server/lib/mentionScanner.ts` (full rewrite)
- Test: `tests/unit/mentionScanner.test.ts`

- [ ] **Step 13.1: Write failing top-level test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/lib/sources/redditSource", () => ({ scanRedditSource: vi.fn() }));
vi.mock("../../server/lib/sources/hackerNewsSource", () => ({ scanHackerNewsSource: vi.fn() }));
vi.mock("../../server/lib/sources/quoraSource", () => ({ scanQuoraSource: vi.fn() }));
vi.mock("../../server/lib/sentimentBatcher", () => ({ judgeSentimentBatch: vi.fn() }));
vi.mock("../../server/storage", () => ({ storage: { /* methods used by scanner */ } }));

// Tests: full orchestration
//  1. Calls each source with built queries.
//  2. Skips sources that shouldSkipSource() says are paused.
//  3. Aggregates rows, runs sentiment batch, inserts via tryInsertBrandMention.
//  4. Records source health success/failure.
//  5. Returns a per-source + totals report.
```

- [ ] **Step 13.2: Run — expect FAIL**

- [ ] **Step 13.3: Implement**

Replace `server/lib/mentionScanner.ts` content:
```ts
import { storage } from "../storage";
import { logger } from "./logger";
import { captureAndFlush } from "./sentryReport";
import { buildScanQueries } from "./mentionQueryBuilder";
import { canonicalizeMentionUrl, type MentionPlatform } from "./canonicalUrl";
import { normalizeEngagement } from "./engagementScore";
import { judgeSentimentBatch, type SentimentInput } from "./sentimentBatcher";
import { shouldSkipSource, recordSourceSuccess, recordSourceFailure } from "./sourceHealth";
import { scanRedditSource } from "./sources/redditSource";
import { scanHackerNewsSource } from "./sources/hackerNewsSource";
import { scanQuoraSource } from "./sources/quoraSource";

const DAILY_SENTIMENT_CAP = 200;

export type SourceReport = { found: number; inserted: number; duplicates: number; failed: boolean; reason?: string };
export type ScanReport = {
  perSource: { reddit: SourceReport; hackernews: SourceReport; quora: SourceReport };
  totals: { found: number; inserted: number; duplicates: number; failedSources: number };
};

export async function scanBrandMentions(brandId: string, scanId?: string): Promise<ScanReport> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("brand_not_found");
  const queries = buildScanQueries({ name: brand.name, nameVariations: brand.nameVariations as string[] | null });
  const variations = queries.variations;

  const report: ScanReport = {
    perSource: {
      reddit: { found: 0, inserted: 0, duplicates: 0, failed: false },
      hackernews: { found: 0, inserted: 0, duplicates: 0, failed: false },
      quora: { found: 0, inserted: 0, duplicates: 0, failed: false },
    },
    totals: { found: 0, inserted: 0, duplicates: 0, failedSources: 0 },
  };
  if (variations.length === 0) {
    logger.info({ brandId, scanId }, "scan.skipped.no_variations");
    return report;
  }

  // Per-source dispatch
  const allMentions: Array<{ platform: MentionPlatform; data: any }> = [];

  // Reddit
  const redditHealth = await shouldSkipSource(brandId, "reddit");
  if (redditHealth.skip) {
    report.perSource.reddit = { found: 0, inserted: 0, duplicates: 0, failed: true, reason: redditHealth.reason ?? "paused" };
  } else if (queries.reddit) {
    const last = await storage.getSourceHealth(brandId, "reddit");
    const sinceUnix = last?.lastSuccessfulScanAt ? Math.floor(last.lastSuccessfulScanAt.getTime() / 1000) : undefined;
    const r = await scanRedditSource({ query: queries.reddit, variations, sinceUnix });
    if (r.failed) {
      report.perSource.reddit = { found: 0, inserted: 0, duplicates: 0, failed: true, reason: r.failed };
      await recordSourceFailure(brandId, "reddit", r.failed);
    } else {
      report.perSource.reddit.found = r.mentions.length;
      r.mentions.forEach((m) => allMentions.push({ platform: "reddit", data: m }));
      await recordSourceSuccess(brandId, "reddit");
    }
  }

  // HN — same pattern
  // Quora — same pattern

  // (Duplicate the Reddit block for HN and Quora with their respective scanRedditSource → scanHackerNewsSource / scanQuoraSource calls.)

  // Sentiment + insert
  const today = new Date(); today.setUTCHours(0,0,0,0);
  const usedToday = await storage.countSentimentCallsForBrandSince(brandId, today); // add this storage method in Task 7
  const remainingBudget = Math.max(0, DAILY_SENTIMENT_CAP - usedToday);
  const sentimentInputs: SentimentInput[] = allMentions.map((m, i) => ({ key: String(i), text: m.data.mentionContext || m.data.sourceTitle || "" }));
  const verdicts = await judgeSentimentBatch(brand.name, sentimentInputs, { remainingBudget });

  for (let i = 0; i < allMentions.length; i++) {
    const { platform, data } = allMentions[i];
    const verdict = verdicts[String(i)];
    const canonical = canonicalizeMentionUrl(platform, data.sourceUrl);
    const engagement = normalizeEngagement(platform, data.engagementInputs ?? {});
    try {
      const inserted = await storage.tryInsertBrandMention({
        brandId,
        platform,
        sourceUrl: canonical,
        sourceTitle: (data.sourceTitle ?? "").slice(0, 500),
        mentionContext: (data.mentionContext ?? "").slice(0, 2000),
        sentiment: verdict.sentiment,
        sentimentScore: verdict.sentimentScore.toFixed(2),
        sentimentSource: verdict.source,
        engagementScore: engagement,
        engagementNormalized: engagement,
        authorUsername: data.authorUsername?.slice(0, 120) ?? null,
        mentionedAt: data.mentionedAt ?? null,
        mentionLocation: data.mentionLocation,
        matchedVariation: data.matchedVariation,
        matchedField: data.matchedField,
        source: "scanner",
        scannerVersion: 2,
        linkStatus: "unknown",
      } as any);
      const r = report.perSource[platform];
      if (inserted) r.inserted += 1; else r.duplicates += 1;
    } catch (err) {
      captureAndFlush(err, { tags: { source: "mention-scanner-insert" }, extra: { brandId, scanId } });
    }
  }

  // Totals
  for (const k of ["reddit","hackernews","quora"] as const) {
    const r = report.perSource[k];
    report.totals.found += r.found;
    report.totals.inserted += r.inserted;
    report.totals.duplicates += r.duplicates;
    if (r.failed) report.totals.failedSources += 1;
  }

  logger.info({
    brandId, scanId,
    durationMs: 0, // filled by caller
    totals: report.totals,
    perSource: report.perSource,
  }, "scan.complete");

  return report;
}
```

(Task 7 needs to add `countSentimentCallsForBrandSince(brandId, since)` which counts `brand_mentions` rows with `sentiment_source='llm' AND created_at >= since` for that brand. Add it now if missed earlier.)

- [ ] **Step 13.4: Run tests, lint, commit** — `feat(mentions): orchestrator with brand-presence gate + sentiment batching`

---

### Task 14: Scan runner (used by both cron and manual route)

**Files:**
- Create: `server/lib/runMentionScan.ts`
- Test: `tests/unit/runMentionScan.test.ts`

- [ ] **Step 14.1-14.5: TDD pattern**

```ts
export async function runMentionScan(scanId: string): Promise<void>;
```

Reads `scan_jobs` row → updates `status='running'` + `started_at` → calls `scanBrandMentions(brandId, scanId)` → updates `status='complete'` + `completed_at` + `per_source` + `totals`. On throw: `status='failed'` + `error` (Sentry-captured).

Commit: `feat(mentions): runMentionScan single entry point for cron + manual`

---

## Phase 7 — Routes file (single canonical owner)

### Task 15: Create `server/routes/mentions.ts`

**Files:**
- Create: `server/routes/mentions.ts` (~400 lines)
- Modify: `server/routes.ts` (mount the new router; remove duplicates)
- Modify: `server/routes/intelligence.ts` (delete duplicate handlers — see line ranges below)
- Modify: `server/routes/publications.ts` (delete duplicate handlers — see line ranges below)
- Test: `tests/unit/mentionsRoutes.test.ts`

- [ ] **Step 15.1: Identify duplicate handlers to delete**

Run:
```
grep -n "/api/brand-mentions" server/routes/intelligence.ts server/routes/publications.ts
```
Note the line ranges for every match. These all get deleted in step 15.4.

- [ ] **Step 15.2: Write failing route tests**

`tests/unit/mentionsRoutes.test.ts` — pattern from `tests/unit/chatbotThreads.test.ts`. Test cases (one `it()` each):

1. `GET /api/brand-mentions/:brandId` returns 404 when caller doesn't own brand. **Audit C13 regression.**
2. `GET /api/brand-mentions/alerts/:brandId` returns 404 when caller doesn't own brand. **Audit C14 regression.**
3. `POST /api/brand-mentions` rejects `javascript:` URL with 400. **Audit C5/G1 regression.**
4. `POST /api/brand-mentions` rejects URL whose host doesn't match selected platform.
5. `POST /api/brand-mentions` rejects when brand-presence gate fails (mocks `safeFetchText` to return text without brand).
6. `PATCH /api/brand-mentions/:id` rejects status transition `replied → new` with 409. **Audit C3 regression.**
7. `PATCH /api/brand-mentions/:id` enforces ownership (404 cross-tenant). **Audit C13 regression.**
8. `DELETE /api/brand-mentions/:id` returns the deleted row (for undo).
9. `POST /api/brand-mentions/scans/:brandId` is idempotent — second call returns the in-progress scanId. **Audit A17 regression.**
10. `POST /api/brand-mentions/scans/:brandId` enforces 4h manual cooldown.
11. `GET /api/brand-mentions/scans/:scanId` 404 cross-tenant.

- [ ] **Step 15.3: Run — expect all FAIL**

- [ ] **Step 15.4: Implement `server/routes/mentions.ts`**

Skeleton (subagent fills in handler bodies; pattern matches `server/routes/assistant.ts` for the chatbot, which is the closest precedent in the repo):

```ts
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { requireBrandOwnership, requireMentionOwnership } from "../lib/ownership";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { safeFetchText } from "../lib/ssrf";
import { passesBrandPresenceGate } from "../lib/brandPresenceGate";
import { canonicalizeMentionUrl } from "../lib/canonicalUrl";
import { judgeSentimentBatch } from "../lib/sentimentBatcher";
import { runMentionScan } from "../lib/runMentionScan";

export const mentionsRouter = Router();

// --- Schemas ---
const PLATFORMS = ["reddit", "hackernews", "quora"] as const;
const STATUSES = ["new", "acknowledged", "replied", "false_positive", "ignored"] as const;
const PLATFORM_HOSTS: Record<typeof PLATFORMS[number], RegExp> = {
  reddit: /^([a-z0-9-]+\.)?reddit\.com$|^redd\.it$/i,
  hackernews: /^news\.ycombinator\.com$/i,
  quora: /^([a-z0-9-]+\.)?quora\.com$/i,
};

const ManualAddSchema = z.object({
  brandId: z.string().uuid(),
  platform: z.enum(PLATFORMS),
  sourceUrl: z.string().url().refine((s) => /^https?:\/\//i.test(s), "must be http(s)"),
});
const StatusPatchSchema = z.object({ status: z.enum(STATUSES) });

// Allowed transitions (Q14 / spec §3.10)
const ALLOWED_TRANSITIONS: Record<typeof STATUSES[number], readonly typeof STATUSES[number][]> = {
  new: ["acknowledged", "replied", "false_positive", "ignored"],
  acknowledged: ["replied", "false_positive", "ignored"],
  replied: [],
  false_positive: [],
  ignored: [],
};

// --- LIST ---
mentionsRouter.get("/:brandId", isAuthenticated, async (req, res) => {
  const { brandId } = req.params;
  const owned = await requireBrandOwnership(brandId, req.user!.id);
  if (!owned) return res.status(404).json({ error: "not_found" });
  const cursor = req.query.cursor ? JSON.parse(Buffer.from(req.query.cursor as string, "base64").toString()) : undefined;
  const result = await storage.listMentionsForBrand(brandId, {
    cursor,
    limit: Math.min(100, Number(req.query.limit) || 50),
    status: req.query.status as string | undefined,
    platform: req.query.platform as string | undefined,
    sentiment: req.query.sentiment as string | undefined,
    from: req.query.from ? new Date(req.query.from as string) : undefined,
    to: req.query.to ? new Date(req.query.to as string) : undefined,
    q: req.query.q as string | undefined,
    sort: (req.query.sort as any) ?? "newest",
  });
  const stats = await storage.getMentionStatsForBrand(brandId);
  res.json({
    rows: result.rows,
    nextCursor: result.nextCursor ? Buffer.from(JSON.stringify(result.nextCursor)).toString("base64") : null,
    stats,
  });
});

// --- MANUAL ADD ---
mentionsRouter.post("/", isAuthenticated, async (req, res) => {
  const parsed = ManualAddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.issues });
  const { brandId, platform, sourceUrl } = parsed.data;
  const owned = await requireBrandOwnership(brandId, req.user!.id);
  if (!owned) return res.status(404).json({ error: "not_found" });
  const url = new URL(sourceUrl);
  if (!PLATFORM_HOSTS[platform].test(url.hostname)) {
    return res.status(400).json({ error: "url_host_mismatch", message: "URL must be from the selected platform." });
  }
  // Per-user manual rate limit (10/min) — use existing rateLimitBuckets infra
  // ... (subagent: read server/lib/rateLimitBuckets.ts and apply)

  const fetched = await safeFetchText(sourceUrl, { timeoutMs: 15_000, maxBytes: 2_000_000 });
  if (fetched.status < 200 || fetched.status >= 300) return res.status(400).json({ error: "fetch_failed" });

  const brand = await storage.getBrandById(brandId);
  const variations = [brand!.name, ...(Array.isArray(brand!.nameVariations) ? brand!.nameVariations : [])].filter(Boolean) as string[];
  const gate = passesBrandPresenceGate({ title: "", selftext: fetched.text }, variations);
  if (!gate.matched) {
    return res.status(400).json({ error: "brand_not_found_in_content", message: "We couldn't find your brand name on this page. Check the URL or update your brand variations." });
  }

  const verdicts = await judgeSentimentBatch(brand!.name, [{ key: "x", text: fetched.text.slice(0, 2000) }]);
  const v = verdicts["x"];
  const canonical = canonicalizeMentionUrl(platform, sourceUrl);

  const inserted = await storage.tryInsertBrandMention({
    brandId, platform, sourceUrl: canonical,
    sourceTitle: fetched.text.slice(0, 200),
    mentionContext: fetched.text.slice(0, 2000),
    sentiment: v.sentiment, sentimentScore: v.sentimentScore.toFixed(2), sentimentSource: v.source,
    matchedVariation: gate.matched ? gate.matchedVariation : null,
    matchedField: gate.matched ? gate.matchedField : null,
    source: "manual", scannerVersion: 2, linkStatus: "unknown",
  } as any);

  if (!inserted) return res.status(409).json({ error: "already_exists" });
  res.status(201).json({ data: inserted });
});

// --- PATCH STATUS ---
mentionsRouter.patch("/:id", isAuthenticated, async (req, res) => {
  const parsed = StatusPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const owned = await requireMentionOwnership(req.params.id, req.user!.id);
  if (!owned) return res.status(404).json({ error: "not_found" });
  const current = (owned.status ?? "new") as typeof STATUSES[number];
  const next = parsed.data.status;
  if (current === next) return res.json({ data: owned });
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    return res.status(409).json({ error: "invalid_transition", from: current, to: next });
  }
  await storage.updateBrandMentionStatus(req.params.id, next); // add storage method
  logger.info({ id: req.params.id, from: current, to: next, userId: req.user!.id }, "mention.status.changed");
  res.json({ ok: true });
});

// --- DELETE ---
mentionsRouter.delete("/:id", isAuthenticated, async (req, res) => {
  const owned = await requireMentionOwnership(req.params.id, req.user!.id);
  if (!owned) return res.status(404).json({ error: "not_found" });
  await storage.deleteBrandMention(req.params.id);
  logger.info({ id: req.params.id, userId: req.user!.id }, "mention.deleted");
  res.json({ data: owned }); // returned for client-side undo
});

// --- BULK DELETE ---
mentionsRouter.post("/bulk-delete", isAuthenticated, async (req, res) => {
  const ids = z.array(z.string().uuid()).max(100).parse(req.body.ids);
  // Filter to only owned mentions
  const owned = await storage.getOwnedMentionIds(ids, req.user!.id); // add storage method
  await storage.deleteManyBrandMentions(owned);
  logger.info({ count: owned.length, userId: req.user!.id }, "mention.bulk_deleted");
  res.json({ deleted: owned.length });
});

// --- DELETE ALL FOR BRAND ---
mentionsRouter.post("/delete-all/:brandId", isAuthenticated, async (req, res) => {
  const owned = await requireBrandOwnership(req.params.brandId, req.user!.id);
  if (!owned) return res.status(404).json({ error: "not_found" });
  if (req.body.brandName !== owned.name) return res.status(400).json({ error: "name_mismatch" });
  const count = await storage.deleteAllMentionsForBrand(req.params.brandId);
  logger.info({ brandId: req.params.brandId, count, userId: req.user!.id }, "mention.delete_all_for_brand");
  res.json({ deleted: count });
});

// --- START SCAN ---
mentionsRouter.post("/scans/:brandId", isAuthenticated, async (req, res) => {
  const owned = await requireBrandOwnership(req.params.brandId, req.user!.id);
  if (!owned) return res.status(404).json({ error: "not_found" });

  // Idempotency: existing active scan?
  const active = await storage.getActiveScanJobForBrand(req.params.brandId);
  if (active) return res.json({ scanId: active.id, attached: true });

  // 4h cooldown
  const last = await storage.getMostRecentManualScanForBrand(req.params.brandId);
  if (last?.completedAt) {
    const since = Date.now() - last.completedAt.getTime();
    if (since < 4 * 60 * 60 * 1000) {
      return res.status(429).json({ error: "cooldown", nextAvailableAt: new Date(last.completedAt.getTime() + 4 * 60 * 60 * 1000) });
    }
  }

  const job = await storage.createScanJob({ brandId: req.params.brandId, userId: req.user!.id, trigger: "manual" });

  // Detach the actual work. waitUntil if available (Vercel), else setImmediate.
  const ctx = (res as any).waitUntil ?? ((p: Promise<unknown>) => setImmediate(() => p.catch(() => {})));
  ctx(runMentionScan(job.id).catch((err) => {
    captureAndFlush(err, { tags: { source: "mention-scan-detached" }, extra: { scanId: job.id } });
  }));
  res.status(202).json({ scanId: job.id });
});

// --- SCAN STATUS ---
mentionsRouter.get("/scans/:scanId", isAuthenticated, async (req, res) => {
  const job = await storage.getScanJob(req.params.scanId);
  if (!job || job.userId !== req.user!.id) return res.status(404).json({ error: "not_found" });
  res.json(job);
});

// --- ACTIVE SCANS LIST (for cross-app completion-toast listener) ---
mentionsRouter.get("/scans/active", isAuthenticated, async (req, res) => {
  const rows = await storage.getActiveScanJobsForUser(req.user!.id);
  res.json({ rows });
});

// --- BRAND OPT-IN TOGGLE ---
mentionsRouter.patch("/brands/:brandId/monitor-mentions", isAuthenticated, async (req, res) => {
  const owned = await requireBrandOwnership(req.params.brandId, req.user!.id);
  if (!owned) return res.status(404).json({ error: "not_found" });
  await storage.setBrandMonitorMentions(req.params.brandId, !!req.body.enabled);
  res.json({ ok: true });
});
```

Add `requireMentionOwnership` to `server/lib/ownership.ts`:
```ts
export async function requireMentionOwnership(mentionId: string, userId: string) {
  const m = await storage.getBrandMention(mentionId);
  if (!m) return null;
  const owned = await requireBrandOwnership(m.brandId, userId);
  return owned ? m : null;
}
```

- [ ] **Step 15.5: Mount router; delete duplicates**

In `server/routes.ts`, find existing mention-route registrations. Delete every registration of `/api/brand-mentions/*`. Add:
```ts
import { mentionsRouter } from "./routes/mentions";
// ... in the route-mounting block:
app.use("/api/brand-mentions", mentionsRouter);
```

In `server/routes/intelligence.ts`: delete every block whose path starts with `/api/brand-mentions`. Replace with a top-of-file comment: `// Mention routes moved to server/routes/mentions.ts (Wave: mentions rebuild)`.

In `server/routes/publications.ts`: same as above.

- [ ] **Step 15.6: Run tests** — expect PASS for all the failure cases written in step 15.2.

- [ ] **Step 15.7: typecheck, lint, commit**
```
npm run check
npm run lint
git add server/routes/mentions.ts server/routes/intelligence.ts server/routes/publications.ts server/routes.ts server/lib/ownership.ts tests/unit/mentionsRoutes.test.ts
git commit -m "feat(mentions): canonical routes file, delete duplicates, fix cross-tenant leak"
```

---

## Phase 8 — Scheduler integration + citation-checker cleanup

### Task 16: Update `runMentionScanJob` in scheduler

**Files:**
- Modify: `server/scheduler.ts:353-357`

- [ ] **Step 16.1: Replace the body**

```ts
export async function runMentionScanJob(deadlineMs?: number): Promise<void> {
  await withAdvisoryLock(lockKeys.mentionScan, "mention-scan", async () => {
    const brands = await storage.listBrandsWithMentionMonitoring();
    for (const b of brands) {
      try {
        const job = await storage.createScanJob({ brandId: b.id, userId: b.userId, trigger: "cron" });
        await runMentionScan(job.id);
      } catch (err) {
        logger.error({ err, brandId: b.id }, "cron.mention_scan.brand_failed");
      }
    }
  });
}
```

Add the import at the top of the file: `import { runMentionScan } from "./lib/runMentionScan";`.

- [ ] **Step 16.2: typecheck, lint, commit** — `feat(mentions): scheduler enqueues per-brand scan_jobs`

---

### Task 17: Remove citation-checker write to brand_mentions

**Files:**
- Modify: `server/citationChecker.ts:1050-1075`

- [ ] **Step 17.1: Verify no consumers**

```
grep -rn "platform.*ai:" client/src server/
grep -rn "ai://" client/src server/
```
Confirm no UI or other server code reads `platform LIKE 'ai:%'` rows. (Side-panel special-case at `geo-tools.tsx:1929-1938` is being deleted with the MentionsTab extraction in Task 21.)

- [ ] **Step 17.2: Delete the write**

In `server/citationChecker.ts`, find the block at lines 1050-1075 that calls `createBrandMention(...)` with synthetic `ai://` URLs. Delete the block entirely. If the surrounding function still does meaningful work (it likely does — it's part of the citation-tracking pipeline), keep that work; only delete the `brand_mentions` insert.

- [ ] **Step 17.3: Run citation-related tests** — expect PASS:
```
npx vitest run tests/unit/citationChecker.matcherAuthority.test.ts
```

- [ ] **Step 17.4: commit** — `feat(mentions): citation-checker no longer writes to brand_mentions`

---

## Phase 9 — Frontend: hook + components

### Task 18: `useMentions` hook

**Files:**
- Create: `client/src/hooks/useMentions.ts`
- Test: `tests/unit/useMentions.test.tsx`

- [ ] **Step 18.1-18.5: TDD pattern**

API per spec §3.11. Returns `{ mentions, isLoading, isError, hasMore, loadMore, filters, setFilter, clearFilters, stats, activeScan, startScan, scanCooldown, updateStatus, deleteMention, bulkDelete, deleteAllForBrand, markFalsePositive }`.

Critical behaviors to test:
- URL-persists filter state via `wouter`'s `useLocation` + `URLSearchParams`.
- Polls `/api/brand-mentions/scans/:scanId` every 2s when `activeScan.status` is `queued` or `running`. Stops on `complete` or `failed`.
- Optimistic update on `updateStatus`: TanStack Query `onMutate` → write optimistic state, `onError` → rollback.
- Optimistic delete with 5s undo toast: `onMutate` removes row from cache, toast `action` calls a `restoreMention` mutation that POSTs the saved row back.

Commit: `feat(mentions): useMentions hook with optimistic updates + polling`

---

### Task 19: Presentational components

**Files:**
- Create: `client/src/components/geo-tools/MentionCard.tsx`
- Create: `client/src/components/geo-tools/MentionDetailSheet.tsx`
- Create: `client/src/components/geo-tools/MentionsFilters.tsx`
- Create: `client/src/components/geo-tools/AddMentionDialog.tsx`
- Create: `client/src/components/geo-tools/ScanStatusPanel.tsx`

- [ ] **Step 19.1: `MentionCard.tsx`**

Per spec §3.12.D: icon + title + sentiment badge + status badge + matched-variation hint + date + engagement (normalized 0-100) + actions menu (⋯). At `<sm` reflows to three rows. Color-blind safe sentiment badge (icon + color: ✓ positive, — neutral, ⚠ negative). `aria-label` on actions menu. Whole card is a `<button>` with focus-ring and visible keyboard focus.

- [ ] **Step 19.2: `MentionDetailSheet.tsx`**

Sheet with side="right" (>=sm) / side="bottom" (<sm). URL-driven via `?mention=<id>` (read+write through wouter). Shows: header, "Open on" button (disabled if `link_status='dead'`), "Why matched" disclosure, mentionContext via `SafeMarkdown`, status dropdown (transitions enforced with disabled options), Delete + Mark false positive buttons. Focus moves into sheet on open; returns to originating row on close.

- [ ] **Step 19.3: `MentionsFilters.tsx`**

Six controls: status, platform, sentiment, date range, free-text search, sort. At `<sm`, collapses to a `Filters (N)` button that opens a Sheet with the controls.

- [ ] **Step 19.4: `AddMentionDialog.tsx`**

Form: platform Select (3 options), sourceUrl Input. Disabled until both filled. On submit calls hook's mutation; on 400 displays the server's `message` field inline. No mentionContext field.

- [ ] **Step 19.5: `ScanStatusPanel.tsx`**

Always visible above the list when a brand is selected. Shows: "Last scan: 4h ago · ✓ Reddit 12 · ✓ HN 5 · ⚠ Quora rate-limited · Next auto-scan: tomorrow 03:00 UTC · Manual cooldown: ready / 2h 14m" plus the searching-for line and the "+ add variation" link. When 3 consecutive auto-scans failed, shows a banner.

Commit each subtask separately: `feat(mentions): MentionCard component`, etc.

---

### Task 20: `MentionsTab.tsx` (composition root)

**Files:**
- Create: `client/src/components/geo-tools/MentionsTab.tsx`
- Test: `tests/unit/MentionsTab.test.tsx`

- [ ] **Step 20.1-20.5: TDD pattern**

Tests cover (using happy-dom + `@axe-core/react`):
- First-time empty state copy.
- Empty-after-scan copy distinguishes from first-time.
- Scanning state shows per-source progress (mocks active scan via mocked hook).
- Mentions list paginates (Load more triggers next-page fetch).
- Filter URL persistence (set status filter → URL has `?status=new`).
- Optimistic delete shows undo toast.
- axe-core asserts no `serious`/`critical` violations.

Commit: `feat(mentions): MentionsTab composition`

---

### Task 21: Wire into `geo-tools.tsx` (delete inline implementation)

**Files:**
- Modify: `client/src/pages/geo-tools.tsx` (delete ~300 lines, add 1 component)

- [ ] **Step 21.1: Identify the lines to remove**

Per the audit, the Mentions tab content is around lines 1496-1789 of `geo-tools.tsx`. Also delete:
- The `mentionsData` query (lines 464-492).
- The `updateMentionStatusMutation` (lines 494-512).
- The `addMentionMutation` (lines ~590-607).
- The `scanMentionsMutation` (lines 654-680).
- `mentionStatusFilter` state.
- `addMentionOpen` state.
- `activeMention` state.
- The inline `AddMentionDialog` JSX (around lines 2260-2350).
- The inline side-panel for selected mention (around lines 1894-1990).
- Any helpers used solely by Mentions: `MENTION_STATUS_DISPLAY`, etc.

- [ ] **Step 21.2: Replace with `<MentionsTab brandId={selectedBrandId} />`**

```tsx
<TabsContent value="mentions">
  <MentionsTab brandId={selectedBrandId} />
</TabsContent>
```

- [ ] **Step 21.3: Verify the rest of the file still typechecks**

```
npm run check
```

- [ ] **Step 21.4: commit** — `feat(mentions): extract MentionsTab from geo-tools monolith`

---

### Task 22: Scan-completion cross-app toast

**Files:**
- Create: `client/src/lib/scanCompletionListener.ts`
- Modify: `client/src/App.tsx` (mount the listener)

- [ ] **Step 22.1: Implement**

```tsx
export function ScanCompletionListener() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const seenIdsRef = useRef(new Set<string>());

  useQuery({
    enabled: !!user,
    queryKey: ["/api/brand-mentions/scans/active"],
    refetchInterval: (data) => (data?.rows.length ?? 0) > 0 ? 5000 : false,
    staleTime: 0,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/brand-mentions/scans/active");
      const data = await res.json();
      // For any active scan we've seen before that is no longer active, fetch it once and toast.
      // Track via seenIdsRef.
      // (Subagent: implement the diff logic.)
      return data;
    },
  });
  return null;
}
```

Mount inside `<AuthProvider>` in `App.tsx`.

- [ ] **Step 22.2: commit** — `feat(mentions): cross-app scan-completion toast`

---

## Phase 10 — Tests for fixtures + axe-core CI

### Task 23: Integration smoke tests against fixtures

**Files:**
- Create: `tests/unit/mentionScannerFixtures.test.ts`
- Create: `tests/fixtures/reddit-search.json`, `reddit-comments.json`, `hn-search.json`, `quora-search.html`

- [ ] **Step 23.1-23.5: TDD pattern**

A single end-to-end test per source: mock `redditFetch` / `fetch` / `safeFetchText` to return fixture content, run the source scanner, assert it produces the expected `RedditMention[]` / `HNMention[]` / `QuoraMention[]`.

Commit: `test(mentions): fixture-driven integration smoke per source`

---

### Task 24: axe-core in Vitest

**Files:**
- Modify: `package.json` (add `@axe-core/react` if not present)
- Modify: `tests/unit/MentionsTab.test.tsx`
- Modify: `vitest.config.ts` (none required — happy-dom is already configured)

- [ ] **Step 24.1: Install**

```
npm install --save-dev @axe-core/react axe-core
```
Verify it isn't already in `package.json` first.

- [ ] **Step 24.2: Add the assertion**

In `tests/unit/MentionsTab.test.tsx`:
```tsx
import { axe } from "@axe-core/react"; // or `vitest-axe`
it("MentionsTab passes axe-core (serious + critical)", async () => {
  const { container } = render(<MentionsTab brandId="b1" />);
  const results = await axe(container);
  const blocking = results.violations.filter(v => v.impact === "critical" || v.impact === "serious");
  expect(blocking).toEqual([]);
});
```

- [ ] **Step 24.3: commit** — `test(mentions): axe-core a11y assertion in CI`

---

## Phase 11 — Cleanup, verification, docs

### Task 25: Boot order verification

**Files:**
- Modify: `server/index.ts:181-236` (only if needed)

- [ ] **Step 25.1: Verify migrations complete before scheduler starts**

Read `server/index.ts`. Confirm `runMigrations()` is `await`-ed *before* `scheduler.start()` is called. If not, add the `await` and a one-line comment explaining why.

- [ ] **Step 25.2: commit** if changed — `chore(boot): ensure migrations complete before workers start`

---

### Task 26: Final full-system verification

- [ ] **Step 26.1: Run all the gates**
```
npm run check
npm run lint
npm run format:check
npm test
```
Expected: all green.

- [ ] **Step 26.2: Boot the dev server**
```
npm run dev
```
Verify migration `0050` applies cleanly (look for `[0050] pre-delete ai_rows=N junk_rows=M` log).

- [ ] **Step 26.3: Manual smoke against UI**
1. Log in.
2. Navigate to GEO Tools → Mentions.
3. Confirm "Searching for: ..." line is shown above scan button.
4. Click "+ add variation", add one, return.
5. Click "Scan Now". Watch ScanStatusPanel show per-source progress.
6. Navigate away mid-scan; return; confirm panel reattaches.
7. After scan completes, confirm list populates.
8. Click a mention; side-panel opens; URL has `?mention=<id>`; refresh page; side-panel survives.
9. Change status to `replied`; refresh; confirm persisted.
10. Try to change `replied` → `new` → confirm 409 surfaces as toast.
11. Delete a row → undo toast appears → click Undo → row reappears.
12. Toggle "Monitor mentions" off for a brand → confirm cron won't pick it up (verify by reading `brands.monitor_mentions`).
13. Try manual-add with a `javascript:` URL → 400 with clear message.
14. Try manual-add with a Quora URL when platform=Reddit selected → 400 host mismatch.
15. Resize browser to 375px → filters collapse to Sheet; cards reflow.

- [ ] **Step 26.4: Document completion**

Add a section to `docs/phase2_completion.md` summarizing the wave. Pattern matches the prior wave entries already in that file.

- [ ] **Step 26.5: Final commit**
```
git add docs/phase2_completion.md
git commit -m "docs: log mentions rebuild completion"
```

---

## Out-of-scope reminders

These are explicitly NOT part of this plan (per spec §3.18):

- Email / Slack / webhook alerts.
- Competitor / SoV view.
- Saved boolean queries.
- CSV / API export.
- Team assignment.
- Reply drafting.
- GEO-relevance scoring on mentions.
- Author reputation.
- Additional sources beyond Reddit / HN / Quora.
- `j` / `k` keyboard shortcuts.

If anything in those categories surfaces during implementation, log it in the followups list, do not implement.

---

## Self-review checklist — all spec sections covered?

| Spec section | Plan task |
|---|---|
| §3.1 File layout (frontend extraction) | Tasks 18-22 |
| §3.1 File layout (backend new files) | Tasks 2-15 |
| §3.2 Data model | Task 1 |
| §3.3 Scan execution flow | Tasks 13, 14, 15 (scan endpoints), 16 (cron) |
| §3.4 Query construction | Task 5 |
| §3.5 Canonical URL normalization | Task 2 |
| §3.6 Brand-presence gate | Task 3 |
| §3.7 Sentiment | Task 8 |
| §3.8 Reddit OAuth | Task 6, 10 |
| §3.9 Manual-add | Task 15 |
| §3.10 API surface | Task 15 |
| §3.11 Frontend state | Task 18 |
| §3.12 UI flows A-I | Tasks 19, 20 |
| §3.13 Scheduling | Task 16 |
| §3.14 Rate limits | Task 6 (Reddit), Task 8 (sentiment cap), Task 15 (manual) |
| §3.15 Observability | Tasks 13, 14, 15 (Sentry + structured logs throughout) |
| §3.16 Migration | Task 1 |
| §3.17 Backwards-incompatible changes | Tasks 15, 16, 17, 21 |
| §3.18 Non-goals | Documented above |
