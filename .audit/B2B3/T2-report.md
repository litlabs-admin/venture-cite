# T2 false-test audit

## PreviewParam.test.tsx

The old test claimed to test the preview admin gate.
It checked a local email suffix helper.
The application never imported that helper.

The real gate is in `client/src/tours/engine/TourOrchestrator.tsx:152-154`.
The component reads `user.isAdmin` and returns for a non-admin user.

I replaced the gate with `if (false) return` for the proof.
The old test still passed with three passing assertions.
This result showed that the old test did not exercise the real gate.

I rewrote the test as a component test.
It imports and renders `TourOrchestrator`.
It sets `previewTour=global-welcome` for a non-admin user.
It checks that the real component does not call `runTour`.

The replacement failed while the gate was disabled.
It passed after I restored `if (!isAdmin) return`.

## dashboardPreDataState.test.ts

The old test claimed to test the Day-0 `hasMeasured` rule.
It copied a rule about checks, scan time, and autopilot status.
It exercised only its local function.

The copied rule came from `c426c8e:client/src/pages/home.tsx:471-476`.
That rule no longer exists in the current dashboard.
The current public result is `hasMeasured` in `client/src/components/dashboard-panels/useDashboardData.ts:422`.
It is true when the hero response exists and `totalChecks` is positive.

I forced the current result to `false` for the proof.
The old test still passed with five passing assertions.
This result showed that the old test did not exercise the current dashboard.

I rewrote the test as a hook test.
It imports and calls `useDashboardData`.
It supplies a completed hero response with ten checks.
It checks the hook result through `hasMeasured`.

The replacement failed while `hasMeasured` was forced false.
It passed after I restored the real expression.

## focused verification

The two old tests proved nothing after the temporary breaks.

```text
npx.cmd vitest run tests/component/PreviewParam.test.tsx --maxWorkers=1
Test Files  1 passed (1)
Tests  3 passed (3)

npx.cmd vitest run tests/unit/dashboardPreDataState.test.ts --maxWorkers=1
Test Files  1 passed (1)
Tests  5 passed (5)
```

The four replacement test runs proved the new tests detect the broken code.

```text
npx.cmd vitest run tests/component/PreviewParam.test.tsx --maxWorkers=1
Temporary broken gate: failed. runTour was called once.

npx.cmd vitest run tests/component/PreviewParam.test.tsx --maxWorkers=1
Restored gate: Test Files  1 passed (1). Tests  1 passed (1).

npx.cmd vitest run tests/unit/dashboardPreDataState.test.ts --maxWorkers=1
Temporary broken result: failed. Expected true and received false.

npx.cmd vitest run tests/unit/dashboardPreDataState.test.ts --maxWorkers=1
Restored result: Test Files  1 passed (1). Tests  1 passed (1).
```

## temporary-edit check

The final source has no temporary production edits.
`TourOrchestrator.tsx` contains `if (!isAdmin) return`.
`useDashboardData.ts` contains the real `hasMeasured` expression.

The final source-diff command and whitespace check produced no output.

```text
git diff -- client/src/tours/engine/TourOrchestrator.tsx client/src/components/dashboard-panels/useDashboardData.ts
(no output)

git diff --check
(no output)
```

The final status contains no temporary source edit.

```text
git status --short
 M .audit/B2B3/ledger.tsv
 M .audit/B2B3/prompts/T2-fake-tests.txt
 M tests/component/PreviewParam.test.tsx
 M tests/unit/dashboardPreDataState.test.ts
?? .audit/B2B3/T2-report.md
```

The prompt file was modified before this task.
I did not change it.

## project verification

```text
npm.cmd run check
Tour-target verification OK (22 targets, all present).

npm.cmd run lint
Exit code 0. ESLint reported 840 existing warnings and no errors.

npx.cmd eslint tests/component/PreviewParam.test.tsx tests/unit/dashboardPreDataState.test.ts
(no output)

npm.cmd run format:check
All matched files use Prettier code style!

npm.cmd test -- --maxWorkers=1
Test Files  224 passed | 20 skipped (244)
Tests  1684 passed | 91 skipped (1775)
Duration  317.46s
```
