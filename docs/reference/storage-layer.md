# Storage layer

`server/storage.ts` declares the `IStorage` interface and exports a single
object, `storage`, that implements it. Every part of the server that reads or
writes application data does so through this object.

No method or file count is stated here on purpose. `npm run storage:surface`
prints the current interface and implementation counts, and
`npm run storage:surface:check` fails CI when they change without the
baseline being updated deliberately. An earlier revision of this page pinned
the number and was wrong twice in one day, because the count moved underneath
it both times.

## Composition

`storage` is built by spreading 11 domain storage objects together, plus a
temporary object built from what remains of the original `DatabaseStorage`
class:

```ts
export const storage: IStorage = {
  ...databaseStorageObject(),
  ...chatbotStorage,
  ...identityStorage,
  ...competitorsStorage,
  ...jobsStorage,
  ...brandsStorage,
  ...factAgentStorage,
  ...platformStorage,
  ...citationsStorage,
  ...promptsStorage,
  ...signalsStorage,
  ...contentStorage,
};
```

Each domain object lives in `server/storage/<domain>Storage.ts` and has the
shape:

```ts
export const brandsStorage = {
  async getBrandById(id: string) { ... },
  // ...
} satisfies Partial<IStorage> & ThisType<IStorage>;
```

`satisfies Partial<IStorage>` lets each file declare only the methods it
implements, and the compiler still checks each method's signature against
`IStorage`. `ThisType<IStorage>` tells the compiler that `this` inside these
methods refers to the fully composed `storage` object, not to the object
literal being defined — which is what makes cross-domain calls resolve
correctly (see [Composition over
delegation](../explanation/composition-over-delegation.md)).

`server/databaseStorage.ts` originally held the entire `IStorage`
implementation in one 5,251-line class. As of this document, its class body
declares no methods; every method has moved into one of the 11 domain
modules above. `databaseStorageObject()` still exists in `server/storage.ts`
to convert whatever the class does still hold into a plain object before it
is spread first (so a later domain spread can override it), but it currently
has nothing to convert. The `DatabaseStorage` class itself, and the code
that spreads its (empty) output, are both still present in the file.

Two schema domains, `perception` and `siteHealth`, have no matching entry in
this list because no `IStorage` method is dedicated to their tables.

## Method allocation

| Domain      | Methods |
| ----------- | ------: |
| content     |      50 |
| signals     |      47 |
| prompts     |      39 |
| citations   |      39 |
| platform    |      31 |
| factAgent   |      28 |
| brands      |      24 |
| competitors |      16 |
| jobs        |      18 |
| identity    |      11 |
| chatbot     |      10 |

## A separate precedent: `workflowStorage.ts`

`server/storage/workflowStorage.ts` is a plain object with the same shape as
the 11 domain modules above, but it is not part of the `storage` composition.
`server/lib/workflowEngine.ts` imports and calls it directly. It predates the
storage-layer split and was the shape the split's authors copied; it is not
itself one of the spread domains.

## What this composition does not fix by itself

Splitting the implementation file into 11 modules does not, on its own,
change what any given caller depends on: every consumer still imports the
same `storage` object with the same 307-method surface as before. Three
further steps make the split pay off, and only the first two exist today:

1. Each domain object is exported directly (for example,
   `import { brandsStorage } from "./storage/brandsStorage"`), so new code
   can depend on a domain's own method count instead of all 307.
2. A committed baseline (`.audit/B5/storage-surface-before.json`) plus
   `scripts/storageSurface.ts` lets a reviewer prove that a change did not
   drop, duplicate, or silently rewrite a method (see [Verifying these
   documents](./verifying-these-docs.md)).
3. **Not yet done**: a check that flags a new `storage.<method>` call site
   where a direct domain import would do. Existing callers still go through
   the wide `storage` object. Migrating all 60 consumer files at once was
   judged too risky to do mechanically; the plan is for callers to migrate
   opportunistically, when someone is already editing that file.

## See also

- [Adding a storage domain method](../how-to/add-a-storage-domain-method.md)
- [Composition over delegation](../explanation/composition-over-delegation.md)
