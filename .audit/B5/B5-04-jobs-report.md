# B5-04 jobs storage report

## Result

I moved 19 methods into `server/storage/jobsStorage.ts`.

Fourteen methods moved from `DatabaseStorage`.

Five workflow run methods moved from `workflowStorage`.

`storage` spreads `jobsStorage` last.

`workflowStorage` spreads `jobsStorage` to keep its direct callers working.

## Cross-domain calls

None of the 19 methods call another storage method through `this.`.

No cross-domain import resolves a storage method call.

## Defect left unchanged

The five workflow methods are not declarations in `IStorage`.

I kept the 307 interface declarations unchanged.

`jobsStorage` permits these compatibility methods with `Record<string, unknown>`.

## Consumer changes

No production consumer file changed.

Two unit test fixtures now compose `jobsStorage` with `DatabaseStorage`.

The tests now exercise the extracted methods with the existing database mocks.

## Verification

The storage gate passed.

```text
Storage surface intact. 307 interface methods, 315 implementations, 55 relocated, no duplicates, no body changed.
```

`npm run check` passed.

Tour target verification found 22 targets.

`npm run lint` passed with 847 warnings and no errors.

`npm run format:check` passed.

The focused storage tests passed with 49 tests.

`npm test -- --maxWorkers=1` passed with 224 files and 1,684 tests.
