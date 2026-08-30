# B6b-05 — requireAuthForApi test coverage (the missing direction)

New file: `tests/unit/requireAuthForApi.test.ts`. Extends the mount pattern
already used in `tests/unit/cronPublicAuth.test.ts` (bare Express app,
`app.use(requireAuthForApi)`, real middleware imported unmocked) rather than
inventing a new harness.

Command used throughout:

```
npx vitest run tests/unit/requireAuthForApi.test.ts tests/unit/cronPublicAuth.test.ts
```

Baseline (clean tree): 2 files passed, 9 tests passed.

## What was covered

`tests/unit/cronPublicAuth.test.ts` only asserted the permissive direction:
two allowlisted cron routes return 204. It never asserted that a route
_outside_ the allowlist is actually rejected, which is how the B6b-01 audit's
"replace requireAuthForApi's body with an unconditional `return next()`"
mutation survived the full 1734-test suite. The new file covers the other
direction.

Db/Supabase are mocked (`vi.hoisted` refs `mockGetUser`, `mockLimit`) so the
valid-token test exercises the real `isAuthenticated` → `loadPublicUser` path
without a live database, same style of mocking `cronPublicAuth.test.ts`
already uses for `supabase`, `db`, `instrument`, `logger`, etc.

## Per-test mutation proof

### Test 1 — gated route, no token → 401, handler never called

File: describe "requireAuthForApi - gated route, no token".

Mutation (required minimum #1): unconditional `return next()` at the top of
`requireAuthForApi`.

```diff
 export const requireAuthForApi: RequestHandler = (req, res, next) => {
+  return next();
   if (!req.path.startsWith("/api/")) return next();
```

Result: FAILS.

```
FAIL  tests/unit/requireAuthForApi.test.ts > requireAuthForApi - gated route, no token > rejects with 401 and never invokes the route handler
AssertionError: expected 200 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 200

 ❯ tests/unit/requireAuthForApi.test.ts:81:29
```

Two other tests failed collaterally under this same mutation (expected,
since the mutation is total bypass, not something narrower):

- "verifies the token, loads the user, and reaches the handler" — failed
  because `mockGetUser` was never called (the request never entered
  `isAuthenticated`):
  `expected "vi.fn()" to be called with arguments: [ 'valid-token' ]` /
  `Number of calls: 0`.
- "POST /api/auth/loginextra ... stays gated" — failed for the same reason
  as test 1 (`expected 200 to be 401`).

Restored `server/auth.ts` to clean; re-ran; PASSES (9/9, back to baseline).

### Test 2 — gated route, valid Bearer token → reaches handler

File: describe "requireAuthForApi - gated route, valid Bearer token".

This test is the positive-path counterpart of test 1, proving the middleware
doesn't just reject everything indiscriminately (a `return res.status(401)`
stub at the top would pass test 1 but fail this one). It is implicitly
proven by mutation #1 above (it failed for the reason given above), so no
separate mutation was run for it.

### Test 3 — non-`/api/` path untouched

File: describe "requireAuthForApi - non-/api/ path".

Also implicitly exercised by mutation #1 (the unconditional `next()` makes
this path trivially pass regardless, so a dedicated mutation targeting only
the `/api/` prefix check adds no signal beyond what test 1 already proves
about that line). Confirmed independently that on the clean tree this test
passes with no Authorization header at all, i.e. it does not depend on the
auth mocks succeeding.

### Test 4 — allowlist matching is exact, not prefix

File: describe "requireAuthForApi - allowlist matching is exact, not
prefix", test "POST /api/auth/loginextra ... stays gated".

Mutation (required minimum #2): `.has(exact key)` → `startsWith` prefix
match, per the B6b-01 audit's Target 2c.

```diff
   const key = `${req.method} ${req.path}`;
-  if (PUBLIC_API_ROUTES.has(key)) return next();
+  const isPublic = [...PUBLIC_API_ROUTES].some((route) => req.path.startsWith(route.split(" ")[1]));
+  if (isPublic) return next();
```

Result: FAILS (and _only_ this test fails — the other 8 pass under this
mutation, which is the correct outcome: this mutation should be caught
specifically by the prefix-collision test, not by the others).

```
FAIL  tests/unit/requireAuthForApi.test.ts > requireAuthForApi - allowlist matching is exact, not prefix > POST /api/auth/loginextra shares the allowlisted prefix but is NOT itself allowlisted, and stays gated
AssertionError: expected 200 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 200

 ❯ tests/unit/requireAuthForApi.test.ts:147:29

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 8 passed (9)
```

Restored `server/auth.ts` to clean; re-ran; PASSES (9/9, back to baseline).

### Test 5 — PUBLIC_API_ROUTES is a bounded, pinned set

File: describe "requireAuthForApi - PUBLIC_API_ROUTES is a bounded, pinned
set".

`PUBLIC_API_ROUTES` is not exported, and per this task's rules
`server/auth.ts` must end with a clean diff, so no export was added for
testing. The actual Set contents are instead recovered from the source text
itself (`readFileSync` + a regex over the `new Set<string>([...])` literal),
the same technique `tests/unit/citationCronUnconditional.test.ts` already
uses in this repo for an invariant that can only be checked against source.
The extracted, deduped, sorted list is compared against a hardcoded expected
list written into the test.

Mutation (required minimum #3): add `"GET /api/admin/users"` to
`PUBLIC_API_ROUTES`.

```diff
   "GET /api/internal/kpis",
+  "GET /api/admin/users",
 ]);
```

Result: FAILS (and _only_ this test fails).

```
FAIL  tests/unit/requireAuthForApi.test.ts > requireAuthForApi - PUBLIC_API_ROUTES is a bounded, pinned set > matches the exact route set defined in server/auth.ts, sorted
AssertionError: expected [ 'GET /api/admin/users', …(32) ] to deeply equal [ 'GET /api/board', …(31) ]

- Expected
+ Received

@@ -1,6 +1,7 @@
  [
+   "GET /api/admin/users",
    "GET /api/board",
    "GET /api/board/aeo",
    ...

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 8 passed (9)
```

Restored `server/auth.ts` to clean; re-ran; PASSES (9/9, back to baseline).

## What could not be tested at unit level

- The `dbUser.deletedAt` grace-window branch inside `isAuthenticated` (used
  by `requireAuthForApi` indirectly) is exercised by mocking `db`, so it is
  covered at unit level and is not a gap here — not called out further,
  since it's outside the scope of "private routes stay private" that this
  task targets.
- Nothing in this task's scope required a real Postgres connection or a real
  Supabase-issued JWT: `isAuthenticated`'s only external calls
  (`supabaseAdmin.auth.getUser`, `db.select(...)`) are both mocked, and the
  mock boundary is the same one the rest of the unit suite already accepts
  for this file. No case was skipped or faked to force a pass.

## Clean-tree proof

```
$ git diff --stat server/auth.ts
(empty)

$ git status --porcelain
 M .audit/B6/B6a-08-why-nothing-caught-it.md
 M tests/unit/MentionsTab.test.tsx
 M tests/unit/brandFactScrapePagesStorage.test.ts
 M tests/unit/brandFactScrapeRunsStorage.test.ts
 M tests/unit/promptGeneratorCap.test.ts
 M tests/unit/requestRepositories.test.ts
 M tests/unit/resendWebhook.test.ts
?? .audit/B6/B6b-01-mutation-auth-ownership.md
?? .audit/B6/B6b-02-mutation-concurrency.md
?? .audit/B6/B6b-03-mutation-metrics.md
?? .audit/B6/B6b-04-tautological-tests.md
?? tests/unit/requireAuthForApi.test.ts
```

The `M` entries above and the other `??` audit files predate this task (this
branch already had uncommitted changes from earlier B6b work before this
task started) and were not touched here. This task's only changes are the
new `tests/unit/requireAuthForApi.test.ts` and this report; `server/auth.ts`
carries zero net diff.

Final verification run (clean tree, both target files):

```
npx vitest run tests/unit/requireAuthForApi.test.ts tests/unit/cronPublicAuth.test.ts
 Test Files  2 passed (2)
      Tests  9 passed (9)
```
