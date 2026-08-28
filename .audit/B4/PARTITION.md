# B4 partition, as built

`shared/schema.ts` held 71 tables in 2,607 lines. It is now a 13-line barrel of
`export *` statements over 13 domain modules. No consumer changed; 147 files
import this module and none of them were touched.

## Modules

| Module      | Tables | Lines | Imports                            |
| ----------- | -----: | ----: | ---------------------------------- |
| identity    |      3 |   227 | none                               |
| brands      |      1 |    86 | identity                           |
| content     |      5 |   241 | brands, identity                   |
| prompts     |      8 |   246 | brands                             |
| competitors |      3 |   130 | brands                             |
| citations   |      7 |   300 | brands, content, identity, prompts |
| signals     |      7 |   298 | brands, content                    |
| factAgent   |      7 |   276 | brands                             |
| siteHealth  |      2 |    71 | brands, identity, factAgent        |
| perception  |      3 |   141 | brands                             |
| chatbot     |      3 |    78 | brands, identity                   |
| jobs        |      7 |   300 | brands, identity                   |
| platform    |     15 |   373 | brands, identity                   |

71 tables. The import graph is acyclic: `identity` imports nothing, and no
module imports one that depends on it.

## Why the plan changed during the work

The design proposed seven modules. The split landed at thirteen.

The co-location pass ordered tables by dependency so the extractions would be
clean cuts. That was the right call for safety, but it meant contiguity and
domain stopped coinciding in the tail. Forcing seven boundaries onto that layout
would have produced groupings the reference graph does not support.

Three modules exist because the data argued for them:

- `prompts` would have been folded into `citations`. Prompts drive citation runs
  rather than belonging to them, and the eight tables reference only `brands` and
  each other.
- `signals` holds off-site content: what other sites say about a brand, as
  opposed to what the brand publishes. Different lifecycle from `content`.
- `jobs` is grouped by failure mode, not feature. Everything in it queues, leases
  or drains work. The B1p audit confirmed 11 concurrency defects and the
  read-modify-write races cluster in these seven tables: the LLM slot limiter
  that is not atomic across sessions, the outbox drain, the weekly digest that
  can send twice. Whoever fixes the next race reads one file.

## The module that is still wrong

`platform` holds 15 tables and 373 lines: analytics, metricsHistory,
alertSettings, alertHistory, communityPosts, emailFailures, apiCosts, auditLogs,
notificationPreferences, schemaAudits, competitorFavicons, sourceHealth,
sentimentCache, tourEvents, systemState.

They are grouped by not belonging anywhere else, which is the definition this
partition set out to avoid. Alerts, audit logs and metrics history are three
different concerns sharing a file. Splitting it arbitrarily now would trade one
bad boundary for three, so it stays as one module and is recorded here as work
for after B5, when the storage layer decomposition will show which of these
tables are actually used together.

## How every module was verified

Six gates per module, run by the orchestrator rather than read from the agent's
report:

1. Export surface identical to the pre-split baseline, 260 names. Types are
   erased at runtime, so this walks the TypeScript AST rather than importing the
   module. A dropped type is invisible to `tsc` when nothing references it today.
2. Generated SQL identical. Drizzle emits tables in declaration order, so the
   statements are sorted before comparison. 271 statements before and after,
   every time.
3. Typecheck.
4. Lint and format.
5. Full test suite, 224 files.
6. Membership: no zod builder or type alias belonging to a moved table left in
   the barrel.

Gate 6 exists because the identity extraction left `insertUserSchema` behind and
gates 1 through 5 all passed. A declaration in the wrong file still exports,
compiles, type-checks and generates identical SQL. The gates prove nothing broke.
They cannot prove a move was complete.

## Reproducing the checks

    node scripts/verifySchemaSplit.mjs

`npm run schema:surface:check` runs gate 1 alone and is wired into CI, so the
surface stays protected after this work ends.
