# Implementation Plan: Universal citation & mention detection

Companion to [2026-04-25-universal-citation-detection-design.md](2026-04-25-universal-citation-detection-design.md).

---

## Phase 1 — Foundation (new code only, no behavior change)

**Goal:** ship the matcher and schema without wiring it into any caller yet. Zero risk of regression.

### 1.1 Schema migration

`migrations/0034_competitor_name_variations.sql`:

```sql
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS name_variations text[] DEFAULT ARRAY[]::text[];

ALTER TABLE geo_rankings
  ADD COLUMN IF NOT EXISTS re_detected_at timestamp;

CREATE INDEX IF NOT EXISTS geo_rankings_re_detected_at_idx
  ON geo_rankings(re_detected_at)
  WHERE re_detected_at IS NOT NULL;
```

### 1.2 Schema TypeScript

`shared/schema.ts`:
- Add `nameVariations: text("name_variations").array().default(sql\`ARRAY[]::text[]\`)` to `competitors` table
- Add `reDetectedAt: timestamp("re_detected_at")` to `geoRankings` table
- Regenerate `InsertCompetitor` / `Competitor` types via drizzle-zod

### 1.3 The matcher

`server/lib/brandMatcher.ts` — new file:

```ts
export type MatchResult = {
  matched: boolean;
  hitVariants: string[];
  positions: number[];
};

export type TrackedEntity = {
  id: string;
  name: string;
  nameVariations: string[];
  website?: string | null;
  domain?: string | null;
};

export type DetectionResult = {
  brand: MatchResult;
  competitors: Array<{
    competitorId: string;
    competitorName: string;
    result: MatchResult;
  }>;
};

export function detectBrandAndCompetitors(
  text: string,
  brand: TrackedEntity,
  competitors: TrackedEntity[],
): DetectionResult;

// Exposed for callers that only care about one entity
export function matchEntity(text: string, entity: TrackedEntity): MatchResult;

// Exposed for preview/debug
export function compileVariantPatterns(entity: TrackedEntity): CompiledPattern[];
```

Internal pieces:
- `escapeRegex(str)` — standard regex escape
- `isDomainVariant(str)` — returns true if no whitespace + contains `.`
- `foldDiacritics(str)` — reuse existing helper from citationChecker.ts, extract to shared file
- `AMBIGUOUS_WORDS` — Set of common English words + generic business terms (initial list extracted from `AMBIGUOUS_GENERIC_WORDS` in citationChecker.ts, expanded with common English stopwords)
- `SIGNAL_WORDS` — regex alternation of tokens that qualify an ambiguous variant: `/\b(company|companies|app|apps|platform|platforms|saas|startup|startups|founded|acquired|ipo|ceo|cto|website|brand|product|team|labs|inc|corp|founder)\b/i`

Matching rules per variant type:

| Type | Detection | Regex shape |
|---|---|---|
| Domain (no spaces, has `.`) | Domain-aware | `(?:^|[\s/:<>"'])(?:www\\.)?<escaped>(?=[/\\s?#:<>"']|$)` |
| Short (≤3 chars) or in AMBIGUOUS_WORDS | Whole word + proximity | `\\b<escaped>(?:[''’]s)?\\b` AND SIGNAL_WORDS within ±60 chars |
| Multi-word | Whole word + flexible whitespace | `\\b<words-joined-by-\\s+>(?:[''’]s)?\\b` |
| Default | Whole word + possessive | `\\b<escaped>(?:[''’]s)?\\b` |

All matching case-insensitive. `foldDiacritics` applied to both text and variant before regex.

### 1.4 Tests

`tests/brandMatcher.test.ts` — new file. Covers every case in the spec's test table plus:
- Empty variants list returns not-matched
- Unicode: "Nestlé" variant matches "Nestle" in text (diacritic folding)
- Overlapping variants: "Notion" and "Notion Labs" both present → both fire
- Domain variant doesn't match inside a word: `anotion.so` no, `docs.notion.so` yes
- Possessive with curly apostrophe: "Notion's" matches via `[''’]`
- Newline between multi-word variant parts: "Notion\nLabs" matches "Notion Labs" variant
- Signal-word boundary: exact 60-char gap matches, 61-char gap doesn't

### 1.5 Storage layer

`server/databaseStorage.ts`:
- `getCompetitorById(id)` — returns single row or null (may already exist; verify)
- `updateCompetitor(id, patch)` — check if exists; add `nameVariations` to updateable fields
- `addBrandNameVariation(brandId, variant)` — appends to `brands.nameVariations` only if not already present (case-insensitive)
- `addCompetitorNameVariation(competitorId, variant)` — same for competitors
- `setGeoRankingReDetected(rankingId)` — sets `re_detected_at = NOW()`, `is_cited = 1`, `rank = NULL`

### 1.6 Verification

- `npm run check` passes
- `npm test -- brandMatcher` — all matcher tests green
- Apply migration locally; confirm competitor rows have `nameVariations: []`
- No caller changes yet — existing functionality identical

**Ship this as one PR before moving on.**

---

## Phase 2 — Migrate callers (behavior changes)

**Goal:** every existing detection site calls the shared matcher. The old local matching code is deleted. LLM analyzers keep running for rank/relevance, but they stop being the source of truth for "is cited."

### 2.1 citationChecker.ts

- Delete `checkForCitation`, `buildBrandNameVariants`, `isAmbiguousGenericHit`, and the variant helper functions
- Replace call sites with `detectBrandAndCompetitors(responseText, brand, competitors)`
- Result mapping:
  - `result.brand.matched` → `isCited` integer
  - `result.competitors[]` → update `competitors_mentioned` on the ranking
- Keep `citationJudge.ts` call for `rank` and `relevance`, but ONLY when `result.brand.matched === true` (skip LLM when regex says no hit)

### 2.2 responseAnalyzer.ts

The current analyzer does two things: (a) LLM extracts all brands in the response, (b) local fuzzy-match to our tracked entities. Split:
- Keep (a): LLM still called to extract every brand in response → feeds the variant-learning loop
- Replace (b): tracked-entity matching now uses `detectBrandAndCompetitors`
- **Variant append:** for each LLM-extracted brand name that matches a tracked entity's variant *list* (case-insensitive), no-op. For each LLM-extracted brand that matches an entity by *name normalization* but the exact surface form isn't in `nameVariations`, call `addBrandNameVariation` or `addCompetitorNameVariation`.

### 2.3 mentionScanner.ts

- Replace the brand-variant search inside Reddit/HN/Quora content with `matchEntity(content, brand)`
- Mention row's `matched_variants` field stores `result.hitVariants` (new field needed? check schema — spec doesn't add it but we may need it for transparency; decide in Phase 2 implementation)
- Keep LLM sentiment judge — it's orthogonal

### 2.4 listicleScanner.ts

- After the LLM extracts list items, also run `detectBrandAndCompetitors` on the page text to update `competitors_mentioned` accurately
- `is_included` = `result.brand.matched` OR `parsed.mentionsBrand` (trust either path; pick matcher if they disagree)

### 2.5 wikipediaScanner.ts

- LLM classification decides topical relevance ("existing"/"opportunity"/"irrelevant") — keep
- `is_mentioned` uses shared matcher on intro extract → overrides LLM's guess if they disagree (matcher is authoritative for presence)

### 2.6 hallucinationDetector.ts

- Re-verification path (`reVerifyHallucinations`) uses `matchEntity(newText, {variants:[claimSnippet]})` — treat the 40-char claim snippet as a one-off variant
- Actually simpler: keep the existing `.includes(snippet)` here since it's a post-hoc snippet, not a brand name. Leave alone.

### 2.7 Tests

- Integration test: run `runBrandPrompts` on a canned response → confirm `isCited` matches new matcher, rank still populated from LLM
- Regression test: pick 5 real responses from `geo_rankings`, run old vs new detection, compare results. Document any divergences (expected: ~2% different due to fixing substring bugs)

### 2.8 Verification

- `npm run check`, `npm test` pass
- Spot check 3 brands in dev DB: run a citation check, confirm results render correctly
- Confirm variant-learning: force a response containing a new brand surface form, confirm it lands in `nameVariations`

**Ship as one PR.** Hold for one week of production observation before Phase 3 (gives the variant-learning loop time to show if it misbehaves).

---

## Phase 3 — Competitors UI (name variations editing)

**Goal:** competitors page gains an Edit dialog with a `nameVariations` field matching the brand's.

### 3.1 Competitor Edit dialog

Today `competitors.tsx` has add and delete but no edit. Add:
- `<Dialog>` controlled by `editingCompetitor: Competitor | null` state
- Fields: name, domain, industry, description, **nameVariations** (comma-separated text input)
- Pencil icon button on each competitor card opens the dialog
- Save calls `PATCH /api/competitors/:id` (add endpoint if missing)

### 3.2 PATCH endpoint

`server/routes/publications.ts`:
- `app.patch("/api/competitors/:id", ...)` — validate ownership via `requireCompetitor`, accept partial updates including `nameVariations`
- Coerces incoming string "a, b, c" to `["a","b","c"]` if client sends a string (mirrors how brands handle this)

### 3.3 Brand page parity check

Confirm the brand edit form already supports editing `nameVariations`. If not, add it in the same form (should be one-line addition to an existing field set). From the audit earlier, this already exists — double-check in implementation.

### 3.4 Verification

- Open competitors page, click edit on any competitor, change variants, save
- Refresh — variants persist
- Run citation check — new variants used in matching (they're read live from DB on each detection)

**Ship as one PR.** Small, low-risk.

---

## Phase 4 — Re-check endpoint + UI wiring

**Goal:** "Re-check stored" button runs shared matcher across all stored text for the selected brand, no LLM calls.

### 4.1 Endpoint

`POST /api/brand-prompts/:brandId/re-detect-all`

```ts
// Pseudo
const brand = await storage.getBrandById(brandId);
const competitors = await storage.getCompetitors(brandId);
const tracked = { brand, competitors };
const counts = { rankings: 0, mentions: 0, listicles: 0, wikipedia: 0 };

// Rankings
for (const r of await storage.getGeoRankingsByBrandId(brandId)) {
  if (!r.citationContext) continue;
  const text = extractResponseText(r.citationContext); // after "||| RAW_RESPONSE |||"
  const result = detectBrandAndCompetitors(text, brand, competitors);
  const newIsCited = result.brand.matched ? 1 : 0;
  const newCompetitorsMentioned = result.competitors
    .filter(c => c.result.matched)
    .map(c => c.competitorName);
  if (changedFrom(r, newIsCited, newCompetitorsMentioned)) {
    const isNewlyCited = newIsCited === 1 && r.isCited === 0;
    await storage.updateGeoRanking(r.id, {
      isCited: newIsCited,
      competitorsMentioned: newCompetitorsMentioned,
      rank: isNewlyCited ? null : r.rank,
      reDetectedAt: isNewlyCited ? new Date() : r.reDetectedAt,
    });
    counts.rankings++;
  }
}

// Same pattern for mentions, listicles, wikipedia
return { success: true, counts, durationMs };
```

- Runs synchronously inside the request (expected duration: <5s for typical user with ~500 rankings). If it grows, move to a job.
- Rate-limit: one re-check per brand per 60 seconds (prevent spam).

### 4.2 Client wiring

`client/src/pages/citations.tsx`:
- `backfillMutation` repointed from the old endpoint to `/re-detect-all`
- Button label stays "Re-check stored" (user-familiar)
- Toast shows the updated counts: `"Re-detected: 3 rankings, 1 mention updated."`
- Invalidates query keys: `brand-prompts/${brandId}/results`, `brand-prompts/${brandId}/history`, and any other surface reading the stored data

### 4.3 UI badge

`client/src/components/citations/PlatformResultCard.tsx` or wherever rankings render:
- If `ranking.reDetectedAt && ranking.rank === null` → show a small badge "Re-detected" with a tooltip "Newly cited via updated variants — rank not available"

### 4.4 Verification

Manual QA checklist:
- Add a new variant to a brand ("Acme Industries"). Confirm variant saved.
- Click "Re-check stored" on citations page.
- Verify: rankings where the stored response contained "Acme Industries" but no other variant now show `is_cited=true` with "Re-detected" badge.
- Delete that variant. Click re-check again. Those rankings flip back to `is_cited=false`.
- Confirm no LLM calls in server logs during re-check.
- Load test: 1000 rankings × re-check runs under 5s.

**Ship as one PR.**

---

## Cross-cutting concerns

### Backwards compatibility

- The change is a pure behavior improvement; no API contracts change.
- Stored data format unchanged — we overwrite existing fields in place.
- Rollback plan: revert each phase independently. Phase 2 is the only one with real-data side effects; keep a DB dump immediately before shipping Phase 2.

### Performance

- `detectBrandAndCompetitors` compiles regexes lazily per call. For hot loops (re-check across 1000+ rows), compile variant patterns once per brand at the start of the loop, pass into an inner `matchWithCompiled` function.
- Regex engine is Node's built-in RE2-free V8 regex — fine for this volume.

### Observability

- Emit a Pino log on every variant auto-append: `logger.info({ brandId, variant, source: 'llm-extraction' }, 'variant auto-appended')`
- Re-check endpoint logs total duration + per-surface counts
- Sentry capture on matcher throws (should never — defensive only)

### Data hygiene

Phase 2 will reveal some historically-miscounted rankings. Plan: after Phase 2 ships, auto-run `/re-detect-all` once per brand via a one-shot migration script so every user's stored data matches the new logic. (Separate operational script, not part of a PR.)

---

## Timeline estimate

| Phase | Complexity | Estimated PR size |
|---|---|---|
| 1. Foundation | Low — new code + migration | ~400 LOC + tests |
| 2. Migrate callers | Medium — 6 files touched + regression testing | ~600 LOC delta (mostly deletions) |
| 3. Competitors UI | Low | ~200 LOC |
| 4. Re-check endpoint + UI | Medium — new endpoint + client wiring | ~350 LOC |

Total: four PRs, each reviewable in one sitting.

---

## Open questions to resolve before coding

1. **`matched_variants` on brand_mentions** — spec didn't add this column. Phase 2.3 asks: do we want to expose which variant fired for each mention? Nice-to-have for debugging but not required. Default: skip, add if requested.
2. **Rate limit on re-check** — 60s is a guess. Revisit if users complain.
3. **Migration script for stored data after Phase 2** — separate from the phase-2 PR, but needs running. Owner: whoever ships Phase 2.
