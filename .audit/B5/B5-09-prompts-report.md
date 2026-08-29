# B5-09 prompts storage report

## Result

I moved 39 prompt methods from `DatabaseStorage` to `promptsStorage`.

`storage` spreads `promptsStorage` last.

`databaseStorageObject` excludes the moved keys from the remaining class shape.

No consumer file changed.

## Cross-domain calls

No moved method calls another storage domain through `this.`.

The prompts module imports no other storage module.

## Verification

The storage gate reported:

```text
Storage surface intact. 307 interface methods, 315 implementations, 217 relocated, no duplicates, no body changed.
```

`npm run check` passed.

`npm run lint` passed with 873 existing warnings and no errors.

`npm run format:check` passed.

`npm test -- --maxWorkers=1` passed.

The test run reported 224 passed files, 20 skipped files, 1,684 passed tests, and 91 skipped tests.

## Defects

`createSetHealthRun` and `setPhrasingTestResults` use existing `as any` casts.

The casts bypass TypeScript checks.

I left them unchanged because the extraction requires verbatim method bodies.
