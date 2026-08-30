# How to add a migration

Use this guide to add a schema change to VentureCite's PostgreSQL database.
`migrations/` is the source of truth. Do not edit `supabase/migrations/` by
hand; it is generated.

## Before you start

Read the table or column you are changing in `shared/schema/<domain>.ts`
first. Find the right domain in [Schema domains](../reference/schema-domains.md)
if you are not sure which file owns the table.

## Write the migration

1. Find the highest existing number in `migrations/` (for example,
   `0123_citation_run_last_advance.sql`) and create the next one:

   ```sh
   touch migrations/0124_your_change_name.sql
   ```

   Use a four-digit, zero-padded, sequential number and a short
   `snake_case` description, matching the existing files.

2. Write plain SQL. Wrap the statement in `BEGIN; ... COMMIT;` if it needs
   to be atomic. If you add a column that other code will read immediately,
   add it as nullable or with a default so existing rows do not break, and
   note in a comment whether a backfill is required.

3. Update the matching Drizzle table definition in
   `shared/schema/<domain>.ts` so the TypeScript type and the database agree.

## Generate the mirror

Run the sync script and commit its output:

```sh
node scripts/syncSupabaseMigrations.mjs
```

Do not write this file by hand. `npm run supabase:migrations:check` runs in
CI and fails the build if `supabase/migrations/` drifts from `migrations/`.

## Apply it locally

```sh
npm run db:migrate
```

This runs `tsx scripts/migrate.ts` against your local `DATABASE_URL`. It
takes a Postgres advisory lock, records the migration's filename and
checksum in `public.schema_migrations`, and skips any migration already
recorded there. Running it twice is safe: the second run finds nothing new
to apply.

Do not use `npm run db:migrate:release` locally. That command targets
production and requires `NODE_ENV=production` and
`CONFIRM_PRODUCTION_MIGRATIONS` to be set; see
[docs/deploy-runbook.md](../deploy-runbook.md) for a release.

## Verify

```sh
npm run schema:surface:check
node scripts/verifySchemaSplit.mjs
npm run supabase:migrations:check
npm run check
```

If your migration adds or changes a table that a test seeds or asserts
against, run the affected file under `tests/integration/` or
`tests/migrations/` — see [Running the integration suite
locally](./run-the-integration-suite.md) for how to point it at a real
database.
