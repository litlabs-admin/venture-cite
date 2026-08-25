# Project reset status

Date: 2026-08-22

## Scope and safety

This report uses current source, test output, Git state, and verified production checks.

The production backup completed before the migration release.

The isolated restore proved that migrations 0094 through 0111 preserve current application rows.

The controlled production release completed without data loss.

No provider call, email, payment, Buffer post, or push notification occurred.

Commit `f8acec7` was pushed to `main` and triggered the configured automatic deployment.

Six post-push health checks returned HTTP 200 with `db: true`.

The Render dashboard session was unavailable, so platform deployment status remains unverified.

The local Supabase stack and its Docker containers are stopped.

The privacy page still has deferred legal entity and contact placeholders.

## Implemented work

Migrations 0094 through 0113 now run in production.

The production application ledger has 114 checked rows.

Actor-bound repositories handle user profiles, brands, articles, revisions, distributions, keywords, and content jobs.

Brand creation and website import use an atomic brand quota check.

Deletion checks enforce ownership before soft-delete scheduling.

Restricted transactions do not cross request boundaries.

Generic OpenAI kickoff and content-cost recording use the transactional outbox.

Stripe, Resend, Buffer, and synchronous model routes keep their existing direct contracts.

## Verified local results

The local PostgreSQL integration run passed 37 of 37 tests.

The local browser run passed five of five safe flows with fake generation.

The full test run passed 204 files and 1,561 active tests.

The checks passed for TypeScript, lint, changed-file formatting, migration synchronization, whitespace, and the production build.

The full repository format check still reports 216 baseline files outside this release diff.

The local browser run did not call OpenAI or other live providers.

## Verified production results

Production has 46 users, 45 brands, and 29 articles.

Production has zero brand-owner orphans.

Production has 114 checked application migration rows through migration 0113.

Production has three restricted roles.

The `venturecite_runtime` login exists.

The membership dry run, apply command, and post-apply audit passed.

A production-mode local boot showed that the runtime login cannot replace the current owner connection yet.

Legacy routes and system workers still need owner access.

The live `/health` endpoint returned HTTP 200 with `db: true`.

The authenticated read-only canary passed for brands, the dashboard, and articles.

The browser reported no error or warning during the final canary.

The production advisor reports one Auth security warning and no database performance warning.

Migration 0112 adds a pending temporary compatibility grant for the current application connection.

The migration adds one self-granted row for each restricted role.

Each new row has `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The existing direct-role admin rows remain unchanged.

The new self-grant explicitly sets `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

Migrations 0112 and 0113 are applied in production.

All 21 audited policies use the initialization-plan expression form.

Revoke the temporary option before the runtime `DATABASE_URL` cutover.

## Remaining work

1. Enable leaked-password protection in Supabase Auth.
2. Move legacy routes and system workers from owner access.
3. Test and perform the runtime role cutover.
4. Add verified privacy values last.

The privacy values require user-provided legal entity and contact details.
