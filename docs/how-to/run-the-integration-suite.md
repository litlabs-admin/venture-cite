# How to run the integration suite locally

VentureCite's integration tests run destructive operations against a real
PostgreSQL database: applying migrations, exercising row-level security
policies, and draining the outbox. Without a test database configured, they
skip silently. This guide sets one up.

## Why "green" is not enough on its own

`npm test` runs every file under `tests/unit/`, `tests/integration/`, and
elsewhere through Vitest. Every test that calls
`configureDestructiveDatabaseTest` first checks `TEST_DATABASE_URL`. If it is
unset, the helper deletes `DATABASE_URL` from the test process's environment
and the test reports `{ kind: "skip" }` — Vitest counts a skip as neither a
pass nor a failure. A fully green `npm test` run proves nothing about the 16
files under `tests/integration/` unless you check the run's own summary line
for how many tests actually ran, not only whether any failed.

## Start a local database

Use the project's local Supabase stack, since its schema and roles match
production:

```sh
npx supabase start
```

This starts local Postgres on port `55322` (see `supabase/config.toml`) and
the local API on port `55321`.

## Point the tests at it

`tests/helpers/destructiveDatabaseTest.ts` enforces three rules on
`TEST_DATABASE_URL`, to make it hard to point a destructive test at a real
database by mistake:

1. It must differ from `DATABASE_URL`.
2. Its database name must contain `test` (for example, `_test` or `-test`)
   and its hostname must not contain `prod` or `production` — **or** it must
   be the local Supabase stack's own database, in which case also set
   `LOCAL_SUPABASE_TEST=1`.
3. It must use a loopback host (`localhost`, `127.0.0.1`, or `::1`) unless
   you also set `ALLOW_REMOTE_TEST_DATABASE=1`.

Using the local Supabase stack started above:

```sh
export TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres"
export LOCAL_SUPABASE_TEST=1
```

Using a separate, dedicated test database instead:

```sh
export TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/venturecite_test"
```

## Run the suite

```sh
npm run test:integration
```

This runs `vitest run tests/integration tests/migrations
tests/unit/factScrapeCacheStorage.test.ts tests/unit/v2LifecycleStorage.test.ts`.
Read the summary line Vitest prints at the end and confirm the test count
matches what you expect — a run with `TEST_DATABASE_URL` unset will still
print "passed", with a much smaller number of tests executed.

Run the full suite, including these files alongside every unit test, with:

```sh
TEST_DATABASE_URL=... npm test
```

## Follow the project's test rules

Run one test suite at a time. Stop the local Supabase stack when you are
done:

```sh
npx supabase stop
```
