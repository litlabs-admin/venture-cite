# Browser tests

The browser tests use Playwright and live in `tests/e2e/`.

Run the suite with this command.

```sh
npm run test:e2e
```

Playwright starts `npm run dev` unless `E2E_BASE_URL` is set.

The suite uses one Chromium project and one worker. The setup project signs in once and stores its state in the Playwright auth file.

The application uses a Supabase Bearer token in local storage. It does not use an authentication cookie.

## Required test setup

Use a dedicated test account with at least one brand.

Use a database that the test account can change.

Use provider keys that cannot charge money or send mail to real users.

The tests create and remove an article fixture for the URL edit test. Do not use a shared production account.

## Scope

The suite checks public pages, authentication pages, billing validation, onboarding, navigation, theme changes, tours, form validation, redirects, raw HTML, and URL state.

The billing test checks request validation. It does not prove a completed Stripe payment.

The suite does not prove real email delivery. Test email delivery separately in a controlled environment.
