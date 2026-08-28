# B4-14 jobs report

## Located tables

- `llmJobs` was at lines 73 through 109 before the move.
- `agentTasks` was at lines 198 through 252 before the move.
- `workflowRuns` was at lines 254 through 292 before the move.
- `outboxCommands` was at lines 383 through 446 before the move.
- `scanJobs` was at lines 558 through 579 before the move.
- `jobLeases` was at lines 637 through 648 before the move.
- `llmConcurrencySlots` was at lines 651 through 664 before the move.

## Membership check

`rg` found zero target table references in `shared/schema.ts`.
The barrel has no target Zod builders or type aliases.
The barrel has no foreign keys to these tables.

## Import direction and cycle check

`shared/schema/jobs.ts` imports `brands` from `./brands`.
It imports `users` from `./identity`.
It imports outbox types from `../outbox`.
No existing schema module imports `jobs`.
The extraction adds no schema import cycle.

## Verification

```text
PASS  export surface  Export surface unchanged. 260 exports.
PASS  generated SQL  271 statements before, 271 after
PASS  typecheck
PASS  lint
PASS  format
PASS  tests  Tests  1684 passed | 91 skipped (1775)

All 6 gates pass. The split is safe to commit.
```

## Changed files

No consumer file changed.
The source change is limited to `shared/schema.ts` and `shared/schema/jobs.ts`.
