# Supabase migration report

## Current state

VentureCite uses Supabase Auth, Storage, and PostgreSQL.

The Express server uses a PostgreSQL pool and Drizzle.

The reset now has three new migration waves.

Migration 0096 adds request access for users and brands.

Migration 0097 adds read-only request access for content tables.

Migration 0098 adds the transactional outbox foundation.

The root SQL files and Supabase SQL copies pass the migration sync check.

Evidence: `migrations/0096_request_rls_foundation.sql`, `migrations/0097_request_rls_content.sql`, `migrations/0098_transactional_outbox.sql`, `supabase/migrations/`, and `scripts/syncSupabaseMigrations.mjs`.

## Applied state

The local foundation tests apply the new migrations to an isolated local database.

The production migration record is unchanged.

Migrations 0096, 0097, and 0098 remain unapplied in production.

No production write occurred.

Evidence: `tests/integration/requestRlsFoundation.test.ts`, `tests/integration/contentRequestRls.test.ts`, `tests/integration/localOutboxMigration.test.ts`, and `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md`.

The combined local RLS and outbox run passed 35 of 35 tests.

The three integration files contain 13, 11, and 11 tests.

The full test run passed 211 files and skipped one file.

It passed 1,579 tests and skipped 16 tests.

## Migration 0096

Migration 0096 defines restricted user and brand columns, actor-bound policies, and no hard delete path.

The request user and brand repositories use the policy inside short transactions.

Evidence: `migrations/0096_request_rls_foundation.sql:105-277`, `server/data/requestUserRepository.ts:40-77`, and `server/data/requestBrandRepository.ts:113-214`.

## Migration 0097

Migration 0097 enables RLS for the content slice.

It gives request access to selected read columns only.

It leaves content writes to controlled worker code.

Evidence: `migrations/0097_request_rls_content.sql:121-307` and `tests/integration/contentRequestRls.test.ts:345-463`.

## Migration 0098

Migration 0098 creates an RLS-protected outbox with idempotency, leases, retries, cancellation, and dead-letter states.

The outbox repository and worker exist.

No Stripe, Resend, Buffer, or OpenAI provider adapter is wired to the worker.

The content-cost event is not connected to the content completion transaction.

Evidence: `migrations/0098_transactional_outbox.sql:1-224`, `server/outbox/outboxRepository.ts:90-355`, `server/outbox/outboxWorker.ts:1-129`, and `server/contentGenerationWorker.ts`.

## Route cutover

Only brand list, brand get, and brand update use the restricted request repository.

Brand creation, website import, deletion preview, and deletion still use the legacy storage path.

Content routes still use the legacy storage path.

Evidence: `server/routes/brands.ts:49-78`, `server/routes/brands.ts:80-393`, `server/routes/brands.ts:395-531`, and `server/data/contentRequestData.ts:36-50`.

## Production audit

The production audit used strict TLS, one read-only transaction, and `ROLLBACK`.

It returned catalog facts and aggregate ownership counts only.

It did not read or change application rows.

It found 62 public relations with RLS enabled, no forced-RLS relations, zero policies on `users` and `brands`, and no public table or column grants.

It found no missing or unknown brand owner.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md:5-31`.

## Release tools

The migration runner, request-role membership tool, and release preflight exist.

They have not run against production.

The release command requires an explicit confirmation value.

Evidence: `scripts/migrate.ts`, `scripts/configureRequestRoleMembership.ts:33-64`, `scripts/releaseEnvironmentPreflight.ts:180-259`, and `docs/OPERATIONS.md:3-29`.

The PostgreSQL 17 membership tool discovers the creator of the restricted roles through `pg_auth_members`.

It requires creator memberships with `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`.

It grants the runtime role with `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The unit tests accept this exact policy.

Evidence: `server/lib/requestRoleMembership.ts:126-225` and `tests/unit/requestRoleMembership.test.ts:81-181`.

Local integration setup removes stale managed roles and memberships from a restored backup.

Each database `beforeAll` hook has a 60-second timeout while it holds the shared advisory lock.

Evidence: `tests/integration/localRoleCleanup.ts:23-161`, `tests/integration/requestRlsFoundation.test.ts:51-106`, `tests/integration/contentRequestRls.test.ts:45-125`, and `tests/integration/localOutboxMigration.test.ts:36-65`.

## Missing configuration

The current release record lacks `DATABASE_DIRECT_URL`.

It lacks the four approved Stripe product and price identifiers.

It lacks `RESEND_FROM_ADDRESS`.

It lacks the least-privileged production runtime role name.

The production audit used a supplied CA and verified TLS.

Privacy legal entity and contact placeholders remain deferred until final release preparation.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md:44-50`, `scripts/releaseEnvironmentPreflight.ts:190-220`, and `docs/privacy-policy.md:1-14`.

## Safe release order

1. Obtain missing release configuration through the secure release channel.
2. Run the strict read-only metadata audit with the direct connection.
3. Review role, owner, grant, policy, and ownership facts.
4. Run migration preflight and backup checks.
5. Apply migrations 0096 through 0098 with the controlled release command.
6. Run request-role membership in dry-run mode.
7. Apply role membership after the final review and confirmation gate.
8. Cut over the remaining brand and content routes.
9. Connect content cost to the outbox completion transaction.
10. Add fake-provider tests and then provider adapters.
11. Replace process-local coordination with database-backed state.
12. Run local flows, preview browser checks, canary monitoring, and rollback checks.
13. Fill privacy placeholders in the final release phase.

Production stays read-only until every gate passes.

## Closed Sol review blockers

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
