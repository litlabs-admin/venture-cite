# VentureCite fresh audit

## Evidence rules

This audit starts from executable source, tests, command results, Git state, and read-only database evidence.

Existing reports and comments do not prove current behavior.

Open items remain open until stronger evidence closes them.

## Safety result

The production audit used a read-only transaction and ended with `ROLLBACK`.

Production remains unchanged.

No production migration, provider call, email, payment, deployment, or push occurred.

The local Supabase stack is stopped, and `docker ps` shows no running containers.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md` and the current Docker process list.

## Verification result

The combined local RLS and outbox run passed 35 of 35 tests.

The three integration files contain 13, 11, and 11 tests.

The full test run passed 211 files and skipped one file.

It passed 1,579 tests and skipped 16 tests.

These checks passed:

- `npm run check`
- `npm run lint`
- `npm run format:check`
- `npm run supabase:migrations:check`
- `git diff --check`

Evidence: `package.json`, `tests/integration/requestRlsFoundation.test.ts`, `tests/integration/contentRequestRls.test.ts`, and `tests/integration/localOutboxMigration.test.ts`.

The local integration setup removes stale managed roles and memberships from a restored backup.

Each database `beforeAll` hook has a 60-second timeout while it holds the shared advisory lock.

Evidence: `tests/integration/localRoleCleanup.ts:23-161`, `tests/integration/requestRlsFoundation.test.ts:51-106`, `tests/integration/contentRequestRls.test.ts:45-125`, and `tests/integration/localOutboxMigration.test.ts:36-65`.

## Foundation findings

### Request-scoped users and brands

Migration 0096 defines restricted request access for approved user and brand columns.

It limits rows to the request actor and rejects cross-user brand writes.

The request repositories set the restricted role and actor value inside each transaction.

Evidence: `migrations/0096_request_rls_foundation.sql:1-277`, `server/data/requestUserRepository.ts:40-77`, `server/data/requestBrandRepository.ts:113-214`, and `server/data/restrictedRequestTransaction.ts:7-23`.

### Request-scoped content

Migration 0097 defines read-only request access for brands, articles, revisions, distributions, keywords, and content jobs.

The content integration tests prove two-user isolation, soft-delete filtering, denied writes, and worker-field protection.

The content repositories exist, but the content routes do not use them.

Evidence: `migrations/0097_request_rls_content.sql:1-307`, `server/data/contentRequestData.ts:24-50`, and `tests/integration/contentRequestRls.test.ts:167-463`.

### Transactional outbox

Migration 0098 defines the outbox table, status constraints, lease indexes, forced RLS, and a private enqueue function.

The repository and worker implement claim, lease renewal, retry, cancellation, dead-letter, and idempotency behavior.

No provider adapter is wired to the worker.

The outbox wave is a foundation only.

Evidence: `migrations/0098_transactional_outbox.sql:1-224`, `server/outbox/outboxRepository.ts:90-355`, `server/outbox/outboxWorker.ts:1-129`, and `tests/integration/localOutboxMigration.test.ts:71-453`.

### PostgreSQL 17 role membership

The membership tool discovers the creator of the restricted roles through `pg_auth_members`.

It requires creator memberships with `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`.

It grants the runtime role with `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The unit tests accept this exact policy.

Evidence: `server/lib/requestRoleMembership.ts:126-225` and `tests/unit/requestRoleMembership.test.ts:81-181`.

### Route cutover

The brand route module uses request repositories for brand list, brand get, and brand update.

Website import, manual create, deletion preview, and delete still use legacy storage.

The content routes still use legacy storage.

Evidence: `server/routes/brands.ts:49-78`, `server/routes/brands.ts:80-393`, `server/routes/brands.ts:395-451`, `server/routes/brands.ts:457-531`, and `server/data/contentRequestData.ts:36-50`.

## Production audit result

The read-only production audit found 62 public relations.

All 62 relations have RLS enabled.

No relation forces RLS.

The table owners can bypass RLS.

The runtime login can bypass RLS and can create roles and databases.

The `users` and `brands` tables have zero policies.

The public schema has no public table or column grants.

No brand has a missing or unknown owner.

The request role does not exist in production.

Do not activate request routes in production under the current deployment.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md:17-42`.

## Release configuration gaps

The current release record lacks `DATABASE_DIRECT_URL`.

It lacks the four approved Stripe product and price identifiers.

It lacks `RESEND_FROM_ADDRESS`.

It lacks the least-privileged production runtime role name.

The production audit used a supplied CA and verified TLS.

The public privacy page still has legal entity and privacy contact placeholders.

Privacy placeholders remain deferred until final release preparation.

Evidence: `evidence/2026-08-20-project-reset/PRODUCTION_DATABASE_AUDIT.md:44-50`, `scripts/releaseEnvironmentPreflight.ts:180-253`, and `docs/privacy-policy.md:1-14`.

## Release decision

The final Sol review says `SHIP`.

It found no P0, P1, or P2 findings.

The foundation work can ship.

Production must remain read-only.

The missing configuration, route cutovers, provider adapters, local user-flow proof, role setup, migration release, canary, and privacy placeholders remain production gates.

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
