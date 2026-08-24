# Supabase RLS foundation

## Current result

Production now contains migrations through `0114_request_brand_deletion_preview.sql`.

The production migration ledger contains 115 checked rows.

Production contains 46 users, 44 brands, 31 articles, 1,154 brand prompts, and 416 citation runs.

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

Migration 0114 moves the brand deletion preview into the content request role.

It grants only `brand_id` on `brand_prompts` and `citation_runs`.

It enables RLS and hides rows that do not belong to the transaction actor.

The production canary confirmed owned visibility and cross-user denial.

Evidence: `migrations/0114_request_brand_deletion_preview.sql`, `server/data/requestBrandRepository.ts`, and `tests/integration/contentRequestRls.test.ts`.

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

The content routes use actor-bound repositories for article, revision, distribution, job, keyword, and brand deletion preview paths.

Keyword discovery finalization, competitor reads, and worker claims still use owner-side storage.

Those paths run outside the request transaction.

Generic OpenAI kickoff and content-cost recording use the transactional outbox.

Stripe, Resend, Buffer, and synchronous model routes keep their existing direct contracts.

## Verification

The current focused unit run passed 31 tests.

The full test run passed 204 files and 1,565 tests with one worker.

The local PostgreSQL integration fixture now covers the 0114 ownership cases.

Its last run was blocked because the Docker host port proxy terminated local connections.

The local browser run passed five of five safe flows with fake generation.

TypeScript, tour checks, lint, changed-file formatting, migration synchronization, whitespace checks, and the production build passed.

Lint reported 790 existing warnings and zero errors.

The full repository format check still reports 209 baseline files outside this release diff.

## Open work

1. Verify the automatic Render deployment after the live link or dashboard access is available.
2. Enable leaked-password protection in Supabase Auth.
3. Move the remaining legacy routes and system workers from owner access.
4. Test and perform the runtime role cutover after that refactor.
5. Add verified privacy values last.

The local RLS integration test needs a stable Docker host port before it can run.

The current release is safe without the runtime cutover because the application still uses the owner connection.

The temporary compatibility grant must remain until the cutover is complete.
