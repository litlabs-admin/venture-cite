# Supabase RLS foundation

## Current result

Production now contains migrations through `0113_rls_current_setting_initplan.sql`.

The production migration ledger contains 114 checked rows.

Production contains 46 users, 45 brands, and 29 articles.

The ownership audit found zero brand-owner orphans.

The authenticated read-only canary passed for brands, the dashboard, and articles.

The approved canary account saw its six owned brands.

The canary produced no writes, emails, payments, provider calls, Buffer posts, or push notifications.

The Supabase advisor has no database performance warning.

One Auth warning remains because leaked-password protection is disabled.

The `venturecite_runtime` login and restricted-role memberships exist.

The application still uses the owner connection for legacy routes and system workers.

The runtime connection cutover remains deferred.

The privacy legal entity and contact values remain deferred until the final release phase.

## Historical preview checkpoints

Earlier preview reports recorded a 94-row production ledger and missing migrations through `0111`.

Those values describe the pre-release state.

They do not describe the current production database.

Earlier preview reports also recorded 112 rows through `0111` after isolated restore.

That result remains useful as restore evidence, but it is not the current production result.

## Migration 0096

Migration 0096 restricts approved columns in `users` and `brands`.

The policies match the actor value stored in the transaction.

The migration rejects unsafe role attributes, unexpected memberships, and privileges outside the approved tables.

The request user and brand repositories set the role and actor value inside one transaction.

Evidence: `migrations/0096_request_rls_foundation.sql`, `server/data/requestUserRepository.ts`, `server/data/requestBrandRepository.ts`, and `server/data/restrictedRequestTransaction.ts`.

## Migration 0097

Migration 0097 defines read-only request access for the content slice.

The slice includes brands, articles, article revisions, distributions, keyword research, and content jobs.

The policies follow brand ownership through the request actor.

The policies hide content after a brand soft delete.

The request role cannot write content rows.

Evidence: `migrations/0097_request_rls_content.sql` and `tests/integration/contentRequestRls.test.ts`.

## Later request migrations

Migrations 0101 through 0110 add request-safe profile, content, command, provider-state, quota, and soft-delete access.

Migration 0111 revokes public, anonymous, and authenticated execution on `public.handle_new_user()`.

Migration 0112 adds a temporary compatibility grant for the current application connection.

Each self-grant has `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The original creator memberships remain unchanged.

Migration 0113 changes 21 audited policy expressions to cache `current_setting` once per statement.

It preserves policy roles, commands, and access predicates.

Evidence: `migrations/0112_transitional_request_role_set_option.sql`, `migrations/0113_rls_current_setting_initplan.sql`, and `evidence/2026-08-20-project-reset/RLS_INITPLAN_MIGRATION_0113.md`.

## PostgreSQL role membership

The membership tool checks the creator of each restricted role through `pg_auth_members`.

The creator membership must use `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`.

The temporary self-grant uses `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The unit tests enforce this policy.

The runtime role remains separate from the current owner connection.

The application must revoke the temporary option before changing `DATABASE_URL` to `venturecite_runtime`.

Evidence: `server/lib/requestRoleMembership.ts` and `tests/unit/requestRoleMembership.test.ts`.

## Request and worker boundaries

Actor-bound repositories handle the migrated request paths.

They do not return raw transactions across request boundaries.

The content routes use actor-bound repositories for article, revision, distribution, job, and keyword request paths.

Keyword discovery finalization, competitor reads, and worker claims still use owner-side storage.

Those paths run outside the request transaction.

Generic OpenAI kickoff and content-cost recording use the transactional outbox.

Stripe, Resend, Buffer, and synchronous model routes keep their existing direct contracts.

## Verification

The local PostgreSQL integration run passed 37 of 37 tests.

The local browser run passed five of five safe flows with fake generation.

The full test run passed 204 files and 1,561 active tests.

TypeScript, lint, changed-file formatting, migration synchronization, whitespace, and the production build passed.

The full repository format check still reports 216 baseline files outside this release diff.

## Open work

1. Enable leaked-password protection in Supabase Auth.
2. Move legacy routes and system workers from owner access.
3. Test and perform the runtime role cutover after that refactor.
4. Add verified privacy values last.

The current release is safe without the runtime cutover because the application still uses the owner connection.

The temporary compatibility grant must remain until the cutover is complete.
