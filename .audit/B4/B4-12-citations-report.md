# B4-12 citations report

## Tables located

I moved these tables into `shared/schema/citations.ts`.

- `citations`
- `citationRuns`
- `geoRankings`
- `brandVisibilitySnapshots`
- `citationQuality`
- `visibilityProgress`
- `geoSignalRuns`

Each table keeps its adjacent comments, Zod builder, and type aliases.

## Membership check

`shared/schema.ts` has no moved table declaration, builder, or type alias.
It re-exports `./schema/citations`.
The remaining `citations` word appears only in that export and an unrelated comment.

## Import direction and cycles

`citations.ts` imports `brands`, `articles`, `users`, and `brandPrompts`.
These imports use `./brands`, `./content`, `./identity`, and `./prompts`.
No existing schema module imports `citations`.
The import graph has no citation cycle.

The barrel keeps `brands`, `articles`, and `users` value imports.
Its remaining tables use them in foreign keys.

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
Only `shared/schema.ts`, `shared/schema/citations.ts`, and this report changed.
