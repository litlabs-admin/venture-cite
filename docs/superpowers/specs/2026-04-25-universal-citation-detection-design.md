# Spec: Universal citation & mention detection

## Problem

VentureCite currently has **9 distinct detection methods** for "is brand/competitor cited or mentioned in this text." They disagree with each other, drift apart as they evolve independently, and produce inconsistent results across pages. Specific failure modes:

- Substring matching ("PR" matches "production", "Nova" matches "supernova") without whole-word boundaries on the legacy path
- Same response analyzed by both the merged analyzer and the legacy pre-filter + judge, then written to different fields
- External scanners (Reddit/Wikipedia/listicle) use slightly different matching rules from AI-response scanners
- No way to re-detect against stored responses when variants change — the user adds "Notion Labs" as a variant and the existing data doesn't catch up

The goal is one detection *contract* used everywhere, backed by whole-word variant matching against a dynamic per-brand and per-competitor `nameVariations` list that grows over time from LLM extraction.

## Scope

**In scope:**
- One shared matcher function used by every surface that asks "is this brand/competitor referenced."
- `nameVariations` column added to `competitors` (mirrors existing `brands.nameVariations`).
- User-editable variant lists for brands (already exists) and competitors (new).
- LLM-surfaced variants auto-appended directly to the relevant entity's variant list.
- "Re-check stored" button that re-runs matching against all stored text without calling any AI.

**Out of scope:**
- Rank/relevance scoring without an LLM — still uses LLM when available; re-check sets `rank=null` for newly-revealed citations.
- Multi-language variant handling beyond what the current diacritic-folding already does.
- Plural matching ("Notions" → "Notion") — user must add the plural explicitly if they care.
- Retiring the LLM analyzer — it still produces rank/relevance; we just stop depending on it to *find* the brand.

---

## Architecture

### The shared matcher

One function, one file: `server/lib/brandMatcher.ts`.

```ts
export type MatchResult = {
  matched: boolean;
  hitVariants: string[];      // which variant strings fired
  positions: number[];        // character offsets of hits (for snippet highlighting)
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
  brand: { id: string; name: string; nameVariations: string[]; website?: string | null },
  competitors: Array<{ id: string; name: string; nameVariations: string[]; domain?: string | null }>,
): DetectionResult;
```

**Every current caller — `citationChecker.ts`, `mentionScanner.ts`, `listicleScanner.ts`, `wikipediaScanner.ts`, `responseAnalyzer.ts` — replaces its local detection with a call to this function.**

### Matching rules

Each variant is compiled into a regex based on its shape:

1. **Name variant (default path)** — whole word with possessive tolerance:
   - Pattern: `\b<escaped-variant>(?:[''’]s)?\b`
   - Case-insensitive
   - Multi-word variants keep their internal whitespace (one or more spaces), so "Notion Labs" matches "Notion  Labs" and "Notion\nLabs"
   - Diacritics folded on both sides before matching (existing behavior)

2. **Domain variant** — detected by the presence of a `.` inside a short string with no spaces (e.g., `notion.so`, `www.notion.so`, `docs.notion.so`):
   - Pattern: `(?:^|[\s/:<>"'])(?:www\.)?<escaped-domain>(?=[/\s?#:<>"']|$)`
   - `www.` prefix optional
   - Case-insensitive
   - Matches inside URLs but not inside other words

3. **Ambiguous / short variants** — variants that are ≤3 chars OR appear in a curated `AMBIGUOUS_WORDS` list (English common words, generic business terms):
   - Must additionally pass a proximity check: within ±60 characters of at least one signal token from `SIGNAL_WORDS` (`company`, `app`, `platform`, `saas`, `startup`, `founded`, `acquired`, `ipo`, `CEO`, `website`, etc.)
   - If no signal token nearby, variant is not considered matched

The `AMBIGUOUS_WORDS` and `SIGNAL_WORDS` lists live inline in `brandMatcher.ts`. The existing `AMBIGUOUS_GENERIC_WORDS` in `citationChecker.ts` moves here and becomes the source of truth.

### Variant learning loop

When the LLM analyzer (responseAnalyzer.ts) extracts a brand or competitor name from an AI response, and that exact name isn't already in the entity's `nameVariations`:

1. Normalize (trim, lowercase comparison, but store original casing)
2. Append to the entity's `nameVariations` via `storage.addBrandNameVariation(brandId, variant)` or `storage.addCompetitorNameVariation(competitorId, variant)`
3. If the variant already exists (case-insensitive), skip (no duplicates)

No guardrails per user's direction. Users can delete unwanted variants from the brand/competitor edit UI.

### UI changes

**Brand edit form** — already shows `nameVariations` as editable comma-separated list. No change.

**Competitor edit form** — new field. Same UI treatment as brands: comma-separated text input labeled "Name Variations" with helper text explaining legal suffixes and acronyms are auto-handled. Added to `client/src/pages/competitors.tsx` via the edit competitor dialog (add one if it doesn't exist yet — today the page has add/delete but no edit).

**Citations page** — the existing "Re-check stored" button changes behavior:
- Before: re-runs brand detection on stored `geoRankings.citationContext` by calling the legacy scorer.
- After: runs `detectBrandAndCompetitors` against stored text for ALL surfaces (citation responses, Reddit/HN/Quora mentions, listicle pages, Wikipedia pages, hallucination claim statements). No LLM calls. Updates `is_cited` / `competitors_mentioned` fields in place.

### Re-check implementation

New endpoint `POST /api/brand-prompts/:brandId/re-detect-all` that:

1. Loads the brand, its competitors, and all their variant lists
2. Iterates each stored text source for this brand:
   - `geo_rankings` rows → update `is_cited` (and for newly-true, set `rank=null` with a `reDetected=true` flag; existing cited rows keep their rank)
   - `brand_mentions` rows → update `is_matched` / `matched_variants`
   - `listicles` rows → update `is_included` + `competitors_mentioned`
   - `wikipedia_mentions` rows → update `is_mentioned`
   - `brand_hallucinations` rows → re-check the `claim_statement` (but don't auto-flip to verified; that's a separate flow)
3. Returns counts: `{ updated: { rankings: 5, mentions: 3, listicles: 0, wikipedia: 1 }, durationMs }`
4. Invalidates the relevant TanStack Query keys on success

### Database changes

Migration `0034_competitor_name_variations.sql`:

```sql
ALTER TABLE competitors ADD COLUMN name_variations text[] DEFAULT ARRAY[]::text[];
```

No schema change for brands (column exists).

Add `re_detected_at` TIMESTAMP column to `geo_rankings` so the UI can badge "re-detected" citations:

```sql
ALTER TABLE geo_rankings ADD COLUMN re_detected_at timestamp;
```

### Migration of existing code

- `server/citationChecker.ts` — `checkForCitation` and `buildBrandNameVariants` DELETED; imports replaced with `detectBrandAndCompetitors`. The LLM judge `citationJudge.ts` stays for rank/relevance.
- `server/lib/responseAnalyzer.ts` — keeps its LLM extraction call for rank/relevance, but the tracked-entity matching is replaced with `detectBrandAndCompetitors` (no more local fuzzy matching).
- `server/lib/mentionScanner.ts` — the variant-matching against Reddit/HN/Quora bodies calls the shared matcher.
- `server/lib/listicleScanner.ts` — page-content match uses the shared matcher; the LLM "isListicle + brandPosition" extraction stays.
- `server/lib/wikipediaScanner.ts` — intro-extract matching uses the shared matcher; the LLM "existing/opportunity/irrelevant" classification stays for topical relevance.
- `server/lib/hallucinationDetector.ts` — the re-verification snippet check uses the shared matcher.

### Accuracy target

Not 100%. Realistic targets on real data:
- **Precision ~95%** (of the responses we call "cited", 95% actually cite the brand)
- **Recall ~90%** (we catch 90% of real citations; the other 10% are paraphrased beyond any variant we have)

Recall improves over time as more variants accumulate. Precision stays stable because variant matching is well-bounded.

---

## Test cases (must pass)

| Case | Expected |
|---|---|
| Variant "Notion" → text "Notion's editor" | matched |
| Variant "Notion" → text "anotion" | not matched |
| Variant "PR" (3 chars, ambiguous) → text "the best PR agency founded in 2017" | matched (signal word "founded" nearby) |
| Variant "PR" → text "that PR push was annoying" | not matched (no signal word) |
| Variant "notion.so" → text "https://docs.notion.so/abc" | matched |
| Variant "notion.so" → text "unotion.so.fake" | not matched |
| Variant "Venture PR" → text "Venture, a PR agency" | not matched (words separated) |
| LLM extracts "Notion Labs" from response → append to variants | future responses with "Notion Labs" match without LLM |
| User deletes "Notion App" from variants → stored responses re-checked | those responses no longer matched on "Notion App" alone |
| "Re-check stored" with no variant changes | zero updates |

---

## Critical files

| File | Change |
|---|---|
| `server/lib/brandMatcher.ts` (NEW) | The universal detector |
| `server/citationChecker.ts` | Replace `checkForCitation` + `buildBrandNameVariants` with calls to shared matcher |
| `server/lib/responseAnalyzer.ts` | Use shared matcher for tracked-entity lookup; keep LLM for rank |
| `server/lib/mentionScanner.ts` | Use shared matcher |
| `server/lib/listicleScanner.ts` | Use shared matcher |
| `server/lib/wikipediaScanner.ts` | Use shared matcher |
| `server/lib/hallucinationDetector.ts` | Use shared matcher in re-verification |
| `server/routes/prompts.ts` (or wherever re-check lives) | New `/re-detect-all` endpoint |
| `shared/schema.ts` | Add `nameVariations` to competitors; `re_detected_at` to geo_rankings |
| `migrations/0034_competitor_name_variations.sql` (NEW) | Schema migration |
| `client/src/pages/competitors.tsx` | Edit dialog with name variations field |
| `client/src/pages/citations.tsx` | "Re-check stored" wired to `/re-detect-all` |

---

## Execution plan

**Phase 1 — Foundation (no behavior change).** Write `brandMatcher.ts` with full test suite. Add migration for competitor.nameVariations + geo_rankings.re_detected_at. Add DAO methods: `getCompetitorById`, `updateCompetitorNameVariations`, `addCompetitorNameVariation`.

**Phase 2 — Migrate callers.** Replace detection logic in each of the 5 library files with calls to `detectBrandAndCompetitors`. Keep LLM analyzer calls for rank/relevance. Wire variant-learning-append into responseAnalyzer.

**Phase 3 — Competitors UI.** Add edit-competitor dialog with nameVariations field (mirrors brand edit).

**Phase 4 — Re-check endpoint + UI wiring.** Build `/api/brand-prompts/:brandId/re-detect-all`. Wire "Re-check stored" button to it. Show a toast with the updated counts.

Each phase lands as its own PR and can be shipped independently. Phase 1 is zero-risk (new code, not called yet). Phase 2 is where real behavior changes and needs the most careful QA.
