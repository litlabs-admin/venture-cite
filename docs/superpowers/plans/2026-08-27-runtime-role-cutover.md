# Task 9 — runtime-role cutover: enumeration and recommendation

**Recommendation: do not perform the cutover as planned.** The evidence below shows it
would not deliver the security benefit it was designed for, and would break the app.

---

## What the cutover was meant to do

The app connects as `postgres` — `DATABASE_URL`'s user is `postgres.<ref>`, the table
owner, which bypasses RLS. Migrations 0096–0114 built a restricted-role architecture:
three roles (`venturecite_request`, `venturecite_content_request`,
`venturecite_outbox_worker`), column-level grants, and 26 RLS policies keyed on a
`venturecite.user_id` GUC set per transaction.

A `venturecite_runtime` login role exists in production and is correctly a member of all
three. `DATABASE_RUNTIME_ROLE_NAME` is unset, so nothing connects as it. The plan was to
switch `DATABASE_URL` to that role so RLS would actually enforce.

## What the enumeration found

Reproduced on the local database: created `venturecite_runtime`, granted it membership in
all three restricted roles, connected as it, and exercised representative app queries.

| Probe                                                                                        | Result                |
| -------------------------------------------------------------------------------------------- | --------------------- |
| `users`, `brands`, `articles`, `outbox_commands`                                             | OK                    |
| `brand_prompts`, `geo_rankings`, `competitors`, `citation_runs`, `api_costs`, `system_state` | **permission denied** |
| write to `geo_rankings`                                                                      | **permission denied** |

Grant coverage across the whole schema:

|                                               | Count  |
| --------------------------------------------- | ------ |
| Public tables                                 | **72** |
| Tables with any grant to the restricted roles | **12** |
| Tables with **no access at all**              | **60** |

And the 12 that are covered are deliberately narrow — `brand_prompts` has `SELECT` on a
single column, `citation_runs` likewise. Full column counts:

```
api_costs                7 cols  INSERT,SELECT      articles       26 cols  INSERT,SELECT,UPDATE
article_revisions        6 cols  INSERT,SELECT      brands         27 cols  INSERT,SELECT,UPDATE
brand_prompts            1 col   SELECT             citation_runs   1 col   SELECT
content_generation_jobs 10 cols  SELECT             distributions  10 cols  INSERT,SELECT,UPDATE
keyword_research        18 cols  SELECT,UPDATE      llm_jobs        8 cols  SELECT,UPDATE
outbox_commands         25 cols  INSERT,SELECT,UPDATE  users       13 cols  SELECT,UPDATE
```

## Why the cutover is the wrong move

The restricted-role architecture was never built for the whole application. It was built
for a **narrow slice**: the four route files that go through `requestData` /
`contentRequestData` (`routes/articles.ts`, `brands.ts`, `content.ts`, `userAccount.ts`),
which open a transaction, `SET LOCAL ROLE`, and set the `venturecite.user_id` GUC.

Everything else — the other ~25 route modules and the 5,145-line `DatabaseStorage` — runs
as the owner by design.

So switching `DATABASE_URL` to `venturecite_runtime` has exactly two outcomes:

1. **Grant only what is needed and the app breaks.** Sixty tables are unreachable. The
   dashboard, citation runs, competitors, mentions, fact sheets and the scheduler all fail
   on their first query.
2. **Grant enough to make it work and the benefit evaporates.** Covering 72 tables with
   the privileges the app actually uses reproduces owner-equivalent access under a
   different role name. RLS would still not constrain anything, because the policies only
   exist on 12 tables and only cover the request-scoped paths.

Neither is worth doing. The security gain the plan assumed — "flip the connection string
and RLS starts enforcing" — does not exist, because the policies and grants cover 12
tables, not 72.

## What to do instead

**Grow the restricted path, do not flip the connection.** The `requestData` /
`contentRequestData` pattern already works and is already enforced by RLS for the routes
that use it. Each additional route migrated onto it gains real enforcement, table by
table, with no big-bang cutover and no window where the app is broken.

Concretely:

1. Pick the next route module by value — the ones handling the most user-scoped data are
   `routes/prompts.ts` and `routes/dashboard.ts`.
2. Add a request-scoped repository for its tables, following
   `server/data/requestBrandRepository.ts`.
3. Add the column-level grants and RLS policies for those tables in one migration,
   matching the style of 0096/0097.
4. Repeat. Coverage grows from 12 tables toward 72 without ever breaking the app.

`DATABASE_URL` stays on the owner role throughout. It becomes safe to switch only once
coverage is effectively complete — which is a much later milestone than this plan assumed.

## Related findings

- **F-10** is confirmed and quantified: the restricted architecture enforces nothing
  outside four route files, and the reason is grant coverage — 12 of 72 tables.
- **F-11** (994 `anon`/`authenticated` grants) is independent of this and can proceed on
  its own. It was deferred behind Task 9 on the assumption the cutover would happen first;
  that assumption is now void.
- **F-20** (four `public.users` rows with no `auth.users` match) does **not** block this
  task. The policies key on the `venturecite.user_id` GUC, not `auth.uid()`. F-20 blocks a
  future PostgREST/`auth.uid()` adoption, which is separate and unscheduled. Of the four
  rows, three are test artifacts (`test@example.com`, `smoke@test.local`, `test@test1.com`
  — the second owns six brands and has a non-UUID id, so it is a seeded fixture that
  leaked into production) and one, `candistokes@yahoo.com`, looks like a real signup whose
  auth record is gone. Cleaning them up is a data decision for the owner; deleting
  `smoke-user` would cascade to six brands.
