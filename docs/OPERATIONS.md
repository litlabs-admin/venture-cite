# Operations

## Release rules

Run one controlled migration job before the application receives production traffic.

Use `npm run db:migrate` for that job. Use `DATABASE_DIRECT_URL` when the runtime URL uses a transaction pooler.

Do not rely on process startup to apply production migrations. Long-lived production startup currently applies migrations, so remove or control that path before a multi-process release.

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

For Vercel or another external scheduler, call `POST /api/cron/daily-orchestrator` with its required secret. Set `DISABLE_IN_PROCESS_SCHEDULER` for a long-lived host.

Do not enable both methods. Duplicate work can send duplicate email and create extra AI cost.

## Email blocker

Resend sends application email. Its webhook can update user email status for delivery, bounce, and complaint events.

The current automated tests do not send or receive a real email. Do not use them as delivery proof.

Before release, test registration verification, password reset, unsubscribe, bounce, and complaint paths with a safe provider setup or a controlled inbox.

## Health and rollback

Use `GET /health` to check that the API can query PostgreSQL.

Check structured logs and Sentry after a release.

The migration runner has no down-migration command. Test every migration against a production-like copy before release. Prepare a restore plan before a destructive schema change.

## Checks

Run these checks before release.

```sh
npm run check
npm run lint
npm run format:check
npm test
```

The current build command applies database migrations first.

Run `npm run build` only with an approved isolated database during pre-release checks.

Run `npm run test:e2e` only against an approved test environment.
