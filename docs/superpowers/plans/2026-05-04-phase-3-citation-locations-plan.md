# Phase 3 — Citation Locations Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement task-by-task.
>
> **No commits during execution.** Same convention as Phases 0–2.

**Goal:** Show users *where* in each AI response their brand was mentioned. Today the citations page reports "2 cited / 24 checked" but no preview of the snippet, where in the response the brand appeared, or which URLs the AI cited. This phase fixes Ben's literal complaint from the meeting transcript ("it didn't tell me where the citations were or what they were"). Self-contained to citations pages — no changes to dashboards, sidebars, or shared infra.

**Architecture:** Two pure client-side PRs (highlighting + snippet strip) and one full-stack PR (URL extraction migration + UI). The data is already largely captured in `geo_rankings.citationContext` (snippet) and `geo_rankings.citingOutletUrl` (one source URL per result). PR 3.3 adds a new `cited_urls TEXT[]` column for the *list* of all URLs the LLM cited in its response — typically 0–10 per response, capped at 20.

**Tech Stack:** React, TanStack Query, `react-markdown` + `rehype-sanitize` (already in use via `SafeMarkdown.tsx`), custom rehype plugin (no new dependency — handwritten 30-line plugin), Drizzle ORM + raw SQL migration.

---

## Pre-conditions verified before writing this plan

- `client/src/components/citations/PlatformResultCard.tsx` accepts `{ result: PlatformResult }`. `result.fullResponse: string | null` is the markdown text we'll highlight. Renders via `<SafeMarkdown>{result.fullResponse}</SafeMarkdown>` at line 216.
- `client/src/components/SafeMarkdown.tsx` (8 lines) already accepts a `rehypePlugins` prop and merges with `rehypeSanitize` defaults. Just needs the sanitize schema extended to allow `<mark>`.
- `shared/schema.ts:150` defines `brands.nameVariations: text("name_variations").array()` — the variations that get highlighted alongside the base name
- `shared/schema.ts:521-560` defines `geo_rankings` with `citationContext` (snippet text) and `citingOutletUrl` (one URL today). New column `cited_urls TEXT[]` will be added in PR 3.3.
- `server/citationChecker.ts:935` is the `storage.createGeoRanking({...})` call site. Adding `citedUrls` to the values object is the wire-up point.
- `server/databaseStorage.ts:476` is the `createGeoRanking` storage method.
- Both `ResultsTab.tsx:426` and `HistoryTab.tsx:462` render `PlatformResultCard`. Both need to pass `highlightTerms` once we add the prop.
- Migration runner uses `schema_migrations` table to track applied migrations, so re-runs are skipped — new migration `0047_*` will run once on next deploy/dev start.
- `useBrandSelection()` hook returns `{ selectedBrandId, brands, selectedBrand, isLoading }` — `selectedBrand` includes `name` and `nameVariations` per the schema.

---

## File structure

**Files modified:**
- `client/src/components/SafeMarkdown.tsx` — extend rehype-sanitize schema to allow `<mark>` tag (PR 3.1)
- `client/src/components/citations/PlatformResultCard.tsx` — accept `highlightTerms` prop, pass to SafeMarkdown via custom rehype plugin (PR 3.1)
- `client/src/components/citations/ResultsTab.tsx` — call `useBrandSelection()` to get brand, pass `highlightTerms` to PlatformResultCard, render `<CitedMentionsStrip />` above per-platform stats card when `totalCited > 0` (PRs 3.1 + 3.2)
- `client/src/components/citations/HistoryTab.tsx` — same `highlightTerms` wiring as ResultsTab (PR 3.1)
- `server/citationChecker.ts` — at the `storage.createGeoRanking` call (line ~935), add `citedUrls: extractCitedUrls(responseText)` (PR 3.3)
- `server/databaseStorage.ts` — `createGeoRanking` will accept the new `citedUrls` field via Drizzle's existing schema-typed insert (no manual change needed if the schema export adds the column)
- `shared/schema.ts` — add `citedUrls: text("cited_urls").array()` to the `geoRankings` table definition (PR 3.3)

**Files created:**
- `client/src/lib/highlightTermsRehype.ts` — rehype plugin factory that walks hast text nodes and wraps brand-name matches in `<mark>` (PR 3.1)
- `client/src/components/citations/CitedMentionsStrip.tsx` — horizontal scroll strip of cited-result cards above the per-platform accordion (PR 3.2)
- `client/src/lib/extractSnippet.ts` — pure function: given response text + brand terms, returns ±200 chars around first match with "…" boundaries (PR 3.2)
- `server/lib/urlExtractor.ts` — pure function: extract + dedupe + cap URLs from response text (PR 3.3)
- `migrations/0047_geo_rankings_cited_urls.sql` — `ALTER TABLE geo_rankings ADD COLUMN IF NOT EXISTS cited_urls TEXT[]` (PR 3.3)
- `tests/unit/highlightTermsRehype.test.ts` — 1 unit test (rehype plugin is pure, doesn't need RTL) (PR 3.1)
- `tests/unit/extractSnippet.test.ts` — 2 unit tests for the snippet helper (PR 3.2)
- `tests/unit/urlExtractor.test.ts` — 3 unit tests (markdown links, plain URLs + trailing punct, dedupe + cap) (PR 3.3)

**No tests for `CitedMentionsStrip.tsx`** — layout-only component per the test-coverage convention. The pure-function helpers (`highlightTermsRehype`, `extractSnippet`, `urlExtractor`) get vitest tests because they're logic-bearing.

**No changes to:**
- `vercel.json` (no new function, no new cron, no new env var)
- `vitest.config.ts` (no new test infra)
- `package.json` (no new deps)
- Any Phase 0/1/2 code (Phase 3 is purely additive on the citations layer)

---

## Pre-flight: baseline check

- [ ] **P3.0: Confirm baseline is green**

Run:
```
npm run check
npm test
```

Expected: typecheck clean, **244 tests passing** (baseline from end of Phase 2). If either fails, halt and address before continuing.

---

## PR 3.1 — Highlight brand mentions inside responses (~3 hours)

### Task 1: Build the `highlightTermsRehype` plugin + 1 unit test (TDD)

**Files:**
- Create: `client/src/lib/highlightTermsRehype.ts`
- Create: `tests/unit/highlightTermsRehype.test.ts`

**Why a custom rehype plugin (not regex-on-source):** Regex on markdown source corrupts `[Stripe](https://stripe.com)` (matches in BOTH the link text and the URL), code blocks (highlighting code is wrong), and HTML in markdown (would double-wrap). A rehype plugin walks the AST after markdown→HTML conversion and only touches text nodes that aren't descendants of `<code>` or `<a>`. ~30 lines of plugin logic, no new dependency.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/highlightTermsRehype.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

import { createHighlightPlugin } from "../../client/src/lib/highlightTermsRehype";

async function process(markdown: string, terms: string[]): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(createHighlightPlugin(terms))
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

describe("highlightTermsRehype", () => {
  it("wraps case-insensitive, word-boundary brand-name matches in <mark>", async () => {
    const html = await process(
      "Stripe is a payment processor. STRIPE leads the space. Don't confuse with stripeling.",
      ["Stripe"],
    );
    // 2 matches: "Stripe" + "STRIPE" (case-insensitive). "stripeling" must NOT match (word boundary).
    expect(html.match(/<mark>/g)?.length ?? 0).toBe(2);
    expect(html).toContain("<mark>Stripe</mark>");
    expect(html).toContain("<mark>STRIPE</mark>");
    expect(html).toContain("stripeling"); // present, not wrapped
    expect(html).not.toContain("<mark>stripeling</mark>");
  });

  it("does NOT highlight matches inside <code> or <a>", async () => {
    const html = await process(
      "Visit [Stripe](https://stripe.com) or call `Stripe.createPayment()`. Stripe is great.",
      ["Stripe"],
    );
    // Only the bare-text "Stripe" (last sentence) should be wrapped.
    // The link text "Stripe" inside <a> is skipped; "Stripe.createPayment" inside <code> is skipped.
    expect(html.match(/<mark>/g)?.length ?? 0).toBe(1);
    // The link's href and text are intact.
    expect(html).toContain('href="https://stripe.com"');
    expect(html).toContain(">Stripe</a>");
    // The code content is intact.
    expect(html).toContain("<code>Stripe.createPayment()</code>");
  });

  it("escapes regex special chars in brand names (e.g. C++)", async () => {
    const html = await process("I love C++ programming.", ["C++"]);
    expect(html).toContain("<mark>C++</mark>");
  });

  it("highlights multiple terms, preferring the longest match (no overlap)", async () => {
    const html = await process(
      "Stripe Inc owns Stripe.",
      ["Stripe", "Stripe Inc"],
    );
    // "Stripe Inc" (longer) wins for the first occurrence; standalone "Stripe" wraps the second.
    expect(html).toContain("<mark>Stripe Inc</mark>");
    expect(html).toContain("<mark>Stripe</mark>");
    // Make sure we didn't double-wrap "Stripe Inc" as <mark>Stripe</mark> Inc</mark>.
    expect(html).not.toContain("<mark><mark>");
  });

  it("no-ops cleanly when terms array is empty", async () => {
    const html = await process("Stripe is a payment processor.", []);
    expect(html).not.toContain("<mark>");
    expect(html).toContain("Stripe is a payment processor.");
  });

  it("caps the term list at 50 to bound regex compile cost", async () => {
    const manyTerms = Array.from({ length: 100 }, (_, i) => `Brand${i}`);
    // Should not throw or hang. The first 50 terms are used; remainder ignored.
    const html = await process("Brand0 and Brand49 and Brand50 mentioned.", manyTerms);
    expect(html).toContain("<mark>Brand0</mark>");
    expect(html).toContain("<mark>Brand49</mark>");
    expect(html).toContain("Brand50"); // beyond cap → not wrapped
    expect(html).not.toContain("<mark>Brand50</mark>");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```
npx vitest run tests/unit/highlightTermsRehype.test.ts
```

Expected: 6 tests fail with "module not found" — plugin doesn't exist yet.

- [ ] **Step 3: Create `client/src/lib/highlightTermsRehype.ts`**

```ts
import type { Plugin } from "unified";
import type { Root, Element, Text } from "hast";
import { visit, SKIP } from "unist-util-visit";

const TERMS_CAP = 50;

/** Returns a rehype plugin that walks hast text nodes and wraps
 *  case-insensitive, word-boundary matches in <mark>. Skips text
 *  inside <code>, <pre>, or <a> elements (matches inside links or
 *  code blocks would corrupt the rendered output). Pure function —
 *  factory pattern lets the same instance be reused across renders. */
export function createHighlightPlugin(terms: string[]): Plugin<[], Root> {
  // Cap term count to bound regex compile cost. Real brands have <10
  // variations; the cap protects against pathological config.
  const cappedTerms = terms.slice(0, TERMS_CAP).filter((t) => t && t.trim().length > 0);

  if (cappedTerms.length === 0) {
    // No-op plugin — return early so the default plugin shape is preserved.
    return () => () => {};
  }

  // Sort longest-first so "Stripe Inc" matches before "Stripe" when both
  // are in the term list. RegExp alternation is greedy left-to-right —
  // longest-first is the simplest way to prefer the longer match.
  const sorted = [...cappedTerms].sort((a, b) => b.length - a.length);

  // Escape regex special chars in each term so brand names like "C++" or
  // "AT&T" don't break the pattern.
  const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  // \b is the standard word-boundary anchor. Case-insensitive via the i flag.
  // Global flag so all occurrences in a node get wrapped, not just the first.
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

  return () => (tree) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (parent === null || index === null) return;

      // Skip text inside elements where highlighting would corrupt
      // semantics: <code>, <pre>, <a>. Walk up the parent chain isn't
      // available in unist-util-visit's signature directly — we rely
      // on the immediate parent being one of these (rehype trees from
      // markdown have flat text-in-element structure, no nested
      // text-in-text). For safety, also skip if parent's tagName is one
      // of the known opt-out tags.
      if (parent.type === "element") {
        const tag = (parent as Element).tagName;
        if (tag === "code" || tag === "pre" || tag === "a") return;
      }

      // Skip if the text doesn't contain any matches — common case.
      if (!pattern.test(node.value)) {
        pattern.lastIndex = 0; // reset stateful regex
        return;
      }
      pattern.lastIndex = 0;

      // Split the text into alternating non-match / match segments and
      // build a new array of nodes. text -> [text, mark, text, mark, …].
      const newNodes: Array<Text | Element> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(node.value)) !== null) {
        if (match.index > lastIndex) {
          newNodes.push({ type: "text", value: node.value.slice(lastIndex, match.index) });
        }
        newNodes.push({
          type: "element",
          tagName: "mark",
          properties: {},
          children: [{ type: "text", value: match[0] }],
        });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < node.value.length) {
        newNodes.push({ type: "text", value: node.value.slice(lastIndex) });
      }

      // Replace the original text node with the new sequence in the parent.
      (parent as Element).children.splice(index, 1, ...newNodes);
      // Skip the inserted nodes so visit() doesn't re-process them.
      return [SKIP, index + newNodes.length];
    });
  };
}
```

- [ ] **Step 4: Run the test, expect 6 passes**

```
npx vitest run tests/unit/highlightTermsRehype.test.ts
```

Expected: all 6 pass. If any fail, common causes:
- `unist-util-visit` not installed — it's a transitive dep of `react-markdown`; if missing, `npm install --save-dev unist-util-visit` (lightweight, ~5 KB)
- `hast` types not exported — check that `import type { Root, Element, Text } from "hast"` resolves; if not, use `unknown` and cast carefully

- [ ] **Step 5: Run typecheck + full suite**

```
npm run check
npm test
```

Expected: typecheck clean, **250 tests passing** (244 baseline + 6 new).

### Task 2: Allow `<mark>` in SafeMarkdown's sanitize schema

**Files:**
- Modify: `client/src/components/SafeMarkdown.tsx`

**Why:** rehype-sanitize defaults to GitHub schema, which excludes `<mark>`. Without extending the schema, the sanitizer would strip the `<mark>` tags the new plugin inserts.

- [ ] **Step 1: Read the current `client/src/components/SafeMarkdown.tsx`** (8 lines).

- [ ] **Step 2: Replace with the schema-extended version**

```tsx
import ReactMarkdown, { type Options } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// Extend the sanitize schema to allow <mark> (the highlight tag inserted
// by createHighlightPlugin). Everything else follows the GitHub schema
// defaults — same security posture, just one extra allowed tag.
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
};

export default function SafeMarkdown(props: Options) {
  const { rehypePlugins, ...rest } = props;
  const plugins = [
    [rehypeSanitize, schema] as const,
    ...(Array.isArray(rehypePlugins) ? rehypePlugins : []),
  ];
  return <ReactMarkdown {...rest} rehypePlugins={plugins} />;
}
```

Note: the `[rehypeSanitize, schema] as const` form passes the schema as the plugin's options argument, which is how unified plugins receive config.

- [ ] **Step 3: Run typecheck**

```
npm run check
```

Expected: clean. If TypeScript complains about the tuple form, it may need to be `[rehypeSanitize, schema] as [typeof rehypeSanitize, typeof schema]` — adapt as needed.

- [ ] **Step 4: Run full test suite**

```
npm test
```

Expected: 250 tests still passing. The change is backward-compatible — existing callers without rehype plugins still get sanitization with the now-slightly-broader allow-list.

### Task 3: Wire `highlightTerms` into `PlatformResultCard`, `ResultsTab`, `HistoryTab`

**Files:**
- Modify: `client/src/components/citations/PlatformResultCard.tsx`
- Modify: `client/src/components/citations/ResultsTab.tsx`
- Modify: `client/src/components/citations/HistoryTab.tsx`

**Why:** The plugin needs the brand-name terms (`brand.name + brand.nameVariations`) to operate. Passing them down from the parent tabs (which have access to `useBrandSelection`) is the cleanest approach.

- [ ] **Step 1: Add `highlightTerms` prop to `PlatformResultCard`**

In `client/src/components/citations/PlatformResultCard.tsx`:

(a) Add the import at the top:
```ts
import { createHighlightPlugin } from "@/lib/highlightTermsRehype";
```

(b) Extend the component signature. Find:
```tsx
export function PlatformResultCard({ result }: { result: PlatformResult }) {
```

Replace with:
```tsx
export function PlatformResultCard({
  result,
  highlightTerms = [],
}: {
  result: PlatformResult;
  highlightTerms?: string[];
}) {
```

(c) Find the SafeMarkdown render at line ~216:
```tsx
<SafeMarkdown>{result.fullResponse}</SafeMarkdown>
```

Replace with:
```tsx
<SafeMarkdown rehypePlugins={[createHighlightPlugin(highlightTerms)]}>
  {result.fullResponse}
</SafeMarkdown>
```

- [ ] **Step 2: Pass `highlightTerms` from `ResultsTab`**

In `client/src/components/citations/ResultsTab.tsx`:

(a) Find the existing import block at the top. Add:
```ts
import { useBrandSelection } from "@/hooks/use-brand-selection";
```

(b) Inside the component body (early, near the top), add:
```ts
const { selectedBrand } = useBrandSelection();
const highlightTerms = selectedBrand
  ? [selectedBrand.name, ...(selectedBrand.nameVariations ?? [])].filter(Boolean)
  : [];
```

(c) Find the existing PlatformResultCard render at line ~426:
```tsx
<PlatformResultCard key={`${plat.platform}-${j}`} result={plat} />
```

Replace with:
```tsx
<PlatformResultCard
  key={`${plat.platform}-${j}`}
  result={plat}
  highlightTerms={highlightTerms}
/>
```

- [ ] **Step 3: Same wiring in `HistoryTab.tsx`**

In `client/src/components/citations/HistoryTab.tsx`:

(a) Add the same `useBrandSelection` import.
(b) Add the same `highlightTerms` derivation inside the component body.
(c) Find the existing PlatformResultCard render at line ~462 and add the `highlightTerms={highlightTerms}` prop.

- [ ] **Step 4: Run typecheck + full suite**

```
npm run check
npm test
```

Expected: typecheck clean, 250 tests still passing.

- [ ] **Step 5: Manual smoke test**

`npm run dev`. Navigate to `/citations` for a brand with at least one cited result. Expand a `PlatformResultCard`. Confirm:
- The brand name is highlighted (yellow `<mark>` background) wherever it appears in the response markdown
- Variations from `brand.nameVariations` (e.g. "stripe.com") are also highlighted
- Code blocks (` ```js ... ``` `) and link texts within the response are NOT corrupted by the highlighting
- A response that doesn't mention the brand still renders normally (no errors)
- An empty/null response still renders the existing "no full response" fallback

### PR 3.1 verification gate

- [ ] **Final checks for PR 3.1:**

```
npm run check
npm test
npx eslint client/src/lib/highlightTermsRehype.ts client/src/components/SafeMarkdown.tsx client/src/components/citations/PlatformResultCard.tsx client/src/components/citations/ResultsTab.tsx client/src/components/citations/HistoryTab.tsx 2>&1 | tail -3
```

Expected: typecheck clean, 250 tests, 0 eslint errors on touched files.

---

## PR 3.2 — "Cited mentions" snippet strip above the per-platform accordion (~4 hours)

### Task 4: Build `extractSnippet` helper + 2 unit tests

**Files:**
- Create: `client/src/lib/extractSnippet.ts`
- Create: `tests/unit/extractSnippet.test.ts`

**Why:** When showing a "card per cited result," users need to see WHY each result is marked as cited. The card displays a snippet — the ±200 chars around where the brand name first appears. Logic-bearing pure function, gets a unit test.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/extractSnippet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractSnippet } from "../../client/src/lib/extractSnippet";

const LONG_TEXT =
  "ChatGPT, Claude, and Perplexity all power AI search. Stripe is a leading payment processor used by many companies in the SaaS space. " +
  "Other notable mentions include Square, Adyen, and PayPal. The payment processing market continues to evolve rapidly with new entrants. " +
  "Many businesses choose Stripe for its developer-friendly API and global reach. Documentation quality is also a key factor.";

describe("extractSnippet", () => {
  it("returns ±200 chars around first brand match with ellipsis boundaries", () => {
    const out = extractSnippet(LONG_TEXT, ["Stripe"], 50);
    // Should contain "Stripe" and have leading "…" (since the match isn't at start).
    expect(out).toContain("Stripe");
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    // Snippet length is bounded.
    expect(out.length).toBeLessThan(150); // ±50 + brand + 2 ellipses
  });

  it("returns leading text when no match found, with trailing ellipsis", () => {
    const out = extractSnippet(LONG_TEXT, ["Acme"], 50);
    expect(out.startsWith("…")).toBe(false); // no leading ellipsis when starting at idx 0
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(101); // 100 chars + ellipsis
  });

  it("matches case-insensitive with word boundaries", () => {
    const out = extractSnippet("Pre-text. STRIPE is great. Post-text.", ["Stripe"], 20);
    expect(out).toContain("STRIPE");
  });

  it("returns full text without ellipsis when shorter than 2*radius", () => {
    const short = "Hello Stripe world.";
    const out = extractSnippet(short, ["Stripe"], 100);
    expect(out).toBe(short); // no truncation needed
    expect(out).not.toContain("…");
  });

  it("uses longest term first when multiple variations match", () => {
    const text = "Stripe Inc is a payment processor.";
    const out = extractSnippet(text, ["Stripe", "Stripe Inc"], 50);
    // We just confirm it didn't crash and snippet contains the brand.
    expect(out).toContain("Stripe");
  });

  it("returns empty string for empty text input", () => {
    expect(extractSnippet("", ["Stripe"], 50)).toBe("");
  });
});
```

- [ ] **Step 2: Run the test, expect 6 failures (function doesn't exist)**

```
npx vitest run tests/unit/extractSnippet.test.ts
```

- [ ] **Step 3: Create `client/src/lib/extractSnippet.ts`**

```ts
/** Returns ±radius chars around the first case-insensitive, word-boundary
 *  match of any of `terms` within `text`. Adds "…" boundaries when
 *  truncated. If no match is found, returns the leading 2*radius chars
 *  (or full text if shorter) with a trailing "…". Pure function. */
export function extractSnippet(text: string, terms: string[], radius = 200): string {
  if (!text) return "";

  // Sort longest-first so "Stripe Inc" wins over "Stripe" when both are
  // candidates. Same approach as the rehype highlight plugin.
  const candidates = terms
    .filter((t) => t && t.trim().length > 0)
    .sort((a, b) => b.length - a.length);

  let matchIdx = -1;
  let matchLen = 0;

  for (const term of candidates) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    const m = re.exec(text);
    if (m && (matchIdx === -1 || m.index < matchIdx)) {
      matchIdx = m.index;
      matchLen = m[0].length;
    }
  }

  // No match found → return leading chunk with trailing ellipsis.
  if (matchIdx === -1) {
    if (text.length <= 2 * radius) return text;
    return text.slice(0, 2 * radius) + "…";
  }

  const start = Math.max(0, matchIdx - radius);
  const end = Math.min(text.length, matchIdx + matchLen + radius);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}
```

- [ ] **Step 4: Run the test, expect 6 passes**

```
npx vitest run tests/unit/extractSnippet.test.ts
```

- [ ] **Step 5: Run typecheck + full suite**

```
npm run check
npm test
```

Expected: typecheck clean, **256 tests passing** (250 + 6 new).

### Task 5: Build `CitedMentionsStrip` component + wire into ResultsTab

**Files:**
- Create: `client/src/components/citations/CitedMentionsStrip.tsx`
- Modify: `client/src/components/citations/ResultsTab.tsx`

**Why:** Users today have to expand each `PlatformResultCard` to see if THIS one cited their brand. Click-heavy. The strip surfaces all cited results at the top of the page as scannable cards.

- [ ] **Step 1: Create `client/src/components/citations/CitedMentionsStrip.tsx`**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { extractSnippet } from "@/lib/extractSnippet";

const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  Claude: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  Gemini: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  Perplexity: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  DeepSeek: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
};

export type CitedMention = {
  /** Platform name, e.g. "ChatGPT", "Perplexity" */
  platform: string;
  /** Truncated prompt text */
  prompt: string;
  /** Full AI response text — used to extract a snippet. May be null
   *  if the response wasn't stored, in which case we fall back to the
   *  saved citationContext snippet. */
  fullResponse: string | null;
  /** Pre-computed citation context (may be the same as the snippet
   *  extracted on-the-fly; this is the saved one from geo_rankings). */
  savedSnippet: string | null;
  /** Optional anchor: if the parent provides an onClick, the card
   *  becomes interactive — typically scrolls to the matching
   *  PlatformResultCard in the accordion below. */
  onClick?: () => void;
};

interface CitedMentionsStripProps {
  mentions: CitedMention[];
  highlightTerms: string[];
}

export default function CitedMentionsStrip({ mentions, highlightTerms }: CitedMentionsStripProps) {
  if (mentions.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Where you were cited</h3>
          <span className="text-xs text-muted-foreground">{mentions.length} mention{mentions.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {mentions.map((m, i) => {
            const platformClass =
              PLATFORM_COLORS[m.platform] ?? "bg-muted text-foreground border-border";
            // Prefer extracting a snippet from the full response (200 chars
            // around the first brand match). Fall back to the saved snippet
            // if no full response is available.
            const snippet = m.fullResponse
              ? extractSnippet(m.fullResponse, highlightTerms, 150)
              : (m.savedSnippet ?? "");
            return (
              <button
                key={`${m.platform}-${i}`}
                type="button"
                onClick={m.onClick}
                disabled={!m.onClick}
                className={[
                  "snap-start min-w-[280px] max-w-[320px] text-left rounded-lg border p-3",
                  m.onClick
                    ? "hover:border-primary/40 hover:shadow-sm cursor-pointer transition-colors"
                    : "cursor-default",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={[
                      "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border",
                      platformClass,
                    ].join(" ")}
                  >
                    {m.platform}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 mb-1.5">{m.prompt}</p>
                <p className="text-xs leading-relaxed line-clamp-3">{snippet || "(no snippet)"}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire `<CitedMentionsStrip />` into `ResultsTab.tsx`**

In `client/src/components/citations/ResultsTab.tsx`:

(a) Add the import at the top:
```ts
import CitedMentionsStrip, { type CitedMention } from "./CitedMentionsStrip";
```

(b) Inside the component body, after the existing query for results data, derive the cited-mention list. Find the existing `results` data structure (the parent renders by-platform stats + the per-prompt accordion). Compute:

```ts
// Flatten cited platform results into a single list for the strip.
// Each entry corresponds to one (prompt × platform) where isCited === true.
const citedMentions: CitedMention[] = (results?.byPrompt ?? []).flatMap((promptRow) =>
  (promptRow.platforms ?? [])
    .filter((p) => p.isCited && (p.fullResponse || p.snippet))
    .map((p) => ({
      platform: p.platform,
      prompt: promptRow.prompt,
      fullResponse: p.fullResponse,
      savedSnippet: p.snippet,
      // Future enhancement: scroll-to or expand the matching accordion item.
      onClick: undefined,
    })),
);
```

(Adapt the field names — `results.byPrompt`, `promptRow.platforms`, `promptRow.prompt`, `p.isCited`, `p.fullResponse`, `p.snippet` — to whatever the actual `results` data structure uses in this file. Read the file and match the shape.)

(c) Render the strip ABOVE the existing per-platform stats card. Find the JSX where the by-platform stats card and per-prompt accordion render. Insert before:

```tsx
{citedMentions.length > 0 && (
  <CitedMentionsStrip mentions={citedMentions} highlightTerms={highlightTerms} />
)}
{/* existing by-platform stats card stays here */}
```

(`highlightTerms` was added as a local var in PR 3.1's Task 3 step 2 — already in scope.)

- [ ] **Step 3: Run typecheck + tests**

```
npm run check
npm test
```

Expected: typecheck clean, 256 tests passing (no new tests for the layout-only strip).

- [ ] **Step 4: Manual smoke test**

`npm run dev`. Navigate to `/citations` for a brand with multiple cited results. Confirm:
- A "Where you were cited" card renders ABOVE the existing per-platform stats card
- One card per cited result, scrollable horizontally on narrow screens
- Each card shows: platform pill, truncated prompt, snippet
- The snippet is the ±150-char window around the brand name (NOT just the first 300 chars of the response)
- When `totalCited === 0`, the strip does NOT render (component returns null) — the existing `<EmptyResultsHero />` from Phase 1 still renders elsewhere
- Mobile (375px): cards scroll horizontally with snap, no page-level overflow

### PR 3.2 verification gate

- [ ] **Final checks:**

```
npm run check
npm test
npx eslint client/src/lib/extractSnippet.ts client/src/components/citations/CitedMentionsStrip.tsx 2>&1 | tail -3
```

Expected: typecheck clean, 256 tests, 0 eslint errors on touched files.

---

## PR 3.3 — Extract source URLs migration + UI (~1 day)

### Task 6: Investigation step — check Perplexity/ChatGPT Search structured citations

**Files:** none (read-only investigation)

**Why:** Per the spec's PR 3.3 "Investigation step at top of implementation" — before writing the URL extractor, see whether Perplexity / ChatGPT Search already return structured citations in the API response that we're currently dropping. If yes, fold structured-citation capture into PR 3.3 with minimal extra work. If no (i.e., requires new API calls or significant adapter work), defer to a future PR 3.5.

- [ ] **Step 1: Read the Perplexity + ChatGPT Search response handling in `server/citationChecker.ts`**

Look for the platform-specific response parsing code. Specifically grep for:
```
grep -nE "perplexity|Perplexity|chatgpt-search|search_results|citations" server/citationChecker.ts | head -20
```

For each platform, identify:
- Does the API response include a `citations` field, `web_results` field, or similar structured-citation array?
- If yes: are we currently reading it (and what variable holds it)? Or is it being dropped?
- If we're dropping it: how many lines to capture it? <20 lines = fold into PR 3.3. >20 lines or requires new API call = defer.

- [ ] **Step 2: Decision point**

**If structured citations are cheap to capture (the data is in `response.citations` or `response.web_results` and we're dropping it):**
- Extend the URL extractor in Task 7 to ALSO accept the structured citations as a starting set
- The text-extraction is then additive (catches plain URLs in the response body that aren't in the structured list)

**If it requires new API calls or significant adapter work:**
- Document the deferral in a comment in `server/citationChecker.ts` near the relevant platform's handling
- Continue with the universal text-extraction approach in Task 7

- [ ] **Step 3: Document the decision in this PR**

In your PR description (or RUNBOOK), note:
- "Investigated Perplexity structured citations: [findings]"
- "Investigated ChatGPT Search structured citations: [findings]"
- "Decision: [folded into Task 7 / deferred to PR 3.5 because <reason>]"

### Task 7: Add `cited_urls` column via migration + Drizzle schema

**Files:**
- Create: `migrations/0047_geo_rankings_cited_urls.sql`
- Modify: `shared/schema.ts` (add `citedUrls` field to `geoRankings` table)

- [ ] **Step 1: Create the migration**

Create `migrations/0047_geo_rankings_cited_urls.sql`:

```sql
-- Phase 3 (A3 citation locations): capture the list of URLs the LLM cited
-- in its response, in addition to the single citingOutletUrl that the
-- matcher pass derives. Many AI responses cite multiple URLs (footnote
-- style); previously we were dropping all but the first one.
--
-- TEXT[] is bounded application-side at 20 URLs per response (paranoid
-- cap — real responses cite 0–10).
--
-- Backward-compatible: column is nullable, existing rows stay null.
-- The UI guards with `result.citedUrls?.length > 0` so old rows render
-- without the new section.

ALTER TABLE geo_rankings ADD COLUMN IF NOT EXISTS cited_urls TEXT[];
```

- [ ] **Step 2: Add the column to Drizzle's `geoRankings` schema**

In `shared/schema.ts`, find the `geoRankings` table definition (line ~521). Find the existing column block. Add `citedUrls` near the bottom (before the indexes block):

```ts
export const geoRankings = pgTable(
  "geo_rankings",
  {
    // ... existing columns ...
    citingOutletUrl: text("citing_outlet_url"),
    citingOutletName: text("citing_outlet_name"),
    // ... existing columns ...
    metadata: jsonb("metadata"),
    // NEW: full list of URLs the LLM cited in its response. Set by
    // citationChecker via extractCitedUrls(responseText). Capped at
    // 20 entries application-side. Existing rows stay null.
    citedUrls: text("cited_urls").array(),
  },
  (table) => [
    // ... existing indexes ...
  ],
);
```

(Adapt the exact placement to match the existing column ordering style. The new column goes alongside the other URL-related columns for readability.)

- [ ] **Step 3: Verify the migration is detectable by drizzle-kit**

```
npx drizzle-kit check
```

Expected: clean (drift detection is happy because the new SQL file matches the new schema).

- [ ] **Step 4: Run typecheck**

```
npm run check
```

Expected: clean. New `citedUrls` field is now part of the inferred Drizzle type for inserts/selects.

### Task 8: Build `extractCitedUrls` server helper + 3 unit tests (TDD)

**Files:**
- Create: `server/lib/urlExtractor.ts`
- Create: `tests/unit/urlExtractor.test.ts`

**Why:** Pure function for extracting + deduplicating + capping URLs from response text. Tested independently because the citation pipeline is heavy to integration-test.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/urlExtractor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractCitedUrls } from "../../server/lib/urlExtractor";

describe("extractCitedUrls", () => {
  it("extracts URLs from markdown link syntax", () => {
    const text =
      "Stripe is great. See [Stripe docs](https://stripe.com/docs) and [their pricing](https://stripe.com/pricing) for more.";
    const urls = extractCitedUrls(text);
    expect(urls).toContain("https://stripe.com/docs");
    expect(urls).toContain("https://stripe.com/pricing");
    expect(urls).toHaveLength(2);
  });

  it("extracts plain URLs and strips trailing punctuation", () => {
    const text = "Visit https://stripe.com. Also see https://docs.stripe.com/api, plus https://example.com/path?q=1.";
    const urls = extractCitedUrls(text);
    expect(urls).toContain("https://stripe.com");
    expect(urls).toContain("https://docs.stripe.com/api");
    expect(urls).toContain("https://example.com/path?q=1");
    // Trailing periods/commas removed.
    expect(urls).not.toContain("https://stripe.com.");
    expect(urls).not.toContain("https://docs.stripe.com/api,");
  });

  it("dedupes case-insensitive on hostname, exact on path", () => {
    const text =
      "https://stripe.com/docs and https://STRIPE.COM/docs and https://stripe.com/Docs";
    const urls = extractCitedUrls(text);
    // Hostname dedupe (case-insensitive): stripe.com == STRIPE.COM
    // Path dedupe (exact): /docs and /Docs are different
    expect(urls).toHaveLength(2);
  });

  it("rejects non-http(s) schemes", () => {
    const text =
      "Visit javascript:alert(1) or file:///etc/passwd or data:text/plain;base64,YWJj — but https://stripe.com is fine.";
    const urls = extractCitedUrls(text);
    expect(urls).toEqual(["https://stripe.com"]);
  });

  it("rejects URLs without a dot in hostname (localhost, intranet)", () => {
    const text = "http://localhost:3000 and http://internal-server are not valid; https://stripe.com is.";
    const urls = extractCitedUrls(text);
    expect(urls).toEqual(["https://stripe.com"]);
  });

  it("caps at 20 URLs per response", () => {
    const text = Array.from({ length: 50 }, (_, i) => `https://site${i}.com`).join(" ");
    const urls = extractCitedUrls(text);
    expect(urls).toHaveLength(20);
    expect(urls[0]).toBe("https://site0.com");
    expect(urls[19]).toBe("https://site19.com");
  });

  it("returns empty array for empty input", () => {
    expect(extractCitedUrls("")).toEqual([]);
    expect(extractCitedUrls("No URLs here, just text.")).toEqual([]);
  });

  it("truncates URLs longer than 2 KB", () => {
    const longPath = "x".repeat(3000);
    const text = `Visit https://example.com/${longPath} for details.`;
    const urls = extractCitedUrls(text);
    expect(urls).toHaveLength(1);
    expect(urls[0].length).toBeLessThanOrEqual(2048);
  });
});
```

- [ ] **Step 2: Run the tests, expect 8 failures**

```
npx vitest run tests/unit/urlExtractor.test.ts
```

- [ ] **Step 3: Create `server/lib/urlExtractor.ts`**

```ts
const MAX_URLS = 20;
const MAX_URL_LENGTH = 2048;

// Matches markdown links AND plain http(s) URLs. Captured group is the
// URL itself. Stops at whitespace, closing brackets/parens, or ", < >.
const URL_PATTERN = /(?:\[[^\]]*\]\((https?:\/\/[^\s)<>"]+)\))|(https?:\/\/[^\s)<>"]+)/g;

// Trailing punctuation that shouldn't be part of the URL when extracted
// from prose (sentences end with these). Note: "?" is intentionally NOT
// stripped because URLs commonly end with query strings.
const TRAILING_PUNCT = /[.,;:!]+$/;

/** Extract URLs the LLM cited in its response text. Handles markdown
 *  links + plain URLs. Strips trailing punctuation. Validates http/https
 *  + hostname-with-dot. Dedupes case-insensitive on hostname, exact on
 *  path. Caps at 20 URLs and 2 KB per URL. Pure function. */
export function extractCitedUrls(text: string): string[] {
  if (!text) return [];

  const seen = new Map<string, string>(); // dedupe key (host.lower + path) → original URL
  const ordered: string[] = []; // preserve insertion order

  // Reset the global regex state because RegExp.exec is stateful.
  URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    let url = raw.replace(TRAILING_PUNCT, "");
    if (url.length > MAX_URL_LENGTH) {
      url = url.slice(0, MAX_URL_LENGTH);
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (!parsed.hostname.includes(".")) continue;

    const dedupeKey = `${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}`;
    if (seen.has(dedupeKey)) continue;
    seen.set(dedupeKey, url);
    ordered.push(url);

    if (ordered.length >= MAX_URLS) break;
  }

  return ordered;
}
```

- [ ] **Step 4: Run the tests, expect all passing**

```
npx vitest run tests/unit/urlExtractor.test.ts
```

If any test fails, common causes:
- Trailing punctuation: the test asserts `https://example.com/path?q=1` remains intact (no trailing punct stripped from `?q=1`). Confirm `TRAILING_PUNCT` doesn't include `?`.
- Cap behavior: ordered insertion + early-break should yield exactly 20 results given 50 unique inputs.
- Hostname check: ensure `parsed.hostname.includes(".")` correctly rejects `localhost` and `internal-server`.

- [ ] **Step 5: Run typecheck + full suite**

```
npm run check
npm test
```

Expected: typecheck clean, **264 tests passing** (256 + 8 new).

### Task 9: Wire `extractCitedUrls` into the citation pipeline

**Files:**
- Modify: `server/citationChecker.ts` (line ~935 — `storage.createGeoRanking` call)

**Why:** This is the single write site for `geo_rankings`. Adding `citedUrls` to the values object captures the URLs at the time the row is written.

- [ ] **Step 1: Add the import at the top of `server/citationChecker.ts`**

```ts
import { extractCitedUrls } from "./lib/urlExtractor";
```

- [ ] **Step 2: Add `citedUrls` to the createGeoRanking call**

Find line ~935:
```ts
const row = await storage.createGeoRanking({
  articleId: null,
  brandPromptId: bp.id,
  runId: citationRun.id,
  aiPlatform: platform,
  prompt: bp.prompt,
  rank,
  isCited: isCited ? 1 : 0,
  citationContext,
  citingOutletUrl,
  sourceType,
  authorityScore,
  relevanceScore: relevance,
  sentiment: brandSentiment,
  checkedAt: new Date(),
} as any);
```

Add `citedUrls` in the values object:
```ts
const row = await storage.createGeoRanking({
  articleId: null,
  brandPromptId: bp.id,
  runId: citationRun.id,
  aiPlatform: platform,
  prompt: bp.prompt,
  rank,
  isCited: isCited ? 1 : 0,
  citationContext,
  citingOutletUrl,
  citedUrls: extractCitedUrls(responseText),
  sourceType,
  authorityScore,
  relevanceScore: relevance,
  sentiment: brandSentiment,
  checkedAt: new Date(),
} as any);
```

(`responseText` is the variable holding the full LLM response in this scope. Verify the variable name by reading the surrounding function — it may be `text`, `response`, `body`, etc. Adapt as needed.)

- [ ] **Step 3: Run typecheck + tests**

```
npm run check
npm test
```

Expected: typecheck clean, 264 tests passing. Existing `citationChecker.matcherAuthority.test.ts` and similar tests should still pass — they don't assert on the new field.

### Task 10: Render `cited_urls` in `PlatformResultCard`

**Files:**
- Modify: `client/src/components/citations/PlatformResultCard.tsx`

**Why:** The captured URLs need a UI surface. Render as a "Sources cited in response" pill list below the markdown, using `rel="noopener noreferrer"` because these are external URLs from untrusted AI output.

- [ ] **Step 1: Extend the `PlatformResult` type in `PlatformResultCard.tsx`**

Find the existing `PlatformResult` type (line ~15):

```ts
export type PlatformResult = {
  platform: string;
  isCited: boolean;
  snippet: string | null;
  fullResponse: string | null;
  checkedAt: string;
  reDetectedAt?: string | null;
  prompt?: string;
};
```

Add `citedUrls`:

```ts
export type PlatformResult = {
  platform: string;
  isCited: boolean;
  snippet: string | null;
  fullResponse: string | null;
  checkedAt: string;
  reDetectedAt?: string | null;
  prompt?: string;
  /** Phase 3: list of URLs the LLM cited in its response. Null on
   *  rows written before migration 0047. */
  citedUrls?: string[] | null;
};
```

- [ ] **Step 2: Render the cited-URLs section below the SafeMarkdown**

Find the SafeMarkdown render (line ~216 area):

```tsx
<SafeMarkdown rehypePlugins={[createHighlightPlugin(highlightTerms)]}>
  {result.fullResponse}
</SafeMarkdown>
```

After it, add:

```tsx
{result.citedUrls && result.citedUrls.length > 0 && (
  <div className="mt-4 border-t pt-3">
    <p className="text-xs text-muted-foreground mb-2">Sources cited in response</p>
    <div className="flex flex-wrap gap-2">
      {result.citedUrls.map((url) => {
        let hostname = url;
        try {
          hostname = new URL(url).hostname;
        } catch {
          // Defensive — render the raw URL if URL parsing fails.
        }
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 rounded bg-secondary hover:bg-accent transition-colors"
            title={url}
          >
            {hostname}
          </a>
        );
      })}
    </div>
  </div>
)}
```

`rel="noopener noreferrer"` is critical — these URLs come from external AI output and must not be allowed to script the parent window or leak referrer.

- [ ] **Step 3: Run typecheck + tests**

```
npm run check
npm test
```

Expected: typecheck clean, 264 tests passing.

- [ ] **Step 4: Manual smoke test**

`npm run dev`. To see new cited URLs render, you'd need to run a fresh citation check (because old rows have `cited_urls = null`). Two ways to verify without running a full check:

(a) Inspect an old row in DevTools → Network → look at the `/results` API response for an existing brand. Confirm `citedUrls` is `null` or `undefined` for old rows → component correctly skips the section (no errors).

(b) For a fresh test, manually insert a test row in the DB:
```sql
UPDATE geo_rankings
SET cited_urls = ARRAY['https://stripe.com/docs', 'https://example.com/article']
WHERE id = '<some-id>';
```
Reload the citations page → confirm the "Sources cited in response" pill list renders with both URLs.

(c) Run a fresh citation check (the cleanest test). Expand a result. Confirm cited URLs appear as pills.

### PR 3.3 verification gate

- [ ] **Final checks:**

```
npm run check
npm test
npx eslint server/lib/urlExtractor.ts server/citationChecker.ts client/src/components/citations/PlatformResultCard.tsx shared/schema.ts 2>&1 | tail -3
```

Expected: typecheck clean, 264 tests passing, 0 eslint errors on touched files.

Plus migration sanity:
```
npx drizzle-kit check
```
Expected: clean — schema and migration agree.

---

## Final verification

### Task 11: End-to-end Phase 3 verification

- [ ] **Step 1: Full type + test + lint pass**

```
npm run check
npm test
npx eslint server/ client/src/ 2>&1 | tail -3
```

Expected:
- typecheck clean
- **264 tests passing** (244 baseline + 20 new across the 3 PRs)
- 0 eslint errors. Warnings unchanged.

- [ ] **Step 2: Manual smoke test**

`npm run dev`. Navigate to `/citations` for a brand with cited results.

Verify the visible improvements (in order):
1. **CitedMentionsStrip** at the top: scrollable horizontal cards, one per cited result, showing platform + prompt + snippet
2. **Per-platform stats card** (existing) renders below
3. **Per-prompt accordion** (existing) renders below that — expand a card to see:
   - Brand name highlighted (`<mark>` yellow background) wherever it appears in the markdown response
   - Code blocks and links inside the response NOT corrupted
   - "Sources cited in response" pill list below the markdown if `citedUrls` was populated for this row (won't appear for pre-migration rows)

Mobile (375px):
- CitedMentionsStrip cards scroll horizontally (no page-level overflow)
- Cited-URLs pills wrap onto multiple lines

Edge cases:
- Brand with 0 cited results: CitedMentionsStrip doesn't render (returns null); the existing `<EmptyResultsHero />` from Phase 1 still renders
- A response that doesn't mention the brand: highlighting is a no-op, no crash
- An old row without `citedUrls`: the new pills section is skipped (component guards with `result.citedUrls?.length > 0`)

- [ ] **Step 3: Verify diff footprint**

```
git diff --stat client/ server/ shared/ migrations/ 2>&1 | tail -20
git status --short | grep -E "highlightTermsRehype|extractSnippet|CitedMentionsStrip|urlExtractor|0047_geo_rankings"
```

Expected modified files:
- `client/src/components/SafeMarkdown.tsx`
- `client/src/components/citations/PlatformResultCard.tsx`
- `client/src/components/citations/ResultsTab.tsx`
- `client/src/components/citations/HistoryTab.tsx`
- `server/citationChecker.ts`
- `shared/schema.ts`

Expected new (untracked) files:
- `client/src/lib/highlightTermsRehype.ts`
- `client/src/lib/extractSnippet.ts`
- `client/src/components/citations/CitedMentionsStrip.tsx`
- `server/lib/urlExtractor.ts`
- `migrations/0047_geo_rankings_cited_urls.sql`
- `tests/unit/highlightTermsRehype.test.ts`
- `tests/unit/extractSnippet.test.ts`
- `tests/unit/urlExtractor.test.ts`

- [ ] **Step 4: Report Phase 3 complete**

Summarize what changed: brand mentions highlighted in responses, cited-mentions strip surfaces all matches above the accordion, source URLs from AI responses are extracted on write and rendered as a pill list. 20 new tests added. Migration 0047 will run on next boot.

---

## What this plan does NOT do

Per the spec's "Open items / follow-up specs" section, Phase 3 deliberately does not:

- **PR 3.5 — Perplexity / ChatGPT Search structured citations** — the investigation step in Task 6 decides whether to fold this in or defer. If deferred, becomes a separate plan.
- Backfill `cited_urls` for old rows — only new citation runs from this point onward populate the column. Old rows render without the pill list section.
- Show URL text labels (only hostnames render in the pills) — pulling page titles would require a separate fetch per URL, expensive at scale; deferred.
- Filter the URL list to "authoritative" sources only — every URL the LLM cited is rendered, sorted by appearance order. Quality scoring is a separate concern.
- Add UI toggles to expand/collapse the highlighting — always-on per the spec.
- Build a "click strip card → scroll to accordion" interaction — the strip's `onClick` prop is supported by `CitedMentionsStrip` but left unwired in `ResultsTab` for now (out of scope; ~15 min to add later if user feedback wants it).

---

## Vercel Hobby compatibility

- One new migration (`0047_*`) — runs once on next boot via the existing `applyMigrations()` runner (tracked in `schema_migrations` table)
- Per-write CPU cost: <5 ms additional per geo_rankings INSERT (regex + URL parsing on text up to ~20 KB). Negligible vs. the 2–10s the LLM call already took.
- DB storage long-term: ~20 MB at 100x current scale (cap at 20 URLs × ~100 chars each per row, ~10K rows in geo_rankings = ~20 MB). Supabase Free 500 MB still safe through pre-launch.
- Zero new endpoints, functions, crons, env vars, or dependencies.
- Bundle delta: ~+10 KB (rehype plugin + snippet helper + cited-strip + cited-URLs pill section).

---

## Test count delta

| Task | Tests added |
|---|---|
| Task 1 (highlightTermsRehype) | 6 unit |
| Task 4 (extractSnippet) | 6 unit |
| Task 8 (urlExtractor) | 8 unit |
| **Phase 3 total** | **20 new** |

Final test count: **264** (244 baseline + 20 new).
