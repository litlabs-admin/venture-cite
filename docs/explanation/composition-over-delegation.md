# Why the storage layer uses composition, not delegation

[Storage layer](../reference/storage-layer.md) describes `server/storage.ts`
as 11 domain objects spread together into one `storage` object. The
interesting design decision is not that the interface got split — it is how
the split modules call each other.

## The problem: six methods cross a domain boundary

Splitting `DatabaseStorage`'s 307 methods - the count at the time of the
split - along the 13 schema domains
produces 11 storage domains (`perception` and `siteHealth` need none). Most
of the 26 internal `this.` calls inside the original class stay within one
domain. Six do not:

```
deleteBrand              -> clearTourStateForBrand    brands      -> platform
getCitationQualities     -> getBrandPromptsByBrandId  citations   -> prompts
getCitationQualityStats  -> getBrandPromptsByBrandId  citations   -> prompts
getCompetitorLeaderboard -> getBrandById, getBrands   competitors -> brands
recordCurrentMetrics     -> getGeoRankingsBy...       platform    -> citations
getUserUsage             -> resetMonthlyUsage         identity    -> identity
```

Any decomposition has to answer: how does `competitorsStorage.getCompetitorLeaderboard`
reach a method that now lives in `brandsStorage`?

## Why not have modules import each other

The obvious answer is delegation: `competitorsStorage` imports `brandsStorage`
and calls its methods directly. Laid out from the six crossings above, that
produces `brands -> platform`, `citations -> prompts` (twice),
`competitors -> brands`, and `platform -> citations`. Chain those together —
`competitors -> brands -> platform -> citations -> prompts` — and the
modules already form a five-deep import chain. Add one more real crossing in
either direction and it becomes a cycle, which JavaScript's module system
tolerates poorly and which would have undone the entire point of separating
these into independent files.

## What composition buys instead

Object spread does not have this problem, because of how JavaScript resolves
`this`. Each domain module is written as:

```ts
export const competitorsStorage = {
  async getCompetitorLeaderboard(...) {
    const brand = await this.getBrandById(...); // resolves through `storage`
  },
} satisfies Partial<IStorage> & ThisType<IStorage>;
```

`this` inside a plain-object method is bound at call time to whatever object
the method is called _on_ — not to the object literal where it was
_defined_. Once `competitorsStorage` is spread into `storage`, calling
`storage.getCompetitorLeaderboard()` binds `this` to `storage`, which also
has `getBrandById` on it (spread in from `brandsStorage`). The cross-domain
call resolves without `competitors/*` ever importing anything from
`brands/*`. `ThisType<IStorage>` is a TypeScript-only annotation that tells
the compiler `this` has the full `IStorage` shape inside these methods, so
`this.getBrandById(...)` type-checks even though `getBrandById` is not
declared in the same file.

This was verified, not assumed, before being adopted: the pattern
type-checks under `--strict`, runs correctly at call time, and — the
property that matters most for a decomposition meant to prevent silent
gaps — removing a domain from the spread produces a compiler error
(`TS2741: Property '...' is missing in type '...'`) rather than a
runtime `undefined is not a function`. The compiler enforces that the
composition is complete.

## What this does not solve

Composition avoids a cyclic import graph. It does not, by itself, reduce
what any given caller depends on — every one of the 60 files that import
`storage` still sees the entire interface, exactly as before the split. That is a
separate, larger problem, addressed by encouraging new code to import a
single domain object directly instead of the composed `storage`; see
[Storage layer](../reference/storage-layer.md#what-this-composition-does-not-fix-by-itself).
