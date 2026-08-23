# Supabase migration report

Date: 2026-08-22

## Current architecture

VentureCite uses Supabase Auth, Storage, and PostgreSQL.

The Express server uses Drizzle and a PostgreSQL pool.

Production now contains migrations through `0113_rls_current_setting_initplan.sql`.

The root migration files and Supabase copies pass the migration synchronization check.

## Current production state

Production contains 114 checked rows in `public.schema_migrations`.

The latest application migration is `0113_rls_current_setting_initplan.sql`.

Production contains 46 users, 45 brands, and 29 articles.

The ownership audit found zero brand-owner orphans.

Production has three restricted request and worker roles.

The restricted roles have no unsafe owner or database creation privileges.

The `venturecite_runtime` login exists.

Its membership dry run, apply command, and post-apply audit passed.

The application did not switch to that login.

Legacy routes and system workers still require the current owner connection.

The runtime cutover remains deferred until those paths change.

## Backup and restore proof

The release created schema, role, full-data, Auth-data, and public-data backups before production migration.

The release recorded SHA-256 hashes in the secure backup directory.

An isolated restore preserved 46 users, 45 brands, 29 articles, and zero brand-owner orphans.

The isolated restore applied migrations 0094 through 0111 without error.

The restore made no provider calls, emails, payments, Buffer posts, push notifications, or deployment.

The isolated restore ended with 112 checked application rows through migration 0111.

That row count is historical restore evidence.

It does not replace the current production count of 114 rows through migration 0113.

## Migration groups

Migrations 0096 and 0097 define request access for user, brand, and content data.

Migrations 0098 through 0100 define the transactional outbox, cost convergence, and claim indexes.

Migrations 0101 through 0110 add request-safe profile, content, command, provider-state, quota, and soft-delete access.

Migration 0111 restricts execution of the security-definer auth trigger function.

Migration 0112 adds a temporary self-grant for the current application connection.

The self-grant permits role entry with `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

Migration 0113 changes 21 audited RLS expressions to cache request context once per statement.

It preserves the policy roles, commands, and access predicates.

The production advisor now reports no database performance warning.

One Auth warning remains because leaked-password protection is disabled.

## Historical preview checkpoints

Earlier preview reports described an empty branch and a data-backed branch.

Those branches helped test migration order and restore behavior before production release.

The data-backed branch matched the checked counts of 46 users, 45 brands, and 29 articles.

The preview report recorded 112 checked rows through migration 0111.

The current production release later applied migrations 0112 and 0113.

No earlier preview claim about a 94-row production ledger or missing migrations remains current.

## Verification

The local PostgreSQL integration run passed 37 of 37 tests.

The local browser run passed five of five safe flows with fake generation.

The full test run passed 204 files and 1,561 active tests.

TypeScript, lint, changed-file formatting, migration synchronization, whitespace, and the production build passed.

The live health endpoint returned HTTP 200 with `db: true`.

The authenticated read-only canary passed for brands, the dashboard, and articles.

The browser reported no error or warning during the final canary.

The canary made no write, provider, email, payment, Buffer, or push request.

The full repository format check still reports 216 baseline files outside this release diff.

## Controlled release result

The release used the production backup and the application migration ledger.

The release used one transaction per migration and a PostgreSQL advisory lock.

The release completed without a migration error.

No production data was deleted.

No provider call, email, payment, Buffer post, or push notification occurred.

The configured automatic deployment was triggered by the push to `main`.

The Render dashboard session was unavailable, so platform deployment status remains unverified.

## Open work

1. Enable leaked-password protection in Supabase Auth.
2. Move legacy routes and system workers from owner access.
3. Test and perform the runtime role cutover.
4. Add verified privacy values last.

The privacy legal entity and contact values remain pending.

The temporary compatibility grant must be revoked before changing `DATABASE_URL` to `venturecite_runtime`.
