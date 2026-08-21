# Browser tests

The browser tests use Playwright and live in `tests/e2e/`.

Run the account-based suite with this command.

```sh
npm run test:e2e
```

Playwright starts `npm run dev` unless `E2E_BASE_URL` is set.

The local product-flow project uses one Chromium worker.

The application uses a Supabase Bearer token in local storage. It does not use an authentication cookie.

## Local product-flow setup

Start the local Supabase stack first.

Set these local values without copying them into a tracked file:

- `E2E_LOCAL_APP_URL`
- `E2E_LOCAL_DATABASE_URL`
- `E2E_LOCAL_ADMIN_DATABASE_URL`
- `E2E_LOCAL_SUPABASE_URL`
- `E2E_LOCAL_SUPABASE_ANON_KEY`
- `E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY`
- `E2E_LOCAL_FAKE_GENERATION=1`

Run only the isolated local project.

```sh
npm run test:e2e:local
```

The local flow creates isolated users and removes them after the run.

The flow uses the deterministic fake content provider.

The local launcher rejects production and non-loopback targets.

Do not use a production account, database, or provider key.

## Scope

The suite checks public pages, authentication, navigation, forms, billing validation, and product flows.

The product flows cover article editing, revisions, fake generation, cancellation, distribution, deletion, and cross-tenant denial.

The billing test checks request validation. It does not prove a completed Stripe payment.

The suite does not prove real email delivery. Test email delivery separately in a controlled environment.
