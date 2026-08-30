# How to add a storage domain method

Use this guide to add a new database-access method to VentureCite's storage
layer. Read [Storage layer](../reference/storage-layer.md) first if you have
not already; this guide assumes you know which of the 11 domain modules
under `server/storage/` should own the new method.

## Add the method

1. Declare the method's signature on the `IStorage` interface in
   `server/storage.ts`.

2. Implement it in the matching domain file,
   `server/storage/<domain>Storage.ts`. Match the existing style in that
   file: an `async` method on the exported object, using `db` from
   `server/db.ts` and Drizzle query builders, not raw SQL unless the rest of
   the file already does.

3. If your method needs data owned by a different domain (for example, a
   `citations` method that needs a brand's prompts), call it as
   `this.<otherMethod>(...)`, not through a direct import of the other
   domain's file. `ThisType<IStorage>` on the exported object makes `this`
   resolve through the composed `storage` object, not the local file. See
   [Composition over
   delegation](../explanation/composition-over-delegation.md) for why. Do
   not import another domain's storage file directly — that reintroduces
   the cross-module dependency the composition pattern avoids.

4. If the new method is the first one for a domain that does not yet have a
   file (this only applies to `perception` and `siteHealth` today, which
   currently have none), create `server/storage/<domain>Storage.ts` with the
   same shape as an existing one:

   ```ts
   export const perceptionStorage = {
     async yourMethod(...) { ... },
   } satisfies Partial<IStorage> & ThisType<IStorage>;
   ```

   Then add `...perceptionStorage` to the object literal in
   `server/storage.ts`'s `export const storage: IStorage = { ... }`.

## Call the new method

Prefer importing the domain object directly in new call sites —
`import { brandsStorage } from "../storage/brandsStorage"` — over importing
the wide `storage` object, so the new caller's dependency is visible as one
domain instead of the entire interface. Existing call sites that already import
`storage` do not need to change.

## Verify

```sh
npx tsx scripts/storageSurface.ts --check .audit/B5/storage-surface-before.json
```

This fails if your change accidentally duplicates a method name across two
domain files, or if a method body you did not mean to touch changed. A new
method that only adds to the interface and one file will not trip this
check; it exists to catch accidental collisions and unintended edits to
methods you did not mean to change.

```sh
npm run check
npm test
```

If the new method needs an integration test against a real database, see
[Running the integration suite locally](./run-the-integration-suite.md).
