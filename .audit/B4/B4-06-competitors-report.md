# B4-06 competitors extraction report

## Boundary confirmed

The moved block starts at `shared/schema.ts:500` in the source before this extraction.

The moved block ends at line 623 after `CompetitorCitationSnapshot`.

The competitor ranking comment moves with `competitorGeoRankings`.

The listicle comment stays in the barrel.

The block has `competitors`, `competitorGeoRankings`, and `competitorCitationSnapshots`.

The block also has their Zod builders and type aliases.

The moved block matches HEAD after whitespace normalization.

## Membership check

`shared/schema.ts` has no competitor table declaration, Zod builder, or related type alias.

The exact table identifiers remain only in the barrel re-export.

An unrelated existing comment includes the word `competitors`.

No outside table in the current barrel has a foreign key to these tables.

The barrel runtime check exports all three tables as values.

## Import direction

`shared/schema/competitors.ts` imports `brands` from `./brands`.

It has no other local schema import.

It does not import the barrel or a downstream domain module.

The barrel re-exports `./schema/competitors`.

## Gates

1. `npm run schema:surface:check` exited with code 0.
   Output: `Export surface unchanged. 260 exports.`
2. Drizzle generated 271 normalized SQL statements from HEAD and the working tree.
   The sorted statements are identical.
3. `npm run check` exited with code 0.
   The tour check found 22 targets.
4. `npm run lint` exited with code 0.
   It reported 840 warnings and zero errors.
   `npm run format:check` exited with code 0.
   Output: `All matched files use Prettier code style!`
5. `npm test -- --maxWorkers=1` exited with code 0.
   It passed 224 files and 1,684 tests.
   It skipped 20 files and 91 tests.

## Diff scope

`git diff --stat` reports `shared/schema.ts | 126`.

The tracked diff has one insertion and 125 deletions.

`shared/schema/competitors.ts` is a new module with 130 lines.

No consumer file changed.

No migration changed.

Temporary SQL files were removed after the comparison.
