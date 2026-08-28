# B4-15 platform extraction report

## Result

`shared/schema/platform.ts` now owns these tables.

- `analytics`
- `metricsHistory`
- `alertSettings`
- `alertHistory`
- `communityPosts`
- `emailFailures`
- `apiCosts`
- `auditLogs`
- `notificationPreferences`
- `schemaAudits`
- `competitorFavicons`
- `sourceHealth`
- `sentimentCache`
- `tourEvents`
- `systemState`

Each moved table keeps its insert schema and exported types.

## Membership check

`shared/schema.ts` has no `pgTable` call.

The search found no moved table name in the barrel.

The barrel has only module re-exports.

`.audit/B4/PARTITION.md` is absent from the worktree and from `HEAD`.

I could not compare the table list against that unavailable input.

No extra table remained in the barrel.

## Imports and cycles

`platform.ts` imports `brands` from `./brands`.

`platform.ts` imports `users` from `./identity`.

No extracted schema module imports `platform`.

The import direction stays one way.

The schema module graph has no platform cycle.

## Verification

`node scripts/verifySchemaSplit.mjs` passed all six gates.

- Export surface: 260 exports unchanged.
- Generated SQL: 271 statements before and after.
- Typecheck: pass.
- Lint: pass.
- Format: pass.
- Tests: 1,684 passed and 91 skipped.

## Changed files

The task changed `shared/schema.ts` and added `shared/schema/platform.ts`.

The task added this report.

No consumer file changed.

No temporary file remains from this task.
