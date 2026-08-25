# Migration ledger reconciliation

## Problem

Supabase records timestamped migration mirrors in `supabase_migrations.schema_migrations`.

The application runner records root filenames in `public.schema_migrations`.

The local database has all 110 root migrations applied through the Supabase ledger.

The application ledger is empty, so the runner tries to apply historical SQL again.

Migration `0003` then references the `articles.slug` column removed by migration `0033`.

The release must not edit historical migrations or rerun destructive SQL.

## Usage

The caller remains unchanged:

```ts
await applyMigrations();
```

On a Supabase database, the runner will verify the internal ledger first.

It will record matching root filenames in the application ledger when they are missing.

It will then skip those SQL files as already applied.

On a database without the Supabase ledger, the existing runner behavior remains unchanged.

## Shape

The runner owns one internal reconciliation function.

The function reads migration names and generated SHA-256 headers from the Supabase ledger.

It compares them with the current root migration files.

It fails before SQL execution when a file is missing or has a different checksum.

It inserts only missing application-ledger rows.

The function does not expose Supabase storage types to callers.

## Decision

Use the Supabase ledger as read-only evidence of applied root migrations.

This preserves immutable migration files and prevents a mixed ledger from running old SQL.

The local ledger contains all 110 root files with matching checksums.

## Trade-offs accepted

A partial or inconsistent Supabase ledger blocks the release.

The sync script must keep the generated SHA-256 header in each mirror.

This design adds no migration SQL and makes no production change by itself.

## Alternatives considered

Editing `0003_fk_hardening.sql` would change historical migration meaning.

Ignoring the mismatch could rerun destructive SQL against real data.

Using the Supabase CLI as the release runner would bypass the current application release checks.

## Open questions and risks

Production metadata and backup evidence still require an approved read-only release session.

Provider outbox adapters remain separate work.

Privacy values remain deferred until the final release phase.

## Next implementation step

Implement the internal reconciliation and verify the local runner completes without applying historical SQL.
