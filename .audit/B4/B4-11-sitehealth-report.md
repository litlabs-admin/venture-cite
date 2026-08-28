# B4-11 site health schema extraction report

## Located tables

The move included `siteHealthScanHistory` from migration 0094.

The move included `siteHealthFindingStatus` from migration 0095.

The table declarations and type aliases match the HEAD definitions byte-for-byte.

## Membership check

`shared/schema.ts` re-exports `./schema/siteHealth`.

`shared/schema.ts` has no remaining references to either moved table.

No remaining table has a foreign key to either moved table.

## Import direction and cycle check

`shared/schema/siteHealth.ts` imports `brands` from `./brands`.

It imports `users` from `./identity`.

It imports `brandFactScrapeRuns` from `./factAgent`.

The import chain is `siteHealth -> factAgent -> brands -> identity`.

`factAgent.ts` has no `siteHealth` import or reference.

The extraction creates no import cycle.

## Gate output

```text
PASS  export surface  Export surface unchanged. 260 exports.
PASS  generated SQL  271 statements before, 271 after
PASS  typecheck
PASS  lint
PASS  format
PASS  tests  Tests  1684 passed | 91 skipped (1775)

All 6 gates pass. The split is safe to commit.
```

## Consumer files

No consumer file changed.

The only source changes are `shared/schema.ts` and `shared/schema/siteHealth.ts`.
