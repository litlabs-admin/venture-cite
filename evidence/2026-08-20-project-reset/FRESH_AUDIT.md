# VentureCite current audit

Date: 2026-08-22

## Evidence rules

This report uses current source, current tests, current Git state, and verified production checks.

Older reports do not override current source or current command output.

Unverified claims remain open.

## Safety result

The release created fresh production backups before migration.

The release restored production schema and public data into an isolated PostgreSQL container.

The restore preserved 46 users, 45 brands, 29 articles, and zero brand-owner orphans.

The restore applied migrations 0094 through 0111 without error.

The controlled production release then applied migrations 0094 through 0111.

No production data was deleted.

No provider call, email, payment, Buffer post, or push notification occurred.

Commit `f8acec7` was pushed to `main` and triggered the configured automatic deployment.

Six post-push health checks returned HTTP 200 with `db: true`.

The Render dashboard session was unavailable, so platform deployment status remains unverified.

## Production database

Production now has 114 checked rows in `public.schema_migrations`.

The latest migration is `0113_rls_current_setting_initplan.sql`.

Production has 46 users, 45 brands, and 29 articles.

Production has zero brand-owner orphans.

Production has three restricted roles.

The restricted role post-audit found no unsafe owner or database creation privileges.

## Runtime access

The release created the `venturecite_runtime` login.

The membership dry run passed.

The membership apply command passed.

The post-apply audit passed.

A production-mode local boot showed that the login cannot replace the current owner connection yet.

Legacy routes and system workers still need owner access.

The deployment did not perform a runtime role cutover.

## Live verification

The live `/health` endpoint returned HTTP 200.

The health response reported `db: true`.

The authenticated read-only canary passed for brands, the dashboard, and articles.

The brands page returned the six brands owned by the approved canary account.

The dashboard and articles page loaded without browser errors or warnings.

The canary made no write, provider, email, payment, Buffer, or push request.

The production advisor now reports only the Auth leaked-password warning.

Migration 0112 now defines a temporary compatibility grant for the current application connection.

The migration adds one self-granted row for each restricted role.

Each new row has `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The existing direct-role admin rows remain unchanged.

The new self-grant explicitly sets `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

Migration 0112 is applied in production.

Migration 0113 is applied in production.

All 21 audited policies now use the initialization-plan expression form.

No audited policy uses the old expression form.

Revoke the temporary option before the runtime `DATABASE_URL` cutover.

## Local verification

The local PostgreSQL integration run passed 37 of 37 tests.

The local browser run passed five of five safe flows with fake generation.

The full test run passed 204 files and 1,561 active tests.

TypeScript, lint, changed-file formatting, migration synchronization, whitespace, and the production build passed.

The full repository format check still reports 216 baseline files outside this release diff.

## Current application state

Actor-bound repositories handle the migrated request paths.

The request repositories open restricted transactions and do not return raw transactions.

Generic OpenAI kickoff and content-cost recording use the transactional outbox.

Stripe, Resend, Buffer, and synchronous model routes remain direct by design.

## Remaining work

1. Enable leaked-password protection in Supabase Auth.
2. Move legacy routes and system workers from owner access.
3. Test and perform the runtime role cutover.
4. Add verified privacy values last.

The privacy legal entity and contact values remain pending.
