# B4-13 signals extraction report

## Located tables

The extraction moved these tables to `shared/schema/signals.ts`.

- `listicles`
- `wikipediaMentions`
- `bofuContent`
- `faqItems`
- `brandMentions`
- `trackedContentUrls`
- `brandHallucinations`

The module includes each insert Zod builder and each select and insert type alias.

## Membership check

`shared/schema.ts` has no remaining reference to these seven tables.

No barrel table has a foreign key to a moved table.

The barrel re-exports `./schema/signals`.

## Import direction and cycles

`signals.ts` imports `brands` from `./brands`.

`signals.ts` imports `articles` from `./content`.

No extracted schema module imports `./signals`.

The import graph has no cycle through `signals`.

## Gate output

`node scripts/verifySchemaSplit.mjs` passed all six gates.

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

The changed schema files are `shared/schema.ts` and `shared/schema/signals.ts`.
