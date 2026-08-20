# VentureCite fresh audit

## Evidence rules

This report starts from executable code, test output, Git, and read-only live checks.

Existing Markdown files and code comments do not prove current behavior.

Each finding states whether code, a test, or a live check proves it.

## Safety state

- No production write occurred.
- No email was sent.
- No payment action occurred.
- No live user record was read or changed.
- No deployment occurred.
- No `.env` value entered this report.

## Current executable stack

The package uses React 19, Express 5, and TanStack Start.

Evidence: `package.json` dependencies and scripts.

TanStack file routes exist under `src/routes/`.

Evidence: `src/router.tsx` and `src/routes/_app.tsx`.

The TanStack server routes forward API requests to Express.

Evidence: `src/routes/webhooks/$.ts`, `src/routes/health.ts`, and `server/expressBridge.ts`.

The old Wouter description is not current.

## Quality baseline

### Type check

Status: pass.

The root audit reran `npm run check` after the parallel checks ended.

The command passed in 14 seconds.

The tour check confirmed 22 route targets.

### Lint

Status: pass with serious warning debt.

`npm run lint` returned exit code 0 with 813 warnings.

Common warnings include `any`, hook dependencies, refresh exports, and JSX entities.

### Format

Status: fail.

`npm run format:check` found differences in hundreds of files.

The format command also scans stale Markdown and temporary files.

### Tests

Status: pass.

`npm test` passed 1,390 tests.

The run skipped 37 tests that require an isolated database.

No test loaded the normal application database URL.

The CI workflow does not create a PostgreSQL service.

The CI workflow does not set `TEST_DATABASE_URL`.

Evidence: `.github/workflows/ci.yml`, `vitest.config.ts`, and `tests/setup.ts`.

### P1: Integration tests can write to the normal database URL

Several integration tests load `.env` and import the normal database client.

Evidence: `tests/integration/tourEvents.test.ts:4` through `tests/integration/tourEvents.test.ts:8`.

Their setup and cleanup delete database rows.

Evidence: `tests/integration/tourEvents.test.ts:15` through `tests/integration/tourEvents.test.ts:30`.

Required fix: require an isolated `TEST_DATABASE_URL` and reject the normal application URL.

Do not run the current integration suite with production environment values.

### End-to-end tests

Status: not part of CI.

The repository has 11 Playwright files under `tests/e2e/`.

The CI workflow does not run `npm run test:e2e`.

## Confirmed defects

### P0: An unauthenticated request can replace shared board data

The global auth bypass includes `PUT /api/board`.

Evidence: `server/auth.ts:180` and `server/auth.ts:224`.

The route validates the body and writes the shared `system_state` row.

Evidence: `server/routes/board.ts:87` through `server/routes/board.ts:105`.

Impact: any network client can replace persistent shared board data.

Required fix: require an administrator or a separate signed write token.

### P1: Stripe checkout accepts caller-controlled redirect URLs

The billing route reads `successUrl` and `cancelUrl` from the request body.

Evidence: `server/routes/billing.ts:160`.

The route sends both values to Stripe without an origin check.

Evidence: `server/routes/billing.ts:286` through `server/routes/billing.ts:304`.

Impact: an authenticated caller can choose an external post-checkout destination.

Required fix: use one verified application origin and allow only local paths.

### P1: A canceled customer can receive another free trial

The checkout route treats only active and trialing subscriptions as current.

Evidence: `server/routes/billing.ts:249` through `server/routes/billing.ts:257`.

Every new checkout receives `trial_period_days`.

Evidence: `server/routes/billing.ts:287` through `server/routes/billing.ts:297`.

Required fix: store a permanent trial-use fact and enforce it on the server.

### P1: Concurrent Stripe webhook deliveries can both run side effects

The first delivery inserts the event row.

Later deliveries continue when `processed_at` is empty.

Evidence: `server/webhookHandlers.ts:75` through `server/webhookHandlers.ts:143`.

The code marks completion only after all event side effects.

Evidence: `server/webhookHandlers.ts:506`.

Required fix: use one atomic processing claim with a recovery lease.

### P1: Checkout trusts the Stripe product catalog without a server allowlist

The route accepts an active recurring product with a nonempty `metadata.tier`.

Evidence: `server/routes/billing.ts:192` through `server/routes/billing.ts:209`.

Required fix: verify product, price, tier, currency, interval, and amount against server data.

### P1: The content-job lease can expire during a provider call

The browser advance route claims a nine-second lease.

Evidence: `server/routes/content.ts:452`.

The OpenAI client can wait up to 25 seconds.

Evidence: `server/contentGenerationWorker.ts:41` and `server/lib/factAgent/v2/vercelBudget.ts:35`.

Impact: another request can claim the same job while the first call remains active.

Required fix: use a lease token, a heartbeat, or a lease longer than every call.

### P1: Cancellation can lose a race with completion

The cancel route changes the database row without coordination with the active lease.

Evidence: `server/routes/content.ts:497` through `server/routes/content.ts:512`.

The active slice can still write the article and mark the job as successful.

Evidence: `server/contentGenerationWorker.ts:174` through `server/contentGenerationWorker.ts:183`.

Required fix: make every terminal write conditional on the current job version and state.

### P1: Production database TLS can skip certificate verification

The database code accepts `rejectUnauthorized: false` by default.

Evidence: `server/db.ts:49` through `server/db.ts:61`.

Required fix: require a trusted CA or the Node CA store in production.

### P2: Stripe customer creation is not recoverable after a database failure

The route creates the Stripe customer before it stores the customer ID.

Evidence: `server/routes/billing.ts:219` through `server/routes/billing.ts:224`.

Impact: a failed database write can create an orphan customer.

Required fix: use a stable idempotency key and a recovery lookup.

### P2: The fact-scrape cron route cannot use only the cron secret

The global public-route set excludes the fact-scrape backstop route.

Evidence: `server/auth.ts:180` through `server/auth.ts:225`.

The route applies its cron-secret check only after the global user-auth check.

Evidence: `server/routes/cron.ts:558` through `server/routes/cron.ts:566`.

Required fix: route all cron endpoints through one dedicated cron auth gate.

### P2: Tour events accept another user's brand identifier

The event schema accepts any brand UUID.

The insert maps that UUID to the current user's event without an ownership check.

Evidence: `server/routes/tours.ts:72` through `server/routes/tours.ts:80` and `server/routes/tours.ts:192` through `server/routes/tours.ts:203`.

Required fix: confirm brand ownership before the insert.

### P2: Logs and error reports include personal data

Billing email logs include the destination address.

Evidence: `server/lib/billingEmails.ts:32` through `server/lib/billingEmails.ts:38`.

Enterprise inquiry logs include names, email addresses, and companies.

Evidence: `server/routes/enterpriseInquiry.ts:81` through `server/routes/enterpriseInquiry.ts:105`.

Required fix: remove these fields or use a stable one-way hash.

### P2: Buffer still accepts legacy plaintext tokens

The decrypt function returns values without the encryption prefix unchanged.

Evidence: `server/lib/tokenCipher.ts:69` through `server/lib/tokenCipher.ts:75`.

Required fix: count legacy rows without returning values, then migrate them in an isolated step.

## Confirmed architecture risks

The build script runs database migrations before the application build.

Evidence: the `build` script in `package.json`.

Do not run the production build against a live database during ordinary verification.

The database storage class has 4,594 lines and covers many domains.

Evidence: `server/databaseStorage.ts`.

The database uses one direct PostgreSQL pool for application requests.

Evidence: `server/db.ts`.

Supabase service access can bypass row-level security.

Evidence: `server/supabase.ts` and the direct database role configuration.

The current tenant boundary depends mainly on application code.

This statement needs live role and policy checks before final confirmation.

## Confirmed controls

The browser uses the Supabase anonymous key.

Evidence: `client/src/lib/supabase.ts`.

The server rejects a publishable key as the service key.

Evidence: `server/supabase.ts:20` through `server/supabase.ts:28`.

JWT checks call Supabase before they load the local user.

Evidence: `server/auth.ts:60` through `server/auth.ts:76`.

Stripe verifies the raw request signature.

Evidence: `server/app.ts:152` through `server/app.ts:174`.

Resend rejects webhooks when its secret is absent.

Evidence: `server/app.ts:178` through `server/app.ts:204`.

New Buffer token writes use AES-256-GCM.

Evidence: `server/lib/tokenCipher.ts:52` through `server/lib/tokenCipher.ts:62`.

## Supabase migration direction

Use a hybrid migration first.

Keep long AI tasks and payment webhooks in controlled server workers.

Move ownership enforcement and ordinary data access toward tested Supabase roles.

### Phase 1: Stop unsafe schema deployment

Run migrations once in a controlled release step.

Do not change the schema during every application build or process start.

### Phase 2: Secure users and brands

Add tested row-level policies for user and brand ownership.

Use the authenticated role for ordinary user requests.

Keep the service role for narrow server-only administration.

### Phase 3: Move content domains

Move articles, jobs, citations, and fact sheets one domain at a time.

Add integration tests for two users before each cutover.

Prove that one user cannot read or change another user's rows.

### Phase 4: Make external commands recoverable

Write Stripe, Resend, Buffer, and AI commands to a transactional outbox.

Use stable provider idempotency keys.

Record each provider result before a retry.

### Deferred content cost outbox

The content completion transaction stores the job, article, and revision.

The worker records the provider cost after that transaction.

A process crash in this gap can omit one cost record.

The later outbox wave must store the cost event in the completion transaction.

The outbox consumer must write each cost record once.

### Phase 5: Replace process-local coordination

Move rate limits, leases, and queues to database-backed primitives.

Use conditional state changes and lease tokens.

## Unproven areas

- The live deployment uses `https://www.venturecite.com`.
- The live database policy state is not confirmed.
- The deployed commit is not confirmed.
- The landing, pricing, login, and registration pages rendered in the browser.
- The authenticated application flow is not checked.
- The email safety controls are not checked against the live configuration.

Do not use this report as release approval until those checks finish.

## Repair status on the setup branch

These repairs are local. They are not deployed.

- Board reads and writes require an administrator.
- Destructive tests require an explicit isolated database.
- Stripe redirects use the configured application origin.
- Checkout validates the plan amount and monthly interval.
- Prior Stripe subscription history blocks a second trial.
- Stripe customer creation uses idempotency and recovery keys.
- Stripe webhooks use renewable token claims.
- Content jobs use token leases and guarded transitions.
- Content success updates the job, article, and revision in one transaction.
- Cron backstop requests use the cron secret gate.
- Tour events and tour state verify brand ownership.
- Logs and Sentry remove contact data.
- Production database connections require certificate verification.

The local Supabase stack uses Docker on ports 55321 through 55329.

Real PostgreSQL tests passed for migrations 0094 and 0095.

The tests use one temporary schema and remove it after each run.

The focused safety run passed 102 tests and skipped 13 database tests.

The local PostgreSQL run passed six additional tests.

The full test run passed 1,390 tests and skipped 37 database-dependent tests.

The TypeScript and tour checks passed.

The lint command passed with errors suppressed only by its existing warning policy.

The dependency audit has no high or low findings.

Four moderate findings remain in the current Drizzle Kit loader chain.

The final Sol review found seven repair gaps.

The repair pass fixed all seven gaps before any local commit.

The review found no direct regression after the fixes.
