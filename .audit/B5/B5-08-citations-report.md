# B5-08 citations storage report

## Result

I moved 40 citation methods from `DatabaseStorage` to `citationsStorage`.

`storage` now spreads `citationsStorage` last.

`databaseStorageObject` excludes the moved keys from its required class shape.

No consumer file changed.

## Cross-domain calls

`getCitationQualities` calls `this.getBrandPromptsByBrandId()`.

`getCitationQualityStats` calls `this.getBrandPromptsByBrandId()`.

Both calls stay as `this.` calls.

The composed `storage` object resolves them through the prompts domain.

Neither method imports another storage domain.

## Verification

The storage gate reported:

```text
Storage surface intact. 307 interface methods, 315 implementations, 178 relocated, no duplicates, no body changed.
```

`npm run check` passed.

`npm run lint` passed with 872 existing warnings and no errors.

`npm run format:check` passed.

`npm test -- --maxWorkers=1` passed.

The test run reported 224 passed files, 20 skipped files, 1,684 passed tests, and 91 skipped tests.

## Defects

I found no code defect during this move.
