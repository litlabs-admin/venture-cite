# B6a-02: re-detect-all cooldown

## 1. Are the three implementations as described

Yes, confirmed by reading all three in full in `server/routes/prompts.ts`.

- **Audience generation** (`POST /api/brand-prompts/:brandId/audiences/generate`, around
  line 638): reads `storage.getLatestAiAudienceCreatedAt(brand.id)`, compares age to
  `AUDIENCE_GENERATION_COOLDOWN_MS`, sets `Retry-After`, returns
  `429 { success: false, error, retryAfterSeconds }`.
- **Set Health** (`POST /api/brand-prompts/:brandId/set-health/run`, around line 788):
  reads `storage.getLatestSetHealthRun(brand.id)`, compares
  `recent.createdAt` age to `SET_HEALTH_COOLDOWN_MS`, sets `Retry-After`, returns the
  same 429 shape.
- **Re-detect-all** (`POST /api/brand-prompts/:brandId/re-detect-all`, was around line
  1423): used `const reDetectLastRunAt = new Map<string, number>()` declared in the
  `setupPromptsRoutes` closure, checked/set with `.get`/`.set`, `RE_DETECT_COOLDOWN_MS =
60_000`. No `Retry-After` header, no `retryAfterSeconds` field - just
  `429 { success: false, error }`. Per-process, resets on every redeploy, and two
  instances behind a load balancer never see each other's writes.

## 2. What was changed

Made the re-detect-all cooldown database-backed, matching the other two:

- `server/storage.ts`: added `getReDetectAllLastRunAt(brandId): Promise<Date | null>`
  and `setReDetectAllLastRunAt(brandId, at): Promise<void>` to `IStorage`.
- `server/storage/promptsStorage.ts`: implemented both methods against the existing
  `system_state` table (`schema.systemState`, key/value + `updatedAt`, no schema
  change - see section 3). Key used: `` `re-detect-all:${brandId}` ``, value
  `{ lastRanAt: <ISO string> }`. This is the same mechanism already used for
  identically-shaped "last ran at" ledgers elsewhere in this codebase:
  `server/lib/jobDebounce.ts` (`job:${job}:lastRanAt`) and
  `server/lib/siteHealthHistory.ts` (`site_health:${brandId}`).
- `server/routes/prompts.ts`: removed the `Map` and replaced the cooldown check with
  `await storage.getReDetectAllLastRunAt(brand.id)` / `await
storage.setReDetectAllLastRunAt(brand.id, new Date())`, and added the `Retry-After`
  header plus `retryAfterSeconds` field to the 429 body so the shape now matches the
  other two cooldowns. The 429 error message text is unchanged
  (`Re-check rate-limited. Try again in {n}s.`); only the added header/field are new.
  Nothing else in the route changed - same detection logic, same success response
  shape, same comments about not writing a `citation_runs` row.

### Why `system_state` and not `geo_rankings.re_detected_at`

`geo_rankings` already has a `re_detected_at` timestamp column (migration
`0032_universal_detection.sql`), which looked like a candidate. It is not fit for
this purpose: the route only sets it on rows that flip from not-cited to newly-cited
(`if (becameCited) { patch.reDetectedAt = new Date(); ... }`). A re-detect-all call
that changes nothing (the common case - matcher improvements are rare, most calls are
users double-clicking the button) never touches that column, so gating the cooldown
on `MAX(re_detected_at)` would let the cooldown be bypassed on exactly the case the
comment at the top of the handler says it exists to guard against ("iterating
thousands of stored rows still burns DB bandwidth"). `system_state` records every
invocation unconditionally, like `brandPerceptionRuns.createdAt` does for the
`dashboard.ts` perception-run cooldown (a fourth instance of this same pattern,
confirmed while reading around this task).

## 3. Does this need a schema change

**No.** `system_state` (`shared/schema/platform.ts`) is an existing generic
`key text primary key / value_json jsonb / updated_at timestamp` table, already
exposed via `storage.getSystemState` / `storage.setSystemState`
(`server/storage/platformStorage.ts`), and already used for this exact "durable
per-key/per-brand last-ran-at" shape by `jobDebounce.ts` and `siteHealthHistory.ts`.
No migration was written or needed.

## 4. Test

Added `tests/unit/reDetectAllCooldown.test.ts`. It mounts the real
`setupPromptsRoutes(app)` (mocking `db`, `storage`, `routesShared`, `logger`, and the
AI-generation modules the file imports for its other routes, so nothing touches a
live database or LLM key), and calls `setupPromptsRoutes` **twice**, against two
separate Express apps - each a fresh closure, standing in for two separate process
lifetimes (a redeploy, or two instances behind a load balancer) - both backed by the
same mocked `storage`, standing in for the one real database both would share. This
directly targets the defect: the old `Map` lived inside the closure, so a second call
to `setupPromptsRoutes` started with an empty map and would have let the second
request through; the new code reads `storage.getReDetectAllLastRunAt` regardless of
which closure invocation is running, so it can't drift from persisted state.

Three cases:

1. Cooldown holds across the simulated restart - both "process A" and "process B"
   get 429 with `Retry-After` set and `retryAfterSeconds > 0`; `setReDetectAllLastRunAt`
   is never called.
2. Cooldown expired (last run 61s ago, window is 60s) - call succeeds (200,
   `success: true`) and `setReDetectAllLastRunAt(brandId, expect.any(Date))` is called
   once.
3. First-ever call for a brand (`getReDetectAllLastRunAt` resolves `null`) - succeeds
   and records a run.

Run (scoped, per instructions - not the full suite):

```
$ npx vitest run tests/unit/reDetectAllCooldown.test.ts tests/unit/promptDiagnoseRivals.test.ts \
    tests/unit/promptGeneratorCap.test.ts tests/unit/promptScoreHistory.test.ts tests/unit/promptShape.test.ts

 Test Files  5 passed (5)
      Tests  39 passed (39)
```

Also ran, scoped to the touched files only:

- `npx tsc --noEmit -p tsconfig.json` - 0 errors (test files are excluded from this
  project's tsconfig, per `tsconfig.json`'s `exclude`).
- `npx eslint server/routes/prompts.ts server/storage.ts server/storage/promptsStorage.ts tests/unit/reDetectAllCooldown.test.ts`
  - 0 errors, 22 pre-existing-style `no-explicit-any` warnings (same warning type
    already present throughout these files; none introduced a new error).
- `npx prettier --check` on the same four files - clean after one `--write` pass on
  the new test file.

## 5. What is still untested

- **No integration test against a real Postgres `system_state` table.** The test
  above proves the route no longer depends on in-process module state and correctly
  delegates to `storage`, but it mocks `storage` itself, so it does not exercise the
  real `INSERT ... ON CONFLICT DO UPDATE` against `system_state`, and does not prove
  two real OS processes pointed at the same database serialize correctly (no
  transaction/lock around the read-then-write - the same race that already exists,
  unaddressed, in `jobDebounce.ts`, `siteHealthHistory.ts`, and the two "working"
  cooldowns this task was modeled on, none of which take a lock either). Running that
  would require `TEST_DATABASE_URL`, which this environment does not have set; per
  the project's own note, integration tests silently skip without it, so I did not
  write one that would silently do nothing. If `TEST_DATABASE_URL` is available in
  CI, a reasonable follow-up test writes a real `system_state` row via
  `promptsStorage.setReDetectAllLastRunAt`, then reads it back via
  `getReDetectAllLastRunAt` in a _separate_ `db` connection/import to prove
  persistence, but that is a second test, not a substitute for the one above.
- The other two cooldowns (audiences/generate, set-health/run) were read and
  confirmed correct but were not touched, and have no new tests added here - the task
  scoped testing to the re-detect-all cooldown only.
