# Production database audit

## Scope

The audit ran against the VentureCite production Supabase project.

The release used the approved CA certificate and strict TLS verification.

Read-only checks did not return user rows, brand rows, identifiers, emails, or secret values.

The release created fresh logical backups before applying migrations.

## Backup and restore proof

The release created fresh schema, role, full-data, Auth-data, and public-data backups.

The release recorded SHA-256 hashes for the backup files in the secure backup directory.

The release restored the production schema and public data into an isolated PostgreSQL container.

The isolated restore preserved 46 users, 45 brands, 29 articles, and zero brand-owner orphans.

The isolated restore applied migrations 0094 through 0111 successfully.

The isolated restore ended with 112 application migration rows and three restricted roles.

The restore made no provider calls, emails, payments, Buffer posts, push notifications, or deployment.

## Controlled production release

The controlled release applied migrations 0094 through 0111 to production.

The release used the application ledger in `public.schema_migrations`.

The release used one transaction per migration and a PostgreSQL advisory lock.

The release completed without a migration error.

Production now has 114 checked application-ledger rows.

The latest application migration is `0113_rls_current_setting_initplan.sql`.

Production has 46 users, 45 brands, and 29 articles.

No brand has a missing owner.

Production has three restricted roles.

The restricted roles have no unsafe owner or database creation privileges.

## Runtime login

The release created the `venturecite_runtime` login.

The role membership dry run passed.

The role membership apply command passed.

The post-apply membership audit passed.

A production-mode local boot showed that this login cannot replace the current owner connection yet.

Legacy routes and system workers still need owner access.

The deployment did not switch to `venturecite_runtime`.

The current evidence does not claim a runtime cutover.

## Live health check

The live `/health` endpoint returned HTTP 200.

The health response reported `db: true`.

The authenticated application canary passed for brands, the dashboard, and articles.

The post-release advisor reports one disabled leaked-password protection warning.

It reports no database performance warning.

Migration 0112 defines a temporary compatibility grant for the current application connection.

The migration adds one self-granted row for each restricted role.

Each new row has `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The existing direct-role admin rows remain unchanged.

The new self-grant explicitly sets `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

Migration 0112 is applied in production.

Migration 0113 is applied in production.

All 21 audited policies use the initialization-plan expression form.

Revoke the temporary option before changing `DATABASE_URL` to `venturecite_runtime`.

## Safety result

No production data was deleted.

No production provider call occurred.

No email was sent.

No payment was created or captured.

No Buffer post or push notification occurred.

Commit `f8acec7` was pushed to `main` and triggered the configured automatic deployment.

Six post-push health checks returned HTTP 200 with `db: true`.

The Render dashboard session was unavailable, so platform deployment status remains unverified.

The privacy legal entity and contact values remain pending.

## Remaining release gates

1. Enable leaked-password protection in the Supabase Auth settings.
2. Move legacy routes and workers from owner access.
3. Configure the runtime login only after that work.
4. Add verified privacy values last.
