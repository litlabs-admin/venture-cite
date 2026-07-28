# Deploy runbook — Render + Vercel from one build

One codebase, one Vite/Nitro build, two hosts. Nitro (the Vite plugin wired
in `vite.config.ts`) auto-detects its target preset from the build
environment: no `VERCEL` env var → `node-server` (Render runs this
directly); `VERCEL=1` (set automatically by Vercel's build containers) →
the `vercel` preset, which writes Vercel's Build Output API v3 tree
(`.vercel/output`) directly. No `preset` is pinned in `vite.config.ts`, so
the same `vite build` invocation targets whichever host runs it.

This doc is deliberately short. Anything longer belongs in code comments
next to the code it explains (see `vite.config.ts`, `server/nitroBoot.ts`,
`server/db.ts`, `server/env.ts` — all already carry detailed "why" comments
for the decisions summarized here).

## What was proven with a real command, this session

- `VERCEL=1 NODE_ENV=production npx vite build` (run from an isolated copy
  of the repo — the live worktree had an in-progress, unrelated syntax
  error in `client/src/pages/articles.tsx` from concurrent work at build
  time) produced a real `.vercel/output` tree: `config.json`,
  `functions/__server.func/` (a single Node function, `.vc-config.json`
  shows `runtime: nodejs24.x`, no `maxDuration`/`memory` set), and
  `static/` (all prerendered/static assets, `robots.txt`, `sitemap.xml`,
  `llms.txt`, `favicon.png`).
- The generated `config.json` routes are exactly: cache-control headers on
  `/assets/(.*)`, `{ "handle": "filesystem" }`, then a catch-all
  `"/(.*)" -> "/__server"`. Every request that isn't a static file lands in
  the single server function, which is TanStack Start's own router —
  including the three server routes (`src/routes/api/$.ts`,
  `src/routes/webhooks/$.ts`, `src/routes/health.ts`) that already forward
  into the existing Express app.
- Read Nitro's own Vercel-preset source directly
  (`node_modules/nitro/dist/_presets.mjs`, `generateBuildConfig()` and the
  function-config writer above it): `config.json` is built purely from
  `nitro.options.vercel?.config` / `nitro.options.vercel?.functions` /
  `nitro.options.scheduledTasks` — **it never reads the repo's root
  `vercel.json` at all.**
- A separate, already-existing `dist/{nitro.json,public,server}` build
  (no `VERCEL` env var, `node-server` preset) has `dist/nitro.json`
  confirming `"preset": "node-server"`, `"serverEntry": "server/index.mjs"`.
  `dist/server/index.mjs` contains
  `process.env.NITRO_PORT ?? process.env.PORT` for the listen port, and
  passes `hostname: host` where `host` is `undefined` unless
  `NITRO_HOST`/`HOST` is set — Node/srvx's default in that case is to
  listen on all interfaces. Render-compatible as-is.

## What was reasoned from documentation/source, not deployed

- Vercel's own Build Output API v3 schema (`vercel.com/docs/build-output-api/v3/configuration`)
  does list `crons` as a supported `config.json` property. Vercel's cron
  troubleshooting KB tells users to check `.vercel/output/config.json` for
  the `crons` array as the way to confirm a cron registered — it does not
  describe a fallback to the root `vercel.json` once Build Output API is
  in play. Combined with the source-level fact above (Nitro never reads
  `vercel.json`), this is strong but not 100%-certain evidence — the only
  way to fully close it is a real deploy (see "Crons verdict" below).

## Vercel: `vercel.json` and `api/index.ts` verdict

**`api/index.ts` — deleted.** It was an 8-line stub re-exporting a
hand-bundled `api/_bundle.js` (produced by `package.json`'s `build` script
via a separate `esbuild server/vercelEntry.ts ...` step), built to work
around two problems with hand-deploying Express on Vercel
(node-file-trace not resolving extensionless ESM imports; `vercel.json`'s
function-glob validation running before `buildCommand`). Nitro's `vercel`
preset does its own bundling/tracing as part of the Nitro build and does
not use or need this stub — proven above: the real `.vercel/output/functions/__server.func/`
directory is a complete, self-contained function with its own `index.mjs`,
`_libs/`, `_ssr/`, `_chunks/`, and a `node_modules/` for native deps
(`import-in-the-middle`, etc.), built entirely by Nitro. `api/index.ts` had
no other importer in the codebase (confirmed by grep) — safe to delete.

**`vercel.json` — trimmed, not deleted.** Kept: `buildCommand` (still a
real, respected Vercel project setting — Build Output API doesn't change
_how the build command is invoked_, only how its output is interpreted)
and `crons` (kept as a defense-in-depth attempt — see verdict below; costs
nothing to leave in). Removed: `outputDirectory`, `functions`, `rewrites`
— all three describe how to interpret a conventional (non-Build-Output-API)
build, which Vercel bypasses entirely once `.vercel/output` exists. Kept
before trimming, deprecated by the real build tree above: the routing
`vercel.json`'s `rewrites` used to declare (`/api/*`, `/health`,
`/webhooks/*` → `/api/index`) is now handled _inside_ the single Nitro
function by TanStack Start's own file-based router, matching the shape of
the three `src/routes/{api,webhooks}/$.ts` + `health.ts` server routes
already in the tree.

Current `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "crons": [{ "path": "/api/cron/daily-orchestrator", "schedule": "0 6 * * *" }]
}
```

## Crons verdict: **likely broken as configured — do not assume it works**

The real `VERCEL=1` build's `.vercel/output/config.json` came out with
**no `crons` key at all**, because `vite.config.ts`'s `nitro({...})` call
today doesn't pass through `vercel: { config: { crons: [...] } }` and
doesn't use Nitro's own `scheduledTasks` feature — and Nitro's build never
reads the root `vercel.json`'s `crons` array to fill that gap (source-read,
not guessed — see above). Vercel's own troubleshooting guidance treats
`.vercel/output/config.json`'s `crons` property as the thing to check, with
no documented vercel.json fallback once Build Output API is active.

**What would fully settle it:** either (a) a real `vercel deploy`
(`--prebuilt` against the `.vercel/output` this doc already produced, or a
normal git-triggered deploy) followed by checking the Vercel dashboard's
Project → Cron Jobs tab for a registered `/api/cron/daily-orchestrator`
entry, or (b) contacting Vercel support/docs for an explicit statement
that root `vercel.json` crons are merged into Build-Output-API deployments.
Neither was done — this task's scope was configuration and local proof
only, no deploys.

**The fix, if the deploy check confirms it's broken (recommended
regardless, since it's the documented, Nitro-native mechanism and doesn't
depend on an unconfirmed vercel.json fallback):** in `vite.config.ts`'s
`nitro({...})` call, add

```ts
vercel: {
  config: {
    crons: [{ path: "/api/cron/daily-orchestrator", schedule: "0 6 * * *" }],
  },
},
```

This is a `vite.config.ts` change, out of this task's file scope — flagged
here for whoever owns that file next, not made silently.

## Render: `render.yaml`

See the fully-commented `render.yaml` at the repo root for the actual
build/start commands, health check, Node version, and env var list with
the reasoning inline. Summary:

| Setting           | Value                     | Why                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildCommand`    | `npm ci && npm run build` | Matches the repo's actual `npm run build` (`db:migrate && vite build && esbuild ...`); the esbuild step is dead weight now that `api/index.ts` is gone, but package.json is out of scope for this change — flagged for cleanup.                                                                                                   |
| `startCommand`    | `npm start`               | Already points at Nitro's generated `dist/server/index.mjs`, not the old esbuild bundle.                                                                                                                                                                                                                                          |
| `healthCheckPath` | `/health`                 | Real DB check (`SELECT 1`), 200/503 — not a static stub.                                                                                                                                                                                                                                                                          |
| `NODE_VERSION`    | `24.11.1`                 | The exact version used for every real build this session (`node -v`). No `.nvmrc`/`engines` field exists in the repo to infer this from otherwise.                                                                                                                                                                                |
| `NODE_ENV`        | `production`              | **Load-bearing.** `server/nitroBoot.ts` (migrations, in-process scheduler, autopilot resume, Stripe setup) is a no-op unless `NODE_ENV=production` _and_ `VERCEL` is unset. Render doesn't set `NODE_ENV` on its own — this must be explicit or the service boots healthy and silently never runs a migration or a scheduled job. |
| `plan`            | `free`                    | Per the task — see limitations below.                                                                                                                                                                                                                                                                                             |

### Free tier — what it cannot do (stated plainly, not worked around)

- **Idle spin-down.** A free web service with no inbound HTTP traffic for
  ~15 minutes spins down; the next request pays a cold-start penalty
  (10s+, plus `nitroBoot`'s migration/scheduler-init work runs again on
  every fresh boot). The user has already confirmed a plan for an
  external uptime ping — not implemented here.
- **No Cron Job resource.** Render's Cron Job product is a paid feature;
  `render.yaml` deliberately has no `- type: cron` service. Do not add
  one on the free plan.
- **Scheduling on Render today actually comes from `nitroBoot`'s
  in-process `node-cron` scheduler** (`server/scheduler.ts`), which only
  exists because Render runs a long-lived Node process (unlike Vercel's
  serverless functions). This is a real, working mechanism on the free
  plan — it is not blocked by the "no Cron Job resource" limitation above,
  those are two different things. **Open question for the user:** if the
  planned external scheduler also calls
  `POST /api/cron/daily-orchestrator` against the Render URL (the same
  endpoint Vercel's cron hits), Render would run that job set **twice** —
  once from the in-process scheduler, once from the external trigger. Pick
  one per host; this wasn't resolved here because it's a product decision,
  not a config bug.

## Env vars — full reference

Derived from `server/env.ts` (the Zod-validated schema) plus a direct grep
of every `process.env.*` / `import.meta.env.*` read across `server/`,
`src/`, and `client/src/` — not from `.env`/`.env.example` alone, since
this repo has previously had vars defined in `.env` that no code actually
read. The authoritative, per-var version lives in `.env.example` (every
entry below now has a matching documented line there); this table is the
condensed cross-reference. No values are reproduced anywhere in this repo
or this doc — see the Render dashboard / Vercel project settings for the
real secrets.

**Required at boot** (`server/env.ts` throws and the process refuses to
start if any are missing/invalid): `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`OPENAI_API_KEY`, `APP_URL` (auto-resolved from `VERCEL_URL` on Vercel;
**must be set explicitly on Render** — no `RENDER_EXTERNAL_URL` fallback
exists in the code, confirmed by reading `server/env.ts`).

**Host-injected, do not set manually:**

- Vercel: `VERCEL`, `VERCEL_URL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`.
- Render: `PORT` (Nitro reads it automatically).

**Build-time only** (baked into the client bundle by Vite; changing them
requires a rebuild, not just a redeploy of the same artifact):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`,
`VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_TOUR_ENGINE_ENABLED`,
plus the Sentry-source-map-upload set consumed by `vite.config.ts` itself
(not shipped to the client): `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
`SENTRY_PROJECT`, `SENTRY_RELEASE`.

**Runtime, host-specific:**

- `VERCEL_FUNCTION_BUDGET_MS` — Vercel only. Drives every derived timeout
  in `server/lib/factAgent/v2/vercelBudget.ts`. Defaults to 60000 (Pro
  assumption) — **set to `10000` explicitly on Vercel Hobby**, or budgets
  will assume 60s of runway the platform doesn't actually grant, and the
  function gets hard-killed mid-step instead of returning cleanly. This
  matters more than it did before this task, now that `vercel.json`'s
  `functions.maxDuration: 60` is dead config too (superseded by Build
  Output API, and never carried over into the generated
  `.vc-config.json` — confirmed empirically, that file has no
  `maxDuration`/`memory` key in the real build).
- `AUTO_CITATION_CRON`, `COMPETITOR_DISCOVERY_CRON`, `MENTION_SCAN_CRON`,
  `LISTICLE_SCAN_CRON`, `ACCOUNT_PURGE_CRON`, `BRAND_PURGE_CRON`,
  `TOUR_EVENTS_CLEANUP_CRON`, `DETECT_FACT_SCRAPE_FAILURE_CRON`,
  `WEEKLY_CATCHUP_CRON`, `WEEKLY_REPORT_CRON`,
  `WEEKLY_MAX_BRANDS_PER_USER` — Render only (the in-process scheduler
  that reads them never starts on Vercel).

**Everything else is optional** and either has a safe default or degrades
a specific feature: `OPENROUTER_API_KEY`, `STRIPE_PUBLISHABLE_KEY`,
`SESSION_SECRET`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `LOG_LEVEL`,
`DATABASE_CA_CERT_PATH`, `DATABASE_SSL_REJECT_UNAUTHORIZED`,
`EMAIL_UNSUBSCRIBE_SECRET`, `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY`,
`RESEND_FROM_ADDRESS`, `STRIPE_API_VERSION`, `BUFFER_ENCRYPTION_KEY`,
`REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`/`REDDIT_USERNAME`/`REDDIT_PASSWORD`,
`EXTRA_CORS_ORIGINS`, `CRON_SECRET` (technically optional per the schema,
but the cron HTTP endpoint fails closed with no way to call it if unset —
treat as required if either host's scheduled work needs to run),
`JINA_API_KEY`, `FACT_AGENT_JINA_ENABLED`, `FACT_AGENT_LLM_URL_RANKER`,
`FACT_AGENT_WIKIDATA_ENABLED`.

**Findings from this audit, not previously documented:**

- Read-but-undocumented before this change (now added to `.env.example`
  and this table): `EXTRA_CORS_ORIGINS`, `CRON_SECRET`, all nine `*_CRON`
  overrides plus `WEEKLY_MAX_BRANDS_PER_USER`, `JINA_API_KEY`,
  `FACT_AGENT_JINA_ENABLED`, `FACT_AGENT_LLM_URL_RANKER`,
  `FACT_AGENT_WIKIDATA_ENABLED`, `VERCEL_FUNCTION_BUDGET_MS`,
  `VITE_SENTRY_ENVIRONMENT`, `VITE_TOUR_ENGINE_ENABLED`, `SENTRY_ORG`,
  `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_RELEASE`,
  `STRIPE_PUBLISHABLE_KEY`, `SESSION_SECRET` (mentioned only in a comment
  before this change, no entry line of its own).
- Defined-but-effectively-unused-in-app-runtime: `E2E_TEST_EMAIL`,
  `E2E_TEST_PASSWORD` — real, but only consumed by
  `tests/e2e/support/auth.ts` (Playwright). Not needed by either deploy
  target; keep them out of Render/Vercel env config.

## Boot side-effects — same host-branching pattern, now doubly load-bearing

`server/nitroBoot.ts` explicitly no-ops unless `NODE_ENV=production &&
!process.env.VERCEL`. That means:

- **Render**: must set `NODE_ENV=production` (done in `render.yaml`) for
  migrations/scheduler/autopilot-resume/Stripe-setup to run at all.
- **Vercel**: relies entirely on the daily cron orchestrator
  (`/api/cron/daily-orchestrator`) for the equivalent jobs — which is
  exactly the endpoint whose Vercel cron registration this doc could not
  fully confirm (see "Crons verdict" above). If that cron silently isn't
  registered, Vercel gets neither the in-process scheduler (correctly, by
  design — Vercel is serverless) **nor** the daily orchestrator. Confirming
  the crons verdict with a real deploy is the single highest-value
  follow-up from this task.
