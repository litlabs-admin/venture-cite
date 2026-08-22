# Operations

## Release rules

Run one controlled migration job before the application receives production traffic.

Run `npm run release:preflight` before the migration job.

Use `npm run db:migrate:release` after the preflight. The command repeats the full preflight before database access.

Set `DATABASE_DIRECT_URL` to a verified session URL. The command rejects a transaction pooler URL.

Set `CONFIRM_PRODUCTION_MIGRATIONS=venturecite-production` before you run the production command.

The release command rejects production migrations without this confirmation and a passing preflight.

Configure the restricted request roles after migrations and before traffic.

Set `DATABASE_RUNTIME_ROLE_NAME` to the runtime login role.

Run `npm run db:configure-request-roles` first in dry-run mode.

Set `REQUEST_ROLE_MEMBERSHIP_MODE=apply` and `CONFIRM_REQUEST_ROLE_MEMBERSHIP=venturecite-production` to apply the grant.

The command verifies the runtime connection and role attributes before it changes memberships.

The command configures the request, content-request, and outbox-worker roles.

Do not replace the production `DATABASE_URL` with the dedicated runtime login yet.

Legacy routes and system workers still require the current application-owner connection.

The dedicated login stays dormant until those paths use actor-bound repositories or a separate worker connection.

Migration 0112 is a temporary compatibility step for the current application connection.

It adds one self-granted membership row for each restricted role.

Each new row has `ADMIN FALSE`, `INHERIT FALSE`, and `SET TRUE`.

The existing direct-role admin rows remain `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`.

Revoke this temporary membership option before changing `DATABASE_URL` to `venturecite_runtime`.

Do not treat migration 0112 as the runtime-role cutover.

Migration 0113 changes the evaluation form for 21 request-context RLS policies.

It keeps each policy role, command, access test, and write test unchanged.

After migration 0113, run the Supabase advisors and compare all policy definitions with the release record.

The build and application startup never apply migrations.

Production releases use `public.schema_migrations` as the application migration ledger.

The runner verifies recorded checksums before it executes pending application migrations.

The independent `supabase_migrations.schema_migrations` ledger records Supabase CLI changes.

The bootstrap command permits the first controlled release before the dedicated runtime role exists.

Set strict database TLS in production. Set `DATABASE_CA_CERT_PATH` or set `DATABASE_SSL_REJECT_UNAUTHORIZED=true`.

Remove TLS query parameters from `DATABASE_URL` when you enable certificate verification.

## Stripe blocker

The application sells the Pro and Agency plans. The expected monthly amounts are USD 99 and USD 500.

Before release, create or approve the Stripe products and active prices. Each product needs `metadata.tier` with `pro` or `agency`.

Record the approved Stripe product and price IDs in the release record. Verify the public product API, checkout, customer portal, and signed webhook with test keys first.

Set `STRIPE_PRODUCT_SYNC=true` only for a deliberate catalogue update. This setting writes products to Stripe.

Do not release with Stripe test keys in production. The application logs a warning, but a customer still cannot make a real payment.

## Scheduler rule

Use one scheduler method.

For a long-lived Node host, the Nitro boot code starts the in-process scheduler.

Render currently uses the in-process scheduler. Keep `DISABLE_IN_PROCESS_SCHEDULER=false` and `EXTERNAL_CRON_ORCHESTRATOR_ENABLED=false`.

Use `POST /api/cron/daily-orchestrator` only after an authenticated external trigger passes release verification.

Do not enable both methods. Duplicate work can send duplicate email and create extra AI cost.

## Email blocker

Resend sends application email. Its webhook can update user email status for delivery, bounce, and complaint events.

The current automated tests do not send or receive a real email. Do not use them as delivery proof.

Before release, test registration verification, password reset, unsubscribe, bounce, and complaint paths with a safe provider setup or a controlled inbox.

## Health and rollback

Use `GET /health` to check that the API can query PostgreSQL.

Check structured logs and Sentry after a release.

The migration runner has no down-migration command. Test every migration against a production-like copy before release. Prepare a restore plan before a destructive schema change.

Do not use a Vercel preview until its Supabase database and provider configuration are verified as isolated from production.

## Checks

Run these checks before release.

```sh
npm run check
npm run lint
npm run format:check
npm test
```

Run `npm run build` without a database connection during pre-release checks.

Run `npm run test:e2e` only against an approved test environment.

Use [deploy-runbook.md](deploy-runbook.md) for the ordered release procedure.
