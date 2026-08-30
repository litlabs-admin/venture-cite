# B6b-01 — Mutation testing: auth, ownership, tenant isolation

Scope: `server/lib/ownership.ts`, `server/auth.ts` (`requireAuthForApi` /
`PUBLIC_API_ROUTES`), `server/routes/assistant.ts` (thread ownership
scoping / 404-not-403 policy).

Method: for each function, a semantic mutation was applied directly to the
implementation file, only the test file(s) that claim to cover that
behavior were run, the result was recorded, and the mutation was reverted
before moving to the next one. Every mutation below was applied and reverted
individually — none were left in place between steps.

Baseline (unmodified tree) for every file used below:

```
npx vitest run tests/unit/cronPublicAuth.test.ts tests/unit/chatbotThreads.test.ts \
  tests/unit/assistantChat.test.ts tests/unit/mentionsRoutes.test.ts
→ 4 files passed, 27 tests passed
```

## Overall verdict

Every ownership-related mutation tried — across `ownership.ts` and
`auth.ts` — **survived**. The consuming test suites for these two files
follow one structural pattern: every route-level test replaces
`server/lib/ownership` with a hand-written mock (fully, or via
`vi.importActual` with only the specific `require*` function overridden).
That means the _real_ database-querying code in `ownership.ts` — the part
that actually decides who owns what — is never executed by any test in the
repository. The route tests verify "the route calls `requireBrand` with
these arguments" or "the route returns 404 when the (mocked) ownership
helper rejects," which is legitimate route-wiring coverage, but it is not
coverage of the ownership check itself. `requireAuthForApi` is the one
function that IS exercised for real, but the only test that imports it
only checks the two public/allowlisted routes it depends on for cron
jobs — no test asserts that a route outside the allowlist is rejected.

---

## Target 1 — `server/lib/ownership.ts`

### 1a. `requireChatbotThread` — drop the `userId` predicate

Claimed by: `tests/unit/chatbotThreads.test.ts` (file header: "...enforce
ownership via `requireChatbotThread`..."), `tests/unit/assistantChat.test.ts`.

Mutation:

```diff
 export async function requireChatbotThread(id: string, userId: string) {
   const [row] = await db
     .select()
     .from(schema.chatbotThreads)
-    .where(and(eq(schema.chatbotThreads.id, id), eq(schema.chatbotThreads.userId, userId)))
+    .where(and(eq(schema.chatbotThreads.id, id)))
     .limit(1);
   if (!row) throw new OwnershipError(404, "Conversation not found");
   return row;
 }
```

Command: `npx vitest run tests/unit/chatbotThreads.test.ts tests/unit/assistantChat.test.ts`

Result: `2 files passed (2), 12 tests passed (12)` — unchanged from baseline.

**Verdict: SURVIVES.**

Why: both files replace the entire `server/lib/ownership` module with
`vi.mock`, substituting `requireChatbotThread: vi.fn(async () => ({ id, userId: "user-1" }))`.
The route under test calls the mock, never the real function, so a
mutation to the real query has zero effect on the mock's return value. The
test in `chatbotThreads.test.ts` named
`"GET /threads/:id/messages enforces ownership and returns transcript"`
only asserts `expect(stubs.requireChatbotThread).toHaveBeenCalledWith(VALID_ID, "user-1")` —
it checks the route _called_ the helper with the right arguments, not that
the helper _itself_ filters by owner.

### 1b. `requireChatbotThread` — 404 → 403 (anti-enumeration policy violation)

Mutation: `throw new OwnershipError(403, "Conversation not found")` instead
of 404.

Command: `npx vitest run tests/unit/chatbotThreads.test.ts tests/unit/assistantChat.test.ts`

Result: `2 files passed (2), 12 tests passed (12)` — unchanged.

**Verdict: SURVIVES.** Same root cause, compounded: both files also stub
`sendOwnershipError: () => false` and stub `routesShared.sendError` to
always return `res.status(500)`. Neither the real status code produced by
`OwnershipError`, nor the real `sendOwnershipError`/`sendError` translation
that turns it into an HTTP response, is exercised by these files at all —
not even the pathway, let alone the specific code (404 vs 403). No test in
the repo drives `requireChatbotThread` (real or mocked-to-reject) through
`assistant.ts`'s catch block to assert the resulting status code.

### 1c. `requireBrand` — drop the `userId` predicate

Claimed by: `tests/unit/autopilotRetry.test.ts` ("404 (not 403) on
cross-tenant per anti-enumeration policy"), `tests/unit/geoSignalsAnalyzePersistence.test.ts`,
`tests/unit/keywordResearchProvenance.test.ts`.

Mutation:

```diff
 export async function requireBrand(id: string, userId: string) {
   const [row] = await db
     .select()
     .from(schema.brands)
-    .where(and(eq(schema.brands.id, id), eq(schema.brands.userId, userId)))
+    .where(and(eq(schema.brands.id, id)))
     .limit(1);
```

Command: `npx vitest run tests/unit/autopilotRetry.test.ts tests/unit/geoSignalsAnalyzePersistence.test.ts tests/unit/keywordResearchProvenance.test.ts`

Result: `3 files passed (3), 10 tests passed (10)` — unchanged.

**Verdict: SURVIVES.** All three files use
`vi.mock("../../server/lib/ownership", async () => ({ ...actual, requireBrand: stubs.requireBrand }))` —
they explicitly spread in the real module for everything _except_
`requireBrand`, which they replace with a local `vi.fn()` whose
resolved/rejected value is hand-set per test case (e.g.
`stubs.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"))`).
That is a real, useful test of _how the route reacts_ to an ownership
failure — but it can never observe whether `requireBrand`'s own SQL
actually enforces the ownership boundary, because the SQL is never run.

This pattern generalizes: `grep` across `tests/` found no test file in the
whole repository that leaves `requireBrand` as the real implementation.

### 1d. `loadEntityThroughBrand` — remove the brand-ownership guard clause

This helper backs 11 of the `require*` functions: `requireArticle`,
`requireCompetitor`, `requireFaq`, `requireListicle`, `requireBofuContent`,
`requireHallucination`, `requireBrandFact`, `requireBrandMention`,
`requireCommunityPost`, `requireCitationQuality`, `requireKeywordResearch`.

Claimed by: `tests/unit/contentCancel.test.ts` (comment: "`requireArticle`:
404 OwnershipError if article doesn't belong to user"),
`tests/unit/contentGenerateStatusConflict.test.ts`,
`tests/unit/distributionBufferPost.test.ts`.

Mutation:

```diff
   const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
   if (!row) throw new OwnershipError(404, notFoundLabel);
-  const brandId = (row as any).brandId;
-  if (!brandId) throw new OwnershipError(404, notFoundLabel);
-  const [brand] = await db
-    .select({ id: schema.brands.id })
-    .from(schema.brands)
-    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.userId, userId)))
-    .limit(1);
-  if (!brand) throw new OwnershipError(404, notFoundLabel);
   return row;
```

This is the mutation from the task's list ("make an ownership check return
the row regardless of userId"), applied at the shared choke point instead
of one caller at a time.

Command: `npx vitest run tests/unit/contentCancel.test.ts tests/unit/contentGenerateStatusConflict.test.ts tests/unit/distributionBufferPost.test.ts`

Result: `3 files passed (3), 12 tests passed (12)` — unchanged.

**Verdict: SURVIVES.** Every consumer of `loadEntityThroughBrand`
(`requireArticle` in `distributionBufferPost.test.ts`, etc.) is likewise
replaced by a per-test `vi.fn()` stub in every file that touches it (a
repo-wide `grep` for these 11 function names outside of `stubs.*` /
`vi.fn()` assignments returned zero matches). No test — unit or
integration — ever runs `loadEntityThroughBrand`'s real SQL. This is a
single-point, high-leverage finding: one deleted guard clause silently
breaks tenant isolation for 11 entity types across `articles.ts`,
`contentTypes.ts`, `intelligence.ts`, and `publications.ts`, and nothing in
the suite would notice.

### 1e. `requireMentionOwnership` — drop the brand-ownership check

Claimed by: `tests/unit/mentionsRoutes.test.ts` (tests literally titled
"enforces ownership - 404 cross-tenant (Audit C13 regression)").

Mutation: removed the second `db` query (brand lookup) and its `if
(!brand) return null;` guard, so the function returns any mention row that
exists by id regardless of which brand/user it belongs to.

Command: `npx vitest run tests/unit/mentionsRoutes.test.ts`

Result: `1 file passed (1), 12 tests passed (12)` — unchanged.

**Verdict: SURVIVES.** `mentionsRoutes.test.ts` mocks
`requireMentionOwnership: stubs.requireMentionOwnership` outright (no
`vi.importActual`), and drives the "404 cross-tenant" tests by setting
`stubs.requireMentionOwnership.mockResolvedValue(null)` directly. The test
title advertises coverage of the ownership check; what it actually
verifies is that the _route_ turns a `null` from the (fully fake) ownership
function into a 404. It says nothing about whether the real function ever
produces that `null` for a foreign mention.

### 1f. `requireUser` — drop the "not authenticated" guard

Claimed by: `tests/unit/autopilotRetry.test.ts` and
`tests/unit/geoSignalsAnalyzePersistence.test.ts`, both of which keep
`requireUser` real via `vi.importActual` + spread (only `requireBrand` is
overridden).

Mutation:

```diff
   const user = (req as any).user;
-  if (!user) throw new OwnershipError(401, "Not authenticated");
   return user;
```

Command: `npx vitest run tests/unit/autopilotRetry.test.ts tests/unit/geoSignalsAnalyzePersistence.test.ts`

Result: `2 files passed (2), 7 tests passed (7)` — unchanged.

**Verdict: SURVIVES, but low blast radius.** This is the one `require*`
function actually exercised for real in these two suites — but every test
in both files sets `req.user = { id: "user-1" }` before dispatching, so the
`!user` branch is simply never reached by any test case. In production
this branch is defense-in-depth behind `isAuthenticated`, which already
guarantees `req.user` is set — so the practical exposure is much smaller
than 1a–1e, but it is still an unexercised branch in a function two test
files nominally cover.

---

## Target 2 — `server/auth.ts`: `requireAuthForApi` / `PUBLIC_API_ROUTES`

Claimed by: `tests/unit/cronPublicAuth.test.ts` (the only unit test that
imports the real `requireAuthForApi`, unmocked).

Baseline: `npx vitest run tests/unit/cronPublicAuth.test.ts` →
`1 file passed (1), 3 tests passed (3)`.

### 2a. Total auth bypass — `requireAuthForApi` becomes an unconditional `next()`

Mutation:

```diff
 export const requireAuthForApi: RequestHandler = (req, res, next) => {
-  if (!req.path.startsWith("/api/")) return next();
-  const key = `${req.method} ${req.path}`;
-  if (PUBLIC_API_ROUTES.has(key)) return next();
-  return isAuthenticated(req, res, next);
+  return next();
 };
```

Command: `npx vitest run tests/unit/cronPublicAuth.test.ts`

Result: `1 file passed (1), 3 tests passed (3)` — unchanged.

**Verdict: SURVIVES. Highest blast radius in this audit.** This mutation
removes the entire authentication gate for every `/api/*` route in the
application — every brand, article, citation, billing, and admin endpoint
would accept unauthenticated requests. `cronPublicAuth.test.ts` only
verifies that two specific allowlisted cron routes return 204 through the
middleware; it never sends a request to a route that is _supposed_ to
require auth, so it has no way to detect that the gate is gone. No other
unit test imports the real `requireAuthForApi`.

### 2b. Add a fake sensitive route to `PUBLIC_API_ROUTES`

Mutation: appended `"GET /api/admin/users"` to the allowlist `Set`.

Command: `npx vitest run tests/unit/cronPublicAuth.test.ts`

Result: `1 file passed (1), 3 tests passed (3)` — unchanged.

**Verdict: SURVIVES.** No test enumerates, snapshots, or bounds the
contents of `PUBLIC_API_ROUTES`; the only assertions are "these two known
public routes still work." A one-line addition to this allowlist — the
single most consequential list in the auth module — is invisible to the
test suite. (`grep -rn "PUBLIC_API_ROUTES" tests server` confirms the set
is referenced only in `auth.ts` itself, `routes.ts`, and this one test
file.)

### 2c. Prefix-match bypass — `.has(exact key)` → `startsWith` prefix check

Mutation:

```diff
-  const key = `${req.method} ${req.path}`;
-  if (PUBLIC_API_ROUTES.has(key)) return next();
+  const isPublic = [...PUBLIC_API_ROUTES].some((route) => req.path.startsWith(route.split(" ")[1]));
+  if (isPublic) return next();
```

This turns every allowlisted path into a public _prefix_ (e.g.
`GET /api/waitlist-internal-admin` would now bypass auth because it starts
with `/api/waitlist`), independent of HTTP method.

Command: `npx vitest run tests/unit/cronPublicAuth.test.ts`

Result: `1 file passed (1), 3 tests passed (3)` — unchanged.

**Verdict: SURVIVES.** Same root cause as 2a/2b: the test only checks that
the two cron routes it names still pass through; it does not probe
adjacent or non-listed paths that a prefix-match regression would newly
expose.

---

## Target 3 — `server/routes/assistant.ts`: thread ownership / 404-not-403

The file's own header comment states the policy explicitly: "All thread
endpoints scope by ownership and return 404 (not 403) on miss per project
anti-enumeration policy." The relevant tests are the same
`chatbotThreads.test.ts` / `assistantChat.test.ts` covered in 1a/1b above,
so the results are not repeated in full — summarized here because they are
the direct evidence for this target:

- Neither test file ever makes `requireChatbotThread` reject with an
  `OwnershipError`. Both mocks only ever _resolve_. There is therefore no
  test anywhere that drives a cross-tenant thread request through
  `assistant.ts`'s `catch (error) { sendError(res, error, ...) }` block at
  all, let alone one that checks the resulting status is 404 and not 403
  or 500.
- `chatbotThreads.test.ts`'s one negative-path test
  ("returns 404 when thread id is not a UUID") checks Zod's `uuidSchema`
  parse failure, which is a pre-check that runs _before_
  `requireChatbotThread` is ever called. It exercises input validation,
  not ownership.
- `sendOwnershipError` — the actual function that implements "read
  `err.status` off `OwnershipError` and use it verbatim" — is stubbed to
  `() => false` in both files, so `routesShared.sendError`'s
  `if (sendOwnershipError(res, err)) return;` branch is dead code as far as
  these tests are concerned; the mocked `sendError` always returns 500
  regardless of what error is thrown.

**Verdict: SURVIVES.** The specific policy statement quoted in the file's
own header comment — 404, not 403, on ownership miss — has no test path
that exercises the failure branch of `requireChatbotThread` through this
route file at all.

---

## Healthy findings

- `PUBLIC_API_ROUTES` positive-path behavior (public routes actually stay
  reachable without a token) is correctly tested and would catch a
  regression that _removed_ a route that should stay public — e.g. if
  `GET /api/cron/daily-orchestrator` were deleted from the set,
  `cronPublicAuth.test.ts` would fail immediately. That specific direction
  of drift (accidentally over-locking a genuinely public route) is real
  coverage.
- `tests/unit/autopilotRetry.test.ts` and other route-level suites do
  correctly verify that when a _mocked_ `OwnershipError(404, ...)` reaches
  `onboarding.ts`'s own inline `if (err instanceof OwnershipError) return
res.status(err.status)...` handler, the response is genuinely 404. That
  status-code plumbing at the route layer is real and would catch someone
  changing `onboarding.ts` to hardcode 403, for example. It's the ownership
  _decision_ upstream of that plumbing (does `requireBrand` actually check
  the owner?) that is unverified, not the plumbing itself.

---

## Summary table (ranked by blast radius)

| #   | Function                                           | Mutation                                                | Test(s) run                                                                   | Result                                                      |
| --- | -------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 2a  | `server/auth.ts requireAuthForApi`                 | Unconditional `next()` — global auth bypass             | `cronPublicAuth.test.ts`                                                      | SURVIVES                                                    |
| 2c  | `server/auth.ts requireAuthForApi`                 | Exact-match → prefix-match allowlist check              | `cronPublicAuth.test.ts`                                                      | SURVIVES                                                    |
| 2b  | `server/auth.ts PUBLIC_API_ROUTES`                 | Added fake route to allowlist                           | `cronPublicAuth.test.ts`                                                      | SURVIVES                                                    |
| 1d  | `ownership.ts loadEntityThroughBrand`              | Deleted brand-ownership guard (affects 11 entity types) | `contentCancel`, `contentGenerateStatusConflict`, `distributionBufferPost`    | SURVIVES                                                    |
| 1c  | `ownership.ts requireBrand`                        | Dropped `userId` predicate                              | `autopilotRetry`, `geoSignalsAnalyzePersistence`, `keywordResearchProvenance` | SURVIVES                                                    |
| 1a  | `ownership.ts requireChatbotThread`                | Dropped `userId` predicate                              | `chatbotThreads`, `assistantChat`                                             | SURVIVES                                                    |
| T3  | `routes/assistant.ts` (via `requireChatbotThread`) | N/A — no test drives the failure path at all            | `chatbotThreads`, `assistantChat`                                             | SURVIVES                                                    |
| 1b  | `ownership.ts requireChatbotThread`                | 404 → 403                                               | `chatbotThreads`, `assistantChat`                                             | SURVIVES                                                    |
| 1e  | `ownership.ts requireMentionOwnership`             | Dropped brand-ownership check                           | `mentionsRoutes`                                                              | SURVIVES                                                    |
| 1f  | `ownership.ts requireUser`                         | Dropped "not authenticated" guard                       | `autopilotRetry`, `geoSignalsAnalyzePersistence`                              | SURVIVES (low blast radius — guarded elsewhere in practice) |

No mutation in this audit was caught by its claiming test file. The
consistent mechanism is the same one flagged in the audit's motivating
example (`llmBudget.test.ts`): the test suite verifies that routes call the
right helper with the right arguments and correctly translate a
_hand-scripted_ result from that helper into an HTTP response — but the
helper itself, where the actual tenant-isolation decision is made, is
replaced by a stub in a `vi.mock` in every single test file that touches
it, anywhere in the repository.

---

## Mutations not applicable as literally specified

- "Remove the `deleted_at IS NULL` predicate from an ownership query" —
  none of the three named targets contain a `deleted_at`/`deletedAt`
  filter to remove. `ownership.ts`'s `requireBrand` and
  `loadEntityThroughBrand` do not filter soft-deleted `brands` rows at all
  (unlike `storage/brandsStorage.ts`, which consistently does via
  `isNull(schema.brands.deletedAt)`) — this looks like a separate,
  pre-existing coverage gap rather than something mutation-testing can
  demonstrate by deletion. Flagging it for visibility, not as a scored
  finding, since it is out of this task's brief (no test claims to cover a
  `deleted_at` filter that isn't there).
- The soft-delete lockout that genuinely exists (`isAuthenticated` in
  `auth.ts` blocking accounts with `deletedAt` set) is outside this task's
  named targets (`requireAuthForApi` / `PUBLIC_API_ROUTES`, not
  `isAuthenticated`), and no test file claims to cover it — every test that
  touches a route mocks `isAuthenticated` away entirely — so per the task's
  rule against reporting plain missing-coverage, it is not scored here
  either.

---

## Clean-tree proof

Every mutation above was applied, tested, and reverted in the same step
before the next mutation began. Final state of the two files this task is
allowed to touch:

```
$ git diff --stat server/lib/ownership.ts server/auth.ts server/routes/assistant.ts
(no output — zero diff)
```

Full repository status at the end of this task:

```
$ git status --porcelain
 M .audit/B6/B6a-08-why-nothing-caught-it.md
 M server/lib/promptScoreHistory.ts
 M tests/unit/requestRepositories.test.ts
?? tests/unit/__probe.test.ts

$ git diff --stat
 .audit/B6/B6a-08-why-nothing-caught-it.md | 56 +++++++++++++++++++++++++------
 server/lib/promptScoreHistory.ts          |  2 +-
 tests/unit/requestRepositories.test.ts    | 18 ++++++++--
 3 files changed, 62 insertions(+), 14 deletions(-)
```

None of those four entries were touched by this task. They were present
(`.audit/B6/B6a-08-why-nothing-caught-it.md`) or appeared
(`promptScoreHistory.ts`, `requestRepositories.test.ts`,
`tests/unit/__probe.test.ts`) as a result of other, concurrent work in this
repository — not this mutation-testing run, which only ever edited
`server/lib/ownership.ts` and `server/auth.ts`, and reverted both to their
original content before finishing. This report itself is the only new file
this task added.
