# VentureCite documentation

This documentation set is organized by what you are trying to do, following
the [Diátaxis](https://diataxis.fr) framework: tutorials teach by doing,
how-to guides solve a specific task, reference describes the system as it
is, and explanation covers why it was built that way.

## Tutorials

Start here if you are new to the codebase.

- [Get a local stack running with a seeded brand](./tutorials/local-development-setup.md)

## How-to guides

Task-oriented steps. These assume you already know the codebase; they do
not teach it.

- [Add a migration](./how-to/add-a-migration.md)
- [Add a storage domain method](./how-to/add-a-storage-domain-method.md)
- [Add a cron job](./how-to/add-a-cron-job.md)
- [Run the integration suite locally](./how-to/run-the-integration-suite.md)
- [Debug a stuck citation run](./how-to/debug-a-stuck-citation-run.md)

## Reference

Facts about the system as it exists in the code today, for looking things
up.

- [Architecture](./reference/architecture.md) — the `client/`/`src/` split,
  Nitro and the Express bridge, Supabase and Drizzle, the migration runner.
- [Schema domains](./reference/schema-domains.md) — how `shared/schema.ts`
  is organized into 13 domain modules.
- [Storage layer](./reference/storage-layer.md) — how `server/storage.ts`
  composes 11 domain objects into one `IStorage` implementation.
- [Jobs and cron architecture](./reference/jobs-and-cron.md) — scheduled
  work, concurrency guards, and the citation-run lifecycle.
- [Verifying these documents](./reference/verifying-these-docs.md) — the
  commands that check the claims in this reference section against the
  actual code.

## Explanation

The reasoning behind decisions that are easy to mistake for defects.

- [Why the storage layer uses composition, not delegation](./explanation/composition-over-delegation.md)
- [Why there is only one active citation run per brand](./explanation/one-active-citation-run-per-brand.md)
- [Why citation run staleness is judged by last progress, not elapsed time](./explanation/citation-run-staleness.md)
- [Why the cadence gate must sit where a run is created](./explanation/cadence-gate-placement.md)
- [Why geo-opportunities reports all time while geo-analytics scopes to a run window](./explanation/opportunities-vs-geo-analytics-windows.md)

## Documents outside this set

A few documents predate this Diátaxis structure and are not duplicated
here:

- [../CLAUDE.md](../CLAUDE.md) and [../AGENTS.md](../AGENTS.md) — agent and
  contributor operating rules, not end-user or architecture documentation.
- [ARCHITECTURE.md](./ARCHITECTURE.md) and [OPERATIONS.md](./OPERATIONS.md)
  — a prior architecture and operations write-up. Where they overlap with
  [Reference](./reference/), the reference section in this set is the one
  that was re-verified against the code for this documentation pass.
- [deploy-runbook.md](./deploy-runbook.md) — the release process. Out of
  scope for this set, which covers development, not deployment.
