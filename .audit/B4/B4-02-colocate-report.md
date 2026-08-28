# B4-02 schema companion colocation report

The task changes declaration order in `shared/schema.ts` only.

## Ordering rule

`users` stays at the file start through the identity import and re-export.
`insertUserSchema` now sits directly below that re-export.
`brands` follows `users`.
Each later table follows every table named by its foreign keys.
The order keeps the prior table order when no foreign key constrains it.
The check found 68 local tables and zero forward foreign keys.

## Shared helpers

I keep `sql`, Drizzle column builders, `createInsertSchema`, and `z` in the import block.
They serve many table declarations, schemas, or type aliases.
I also keep the identity and outbox imports there.
They are module imports, not local table helpers.
There are no local table-only constants, enums, or helpers to move.

## Companion checks

The placement check found 41 insert schemas and 131 table type aliases.
It found zero companion groups after another table declaration.
It found zero foreign keys that point to a later local table.

## Gate outputs

### 1. Export surface

```text
> venturecite@1.0.0 schema:surface:check
> tsx scripts/schemaExportSurface.ts --check .audit/B4/schema-exports-before.txt

Export surface unchanged. 260 exports.
```

### 2. Generated SQL

```text
HEAD generator: 71 tables
Current generator: 71 tables
HEAD normalized statements: 271
Current normalized statements: 271
Normalized SQL diff: no differences.
```

The generator used separate temporary output directories.
The comparison split on `--> statement-breakpoint`, normalized whitespace, sorted statements, and compared each position.
`shared/__head.ts` was deleted after the comparison.

### 3. Type check

```text
> venturecite@1.0.0 check
> tsc && npm run verify:tours

Tour-target verification OK (22 targets, all present).
```

### 4. Lint and format

```text
> venturecite@1.0.0 lint
> eslint .

840 problems (0 errors, 840 warnings)
```

```text
> venturecite@1.0.0 format:check
> prettier --check .

All matched files use Prettier code style!
```

### 5. Tests

```text
Test Files  224 passed | 20 skipped (244)
Tests  1684 passed | 91 skipped (1775)
Duration  277.12s
VITEST_EXIT_CODE=0
```

## Diff and consumer files

```text
shared/schema.ts | 424 +++++++++++++++++++++++++++----------------------------
1 file changed, 212 insertions(+), 212 deletions(-)
```

No consumer file changed.
`git diff --name-only` lists only `shared/schema.ts`.
