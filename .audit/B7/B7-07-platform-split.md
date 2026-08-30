# B7-07: acting on the platform module design

Implements the design in `B7-05-platform-split-design.md`: dead-code removal,
the two-table move to `signals`, the `getTourState`/`patchTourState` move to
`identity`, and wiring `storageSurface.ts` into CI. No table was dropped.

## 1. Dead code removed

### alertSettings CRUD (5 methods) - confirmed dead, removed

`createAlertSetting`, `getAlertSettings`, `getAlertSettingById`,
`updateAlertSetting`, `deleteAlertSetting` are gone from `IStorage`
(`server/storage.ts`) and from their implementation
(`server/storage/platformStorage.ts`). Re-verified before deleting:

```
grep -rn "createAlertSetting\|getAlertSettings\|getAlertSettingById\|updateAlertSetting(\|deleteAlertSetting" --include=*.ts --include=*.tsx .
```

returned only the interface declaration and the implementation itself - no
route, job, lib, client, or test referenced any of the five. The unused
`AlertSettings`/`InsertAlertSettings` type imports were removed from both
files. The `alert_settings` **table** and its schema declaration
(`shared/schema/platform.ts`) are untouched, per instruction not to drop
tables - `AlertSettings`/`InsertAlertSettings` types remain exported from
there for any future caller, they're just no longer wired into `IStorage`.

### competitorFavicon "methods" - nothing to remove

Verified there are no `competitorFavicon*` storage methods anywhere: no
declaration in `IStorage`, no implementation in `platformStorage.ts` or any
other domain module. `competitor_favicons` exists only as a schema table
(`shared/schema/platform.ts`) and its origin migration
(`0031_autopilot_and_logos.sql`). Confirmed with:

```
grep -rin "favicon" server/ shared/ --include=*.ts
```

The design doc's own table (§1) lists it as "none" under
`platformStorage methods`, so this part of the task's phrasing describes a
method surface that never existed - there was nothing to delete.

### analytics: the pointless write, removed; the dead read, left in place

Verified the claim: `getAnalytics` (`server/storage/platformStorage.ts`)
recomputes `totalCitations` from `SELECT * FROM articles` on every call and
never reads back the column two other places increment. Removed the two
`analytics.totalCitations` increments in
`server/storage/citationsStorage.ts`:

- `createCitation` - previously ran a second `SELECT` + `UPDATE` against
  `analytics` after inserting the citation.
- `incrementArticleCitations` - previously did the same after bumping
  `articles.citationCount`.

Both now do only the write that's actually read (the `articles` row). This
removes two extra queries per citation event with no behavior change visible
to any caller - nothing ever read `analytics.totalCitations` back.

`getAnalytics`/`updateAnalytics` themselves remain in `IStorage` and
`platformStorage.ts`. The task asked specifically to remove "the pointless
write," not the read methods; those two methods still have zero callers
anywhere in `server/`, tests, or `client/` (confirmed by grep), so the
`analytics` table is now **fully unreferenced by any write path** and
reachable only through two dead methods that recompute from `articles` and
create a row on first read if none exists.

### Tables now unreferenced by any live code path

- `alert_settings` - table stays; zero storage methods now point at it; only
  reachable via raw `db` if someone writes new code against it.
- `competitor_favicons` - was already unreferenced; unchanged.
- `analytics` - the two writes into it are gone; `getAnalytics`/
  `updateAnalytics` still exist but have zero callers, so no code path reads
  or writes this table today.

## 2. Tables and methods moved

### `sourceHealth`, `sentimentCache` -> `signals`

Moved the table definitions from `shared/schema/platform.ts` to
`shared/schema/signals.ts` (added `primaryKey` to the existing
`drizzle-orm/pg-core` import there; `brands` was already imported, so the
move adds no new import edge). Moved six methods from
`server/storage/platformStorage.ts` to `server/storage/signalsStorage.ts`:
`getSourceHealth`, `upsertSourceHealth`, `getCachedSentiment`,
`upsertCachedSentiment`, `pruneOldSentimentCache`,
`countSentimentCallsForBrandSince`. Bodies were moved verbatim (confirmed by
`storageSurface.ts`'s per-method body diff reporting zero changes for these
six).

Evidence re-checked before moving:

```
grep -n "getSourceHealth\|upsertSourceHealth\|getCachedSentiment\|upsertCachedSentiment\|pruneOldSentimentCache\|countSentimentCallsForBrandSince" -r server/ --include=*.ts
```

confirms every caller sits in `server/lib/mentionScanner.ts`,
`server/lib/sourceHealth.ts`, `server/lib/sentimentBatcher.ts`, and
`server/routes/mentions.ts` - all signals-domain. `countSentimentCallsForBrandSince`'s
body queries `schema.brandMentions`, declared in `shared/schema/signals.ts`
already, so this move also collapses a cross-file table reference (platform
storage querying a signals table) into an in-domain one.

`IStorage` in `server/storage.ts` is unchanged - only the implementing file
moved, `IStorage` itself doesn't encode domain ownership. The `server/storage.ts`
composition still spreads `...signalsStorage` (unchanged position/order).

### `getTourState`, `patchTourState` -> `identity`

Moved from `platformStorage.ts` to `server/storage/identityStorage.ts`
verbatim, along with the `applyTourStateOp`/`KnownTourId`/`TourStateOp`
imports they need (`../lib/tourStateOps`, `../lib/tourRegistry` - same
relative path from `server/storage/identityStorage.ts` as it was from
`server/storage/platformStorage.ts`, since both live in `server/storage/`).

Verified before moving: both method bodies read/write only
`schema.users.onboardingState`; neither queries `schema.tourEvents` (the
platform table they were previously colocated with, per B5's own allocation
notes). `recordTourEvents`/`deleteOldTourEvents` (the two methods that
actually touch `tourEvents`) stay in `platformStorage.ts` - only the
misnamed pair moved.

## 3. Surface counts, before and after

Ran the gates before touching anything, mid-work (to confirm the gate
catches the intended removals), and one final time after regenerating the
baseline.

**Schema export surface** - unaffected by this work, checked against the
existing B4 baseline the whole way through (moving `sourceHealth`/
`sentimentCache` between schema files doesn't add, remove, or rename any
export - `shared/schema.ts`'s barrel is `export *`, file-agnostic):

```
$ npx tsx scripts/schemaExportSurface.ts --check .audit/B4/schema-exports-before.txt
Export surface unchanged. 260 exports.
```

**Storage surface** - this is the check the task says was never wired in
and had already silently drifted. Running it against the untouched
`.audit/B5/storage-surface-before.json` baseline, before regenerating,
showed two independent things:

```
IStorage lost 5 methods: createAlertSetting, deleteAlertSetting, getAlertSettingById, getAlertSettings, updateAlertSetting
IStorage gained 1 methods: countAutomaticCitationRunsSince
5 implementations disappeared: createAlertSetting, getAlertSettings, getAlertSettingById, updateAlertSetting, deleteAlertSetting
1 implementations appeared: countAutomaticCitationRunsSince
6 method bodies changed during a move that should not alter behaviour:
    createCitation (mine - the analytics write removal)
    incrementArticleCitations (mine - the analytics write removal)
    createCitationRun (not mine)
    recomputeCitationRunAggregate (not mine)
    getActiveCitationRuns (not mine)
    bumpCitationRunProgress (not mine)
```

The first four lines (`createAlertSetting` et al., `countAutomaticCitationRunsSince`)
and two of the six body changes (`createCitation`, `incrementArticleCitations`)
are this task's work. **The other four body changes
(`createCitationRun`, `recomputeCitationRunAggregate`, `getActiveCitationRuns`,
`bumpCitationRunProgress`) and the `countAutomaticCitationRunsSince` addition
are not from this task** - they landed in `server/storage/citationsStorage.ts`
from concurrent work on this shared branch before this run started. This is
exactly the failure mode Task 3 exists to catch: the interface already
drifted from the last captured baseline with nothing checking it. Confirmed
`getSourceHealth`/`upsertSourceHealth`/`getCachedSentiment`/
`upsertCachedSentiment`/`pruneOldSentimentCache`/`countSentimentCallsForBrandSince`/
`getTourState`/`patchTourState` did **not** appear in either the "disappeared"
or "body changed" lists - the move preserved every body exactly.

Counts, read directly from the JSON (not the tool's summary line, which
elides duplicates already known to be zero):

|                                                                      | interfaceMethods | implementations | duplicates |
| -------------------------------------------------------------------- | ---------------: | --------------: | ---------: |
| Before (old `.audit/B5/storage-surface-before.json`, captured at B5) |              309 |             317 |          0 |
| After (regenerated, this task)                                       |              305 |             313 |          0 |

Net change: **-4 interface methods, -4 implementations** (-5 `alertSettings`
methods, +1 `countAutomaticCitationRunsSince` from the concurrent work noted
above; the `sourceHealth`/`sentimentCache`/`getTourState`/`patchTourState`
moves are relocations, not additions or removals, so they don't change the
count).

### Baseline regeneration - the deliberate final step

Regenerated `.audit/B5/storage-surface-before.json` only after every other
step above was verified, per instruction ("never to silence a failure
mid-work"):

```
npx tsx scripts/storageSurface.ts > .audit/B5/storage-surface-before.json
npx prettier --write .audit/B5/storage-surface-before.json   # match the
                                                               # file's
                                                               # existing
                                                               # formatting
npm run storage:surface:check
# -> Storage surface intact. 305 interface methods, 313 implementations,
#    0 relocated, no duplicates, no body changed.
```

The `prettier --write` step exists because `scripts/storageSurface.ts`
emits `JSON.stringify(surface, null, 1)` (1-space indent), while the
committed baseline in git was 2-space/Prettier-formatted; without
reformatting, `npm run format:check` would flag the regenerated baseline as
a new, unrelated failure.

## 4. CI wiring

Added, mirroring exactly how `schema:surface:check` is wired:

`package.json`:

```
"storage:surface": "tsx scripts/storageSurface.ts",
"storage:surface:check": "tsx scripts/storageSurface.ts --check .audit/B5/storage-surface-before.json",
```

`.github/workflows/ci.yml`, `check` job, added a "Storage surface" step
immediately after "Schema export surface" and before "Lint", with a comment
explaining why (mirrors the existing comment style for that job):

```yaml
- name: Storage surface
  run: npm run storage:surface:check
```

`storage:surface:check` was previously invocable only by hand
(`.audit/B5-domain-report` documents manual runs) - it is now a real CI
gate. `storage:surface` (no `--check`) is the capture command, matching
`schema:surface`'s pairing.

## 5. Verified FK drift: migrations vs `shared/schema/platform.ts`

Read every migration named in the design doc and diffed against the current
schema file. All four claims verified true, direction is the same in every
case: **the migration (the real database) declares an FK; the Drizzle schema
declares a bare column with no `.references()`.**

| Table                      | Migration                                       | Constraint in the real DB                                                | `shared/schema/platform.ts` today                           |
| -------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `audit_logs`               | `migrations/0017_audit_logs.sql`                | `user_id varchar references public.users(id) on delete set null`         | `userId: varchar("user_id")` - no `.references()`           |
| `api_costs`                | `migrations/0019_api_costs.sql`                 | `user_id varchar not null references public.users(id) on delete cascade` | `userId: varchar("user_id").notNull()` - no `.references()` |
| `email_failures`           | `migrations/0020_email_status_and_failures.sql` | `user_id varchar references public.users(id) on delete set null`         | `userId: varchar("user_id")` - no `.references()`           |
| `notification_preferences` | `migrations/0025_notification_preferences.sql`  | `user_id varchar not null references public.users(id) on delete cascade` | `userId: varchar("user_id").notNull()` - no `.references()` |

Nullability matches in all four cases (nullable where `on delete set null`,
`not null` where `on delete cascade`) - the drift is specifically the
missing `.references()` call, not a broader mismatch. This was **not**
changed in this task, per instruction (`.references()` changes Drizzle's
generated SQL and needs its own verification pass - `drizzle-kit generate`
against the current schema would very likely try to add these four
constraints as "new," when they already exist in production, and applying
that migration could either fail (constraint already exists) or, if the
constraint names differ, create duplicate constraints).

**What a fix would have to prove**, if taken on separately:

1. That `drizzle-kit generate` run against the schema _with_ the
   `.references()` calls added produces either a no-op (Drizzle detects the
   constraint already exists under a matching name) or an `ALTER TABLE ...
ADD CONSTRAINT` that is safe to run against a table already carrying the
   equivalent constraint under the migration's auto-generated name.
2. That the four `onDelete` modes chosen in the Drizzle definition match
   the migration exactly (`setNull` for `audit_logs`/`email_failures`,
   `cascade` for `api_costs`/`notification_preferences`) - getting this
   backwards would silently change delete behavior in production the next
   time someone runs `db:push` or applies a generated migration.
3. That no code path relies on the current absence of the FK (e.g., an
   insert that races user creation, relying on the FK not being enforced
   yet) - all four tables are accessed only via raw `db` per the design
   doc's own table (§1), so this is a narrow check, but it should be run
   against actual insert order in `server/lib/audit.ts`,
   `server/outbox/contentCostOutboxAdapter.ts`,
   `server/emailService.ts`, and `server/lib/notificationPrefs.ts` before
   trusting the Drizzle definition to match reality.

## 6. Verification run

```
npx tsx scripts/schemaExportSurface.ts --check .audit/B4/schema-exports-before.txt
  -> Export surface unchanged. 260 exports.

npx tsx scripts/storageSurface.ts --check .audit/B5/storage-surface-before.json
  -> Storage surface intact. 305 interface methods, 313 implementations, 0 relocated, no duplicates, no body changed.

npm run check
  -> tsc: clean. verify:tours: 22 targets, all present.

npx eslint <every file touched>
  -> 0 errors, 10 pre-existing "no-explicit-any" warnings, none new.

npx prettier --check <every file touched, plus ci.yml and package.json>
  -> all match Prettier style.

npx vitest run tests/unit/citationChecker.kickoff.test.ts \
  tests/unit/citationCheckerBatchInsert.test.ts \
  tests/unit/citationRunGuards.test.ts \
  tests/unit/citationRunStaleness.test.ts \
  tests/unit/mentionsStorage.test.ts \
  tests/unit/sentimentBatcher.test.ts \
  tests/unit/sourceHealth.test.ts \
  tests/unit/tourEventsOwnership.test.ts
  -> 8 files passed, 85 tests passed.

npx vitest run tests/integration/toursRoutes.test.ts
  -> 1 skipped (no TEST_DATABASE_URL - expected, not run per instruction not to start a database).
```

These were chosen because they're the tests that actually exercise the code
touched: the four `citation*` tests cover `citationsStorage.ts`'s
`createCitation`/`incrementArticleCitations`/citation-run methods;
`mentionsStorage.test.ts` covers `pruneOldSentimentCache`;
`sentimentBatcher.test.ts` and `sourceHealth.test.ts` cover the other five
moved signals methods; `tourEventsOwnership.test.ts` and
`toursRoutes.test.ts` cover the tour-state move. The full suite was not run,
per instruction, and other agents were working concurrently on this branch
during this task - `git diff --stat` was checked repeatedly through the run
to confirm only the intended files carried this task's changes (three files

- `server/storage/platformStorage.ts`, `server/storage/identityStorage.ts`,
  `shared/schema/platform.ts` - were reverted mid-task by concurrent activity
  on the shared working tree and had to be reapplied; this was caught by
  `npm run check` failing immediately afterward and confirmed fixed by the
  final clean run above).

## 7. Net result

`platform` now holds 10 tables (`analytics`, `metricsHistory`,
`alertSettings`, `alertHistory`, `communityPosts`, `emailFailures`,
`apiCosts`, `auditLogs`, `notificationPreferences`, `schemaAudits`,
`tourEvents`, `systemState` - note this is 12, not 10; see correction below)
and no schema table was dropped.

**Correction against the design doc's §3 count**: the design doc's "stays
platform" list in §2c enumerates 10 names but the table in §1 lists 15
originally minus 2 moved minus 3 flagged-dead = 10 remaining by table count.
Counting what is actually still declared in `shared/schema/platform.ts`
after this task: `analytics`, `metricsHistory`, `alertSettings`,
`alertHistory`, `communityPosts`, `emailFailures`, `apiCosts`, `auditLogs`,
`notificationPreferences`, `schemaAudits`, `competitorFavicons`,
`tourEvents`, `systemState` - **13 tables**, because `analytics`,
`alertSettings`, and `competitorFavicons` were flagged as dead in the
design's §2b but this task was authorized only to remove dead _methods_,
not drop _tables_. All three tables remain physically in `platform.ts`,
just with less (or, for `competitorFavicons`, no change from before - it
never had methods) storage-layer surface pointing at them. `sourceHealth`
and `sentimentCache` are gone from `platform.ts` (moved to `signals.ts`),
so the table count in the file dropped from 15 to 13, not to 10 - the gap
is exactly the three tables this task's authorization kept in place as
schema (dead-flagged, not deleted).
