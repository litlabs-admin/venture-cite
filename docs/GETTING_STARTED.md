# Getting started

Step-by-step setup for a fresh local dev environment. Should take ~20 minutes for someone with the credentials in hand.

---

## Prerequisites

- **Node.js 20.x** (LTS). `node -v` should print `v20.x.y`. If you don't have it: https://nodejs.org or `nvm install 20`.
- **npm 10.x** (ships with Node 20).
- **Git**.
- A code editor with TypeScript support (VS Code recommended).

You'll also need credentials for:
- Supabase project (URL + service-role key + anon key)
- Stripe test keys (secret + publishable + webhook signing secret)
- OpenAI API key
- Optional: OpenRouter, Resend, Buffer, Sentry

---

## 1. Clone and install

```bash
git clone <repo-url> venturecite
cd venturecite
npm install
```

`postinstall` runs Husky setup automatically.

---

## 2. Set up `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in real values. The required keys are:

| Key | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string → **Transaction pooler (port 6543)** |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon / public` key |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe CLI: `stripe listen --forward-to localhost:5000/api/stripe/webhook` prints it |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API keys → Publishable (`pk_test_...`) |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| `APP_URL` | `http://localhost:5000` |
| `NODE_ENV` | `development` |
| `PORT` | `5000` |

Optional (features degrade gracefully if missing):
- `OPENROUTER_API_KEY` — citation features fall back to OpenAI-only
- `RESEND_API_KEY` — weekly email job is skipped
- `BUFFER_*` — social distribution disabled
- `SENTRY_DSN` / `VITE_SENTRY_DSN` — error tracking is no-op

The server validates env on boot (`server/env.ts`) and prints every missing/malformed var if anything is wrong.

---

## 3. Run migrations

Migrations are **auto-applied on server boot** from `migrations/*.sql` in lexical order, tracked in `public.schema_migrations`. You don't need to run them manually — just start the server.

(There's also `npm run db:push` which uses `drizzle-kit` to sync schema diffs, but for normal dev work the boot migrations are enough.)

---

## 4. Start the dev server

```bash
npm run dev
```

This runs `tsx server/index.ts` with `NODE_ENV=development`. The server:
- Validates env
- Inits Sentry (no-op if no DSN)
- Applies pending migrations
- Bootstraps Stripe products (idempotent)
- Starts Express on port 5000
- Mounts Vite middleware so the React client and API share the same port

Visit http://localhost:5000.

---

## 5. Verify your setup

```bash
# In a second terminal
curl http://localhost:5000/health
# → {"status":"ok","db":true,"timestamp":"..."}
```

If `db: false` you have a Postgres connection problem — re-check `DATABASE_URL`.

```bash
# Run the test suite
npm test
# → ssrf + logger tests pass
```

---

## 6. Stripe webhooks (for billing flow testing)

Install the Stripe CLI: https://stripe.com/docs/stripe-cli

```bash
stripe login
stripe listen --forward-to localhost:5000/api/stripe/webhook
# Copy the printed `whsec_...` into your .env as STRIPE_WEBHOOK_SECRET
# Restart the dev server
```

Trigger a test event:
```bash
stripe trigger checkout.session.completed
```

You should see the webhook log line in the dev server output.

---

## 7. Common dev workflows

| Task | Command |
|---|---|
| Add a new dependency | `npm install <pkg>` (lockfile commits, CI uses `npm ci`) |
| Add a migration | Create `migrations/00NN_name.sql`. Restart server to apply. |
| Generate Drizzle types after schema change | `npm run db:push` (or just restart — types are inferred at compile time) |
| Run tests in watch mode | `npm run test:watch` |
| Fix lint + format issues | `npm run lint:fix && npm run format` |
| Type-check only | `npm run check` |

---

## 8. If something breaks

1. **Server won't boot** → look at the first stderr line. Env validation errors are explicit.
2. **DB errors** → Supabase pooler connections are sometimes terminated; restart the dev server.
3. **Stripe 401** → check the secret key matches the project (test vs live).
4. **OpenAI 429** → you're rate-limited; wait or switch keys.
5. **TypeScript errors after a Drizzle schema change** → restart your editor's TS server.
6. **Husky hook not running** → `npm run prepare` re-installs it.
7. **Sentry "DSN required"** → unset `SENTRY_DSN` in `.env`; init is meant to no-op when missing.

If still stuck, check [`docs/RUNBOOK.md`](RUNBOOK.md) for known incident patterns.

---

## 9. What to read next

- [`README.md`](../README.md) — high-level overview
- [`CLAUDE.md`](../CLAUDE.md) — operating context, golden paths, what NOT to do
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — detailed architecture (some sections pre-date the Supabase migration)
- [`docs/feature_flows.md`](feature_flows.md) — feature-by-feature flow walkthrough
- [`AUDIT.md`](../AUDIT.md) + [`audit/`](../audit/) — production-readiness audit
- The remediation plan lives at `~/.claude/plans/how-should-we-go-noble-reddy.md`
