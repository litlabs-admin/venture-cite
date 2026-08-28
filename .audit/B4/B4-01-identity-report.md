# B4-01 identity module report

## Boundaries

The source block starts at line 23 with `export const users`.

The source block ends at line 240 with `InsertWaitlist`.

Line 241 is blank.

Line 242 starts the `citations` table.

I read the surrounding lines before the move.

I also compared the new module declarations with original lines 23 through 240.

The comparison passed.

`citations` and later tables reference `users`.

The barrel imports `users` for those existing local references.

## Moved declarations

`shared/schema/identity.ts` now contains `users`, `betaInviteCodes`, and `waitlist`.

It also contains `usageLimits`, `SELLABLE_TIERS`, `SellableTier`, `PLAN_PRICE_CENTS`, `PAYING_TIERS`, and `TRIAL_DAYS`.

It also contains `hasPurchasablePlan`, `isPayingTier`, and `resolveTier`.

It also contains `UpsertUser`, `User`, `InsertUser`, `BetaInviteCode`, `InsertBetaInviteCode`, `insertWaitlistSchema`, `Waitlist`, and `InsertWaitlist`.

The comments move with the declarations.

## Barrel form

`shared/schema.ts` imports `users` from `./schema/identity`.

It re-exports the module with `export * from "./schema/identity"`.

This retains value and type exports.

This also retains wildcard imports from `@shared/schema`.

The local import keeps all remaining foreign-key references unchanged.

No consumer file changed.

## Gate output

PowerShell blocks `npx.ps1` in this environment.

I used the Windows command equivalent, `npx.cmd`.

### Export surface

```text
$ npx.cmd tsx scripts/schemaExportSurface.ts --check .audit/B4/schema-exports-before.txt
Export surface unchanged. 260 exports.
```

Exit code: `0`.

### Runtime barrel probe

```text
$ npx.cmd tsx --eval <runtime probe>
true
```

The value from `import * as schema` equals the named `users` import.

Exit code: `0`.

### Type check

```text
$ npm.cmd run check

> venturecite@1.0.0 check
> tsc && npm run verify:tours

> venturecite@1.0.0 verify:tours
> tsx scripts/verify-tour-targets.ts

Tour-target verification OK (22 targets, all present).
```

Exit code: `0`.

### Lint

```text
$ npm.cmd run lint

> venturecite@1.0.0 lint
> eslint .

840 problems (0 errors, 840 warnings)
```

Exit code: `0`.

### Format check

```text
$ npm.cmd run format:check

> venturecite@1.0.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!
```

Exit code: `0`.

### Tests

```text
$ npm.cmd test -- --maxWorkers=1

Test Files  224 passed | 20 skipped (244)
Tests  1684 passed | 91 skipped (1775)
Start at  12:17:12
Duration  384.59s
```

Exit code: `0`.

## Git diff statistics

```text
$ git diff --stat
shared/schema.ts | 220 +------------------------------------------------------
1 file changed, 2 insertions(+), 218 deletions(-)
```

`git diff --stat` excludes untracked files.

The untracked additions are `shared/schema/identity.ts` and this report.

The existing audit files and `scripts/schemaExportSurface.ts` were untracked before this task.
