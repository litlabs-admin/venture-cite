# B4-07 perception schema extraction report

## Boundary

The move starts with the Brand perception scoring comment block.

The move ends before the Site health scan history comment block.

The moved source includes all three tables and their aliases.

## Membership check

The search found no perception symbols in `shared/schema.ts`.

No perception foreign key remains in the barrel.

The temporary `shared/__b4_head.ts` file is absent.

## Import direction

`shared/schema/perception.ts` imports `brands` from `./brands`.

The probe foreign key uses the local `brandPerceptionProbeRuns` table.

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

## Git diff stat

```text
shared/schema.ts | 128 +------------------------------------------------------
1 file changed, 1 insertion(+), 127 deletions(-)
```

Git does not include the untracked new module in this command.

The new module is `shared/schema/perception.ts`.

## Consumer files

No consumer file changed.
