# Gamified v2 — Phase 2: Close the Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every point in the canonical economy reachable — five new task sources, five real evidence readers, and a scheduler — so a brand can actually progress from Start to Maintain.

**Architecture:** Extend the work domain landed in Phase 1. Each task type gets a source under `server/services/work/sources/` following the two working examples, and each unverifiable evidence kind gets a reader in `server/domains/work/evidenceReaders.ts`. Reconciliation moves from the request path onto the repo's existing scheduler. No new tables; two new columns on existing tables.

**Tech Stack:** TypeScript, Drizzle over a direct Postgres pool, `node-cron` plus the existing cron orchestrator, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-gamified-v2-dashboard-spec.md`

**Depends on:** Phase 1 complete (`feat/v2-work-foundation` merged or branched from).

## Global Constraints

- `DATABASE_URL` in `.env` points at **production**. Every migration step runs `npx tsx scripts/assert-local-db.ts` first — the guard Phase 1 Task 2 built, which now also checks `DATABASE_DIRECT_URL`.
- One local test process at a time, across every worktree and agent.
- Never commit outside the phase worktree; never push, merge to `main`, or reset.
- Never name Claude, Codex, or any AI tool in code, comments, or commit messages. No `Co-Authored-By` trailers.
- Points are fixed: facts 20, questions 20, baseline 20, fault 40, page 40, community 30, review 10, experiment 50. Levels 0/60/160/320/550. Never edit a value to make a test pass.
- **`taskKey` must start with `${sourceKey}:`** — `server/domains/work/opportunities.ts:101-106` throws otherwise.
- **`completionRule.required` must exactly equal the policy set** for the task type — `policy.ts:59-75` enforces it. An evidence requirement may never be softened.
- **Every table a source reads needs `GRANT SELECT (columns) TO venturecite_request`**, because reads run under a restricted role. A source reading an ungranted table fails at runtime and is swallowed by a `try/catch`, producing no tasks and no error.
- `tsconfig.json` excludes `scripts/` and `tests/`; `npm run check` does not typecheck them.

## Execution policy

Same as Phase 1: Opus orchestrates, reviews and judges; `codex luna --effort high` for mechanical work and `codex terra --effort high` for design-bearing work **once the CLI is installed** (`npm i -g @openai/codex`); Sonnet is the fallback. Never terra `ultra` — it self-delegates. Never pipe `codexDispatch.mjs` through another command; a pipe masks its exit code. Verify every agent result against `git log` and `git status` before accepting it.

**Waves**

| Wave | Track | Tasks                                                            | Worktree     | Notes                                              |
| ---- | ----- | ---------------------------------------------------------------- | ------------ | -------------------------------------------------- |
| A    | A1    | Task 1 (`geo_rankings.outcome`) + Task 2 (`resolved_ranking_id`) | `v2-economy` | Both are migration + backfill + mirror; batched.   |
| A    | A2    | Task 3 (`artifact` reader)                                       | `v2-readers` | Independent file; unblocks a shipped task type.    |
| B    | B1    | Tasks 4, 5 (page + earned-media sources)                         | `v2-economy` | Both add a source file plus a grants migration.    |
| B    | B2    | Tasks 6, 7 (`confirmation` + `decision` readers)                 | `v2-readers` | Same file as A2; sequential there, parallel to B1. |
| C    | C1    | Tasks 8, 9 (review + experiment sources)                         | `v2-economy` | Depend on Task 7's `decision` reader.              |
| D    | D1    | Task 10 (scheduler) then Task 11 (gate)                          | `v2-economy` | Merge `v2-readers` in first.                       |

## File Structure

| File                                                           | Responsibility                                            |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `migrations/0137_geo_rankings_outcome.sql`                     | `outcome` column + backfill from `metadata->>'outcome'`.  |
| `migrations/0138_hallucination_resolved_ranking.sql`           | `resolved_ranking_id` on `brand_hallucinations`.          |
| `migrations/0139_work_source_reader_grants.sql`                | Column grants for every table the new sources read.       |
| `server/domains/work/evidenceReaders.ts`                       | **Modified.** Five kinds stop returning `owned_unusable`. |
| `server/services/work/sources/pageImprovementOpportunities.ts` | `improve_page_for_buyer_need`.                            |
| `server/services/work/sources/earnedMediaOpportunities.ts`     | `complete_earned_media_or_community_work`.                |
| `server/services/work/sources/reviewOpportunities.ts`          | `review_results_and_record_decision`.                     |
| `server/services/work/sources/experimentOpportunities.ts`      | `complete_visibility_experiment`.                         |
| `server/lib/workReconcile.ts`                                  | The scheduled reconcile job.                              |
| `server/lib/schedulerJobRegistry.ts`                           | **Modified.** One new job name.                           |
| `server/routes/cron.ts`                                        | **Modified.** One `orch.run` step.                        |

---

### Task 1: Give `geo_rankings` an honest outcome

**Why first:** `establish_measurement_baseline` is already built and wired, but returns `[]` for every brand. `visibilityCoverage.ts:70-77` reads outcome from `row.outcome` or `row.metadata.outcome`; `geo_rankings` has no `outcome` column and pre-branch rows have no metadata key, so `classifyLegacyStoredObservationOutcome` marks them `unavailable` and `buildBaselineOpportunity` fails the run at zero successful observations. Three other task types depend on the same `measurement` evidence.

**Files:**

- Create: `migrations/0137_geo_rankings_outcome.sql`
- Modify: `shared/schema/citations.ts` — add `outcome` to `geoRankings`
- Test: `tests/migrations/workMigrationShape.test.ts`

**Interfaces:**

- Produces: `geo_rankings.outcome text NULL CHECK (outcome IN ('successful','unavailable','failed'))`. `visibilityCoverage.ts` already prefers this column over the jsonb, so no reader changes.

- [ ] **Step 1: Confirm the column is absent and measure the damage**

```bash
docker exec supabase_db_venturecite psql -U postgres -d postgres -c "\d geo_rankings" | grep -i outcome || echo "ABSENT as expected"
docker exec supabase_db_venturecite psql -U postgres -d postgres -t -A -c "
SELECT count(*) FILTER (WHERE metadata->>'outcome' IS NOT NULL) AS with_meta,
       count(*) FILTER (WHERE citation_context LIKE 'Check failed:%') AS failed_prefix,
       count(*) AS total
FROM geo_rankings;"
```

Record all three numbers in your report. They determine whether the backfill has anything to work with.

- [ ] **Step 2: Write the failing shape test**

```ts
// append to tests/migrations/workMigrationShape.test.ts
it("records a per-observation outcome", () => {
  const sql = readFileSync("migrations/0137_geo_rankings_outcome.sql", "utf8");
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS outcome/i);
  expect(sql).toMatch(/'successful'/);
  expect(sql).toMatch(/'unavailable'/);
  expect(sql).toMatch(/'failed'/);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/migrations/workMigrationShape.test.ts -t "per-observation outcome"`
Expected: FAIL — no such file.

- [ ] **Step 4: Write the migration**

```sql
-- migrations/0137_geo_rankings_outcome.sql
-- A failed provider call is stored as an ordinary row whose failure lives only in a
-- "Check failed: " prefix inside citation_context, and migration 0039 counts it in
-- total_checks. Every mention rate is therefore diluted by provider errors, and the
-- baseline work source sees zero successful observations and produces no task.
ALTER TABLE public.geo_rankings
  ADD COLUMN IF NOT EXISTS outcome text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'geo_rankings_outcome_check'
  ) THEN
    ALTER TABLE public.geo_rankings
      ADD CONSTRAINT geo_rankings_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('successful', 'unavailable', 'failed'));
  END IF;
END $$;

-- Backfill, most trustworthy source first.
UPDATE public.geo_rankings
   SET outcome = metadata->>'outcome'
 WHERE outcome IS NULL
   AND metadata->>'outcome' IN ('successful', 'unavailable', 'failed');

UPDATE public.geo_rankings
   SET outcome = 'failed'
 WHERE outcome IS NULL
   AND citation_context LIKE 'Check failed:%';

-- Everything else predates outcome capture. It is not evidence of success.
UPDATE public.geo_rankings
   SET outcome = 'unavailable'
 WHERE outcome IS NULL;

CREATE INDEX IF NOT EXISTS geo_rankings_brand_outcome_idx
  ON public.geo_rankings (brand_id, outcome);
```

- [ ] **Step 5: Mirror it in Drizzle**

In `shared/schema/citations.ts`, in the `geoRankings` table:

```ts
    outcome: text("outcome"),
```

- [ ] **Step 6: Apply to the local database and verify the distribution**

```bash
npx tsx scripts/assert-local-db.ts
npm run db:migrate
docker exec supabase_db_venturecite psql -U postgres -d postgres -t -A -c "
SELECT outcome, count(*) FROM geo_rankings GROUP BY outcome ORDER BY 2 DESC;"
```

Expected: every row has a non-null outcome. Report the distribution.

- [ ] **Step 7: Honest-consequence check**

The backfill marks legacy rows `unavailable`, not `successful`. That is deliberate: a row with no recorded outcome is not evidence a provider answered. **This means the baseline source stays empty for historical-only brands until a new citation run lands.** Verify and report which of the eleven local brands now have at least one `successful` row:

```bash
docker exec supabase_db_venturecite psql -U postgres -d postgres -t -A -F'|' -c "
SELECT b.name, count(*) FILTER (WHERE g.outcome='successful')
FROM brands b LEFT JOIN geo_rankings g ON g.brand_id=b.id GROUP BY b.name ORDER BY 2 DESC;"
```

If the answer is zero for every brand, say so plainly in your report — it means Phase 3 must show the "Not measured" state, not a baseline task, and that is a correct outcome rather than a bug.

- [ ] **Step 8: Run the tests and commit**

```bash
npx vitest run tests/migrations/workMigrationShape.test.ts
npm run check
git add migrations/0137_geo_rankings_outcome.sql shared/schema/citations.ts tests/migrations
git commit -m "feat(visibility): record a per-observation outcome on geo rankings"
```

---

### Task 2: Record which run confirmed a fault repair

**Files:**

- Create: `migrations/0138_hallucination_resolved_ranking.sql`
- Modify: `shared/schema/signals.ts` — add `resolvedRankingId` to `brandHallucinations` (defined at `signals.ts:256`, NOT `content.ts` as an earlier draft of this plan said)
- Modify: `server/lib/hallucinationDetector.ts:316` — write it
- Test: `tests/migrations/workMigrationShape.test.ts`, `tests/unit/hallucinationDetector.test.ts`

**Interfaces:**

- Produces: `brand_hallucinations.resolved_ranking_id varchar NULL`, mirroring the existing `ranking_id`. Task 6's `fault_repair` reader consumes both as `beforeCheckId` and `afterCheckId`.

- [ ] **Step 1: Read the resolve path and confirm the id is in scope**

```bash
sed -n '276,330p' server/lib/hallucinationDetector.ts
```

Expected: `reverifyHallucinationsForRun` flips `remediationStatus='verified'`, `isResolved=1`, `resolvedAt=now()` — and has the re-verifying `GeoRanking` in hand but discards its id. That discarded id is what makes `fault_repair` unverifiable.

- [ ] **Step 2: Write the failing shape test**

```ts
// append to tests/migrations/workMigrationShape.test.ts
it("records the ranking that confirmed a repair", () => {
  const sql = readFileSync("migrations/0138_hallucination_resolved_ranking.sql", "utf8");
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS resolved_ranking_id/i);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/migrations/workMigrationShape.test.ts -t "confirmed a repair"`
Expected: FAIL.

- [ ] **Step 4: Write the migration**

```sql
-- migrations/0138_hallucination_resolved_ranking.sql
-- ranking_id records the observation that detected the fault. Re-verification proves the
-- repair but discards the observation that proved it, so a fault_repair evidence reference
-- has a beforeCheckId and no afterCheckId. This column supplies the second half.
ALTER TABLE public.brand_hallucinations
  ADD COLUMN IF NOT EXISTS resolved_ranking_id varchar;

CREATE INDEX IF NOT EXISTS brand_hallucinations_resolved_ranking_idx
  ON public.brand_hallucinations (resolved_ranking_id);
```

- [ ] **Step 5: Mirror it in Drizzle**

In `shared/schema/signals.ts`, in `brandHallucinations` (line 256), beside `rankingId`:

```ts
    resolvedRankingId: varchar("resolved_ranking_id"),
```

- [ ] **Step 6: Write the failing detector test**

```ts
// tests/unit/hallucinationDetector.test.ts
it("records the ranking that confirmed the repair", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const fakeDb = makeFakeDb({ onUpdate: (values) => updates.push(values) });
  await reverifyHallucinationsForRun(fakeDb, { brandId: "b1", runId: "r1" });
  expect(updates[0]).toMatchObject({ resolvedRankingId: expect.any(String) });
});
```

Adapt `makeFakeDb` to the fake already used by the neighbouring tests in that file; do not invent a new test harness.

- [ ] **Step 7: Write it at the resolve site**

In `server/lib/hallucinationDetector.ts`, in the update that sets `resolvedAt`, add `resolvedRankingId: ranking.id` using the `GeoRanking` already in scope in that loop.

- [ ] **Step 8: Run the tests and commit**

```bash
npx vitest run tests/migrations/workMigrationShape.test.ts tests/unit/hallucinationDetector.test.ts
npx tsx scripts/assert-local-db.ts && npm run db:migrate
git add migrations/0138_hallucination_resolved_ranking.sql shared/schema/signals.ts server/lib/hallucinationDetector.ts tests
git commit -m "feat(hallucinations): record the observation that confirmed a repair"
```

---

### Task 3: The `artifact` evidence reader

**Why this is first among the readers:** `approve_buyer_question_set` requires `["artifact","confirmation"]` and a source already ships that creates those tasks — so the product creates tasks today that can never be verified. Grants already exist from migration `0133`.

**Files:**

- Modify: `server/domains/work/evidenceReaders.ts`
- Test: `tests/unit/workEvidenceReaders.test.ts`

**Interfaces:**

- Consumes: `prompt_generations(id, brand_id, generation_number)`, `brand_prompts(id, brand_id, generation_id, prompt, status, paused)`.
- Produces: `readArtifact(...)` returning `"owned_usable"` / `"owned_unusable"` / `"not_found"`, wired into `readReference`'s dispatch.

- [ ] **Step 1: Read the two working readers and the emitted shapes**

```bash
sed -n '126,244p' server/domains/work/evidenceReaders.ts
grep -n "artifactId" server/services/work/sources/questionOpportunities.ts server/services/work/sources/factOpportunities.ts
```

Note two distinct `artifactId` shapes: `questionOpportunities.ts` emits a bare `prompt_generations.id`; `factOpportunities.ts` emits the prefixed `fact-record:${id}`. The reader must handle both, dispatching on the prefix.

- [ ] **Step 2: Write the failing tests**

```ts
// append to tests/unit/workEvidenceReaders.test.ts
it("accepts a prompt generation whose approved questions are still tracked", async () => {
  const result = await readReference(fakeTx, actor, brandId, {
    kind: "artifact",
    artifactId: "gen-1",
    version: 2,
    coverage: "p1,p2",
    duplicateCheck: "gen-1",
  });
  expect(result).toBe("owned_usable");
});

it("rejects a prompt generation whose covered question is now paused", async () => {
  const result = await readReference(fakeTxWithPausedPrompt, actor, brandId, {
    kind: "artifact",
    artifactId: "gen-1",
    version: 2,
    coverage: "p1,p2",
    duplicateCheck: "gen-1",
  });
  expect(result).toBe("owned_unusable");
});

it("rejects an artifact belonging to another brand", async () => {
  const result = await readReference(fakeTxOtherBrand, actor, brandId, {
    kind: "artifact",
    artifactId: "gen-1",
    version: 2,
    coverage: "p1",
    duplicateCheck: "gen-1",
  });
  expect(result).toBe("not_found");
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/unit/workEvidenceReaders.test.ts -t "artifact"`
Expected: FAIL — currently every artifact reference returns `owned_unusable`.

- [ ] **Step 4: Implement the reader**

It must verify, in this order, returning `not_found` for the first three and `owned_unusable` for the rest:

1. `prompt_generations.id = artifactId` exists, `brand_id = input.brandId`, and the brand is owned by `actor.userId` with `deleted_at is null`;
2. `prompt_generations.generation_number = reference.version`;
3. `reference.duplicateCheck === reference.artifactId`;
4. every id in `reference.coverage.split(",")` exists in `brand_prompts` with `generation_id = artifactId`, `brand_id = input.brandId`, `status = 'tracked'`, `paused = false`, and a non-empty `prompt`.

When `artifactId` starts with `fact-record:`, strip the prefix and verify against `brand_fact_sheet` by id and brand instead.

- [ ] **Step 5: Remove `artifact` from the hardcoded list**

Delete `artifact` from the `owned_unusable` set at `evidenceReaders.ts:23-28` and dispatch to the new reader in `readReference`.

- [ ] **Step 6: Run the tests and commit**

```bash
npx vitest run tests/unit/workEvidenceReaders.test.ts
npm run check
git add server/domains/work/evidenceReaders.ts tests/unit/workEvidenceReaders.test.ts
git commit -m "feat(work): verify artifact evidence against prompt generations and facts"
```

---

### Tasks 4-11

Tasks 4 through 11 follow the same shape and are written out when Wave A completes, because each depends on a fact Wave A establishes:

- **Task 4** — `improve_page_for_buyer_need` source. Trigger: `bofu_content` rows not yet published with a `target_intent` or `primary_keyword`, absent from `tracked_content_urls`. `taskKey` = `content:bofu:${id}`. The `content_change` reader already works, but hardcodes `source_type='bofu'` at `evidenceReaders.ts:219` — either scope the source to bofu or widen that predicate, never fire FAQ tasks that cannot verify.
- **Task 5** — `complete_earned_media_or_community_work` source over `community_posts` (draft, with `group_url`) and `listicles` (`is_included=0`, `outreach_status='new'`). `sourceKey` = `earned`. Trigger evidence is `artifact`, not `authored_work`, because `community_posts` has no author column.
- **Task 6** — `fault_repair` reader, consuming Task 2's `resolved_ranking_id`.
- **Task 7** — `confirmation` and `decision` readers. `confirmation` is deliberately not a table lookup: assert the actor matches, the note is non-empty and the timestamp is not in the future. `decision` reads `work_outcome_reviews`.
- **Task 8** — `review_results_and_record_decision` source. `taskKey` = `review:${cycleKey}`, never `review:${runId}`, because the cap is per review period.
- **Task 9** — `complete_visibility_experiment` source over published `bofu_content` bracketed by two successful `citation_runs`.
- **Task 10** — the scheduler. Register `work-reconcile` in `SCHEDULER_JOB_NAMES`, wrap the brand loop in `withJobDebounce` outside `withAdvisoryLock`, and add one `orch.run` step in `server/routes/cron.ts`. `tests/unit/schedulerOrchestratorParity.test.ts` fails if the registry and the orchestrator disagree — that test is the guardrail. The job must build one `createRequestActor(brand.user_id)` per brand rather than running privileged, or it defeats the RLS design.
- **Task 11** — phase gate: every task type reachable, every evidence kind verifiable, `npm run test:integration:local` green, and a report of how many tasks each of the four fixture brands actually generates.

**Out of scope, and say so in the phase report:** the access-fault half of `repair_confirmed_access_or_factual_fault`. Site-health findings are computed at read time and never persisted — `dashboardSiteHealth.ts:590-593` recomputes them from the latest run's pages, and `site_health_finding_status` stores a user assertion rather than a check. Making that verifiable needs a per-(run, finding) table, which this phase does not add. The factual half, via Task 2 and Task 6, is in scope and sufficient for the 40-point rule.
