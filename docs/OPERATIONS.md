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

The build and application startup never apply migrations.

On Supabase, the release runner first compares the root migration files with `supabase_migrations.schema_migrations`.

It records matching files in `public.schema_migrations` and skips SQL that Supabase already applied.

It stops before SQL execution when a file is missing or its checksum differs.

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

Do not use the current Vercel preview until it has an isolated Supabase database and test provider configuration.

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
