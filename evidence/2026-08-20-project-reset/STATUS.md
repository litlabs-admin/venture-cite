# Project reset status

## Evidence rules

This report uses executable source, tests, command output, Git state, and read-only database evidence.

Existing Markdown and comments do not prove current behavior.

This report does not approve a production release.

## Safety state

- Production remains read-only.
- The production database is unchanged.
- The production audit used one read-only transaction and ended with `ROLLBACK`.
- No provider call, email, payment, deployment, or production migration occurred.
- The local Supabase stack is stopped.
- `docker ps` shows no running containers.
- No secret value appears in this report.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md`, `migrations/0096_request_rls_foundation.sql`, `migrations/0097_request_rls_content.sql`, and `migrations/0098_transactional_outbox.sql`.

## Foundation decision

The final Sol review says `SHIP`.

It found no P0, P1, or P2 findings.

The foundation work can ship.

This decision does not authorize a production migration.

Production remains read-only until the release gates pass.

## Verified foundation wave

The combined local RLS and outbox run passed 35 of 35 tests.

The three integration files contain 13, 11, and 11 tests.

Evidence: `tests/integration/requestRlsFoundation.test.ts`, `tests/integration/contentRequestRls.test.ts`, and `tests/integration/localOutboxMigration.test.ts`.

The full test run passed 211 files and skipped one file.

It passed 1,579 tests and skipped 16 tests.

The following checks passed:

- `npm run check`
- `npm run lint`
- `npm run format:check`
- `npm run supabase:migrations:check`
- `git diff --check`

Migrations 0096, 0097, and 0098 exist in both migration trees.

They remain unapplied in production.

Evidence: `migrations/0096_request_rls_foundation.sql`, `migrations/0097_request_rls_content.sql`, `migrations/0098_transactional_outbox.sql`, and `scripts/syncSupabaseMigrations.mjs`.

The request-role membership tool exists.

The release environment preflight exists.

Neither command has run against production.

Evidence: `scripts/configureRequestRoleMembership.ts`, `scripts/releaseEnvironmentPreflight.ts`, and `package.json`.

The outbox foundation exists.

It has claim, lease, retry, cancellation, and idempotency rules.

No provider adapter is wired to the worker.

Evidence: `migrations/0098_transactional_outbox.sql`, `shared/outbox.ts`, `server/outbox/outboxRepository.ts`, and `server/outbox/outboxWorker.ts`.

The PostgreSQL 17 membership check discovers the role that created the restricted roles.

The creator must hold each restricted role with `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`.

The runtime role receives only the three restricted roles with `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The membership tests accept this exact policy.

Evidence: `server/lib/requestRoleMembership.ts:126-225` and `tests/unit/requestRoleMembership.test.ts:81-181`.

Local integration setup removes stale managed roles and memberships from a restored backup.

Each database `beforeAll` hook has a 60-second timeout while it holds the shared advisory lock.

Evidence: `tests/integration/localRoleCleanup.ts:23-161`, `tests/integration/requestRlsFoundation.test.ts:51-106`, `tests/integration/contentRequestRls.test.ts:45-125`, and `tests/integration/localOutboxMigration.test.ts:36-65`.

The restricted route cutover covers brand list, brand get, and brand update.

Brand creation, website import, deletion preview, and deletion still use the legacy storage path.

The content routes do not use the content request repositories.

Evidence: `server/routes/brands.ts`, `server/data/requestData.ts`, and `server/data/contentRequestData.ts`.

## Closed Sol review blockers

The final review closed the seven prior foundation blockers.

1. The production migration command now runs the release preflight before it imports database code.

2. The request-role tool now discovers the PostgreSQL 17 creator membership and verifies the exact runtime grant policy.

3. The outbox worker keeps an in-flight command leased while its provider handler runs.

4. The enqueue path requires an owning user and runs only inside a domain transaction.

5. The scheduler guard rejects two owners and rejects a production process with no scheduler owner.

6. The outbox migration rejects worker-role drift before it repairs the role.

7. The role tool verifies that the runtime and direct connections target the same database.

Evidence: `scripts/migrate.ts:10-39`, `scripts/migrationRelease.ts:1-120`, `server/lib/requestRoleMembership.ts:126-314`, `server/outbox/outboxRepository.ts:88-243`, `server/outbox/outboxWorker.ts:16-86`, `server/lib/schedulerMode.ts:21-38`, `server/nitroBoot.ts:99-122`, `migrations/0098_transactional_outbox.sql:138-322`, and the related unit and integration tests.

## Missing release configuration

The current release record does not contain these required values:

- `DATABASE_DIRECT_URL`
- The four approved Stripe product and price identifiers
- `RESEND_FROM_ADDRESS`
- The least-privileged production runtime role name

The production audit used a supplied CA and verified TLS.

The CA value is not recorded here.

The public privacy page still has legal entity and privacy contact placeholders.

Privacy placeholders remain deferred until the final release phase.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md`, `scripts/releaseEnvironmentPreflight.ts`, `docs/OPERATIONS.md`, and `docs/privacy-policy.md`.

## Remaining production gates

1. Obtain the missing release configuration through the approved secure channel.
2. Run the read-only production metadata audit with the direct connection.
3. Review the runtime role, grants, table owners, RLS flags, and policy counts.
4. Run the migration preflight and backup checks.
5. Apply migrations 0096 through 0098 through the controlled release command.
6. Run the request-role membership command in dry-run mode.
7. Apply request-role membership only after the final review and confirmation gate.
8. Cut over the remaining brand operations to request repositories.
9. Cut over the content routes with two-user cross-tenant tests.
10. Connect the content-cost outbox event before other provider effects.
11. Add fake-provider tests for Stripe, Resend, Buffer, and OpenAI.
12. Replace process-local limits, leases, and worker state with database-backed state.
13. Run local user-flow tests and an approved preview browser test.
14. Fill the privacy placeholders during the final release phase.
15. Run the canary, monitor it, and document rollback evidence.

The seven Sol review blockers are closed.

The remaining gates concern production configuration, route cutover, provider wiring, user-flow proof, privacy text, and canary release work.
