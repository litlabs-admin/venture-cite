# Supabase migration report

Date: 2026-08-25

## Current architecture

VentureCite uses Supabase Auth, Storage, and PostgreSQL.

The Express server uses Drizzle and a PostgreSQL pool.

Production now contains migrations through `0114_request_brand_deletion_preview.sql`.

The root migration files and Supabase copies pass the migration synchronization check.

## Current production state

Production contains 115 checked rows in `public.schema_migrations`.

The latest application migration is `0114_request_brand_deletion_preview.sql`.

The latest read-only production check found 46 users, 44 brands, 31 articles, 1,154 brand prompts, and 416 citation runs.

The ownership audit found zero brand-owner orphans.

Production has three restricted request and worker roles.

The restricted roles have no unsafe owner or database creation privileges.

The `venturecite_runtime` login exists.

Its membership dry run, apply command, and post-apply audit passed.

The application did not switch to that login.

Legacy routes and system workers still require the current owner connection.

The runtime cutover remains deferred until those paths change.

## Backup and restore proof

The fresh release backup is in `C:\Users\yoges\OneDrive\Documents\venturecite-secrets\prod-release-20260824-045958`.

The backup contains non-empty schema, public-data, and role files.

The backup SHA-256 hashes are recorded outside the repository.

The backup snapshot contained 46 users, 45 brands, 30 articles, 1,154 brand prompts, and 394 citation runs.

A hashed primary-key comparison found all 46 users unchanged.

It found one backup-only brand, one current-only article, and 22 current-only citation runs.

The audit log records one `brand.delete.completed`, one article creation, and 22 citation runs after the backup.

This proves that production changed after the backup.

The migration did not restore, delete, or modify application rows.

The backup is valid for restore planning, but it is not a current production snapshot.

Earlier isolated-restore evidence remains historical and does not replace the current production counts.

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

Migration 0114 moves the brand deletion preview into the actor-bound content request role.

It grants only `brand_id` on `brand_prompts` and `citation_runs`.

It enables RLS and checks ownership through the transaction actor.

One Auth warning remains because leaked-password protection is disabled.

## Historical preview checkpoints

Earlier preview reports described an empty branch and a data-backed branch.

Those branches helped test migration order and restore behavior before production release.

The data-backed branch matched the checked counts of 46 users, 45 brands, and 29 articles.

The preview report recorded 112 checked rows through migration 0111.

The current production release later applied migrations 0112 through 0114.

No earlier preview claim about a 94-row production ledger or missing migrations remains current.

## Verification

The current focused unit run passed 31 tests.

The full test run passed 204 files and 1,565 tests with one worker.

The local PostgreSQL integration fixture now covers the 0114 ownership cases.

Its last run was blocked because the Docker host port proxy terminated local connections.

The local browser run passed five of five safe flows with fake generation.

TypeScript, tour checks, lint, changed-file formatting, migration synchronization, whitespace checks, and the production build passed.

Lint reported 790 existing warnings and zero errors.

The full repository format check still reports 209 baseline files outside this release diff.

The live health endpoint returned HTTP 200 with `db: true`.

The authenticated read-only canary passed for brands, the dashboard, and articles.

The browser reported no error or warning during the final canary.

The canary made no write, provider, email, payment, Buffer, or push request.

## Controlled release result

The release used the production backup and the application migration ledger.

The release used one transaction per migration and a PostgreSQL advisory lock.

The guarded bootstrap release applied migration 0114 without a migration error.

The migration changed privileges and policies only.

Read-only checks confirmed strict TLS, the application ledger, role attributes, RLS, and cross-user denial.

No provider call, email, payment, Buffer post, or push notification occurred.

Commit `23fc4c9` is pushed to remote `main`.

The Render dashboard session remains unavailable, so platform deployment status is unverified.

## Open work

1. Verify the automatic Render deployment after the live link or dashboard access is available.
2. Enable leaked-password protection in Supabase Auth.
3. Move the remaining legacy routes and system workers from owner access.
4. Test and perform the runtime role cutover.
5. Add verified privacy values last.

The local RLS integration test needs a stable Docker host port before it can run.

The privacy legal entity and contact values remain pending.

The temporary compatibility grant must be revoked before changing `DATABASE_URL` to `venturecite_runtime`.
