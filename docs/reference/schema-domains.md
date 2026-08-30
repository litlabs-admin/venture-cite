# Schema domains

`shared/schema.ts` is a 13-line barrel file. It re-exports every table,
type, and Zod schema from 13 domain modules under `shared/schema/`:

```ts
export * from "./schema/brands";
export * from "./schema/chatbot";
export * from "./schema/competitors";
export * from "./schema/content";
export * from "./schema/citations";
export * from "./schema/factAgent";
export * from "./schema/identity";
export * from "./schema/jobs";
export * from "./schema/perception";
export * from "./schema/platform";
export * from "./schema/prompts";
export * from "./schema/siteHealth";
export * from "./schema/signals";
```

147 files import from `shared/schema`. None of them changed when the schema
was split; every name the barrel re-exports is unchanged from before the
split.

## Domains

| Module      | Tables | Depends on                         |
| ----------- | -----: | ---------------------------------- |
| identity    |      3 | (none)                             |
| brands      |      1 | identity                           |
| content     |      5 | brands, identity                   |
| prompts     |      8 | brands                             |
| competitors |      3 | brands                             |
| citations   |      7 | brands, content, identity, prompts |
| signals     |      7 | brands, content                    |
| factAgent   |      7 | brands                             |
| siteHealth  |      2 | brands, identity, factAgent        |
| perception  |      3 | brands                             |
| chatbot     |      3 | brands, identity                   |
| jobs        |      7 | brands, identity                   |
| platform    |     15 | brands, identity                   |

71 tables total. The dependency graph is acyclic: `identity` imports nothing,
and no module imports one that (transitively) depends on it.

Two domains, `perception` and `siteHealth`, have no corresponding storage
module (see [Storage layer](./storage-layer.md)) — no `IStorage` method
touches their tables through a dedicated domain object.

`signals` holds content that other sites publish about a brand. `content`
holds content the brand itself publishes. They are separate modules because
the two have different lifecycles, not because the tables are unrelated.

`prompts` is separate from `citations` even though prompts exist to drive
citation runs: the eight prompt tables reference only `brands` and each
other, and folding them into `citations` would have made `citations` depend
on nothing new while making `prompts` an artificial subset.

`jobs` groups its seven tables by failure mode (queuing, leasing, and
draining work) rather than by user-facing feature. This groups together the
tables where read-modify-write races have occurred in this codebase: the
per-brand LLM concurrency limiter, the outbox drain, and the weekly digest
job.

`platform` is the one domain that is grouped by exclusion: it holds whatever
did not fit elsewhere; 15 tables spanning analytics, alerting, audit logs,
community posts, cost tracking, and more. It is recorded here, not hidden,
as an open question for a future pass once the storage layer's usage
patterns show which of these tables are actually read and written together.

## How this was verified to be a lossless split

Every extraction ran against the same six checks:

1. **Export surface** — every exported name from the pre-split
   `shared/schema.ts` still exists after the split, checked by walking the
   TypeScript AST rather than importing the module (a type-only export is
   invisible to `tsc` if nothing currently references it).
2. **Generated SQL** — Drizzle's generated `CREATE TABLE` statements,
   sorted before comparison because Drizzle emits tables in declaration
   order and a split changes that order without changing the schema.
3. Typecheck (`tsc`).
4. Lint and format.
5. The full test suite.
6. **Membership** — no Zod builder or type alias belonging to a moved table
   was left behind in the barrel.

Gates 1 through 5 can all pass on a module that left a declaration behind in
the wrong file — the declaration still compiles, still exports, and still
generates identical SQL. Only gate 6 catches that class of mistake; it exists
because it happened once, in the identity extraction.

See [Verifying these documents](./verifying-these-docs.md) for the commands
that run these checks today.

## Foreign keys: the schema declares them, the database names them

`migrations/*.sql` is the source of truth for what the database contains.
The Drizzle definitions in `shared/schema/*.ts` describe the same tables so
the query layer is typed and relationships are visible to a reader.

Those two agree on structure and disagree on one detail: constraint names.
Production carries both conventions, because both tools created constraints
over time.

| Created by                      | Name shape                           | Example                         |
| ------------------------------- | ------------------------------------ | ------------------------------- |
| Hand-written SQL in a migration | `<table>_<column>_fkey`              | `metrics_history_brand_id_fkey` |
| Drizzle                         | `<table>_<column>_<ref>_<refcol>_fk` | `brands_user_id_users_id_fk`    |

So a `.references()` call in the schema file does NOT necessarily name the
constraint that exists in the database. It names the relationship correctly -
target table, column and `onDelete` action all match - but if Drizzle were
asked to create it, it would pick a different name.

This matters for exactly one command: `npm run db:push`, which applies the
Drizzle schema directly rather than running the migrations. Against a database
that already has these constraints under their `_fkey` names, push would add a
SECOND constraint for the same relationship under its own name. Nothing in CI,
the deploy path or any script runs `db:push`; migrations are applied by
`npm run db:migrate`, which reads `migrations/*.sql` through
`server/lib/migrationRunner.ts` and never consults the Drizzle schema.

Treat `db:push` as unsafe against any database that has had migrations
applied to it. Add foreign keys by writing a migration, then declare the same
relationship in the Drizzle file so the schema stays honest about it.
