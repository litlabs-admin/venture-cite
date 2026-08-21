# Supabase RLS foundation

## Current result

The latest local RLS and outbox run passed 37 of 37 database integration tests.

Production remains read-only and unchanged.

Migrations 0096, 0097, and 0098 remain unapplied in production.

The local Supabase stack is stopped.

Evidence: `tests/integration/requestRlsFoundation.test.ts`, `tests/integration/contentRequestRls.test.ts`, `tests/integration/localOutboxMigration.test.ts`, `migrations/0096_request_rls_foundation.sql`, `migrations/0097_request_rls_content.sql`, and `migrations/0098_transactional_outbox.sql`.

## Migration 0096

Migration 0096 defines restricted access for approved columns in `users` and `brands`.

The row policies match the actor value stored in the transaction.

The migration rejects unsafe role attributes, unexpected memberships, and privileges outside the two tables.

The request user and brand repositories set the role and actor value inside a transaction.

Evidence: `migrations/0096_request_rls_foundation.sql:4-277`, `server/data/requestUserRepository.ts:40-77`, `server/data/requestBrandRepository.ts:113-214`, and `server/data/restrictedRequestTransaction.ts:7-23`.

The 0096 integration file has 13 tests.

It proves row isolation, approved writes, version checks, denied columns, transaction cleanup, and actor-bound repository facades.

Evidence: `tests/integration/requestRlsFoundation.test.ts:141-432`.

## Migration 0097

Migration 0097 defines read-only request access for the content slice.

The slice includes brands, articles, article revisions, distributions, keyword research, and content jobs.

The policies follow brand ownership through the request actor.

The policies hide content after a brand soft delete.

The request role cannot write content rows.

Evidence: `migrations/0097_request_rls_content.sql:121-307` and `tests/integration/contentRequestRls.test.ts:167-463`.

## PostgreSQL 17 role membership

The membership tool discovers the creator of the restricted roles through `pg_auth_members`.

The creator must hold each restricted role with `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`.

The runtime role receives the three restricted roles with `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The unit tests accept this exact policy.

Evidence: `server/lib/requestRoleMembership.ts:126-225` and `tests/unit/requestRoleMembership.test.ts:81-181`.

Local integration setup removes stale managed roles and memberships from a restored backup.

Each database `beforeAll` hook has a 60-second timeout while it holds the shared advisory lock.

Evidence: `tests/integration/localRoleCleanup.ts:23-161`, `tests/integration/requestRlsFoundation.test.ts:51-106`, `tests/integration/contentRequestRls.test.ts:45-125`, and `tests/integration/localOutboxMigration.test.ts:36-65`.

The content routes use the actor-bound repositories for article, revision, distribution, job, and keyword request paths.

Keyword discovery finalization, competitor reads, and worker slice claims still use owner-side storage because they run outside the request transaction.

Evidence: `server/data/contentRequestData.ts:24-50` and `server/routes/content.ts:241-1075`.

## Route cutover state

The brand routes use request repositories for list, get, and update.

Brand create, website import, deletion preview, and delete still use legacy storage.

Evidence: `server/routes/brands.ts:49-78`, `server/routes/brands.ts:80-393`, and `server/routes/brands.ts:395-531`.

## Production limits

The production audit was read-only and ended with `ROLLBACK`.

The audit found no request role and zero policies on `users` and `brands`.

All 62 public relations have RLS enabled, but no relation forces RLS.

Do not activate request routes in production before the controlled migration and role review.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md:5-42`.

The request-role membership tool exists but has not run against production.

The release preflight exists but has not run against production.

Evidence: `scripts/configureRequestRoleMembership.ts:33-64`, `scripts/releaseEnvironmentPreflight.ts:180-259`, and `package.json`.

## Remaining gates

1. Obtain `DATABASE_DIRECT_URL` through the secure release channel.
2. Obtain the four approved Stripe product and price identifiers.
3. Obtain `RESEND_FROM_ADDRESS`.
4. Define the least-privileged production runtime role.
5. Run the strict metadata audit with the direct connection.
6. Review grants, owners, RLS flags, policies, and ownership counts.
7. Apply migrations 0096 and 0097 through the controlled release command.
8. Run the request-role membership command in dry-run mode.
9. Apply role membership after the final review and confirmation gate.
10. Cut over the remaining brand routes.
11. Cut over content routes with two-user isolation tests.
12. Keep privacy legal placeholders deferred until final release preparation.

## Security boundary

This design reduces the effect of a missing tenant filter.

It does not make arbitrary SQL safe under an owner connection.

Request routes must use named repositories.

Worker and administrator operations must remain outside request routes.

## Closed review blockers

The final Sol review says `SHIP`.

It found no P0, P1, or P2 findings.

The final review closed the seven prior foundation blockers.

1. The production migration command now runs the release preflight before it imports database code.

2. The request-role tool now discovers the PostgreSQL 17 creator membership and verifies the exact runtime grant policy.

3. The outbox worker keeps an in-flight command leased while its provider handler runs.

4. The enqueue path requires an owning user and runs only inside a domain transaction.

5. The scheduler guard rejects two owners and rejects a production process with no scheduler owner.

6. The outbox migration rejects worker-role drift before it repairs the role.

7. The role tool verifies that the runtime and direct connections target the same database.

Evidence: `scripts/migrate.ts:10-39`, `scripts/migrationRelease.ts:1-120`, `server/lib/requestRoleMembership.ts:126-314`, `server/outbox/outboxRepository.ts:88-243`, `server/outbox/outboxWorker.ts:16-86`, `server/lib/schedulerMode.ts:21-38`, `server/nitroBoot.ts:99-122`, `migrations/0098_transactional_outbox.sql:138-322`, and the related unit and integration tests.
