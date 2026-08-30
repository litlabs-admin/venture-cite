# Get a local VentureCite stack running with a seeded brand

This tutorial takes you from a fresh clone of VentureCite to a running local
stack with one brand created through the product's own onboarding flow. You
will not need a real AI provider key, a real Supabase project, or a real
Stripe account.

## What you will end up with

By the end, you will have `npm run dev` serving the application on
`http://localhost:5000`, a local Supabase stack backing it, and one brand
created through the same "Add Your Brand" flow a real user goes through —
using a fake content provider so the run costs nothing and needs no network
access to a real AI platform.

## Before you start

Install Node.js and clone the repository. Then install dependencies:

```sh
npm install
```

## Start a local Supabase stack

VentureCite's development mode refuses to start with a non-loopback database
or Supabase URL, or with a real AI provider key set, unless you explicitly
opt out of that protection. Give it a fully local stack instead:

```sh
npx supabase start
```

Wait for the command to finish. It prints a local API URL, an anon key, and
a service role key. It runs the local API on port `55321` and local Postgres
on port `55322` (`supabase/config.toml`).

## Configure your environment

Copy the example file and fill in the values `supabase start` printed:

```sh
cp .env.example .env
```

Set at least these values in `.env`:

```sh
NODE_ENV=development
PORT=5000
APP_URL=http://localhost:5000

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres

SUPABASE_URL=http://127.0.0.1:55321
SUPABASE_SERVICE_ROLE_KEY=<the service_role key supabase start printed>
VITE_SUPABASE_URL=http://127.0.0.1:55321
VITE_SUPABASE_ANON_KEY=<the anon key supabase start printed>

CONTENT_GENERATION_PROVIDER=fake
CONTENT_GENERATION_FAKE_BASE_URL=http://127.0.0.1:5000
DISABLE_STARTUP_AUTOPILOT=true
DISABLE_STRIPE_SETUP=true
```

Leave `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, and
`STRIPE_SECRET_KEY` unset. All four addresses point at loopback, so
`server/env.ts`'s startup check passes without needing
`ALLOW_REMOTE_DEVELOPMENT_SERVICES`.

## Apply the database migrations

```sh
npm run db:migrate
```

This applies every file in `migrations/` to your local database in order
and records each one in `public.schema_migrations`. Confirm it printed
`migrate: complete`.

## Start the application

```sh
npm run dev
```

Now visit `http://localhost:5000`. You should see the VentureCite landing
page.

## Create an account

1. Go to `http://localhost:5000/register`.
2. Fill in a first name, last name, an email address, and a password twice.
   Submit the form.
3. Because your local Supabase stack has no real email provider connected,
   check the local Supabase stack's own log output, or its local mail
   capture UI if `supabase start` printed one, for the verification link —
   or disable email confirmation for local testing in your local Supabase
   dashboard (**Authentication → Providers → Email → Confirm email**).
4. Log in at `/login`.

## Create your first brand

A fresh account with no brands lands on `/welcome`.

1. Enter a website URL — any real, reachable site works, since the fake
   content provider only replaces the AI generation calls, not the
   website-scraping step. Try `https://example.com`.
2. Click **Find my brand**. The application scrapes the site and, once
   scraping finishes, shows you an editable summary: brand name, industry,
   description, and so on.
3. Review the fields and click **Confirm and start measuring**. The client
   sends `POST /api/onboarding/confirm`.

You should see the page move to an "activating" screen. The server has
already started the brand's ordered activation pipeline: a fact sheet, then
suggested prompts, then an initial citation run — all using the fake content
provider, so no real API key is spent and no network call reaches a real AI
platform.

4. Wait for the activation screen to finish, then continue to the
   dashboard. You now have one brand with real database rows for a fact
   sheet, prompts, and at least one citation run, created the same way a
   production signup creates them.

## Next steps

- [Reference: architecture](../reference/architecture.md) explains how the
  request you just made travelled from your browser to Postgres.
- [How to run the integration suite locally](../how-to/run-the-integration-suite.md)
  covers testing against this same local database, safely.
- [How to add a migration](../how-to/add-a-migration.md) covers changing the
  schema you just applied.
