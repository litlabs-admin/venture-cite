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

No provider call, email, payment, Buffer post, push notification, or deployment occurred.

## Production database

Production now has 112 checked rows in `public.schema_migrations`.

The latest migration is `0111_revoke_handle_new_user_execute_after_function_replace.sql`.

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

The authenticated read-only canary remains pending.

The canary must avoid writes, provider calls, email, payment, Buffer, and push actions.

The production advisor reports one Auth security warning and 21 request-policy performance warnings.

## Local verification

The local PostgreSQL integration run passed 37 of 37 tests.

The local browser run passed five of five safe flows with fake generation.

The constrained full test run passed 203 files and 1,556 tests.

TypeScript, lint, changed-file formatting, migration synchronization, whitespace, and the production build passed.

The full repository format check still reports 220 baseline files outside this release diff.

## Current application state

Actor-bound repositories handle the migrated request paths.

The request repositories open restricted transactions and do not return raw transactions.

Generic OpenAI kickoff and content-cost recording use the transactional outbox.

Stripe, Resend, Buffer, and synchronous model routes remain direct by design.

## Remaining work

1. Run the authenticated canary against safe read paths.
2. Review live errors after the canary.
3. Enable leaked-password protection in Supabase Auth.
4. Plan the request-policy performance fixes as a separate migration.
5. Resolve owner access for legacy routes and system workers.
6. Decide and test the runtime role cutover.
7. Add verified privacy values last.

The privacy legal entity and contact values remain pending.
