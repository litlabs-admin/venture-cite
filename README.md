# VentureCite

VentureCite helps a brand measure and improve its presence in AI search results.

The application has a React client and an Express API. It stores data in PostgreSQL, uses Supabase for identity, and uses Stripe for subscriptions.

## What the application does

- It creates and manages brands.
- It stores prompts, citation checks, articles, facts, mentions, and reports for each brand.
- It generates content and analysis with configured AI providers.
- It provides billing, email, onboarding, and account controls.

Read [PRODUCT.md](PRODUCT.md) for the current user functions. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the code structure. Read [docs/OPERATIONS.md](docs/OPERATIONS.md) before a production release.

## Run the application

Install the Node.js dependencies.

```sh
npm install
```

Set the required configuration in your local environment. Do not commit secrets.

Start the development server.

```sh
npm run dev
```

The development server listens on port `5000` by default.

## Build and test

```sh
npm run check
npm run lint
npm run format:check
npm test
```

The build command does not apply database migrations.

Run browser tests with the development server.

```sh
npm run test:e2e
```

The browser suite needs a configured test account. It also needs a test database and test provider keys. See [tests/e2e/README.md](tests/e2e/README.md).

## Release blockers

Do not release until Stripe has the approved Pro and Agency catalogue IDs and prices.

Do not release until production PostgreSQL uses strict TLS verification.

Do not let each production process apply migrations. Run `npm run db:migrate:release` as one controlled release step.

Set `CONFIRM_PRODUCTION_MIGRATIONS=venturecite-production` before you run this command.

Do not run the migration command with a production database URL during ordinary verification.

Do not treat the current email tests as proof of email delivery. Add tests that use a safe test provider or a controlled inbox.
