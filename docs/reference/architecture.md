# Architecture

This page describes how VentureCite's code is organized and how a request
reaches the database. It states facts about the current code. For the
reasoning behind these choices, see [Explanation](../explanation/).

## The two frontend-adjacent directories

The repository has two directories that both look like "the frontend":
`client/` and `src/`. They are not duplicates and they do not hold the same
kind of code.

`client/` holds the React application: pages, components, and hooks. It is
`vite.config.ts` aliases the `@` import specifier to `client/src`:

```ts
alias: {
  "@": path.resolve(import.meta.dirname, "client", "src"),
}
```

So `import { Button } from "@/components/ui/button"` resolves to
`client/src/components/ui/button`.

`src/` holds the TanStack Start route layer: 56 files, mostly small route
definitions. `vite.config.ts` passes `srcDirectory: "../src"` to the
`tanstackStart()` plugin, which makes `src/` the directory TanStack Start
scans for route files. Of the 41 route files under `src/routes/_app/`, 26
import page components directly from `@/pages/...` in `client/src`. TanStack
Start owns routing and server-side rendering; the page content it renders
lives in `client/`.

Neither directory is dead code, and neither can absorb the other without
moving what it owns into a directory with a different job.

## How a request reaches Express

Production serves both pages and the API through Nitro, the server runtime
that TanStack Start builds on. The existing Express application
(`server/app.ts`) is not rewritten into Nitro route handlers. Instead, three
file routes under `src/routes/` forward matching requests into Express
unchanged:

| Route file                 | Route pattern | Matches                         |
| -------------------------- | ------------- | ------------------------------- |
| `src/routes/api/$.ts`      | `/api/*`      | Every API request, any sub-path |
| `src/routes/webhooks/$.ts` | `/webhooks/*` | Webhook requests                |
| `src/routes/health.ts`     | `/health`     | The health check (exact path)   |

Each route's `ANY` handler calls `handleExpressRequest`, defined in
`src/server/expressBridge.ts`. That function uses `srvx`'s `toFetchHandler`
to wrap the Express app (a Node `(req, res) => void` handler) as a
Fetch-style `(Request) => Promise<Response>` function, then awaits
`prepareApp()` (which calls `registerRoutes(app)`) before forwarding the
request. `server/app.ts` itself is untouched by this bridge.

`/api/*` and `/webhooks/*` are splat routes because a TanStack Start file
route only matches within its own directory prefix; `/health` is registered
as an exact route because Express registers it as a single path with no
sub-paths.

## The two server entry points

`server/index.ts` is the development entry point only. It runs under
`npm run dev` (`tsx server/index.ts`). It performs boot side effects
(starting the scheduler, resuming stranded onboarding autopilots, setting up
Stripe products) and then calls `setupVite` to serve the app through Vite's
dev middleware. If `NODE_ENV=production` reaches this file, it throws
instead of serving anything:

```ts
throw new Error(
  "server/index.ts must not run with NODE_ENV=production. " +
    "Production runs `node dist/server/index.mjs` (npm start) instead.",
);
```

Production runs Nitro's own generated server, `dist/server/index.mjs`,
started by `npm start`. The equivalent boot side effects run there through
`server/nitroBoot.ts`, registered as a Nitro plugin in `vite.config.ts`. That
plugin only runs when `NODE_ENV=production`, so the two boot paths cannot
both fire in the same process. `vite.config.ts` also chooses Nitro's build
preset from the environment: no `VERCEL` variable selects `node-server`
(used by Render), and `VERCEL` set selects the `vercel` preset.

## Supabase and Drizzle

Supabase provides two things to this application: user authentication and a
hosted PostgreSQL database. No application code calls `supabase.from()` or
`supabase.rpc()` for table access. Every read and write to a table goes
through Drizzle ORM over a direct PostgreSQL connection pool
(`server/db.ts`), using a database role that owns the tables and is not
subject to Supabase's row-level security policies. `server/supabase.ts`
exposes a Supabase admin client, used for identity operations (creating
users, verifying tokens), not for data access.

## The migration runner and the generated mirror

`migrations/` holds ordered, hand-written SQL files and is the source of
truth for the database schema. `server/lib/migrationRunner.ts` is the real
runner. `applyMigrations()`:

1. Takes a session-level PostgreSQL advisory lock (`pg_advisory_lock`) so two
   concurrent release processes cannot apply migrations at the same time.
2. Ensures `public.schema_migrations(filename, checksum)` exists.
3. For each migration file, computes a SHA-256 checksum of its SQL text and
   classifies its status against the ledger as `verified` (checksum matches
   a prior run), `legacy` (row exists with a `NULL` checksum, from before
   checksums were recorded), or unapplied. `verified` and `legacy` files are
   skipped; everything else runs inside its own transaction.

`supabase/migrations/` is a generated mirror of `migrations/`, produced by
`scripts/syncSupabaseMigrations.mjs`. It exists so Supabase's own tooling
(and anyone reading the project through Supabase's dashboard) sees the same
migration history. Run `npm run supabase:migrations:sync` to regenerate it
and `npm run supabase:migrations:check` to confirm it has not drifted from
`migrations/`; CI runs the check. Do not hand-edit files under
`supabase/migrations/`.

## Confirmed dead code

`api/_bundle.js` is an esbuild bundle of a deleted file,
`server/vercelEntry.ts`. Git does not track it (`.gitignore` matches it), and
no script or configuration file references it. Do not read it or edit it; it
plays no role in how the application builds, runs, or deploys.

## See also

- [Schema domains](./schema-domains.md) for how `shared/schema.ts` is
  organized.
- [Storage layer](./storage-layer.md) for how `server/storage.ts` is
  organized.
- [Jobs and cron](./jobs-and-cron.md) for scheduled and background work.
- [Verifying these documents](./verifying-these-docs.md) for the commands
  that check these claims against the code.
