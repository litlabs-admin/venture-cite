# Architecture

## Runtime

The client code is in `client/src/`.

The server code is in `server/`.

The shared database schema and types are in `shared/schema.ts`.

The application uses Express for API routes. `server/app.ts` installs security middleware, CORS, raw webhook parsers, body parsers, request IDs, logging, health checks, and error handling.

`server/routes.ts` installs shared authentication and ownership checks. It then installs route modules from `server/routes/`.

The production build uses Vite and Nitro. `npm start` runs `dist/server/index.mjs`.

## Data and identity

PostgreSQL stores application data. Drizzle defines the schema and uses a `pg` pool.

`users` own `brands`. Brand records own most product records, such as prompts, citations, articles, content jobs, and scans.

Supabase validates Bearer tokens. The API denies protected requests without a token.

The server checks a supplied `brandId` against the authenticated user. A failed ownership check returns 404.

Migrated request domains also use restricted PostgreSQL roles and RLS.

The request repositories open short actor-bound transactions. They do not expose the raw transaction.

Migrations 0096 through 0107 define the current restricted access, outbox, and request-command work.

## External services

Stripe provides prices, checkout, customer portal access, and webhooks.

Resend provides email delivery and delivery-status webhooks.

OpenAI and OpenRouter provide configured AI operations.

Sentry receives error reports when it has configuration. Pino writes structured server logs.

## Background work

The application has a content generation worker and scheduled work.

Long-lived production processes start the scheduler through `server/nitroBoot.ts`.

Vercel uses the daily cron route instead. Do not enable both job triggers.

The migration runner reads ordered SQL files from `migrations/`. It records each filename and SHA-256 checksum in `schema_migrations`.

Only the controlled release command runs the migration runner.

The transactional outbox stores durable internal commands. It uses leases, retries, cancellation, and idempotency keys.

Content completion records cost through the outbox. Generic LLM jobs can also enqueue provider work.

## Tests

Vitest tests server, shared, and client code.

Playwright tests browser paths in `tests/e2e/`. The Playwright configuration starts `npm run dev` unless `E2E_BASE_URL` is set.

Read [tests/e2e/README.md](../tests/e2e/README.md) for the browser test rules.
