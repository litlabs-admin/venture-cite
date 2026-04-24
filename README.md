# VentureCite

AI-powered Generative Engine Optimization (GEO) platform. Brands use it to get discovered and cited by ChatGPT, Perplexity, Gemini, Claude, and other AI search engines.

> **Status**: pre-launch. Active remediation against the production-readiness audit (see [`AUDIT.md`](AUDIT.md)).

---

## Quickstart

```bash
# 1. Clone and install
git clone <repo>
cd venturecite
npm install

# 2. Copy env template and fill in real values
cp .env.example .env
# Edit .env — at minimum: DATABASE_URL, SUPABASE_*, STRIPE_*, OPENAI_API_KEY

# 3. Run dev server (client + server in one process via Vite middleware)
npm run dev
# → http://localhost:5000
```

If you're new to the codebase, read [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) before running anything.

---

## Tech stack

| Layer         | Choice                                                       |
| ------------- | ------------------------------------------------------------ |
| Frontend      | React 18, Vite 5, Wouter, TanStack Query, Radix UI, Tailwind |
| Backend       | Node 20, Express 4, TypeScript (ESM)                         |
| Database      | Postgres (Supabase), Drizzle ORM                             |
| Auth          | Supabase JWT (Bearer header)                                 |
| Payments      | Stripe                                                       |
| Email         | Resend                                                       |
| AI            | OpenAI + OpenRouter                                          |
| Observability | Sentry + Pino                                                |

Detailed architecture in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Scripts

| Script                  | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `npm run dev`           | Start dev server (client + server, Vite middleware, hot reload) |
| `npm run build`         | Build client (Vite) + bundle server (esbuild) → `dist/`         |
| `npm run start`         | Run production build (`node dist/index.js`)                     |
| `npm run check`         | TypeScript strict typecheck                                     |
| `npm run lint`          | ESLint (errors gate CI; warnings tracked)                       |
| `npm run lint:fix`      | Auto-fix ESLint issues                                          |
| `npm run format`        | Prettier write                                                  |
| `npm run format:check`  | Prettier check                                                  |
| `npm test`              | Run Vitest once                                                 |
| `npm run test:watch`    | Vitest in watch mode                                            |
| `npm run test:coverage` | Vitest with coverage report                                     |
| `npm run db:push`       | Sync Drizzle schema to DB                                       |

CI runs `check` + `lint` + `format:check` + `test` on every PR — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Repository layout

```
client/src/        React app (pages, components, hooks, lib)
server/            Express API + workers
  index.ts          Entry: middleware, migrations, scheduler, worker, graceful shutdown
  routes.ts         All API routes (will be split per Wave 5 of remediation plan)
  auth.ts           Supabase JWT verification + ownership middleware
  databaseStorage.ts  DAO layer
  scheduler.ts      node-cron jobs (weekly report, auto-citation, scans)
  contentGenerationWorker.ts  Polls content_generation_jobs table
  webhookHandlers.ts  Stripe webhook (signature-verified, idempotent)
  lib/              ssrf, ownership, modelConfig, logger, etc.
shared/            Drizzle schema + Zod validators (imported by both sides)
migrations/        SQL migrations (auto-applied at boot)
scripts/           One-off scripts (Stripe seed, etc.)
docs/              Architecture, runbook, getting started, feature flows
audit/             Production-readiness audit (per group)
tests/             Vitest unit + integration tests
```

---

## Environment variables

See [`.env.example`](.env.example) for the full list with comments. Server boot validates every required key via Zod ([`server/env.ts`](server/env.ts)) and fails fast with a readable error if any are missing.

Critical ones:

- `DATABASE_URL` — Supabase pooled Postgres connection string
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server-side admin client
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — client-side public auth
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY` (optional — citation features fall back gracefully)
- `RESEND_API_KEY` (optional — weekly emails skip if unset)
- `SENTRY_DSN`, `VITE_SENTRY_DSN` (optional — error tracking is no-op without)

---

## Working in this repo

- **Every PR** runs CI (`tsc` + ESLint + Prettier + Vitest). Pre-commit hook (Husky + lint-staged) auto-fixes and tests staged files.
- **Adding a feature**: schema → migration → DAO method → route → React Query hook → page. See [`CLAUDE.md`](CLAUDE.md) for the full pattern (local-only file).
- **Reporting an incident**: follow [`docs/RUNBOOK.md`](docs/RUNBOOK.md).
- **Production audit findings**: see [`AUDIT.md`](AUDIT.md) and per-group reports in [`audit/`](audit/).

---

## Contributing

This is currently a single-author repository. Code review and pair contributions are welcome — open a PR against `main`. CI must be green to merge.
