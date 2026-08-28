# B5-05 brands storage report

## Result

I moved 24 methods into `server/storage/brandsStorage.ts`.

Twenty-three methods moved from `DatabaseStorage`.

`getRunsByBrand` already lived in `workflowStorage.ts` after B5-04.

I moved it into the brands module once.

`storage` spreads `brandsStorage` last.

The composition helper excludes the brands object keys from `DatabaseStorage` requirements.

## Calls through `this`

`deleteBrand` calls `this.clearTourStateForBrand`.

The composed `storage` object resolves that platform method at runtime.

`addBrandNameVariation` calls `this.getBrandById`.

`getLatestBrandVisibility` calls `this.getBrandVisibilitySnapshots`.

I kept all three calls as `this.` calls.

I added no cross-domain storage import.

## Input defect left unchanged

The task lists `getRunsByBrand` as a `DatabaseStorage` method.

B5-04 had already moved it into `workflowStorage.ts`.

It is not declared in `IStorage`.

The brands module uses the existing `Record<string, unknown>` allowance.

I did not change the interface.

## Consumer changes

No production consumer file changed.

I changed `workflowStorage.ts` only to remove the moved implementation.

I did not change the three pre-edited unit test files.

## Verification

The storage gate passed.

```text
Storage surface intact. 307 interface methods, 315 implementations, 79 relocated, no duplicates, no body changed.
```

`npm run check` passed.

Tour target verification found 22 targets.

`npm run lint` exited with 852 existing warnings and no errors.

`npm run format:check` passed.

The direct composition check found both extracted interface methods on `storage`.

The check used a local dummy database URL and made no database request.

`npm test -- --maxWorkers=1` failed with three fixture errors.

`brandFactScrapeRunsStorage.test.ts` creates `DatabaseStorage` directly.

`mentionsStorage.test.ts` creates `DatabaseStorage` directly.

Those pre-edited fixtures do not compose `brandsStorage`.
