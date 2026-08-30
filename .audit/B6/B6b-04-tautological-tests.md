# B6b-04: Strengthening tautological tests

Five findings from `.audit/B1p/verified.json`. None were stale - all five reproduced
the described gap and were strengthened, with every mutation applied, observed to
fail, restored, and re-verified passing. No implementation file has a net diff.

---

## F-S28-002 (SECURITY) - tests/unit/requestRepositories.test.ts:160

**Original assertion (quoted):**

```ts
it("updates a visible brand and returns no result for another user's brand", async () => {
  const { database, calls } = createTransaction([]);
  ...
  await expect(repository.update("brand-b", { name: "Changed" })).resolves.toBeUndefined();
  expect(calls.set).toHaveBeenCalledWith(expect.objectContaining({ name: "Changed" }));
  expect(USER_B_ID).not.toBe(USER_A_ID);
});
```

**Why it could not fail:** `createTransaction([])` hard-codes an empty `.returning()`
result. `resolves.toBeUndefined()` is therefore guaranteed regardless of what
predicate `update()` built - the mock never runs a real WHERE clause. The final
line compares two hard-coded UUID string literals to each other, which can never
be false. Deleting the user-ownership condition from the repository's `update()`
leaves every line in this test green.

**Strengthened assertion:** exposed `where` on the mock's `calls` object, then
render the actual predicate passed to `.where()` via `PgDialect().sqlToQuery()`
and assert it contains the `user_id` equality bound to the _acting_ user, and does
not contain the other user's id:

```ts
const predicate = calls.where.mock.calls[0]?.[0] as SQL;
const query = new PgDialect().sqlToQuery(predicate);
expect(query.sql).toContain('"brands"."user_id" =');
expect(query.params).toContain(USER_A_ID);
expect(query.params).not.toContain(USER_B_ID);
```

**Mutation:** in `server/data/requestBrandRepository.ts`, `update()`, removed
`eq(brands.userId, actor.userId)` from the WHERE clause (the exact defect the
register names).

**Failure observed:**

```
AssertionError: expected '("brands"."id" = $1 and "brands"."del…' to contain '"brands"."user_id" ='
Expected: ""brands"."user_id" ="
Received: "("brands"."id" = $1 and "brands"."deleted_at" is null)"
```

**Restored, re-run:** 9/9 pass. `git diff --stat server/data/requestBrandRepository.ts` -> empty.

---

## F-S24-003 - tests/unit/brandFactScrapeRunsStorage.test.ts + brandFactScrapePagesStorage.test.ts

**Original assertion (quoted, representative):**

```ts
it("findSlicePendingRuns filters by status and stale cutoff", async () => {
  dbMock.fn.mockReturnValue({
    from: () => ({
      innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve([{ run: fakeRow }]) }) }),
    }),
  } as any);
  const rows = await storage.findSlicePendingRuns(30, 10);
  expect(rows).toEqual([fakeRow]);
});
```

**Why it could not fail:** the entire schema module was mocked as
`new Proxy({}, { get: (_t, p) => p })`, so every column reference (e.g.
`schema.brandFactScrapeRuns.status`) resolved to `undefined`, and every chain
step (`where`, `orderBy`, `innerJoin`, `limit`) was a throwaway arrow function
that ignored its arguments and returned a hard-coded fixture. The test only
proves the fixture round-trips through the function - it never inspects what
predicate, join condition, sort, or limit the implementation actually built. The
same shape held for `transitionScrapeRunStatusCAS`, `incrementScrapeRunCounters`,
`listScrapeRunsForBrand`, and `listScrapePagesForRun`.

**Strengthened assertion:** stopped mocking `shared/schema` (it now exports real
Drizzle pgTable columns), captured every intermediate chain call with `vi.fn()`
spies, and rendered captured `where`/`orderBy`/`set` arguments through
`PgDialect().sqlToQuery()` to assert on the real predicate/order/increment SQL
and bound params. Applied to:

- `transitionScrapeRunStatusCAS` (both tests): asserts the WHERE predicate
  requires both `id =` and `status =` (the actual compare half of CAS).
- `incrementScrapeRunCounters`: asserts each `set()` value is a `col + delta`
  SQL expression (not a literal), and the WHERE is scoped to the run id.
- `findSlicePendingRuns`: asserts the join is against `brands`, the predicate
  requires the status/cutoff pair on `last_advance_at`/`started_at`, AND the
  `brands.fact_scrape_enabled = true` condition.
- `listScrapeRunsForBrand`: asserts WHERE scopes to `brand_id`, `orderBy`
  renders to `"...started_at" desc`, and `limit` is called with `10`.
- `updateScrapePageStatus`: asserts WHERE scopes to `id`.
- `listScrapePagesForRun`: asserts WHERE scopes to `run_id`, `orderBy` renders
  to `"...id" asc`.

**Mutations applied (one at a time) and failures observed:**

1. `factAgentStorage.ts` `transitionScrapeRunStatusCAS`: dropped the
   `eq(status, expected)` half of the WHERE.

   ```
   AssertionError: expected '"brand_fact_scrape_runs"."id" = $1' to contain '"brand_fact_scrape_runs"."status" ='
   ```

   (both CAS tests failed)

2. `jobsStorage.ts` `findSlicePendingRuns`: dropped
   `eq(schema.brands.factScrapeEnabled, true)` from the WHERE.

   ```
   AssertionError: expected '(("brand_fact_scrape_runs"."status" = …' to contain '"brands"."fact_scrape_enabled" ='
   ```

3. `brandsStorage.ts` `listScrapeRunsForBrand`: changed `desc(startedAt)` to
   `asc(startedAt)`.

   ```
   AssertionError: expected '"brand_fact_scrape_runs"."started_at"…' to be '"brand_fact_scrape_runs"."started_at"…'
   Expected: ""brand_fact_scrape_runs"."started_at" desc"
   Received: ""brand_fact_scrape_runs"."started_at" asc"
   ```

4. `factAgentStorage.ts` `incrementScrapeRunCounters`: replaced the `pagesFetched`
   increment SQL expression with a literal `deltas.pagesFetched`.

   ```
   TypeError: sql2.toQuery is not a function
   ```

   (a legitimate failure - the persisted value is no longer a SQL fragment at all)

5. `factAgentStorage.ts` `updateScrapePageStatus`: changed the WHERE column from
   `id` to `runId`.

   ```
   AssertionError: expected '"brand_fact_scrape_pages"."run_id" = …' to contain '"brand_fact_scrape_pages"."id" ='
   ```

6. `factAgentStorage.ts` `listScrapePagesForRun`: changed `asc(id)` to `desc(id)`.
   ```
   AssertionError: expected '"brand_fact_scrape_pages"."id" desc' to be '"brand_fact_scrape_pages"."id" asc'
   ```

**Restored after each, re-run:** `brandFactScrapeRunsStorage.test.ts` 8/8 pass;
`brandFactScrapePagesStorage.test.ts` 4/4 pass. `git diff --stat` on
`factAgentStorage.ts`, `jobsStorage.ts`, `brandsStorage.ts` -> empty.

---

## F-S24-002 - tests/unit/MentionsTab.test.tsx:427-453

**Original assertion (quoted):**

```ts
it("calls deleteMention when the hook fires deleteMention, and toast was called", async () => {
  const deleteMentionMock = vi.fn();
  ...
  deleteMentionMock("m1");
  expect(deleteMentionMock).toHaveBeenCalledWith("m1");
  toastMock({ title: "Mention deleted", ... });
  expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Mention deleted", ... }));
});
```

**Why it could not fail:** the test calls `deleteMentionMock` and `toastMock`
directly - it never triggers anything through the rendered component, and the
`MentionCard` mock did not even accept an `onDelete` prop. Deleting
`onDelete={deleteMention}` from `MentionsTab.tsx`, or deleting the real undo
toast, changes nothing this test observes.

**Note on scope:** the undo toast itself is fired inside `useMentions`'
`onSuccess` callback and is already covered end-to-end (real hook, real toast
call, checked for title/action/duration) by
`tests/unit/useMentions.test.tsx` ("deleteMention removes the row optimistically
and shows an undo toast"). `MentionsTab.tsx` does not itself produce the toast -
it only passes `deleteMention` down as a prop - so re-simulating the toast at
this layer added no coverage; the actual gap at this layer is whether the
component wires the rendered card's delete control to the hook's
`deleteMention`.

**Strengthened assertion:** gave the `MentionCard` mock a real `onDelete`-driven
button, rendered the tab, and clicked it through Testing Library:

```ts
it("wires the rendered card's delete control to the hook's deleteMention", async () => {
  ...
  const deleteBtn = screen.getByTestId("delete-mention-m1");
  await userEvent.click(deleteBtn);
  expect(deleteMentionMock).toHaveBeenCalledExactlyOnceWith("m1");
  expect(navigateMock).not.toHaveBeenCalled();
});
```

(The mock's card/delete-button structure was also fixed to avoid axe's
"nested-interactive" violation - two sibling `<button>`s instead of a `<button>`
nested inside a `role="button"` container - and test #6, which previously
clicked the whole card by test id to open the detail sheet, now clicks the
title button by text instead, since the outer container is no longer clickable.)

**Mutation:** removed `onDelete={deleteMention}` from the `MentionCard` render
in `client/src/components/geo-tools/MentionsTab.tsx`.

**Failure observed:**

```
TypeError: onDelete is not a function
    at onClick (tests/unit/MentionsTab.test.tsx:163:26)
...
AssertionError: expected "vi.fn()" to be called once with arguments: [ 'm1' ]
Number of calls: 0
```

**Restored, re-run:** 9/9 pass. `git diff --stat client/src/components/geo-tools/MentionsTab.tsx` -> empty.

---

## F-S28-001 - tests/unit/promptGeneratorCap.test.ts:20

**Original assertion (quoted):**

```ts
function persisted<T>(clean: T[]): T[] {
  return clean.slice(0, TRACKED_PROMPTS_CAP);
}
it("never persists more tracked prompts than the cap", () => {
  const generated = Array.from({ length: 15 }, (_, i) => `prompt ${i}`);
  expect(persisted(generated)).toHaveLength(TRACKED_PROMPTS_CAP);
});
```

**Why it could not fail:** `persisted()` is a local reimplementation of the cap,
not the production generator. It can never regress when
`server/lib/promptGenerator.ts`'s actual save loop drops the trim - which is
precisely the historical bug the file's own comment describes (12 tracked
prompts persisted against a cap of 10, because the cap was enforced only in the
manual-add route, never in the generator).

**Strengthened assertion:** rewrote the file to mock only the LLM call
(`getOpenrouterClient`) and the storage layer, then call the real
`generateBrandPrompts()` export and assert on what it actually returns/persists
(`result.saved.length`, and `storage.createBrandPrompt` call count/order):

```ts
it("never persists more tracked prompts than the cap", async () => {
  createCompletion.mockResolvedValueOnce(
    completionWith(Array.from({ length: 15 }, (_, i) => shapedPrompt(i))),
  );
  const result = await generateBrandPrompts(BRAND);
  expect(result.saved).toHaveLength(TRACKED_PROMPTS_CAP);
  expect(storageStubs.createBrandPrompt).toHaveBeenCalledTimes(TRACKED_PROMPTS_CAP);
});
```

Also strengthened the "keeps everything under the cap", "keeps the
highest-ranked prompts" (now checks the actual `prompt` field order via the real
`createBrandPrompt` call args, not a slice of local strings), and "handles an
empty generation" tests to drive the same real function. Left "caps at a value
the manual-add route also enforces" unchanged - it already asserts the real
constant, not a fixture.

**Mutation:** in `server/lib/promptGenerator.ts`, changed `const toPersist =
clean.slice(0, TRACKED_PROMPTS_CAP);` to `const toPersist = clean;` (deleting
the cap trim - the exact historical regression).

**Failure observed:**

```
AssertionError: expected [ { id: 'saved-0', …(10) }, …(14) ] to have a length of 10 but got 15
- 10
+ 15
```

**Restored, re-run:** 5/5 pass. `git diff --stat server/lib/promptGenerator.ts` -> empty.

---

## F-S28-006 - tests/unit/resendWebhook.test.ts:7

**Original assertion (quoted):**

```ts
function sign(svixId, ts, body, secret = SECRET) {
  const trimmed = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(trimmed, "base64");
  const input = `${svixId}.${ts}.${buf.toString("utf8")}`;
  ...
}
it("accepts a correctly signed payload", () => {
  const sig = sign(id, ts, body);
  expect(verifyResendWebhook({ ..., svixSignature: sig, secret: SECRET })).toBe(true);
});
```

**Why it could not fail on the defect named:** `sign()` in the test file
implements the identical algorithm (same secret-prefix stripping, same
`id.timestamp.body` join, same base64/HMAC-SHA256 steps) as
`server/lib/resendWebhook.ts`. Every "positive" case in the file signs with this
helper and verifies with the production function - a self-consistency check, not
an interoperability check. If a developer had written the same wrong assumption
into both `sign()` and `verifyResendWebhook` (wrong field order, wrong encoding),
every self-signed test would still pass, because both sides share the mistake.
There was no external, independently-computed signature anywhere in the file.

**Strengthened assertion:** added a positive test using Svix's own published
worked example (the same secret/id/timestamp/payload/signature quadruple
published at docs.svix.com and reused across Svix's own SDK test suites),
verified independently against `verifyResendWebhook` with `vi.setSystemTime`
pinning "now" to the vector's timestamp so the (unrelated) replay-window check
doesn't reject a 2021 fixture, plus a negative check that a flipped signature
byte is rejected:

```ts
it("accepts Svix's own published test vector (external interop check)", () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  const id = "msg_p5jXN8AQM9LWM0D4loKWxJek";
  const ts = "1614265330";
  const body = Buffer.from('{"test": 2432232314}');
  const signature = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Number(ts) * 1000));
  expect(verifyResendWebhook({ rawBody: body, svixId: id, svixTimestamp: ts, svixSignature: signature, secret })).toBe(true);
  const flipped = signature.slice(0, -2) + "XX";
  expect(verifyResendWebhook({ ..., svixSignature: flipped })).toBe(false);
});
```

(Verified independently before writing the test: computed HMAC-SHA256 of
`msg_p5jXN8AQM9LWM0D4loKWxJek.1614265330.{"test": 2432232314}` keyed with the
base64-decoded secret in a standalone Node script - it reproduces
`g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=` byte for byte, confirming the
vector is correct before trusting it in the test.)

**Mutation proving the exact defect class named ("helper and verifier can share
the same encoding error"):** changed the field order in the signed-content join
from `${svixId}.${svixTimestamp}.${body}` to
`${svixTimestamp}.${svixId}.${body}` in **both**
`server/lib/resendWebhook.ts` and the test file's own `sign()` helper
simultaneously (simulating a developer making the same mistake in both places -
this is the actual scenario the register describes, not a change to prod alone).

**Failure observed:** with the shared bug in both places, all seven self-signed
tests stayed green - only the new external-vector test caught it:

```
FAIL  tests/unit/resendWebhook.test.ts > verifyResendWebhook > accepts Svix's own published test vector (external interop check)
AssertionError: expected false to be true
Test Files  1 failed (1)
Tests  1 failed | 7 passed (8)
```

This is the direct proof: the seven pre-existing self-signed tests are blind to
a bug shared between signer and verifier; the new test is not.

**Restored (both files), re-run:** 8/8 pass. `git diff --stat server/lib/resendWebhook.ts` -> empty.

---

## Clean-tree proof

```
$ git status --porcelain
 M .audit/B6/B6a-08-why-nothing-caught-it.md      <- not mine; another task's file, untouched by me
 M server/auth.ts                                  <- not mine; another task's leftover mutation, untouched by me
 M tests/unit/MentionsTab.test.tsx
 M tests/unit/brandFactScrapePagesStorage.test.ts
 M tests/unit/brandFactScrapeRunsStorage.test.ts
 M tests/unit/promptGeneratorCap.test.ts
 M tests/unit/requestRepositories.test.ts
 M tests/unit/resendWebhook.test.ts
?? .audit/B6/B6b-01-mutation-auth-ownership.md      <- not mine; another concurrent task
?? .audit/B6/B6b-02-mutation-concurrency.md         <- not mine; another concurrent task
?? .audit/B6/B6b-03-mutation-metrics.md             <- not mine; another concurrent task

$ git diff --stat
 .audit/B6/B6a-08-why-nothing-caught-it.md      |  56 ++++++++--
 server/auth.ts                                 |   1 +
 tests/unit/MentionsTab.test.tsx                |  69 ++++++------
 tests/unit/brandFactScrapePagesStorage.test.ts |  40 +++++--
 tests/unit/brandFactScrapeRunsStorage.test.ts  | 117 +++++++++++++------
 tests/unit/promptGeneratorCap.test.ts          | 148 +++++++++++++++++++++----
 tests/unit/requestRepositories.test.ts         |  18 ++-
 tests/unit/resendWebhook.test.ts               |  54 ++++++++-
 8 files changed, 396 insertions(+), 107 deletions(-)
```

`server/auth.ts` (a one-line `return next(); // MUTATION` added inside
`requireAuthForApi`) and `.audit/B6/B6a-08-why-nothing-caught-it.md` were not
touched by this task - this session never opened either file. They, and the
three untracked `.audit/B6/B6b-0{1,2,3}-*.md` files, are artifacts of other
concurrent tasks running against the same working tree in this remediation
program. Only the six files this task was scoped to touch changed: the five
target test files, listed above. No implementation file this task modified
carries a net diff - every mutation used for proof was applied and reverted in
place, confirmed by `git diff --stat` on each implementation file
individually before moving to the next finding.

`promptScoreHistory.test.ts` and `rateLimitBuckets.test.ts` were not opened, per
instruction.
