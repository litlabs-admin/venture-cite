# B5-11 content storage extraction

## Result

I moved 51 methods from `DatabaseStorage` to `contentStorage`.

I added `contentStorage` last in the `storage` composition.

I removed the moved class methods.

No consumer file changed.

## `this.` calls

No moved method calls another domain through `this.`.

Two completion methods call `this.completeContentJobSliceInTransaction`.

That helper stays in the content module.

The methods use an explicit local `this` type.

The composed `storage` object supplies that helper at runtime.

## Verification

```text
Storage surface intact. 307 interface methods, 315 implementations, 315 relocated, no duplicates, no body changed.

npm run check
Tour-target verification OK (22 targets, all present).

npm run lint
Exit 0. The repository reports existing warnings and no errors.

npm run format:check
All matched files use Prettier code style.

npm test -- --maxWorkers=1
Test Files  224 passed | 20 skipped (244)
Tests  1684 passed | 91 skipped (1775)
Duration  274.20s
```

## Defects left unchanged

No behavior defect appeared during the move.

The existing content-job claim methods use unchecked `as any` row decoding.

I left that code unchanged because the move gate requires identical method bodies.
