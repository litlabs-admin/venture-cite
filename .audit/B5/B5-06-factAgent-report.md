# B5-06 factAgent extraction report

## Scope

I moved 28 methods to `server/storage/factAgentStorage.ts`.

I removed the 28 methods from `DatabaseStorage`.

`storage` spreads `factAgentStorage` last.

The remainder type excludes the fact-agent method keys.

## Cross-domain calls

None of the 28 methods call another storage method through `this.`.

The extracted module imports no other storage domain.

## Gate

`npx tsx scripts/storageSurface.ts --check .audit/B5/storage-surface-before.json` reports:

```
Storage surface intact. 307 interface methods, 315 implementations, 107 relocated, no duplicates, no body changed.
```

## Verification

`npm run check` passes.

`npm run lint` exits with code 0 and reports 860 warnings.

`npm run format:check` passes.

`npm test -- --maxWorkers=1` exits with code 0.

## Consumer changes

No consumer file changed.

## Defects

I found no defect during this move.
