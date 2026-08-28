# B4-10 fact agent schema extraction report

## Boundary

The move starts at the Spec 2 comment block.

The move includes the comment blocks above all seven tables.

The move ends after `factScrapeLogs` and its type aliases.

The module contains all requested insert Zod builders and type aliases.

## Membership check

The barrel has no moved table declaration.

It re-exports `shared/schema/factAgent.ts`.

The barrel imports `brandFactScrapeRuns` for `siteHealthScanHistory.runId`.

This foreign key is the only remaining table use in the barrel.

## Import direction

`shared/schema/factAgent.ts` imports `brands` from `./brands`.

The page, fact sheet, and log tables reference local `brandFactScrapeRuns`.

`factScrapeEvents` has no foreign key.

The module imports no barrel symbol.

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
