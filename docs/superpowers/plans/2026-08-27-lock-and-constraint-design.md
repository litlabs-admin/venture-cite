# Task 7b and 8b — design decisions

These two were split out of the mechanical plan because neither has a correct answer that
can be derived from the plan text. Both are settled here with evidence.

---

## 7b — Long-job locking

### The measurement that decides it

`DATABASE_URL` points at Supavisor's transaction pooler on port 6543. The open question
was whether holding a pinned `pool.connect()` client preserves the Postgres backend
session across statements, because every advisory lock in this codebase depends on that.

Measured directly against the production pooler, read-only:

| Test                                                                 | Result                                         |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| One idle pinned client, 5 sequential statements                      | Same backend PID all 5 times                   |
| **8 concurrent pinned clients, 6 statements each, 120 ms idle gaps** | **7 of 8 rotated across backends mid-session** |

Supavisor multiplexed 8 client connections onto 2 Postgres backends, reassigning per
transaction. A single idle client looks stable and is therefore misleading; under real
concurrency it is not.

**Conclusion: a pinned client does NOT preserve session state.** Session-scoped advisory
locks cannot be made safe on this connection path by pinning.

This corrects an earlier claim in this project's register (D-5), which said those sites
"already pin a client, so the session lock is not the bug there". Pinning does not help.

### What that means for each site

| Site                                              | Lock                                                         | Verdict                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `advisoryLock.ts:61-75` `withDynamicAdvisoryLock` | `pg_try_advisory_lock` + `pg_advisory_unlock`, pinned client | **Unsafe**                                                                            |
| `advisoryLock.ts:95-109` `withAdvisoryLock`       | same                                                         | **Unsafe**                                                                            |
| `workflowEngine.ts:80,99,116` `withRunLock`       | same                                                         | **Unsafe**                                                                            |
| `migrationRunner.ts:171,287`                      | **blocking** `pg_advisory_lock`, pinned client               | **Unsafe** — and the most likely source of the 64,164 ms block observed in production |
| `factScrapeBackstop.ts:60`                        | `pg_try_advisory_xact_lock` inside a transaction             | **Safe** — a transaction does pin one backend, confirmed by the same measurement      |

The failure mode is silent: the release lands on a different backend, the original backend
keeps the lock until it is recycled, and the next acquirer blocks or spins.

### Why transaction-scoping is not the answer

The obvious fix — convert everything to `pg_advisory_xact_lock` — is wrong for these
callers. `withAdvisoryLock` wraps whole cron jobs: auto-citation has been observed running
25+ minutes with roughly 180 LLM calls, and mention-scan, listicle-scan and weekly-report
are the same shape. Holding an open transaction for that long pins a pooled backend, blocks
VACUUM on the tables it touched, and dies to any `idle_in_transaction_session_timeout`.

Transaction scope is correct only where the critical section is short and purely database
work — which is exactly `factScrapeBackstop`, and exactly why that site is already right.

### The design: a lease table

Long-running mutual exclusion should not use advisory locks on this connection path at
all. Use a row with an expiry, which is pooler-agnostic because every operation is a
single atomic statement.

This is not a new pattern for this codebase. It is already how three subsystems work:

- `outbox_commands` — `lease_token`, `lease_expires_at`, claim via
  `FOR UPDATE SKIP LOCKED`, renewed by a heartbeat
- `llm_concurrency_slots` — TTL rows, expired slots reclaimed with no explicit release
- `system_state` — `jobDebounce`'s "did this job already run" window

Shape:

```sql
create table if not exists job_leases (
  lease_key     text primary key,
  holder_token  uuid        not null,
  acquired_at   timestamptz not null default now(),
  expires_at    timestamptz not null,
  heartbeat_at  timestamptz not null default now()
);
```

Acquire — one atomic statement, succeeds only if free or expired:

```sql
insert into job_leases (lease_key, holder_token, expires_at)
values ($1, $2, now() + $3::interval)
on conflict (lease_key) do update
  set holder_token = excluded.holder_token,
      acquired_at  = now(),
      heartbeat_at = now(),
      expires_at   = excluded.expires_at
  where job_leases.expires_at < now()
returning holder_token;
```

A returned row means this caller holds it; no row means someone else does. Renew on a
timer while the job runs; release with
`delete from job_leases where lease_key = $1 and holder_token = $2`, which cannot free
somebody else's lease. A crashed holder's lease expires on its own — the property session
locks were supposed to provide and, on this pooler, do not.

**Why this beats the alternatives.** A direct (non-pooler) connection just for locks would
work but adds a second connection path and a second failure mode. Moving off the
transaction pooler entirely is a much larger change with its own cost.

### Migration order

1. Add `job_leases` and a `withJobLease(key, ttl, fn)` helper.
2. Move `withAdvisoryLock` and `withDynamicAdvisoryLock` onto it. Their callers are cron
   jobs that already tolerate "someone else holds it, skip this tick".
3. Move `withRunLock` onto it. It already has a 5-minute staleness rescue, which the
   lease TTL replaces properly.
4. Leave `factScrapeBackstop` alone.
5. `migrationRunner` is separate: it runs as a release step, not under app concurrency.
   The safe fix there is to hold its lock inside a single transaction, which conflicts
   with Task 2a's non-transactional pragma. Simplest correct option is to run migrations
   over `DATABASE_DIRECT_URL` — the session pooler — which
   `scripts/releaseEnvironmentPreflight.ts` already requires and validates.

---

## 8b — CHECK constraints on status columns

### Recommendation: do not add them yet

The value set cannot be established by static analysis. For
`brand_fact_scrape_runs.status` alone, three sources disagree:

| Source                                         | Values                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Schema comment in `shared/schema.ts`           | `pending`, `planning`, `fetching`, `extracting`, `slice_pending`, … |
| Literals found near the scrape-run write sites | `completed`, `done`, `failed`, `pending`                            |
| Live production data                           | `completed`, `pending`                                              |

`completed` appears in the data and in the code but **not** in the documented list, which
is direct evidence the comment is stale. Status is also written through generic helpers
that take a variable rather than a literal, so grep cannot enumerate the reachable set.

A CHECK narrower than the reachable set does not fail in review. It fails in production,
the first time a legitimate state transition is written, and it fails as a write error on
a background job. The benefit — catching a typo — does not justify that risk while the
allowed set is unknown.

### What to do instead

Observe first, constrain second. Add a monitoring query to the existing
`signals-retention-prune` cron step that reports any status value outside the expected set
per table, without blocking the write:

```sql
select 'brand_fact_scrape_runs' as tbl, status, count(*)
from brand_fact_scrape_runs
where status not in ('pending','planning','fetching','extracting','slice_pending','completed','failed','cancelled')
group by status;
```

Log the result. If it stays empty across a full cycle of every state machine — a few weeks
covering weekly jobs — the observed set is evidence, and a CHECK can then be added with
`NOT VALID` first so it applies to new rows only, and validated afterwards.

The four columns worth constraining eventually, because each gates a real invariant:
`articles.status`, `content_generation_jobs.status`, `citation_runs.status`, and
`brand_fact_scrape_runs.status` — the last because it backs a partial unique index
enforcing one active run per brand, so a stray value silently permits concurrent runs.
