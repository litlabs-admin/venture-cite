# Gamified v2 — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the inherited work domain on a clean branch off `main` as additive backend only, fix the eleven defects that make it unusable, and prove it against a real database — with zero change to the live dashboard.

**Architecture:** Copy the work domain (schema, migrations, domain logic, services, storage, HTTP routes) out of `codex/gamified-platform` onto a fresh branch, deliberately leaving that branch's `Sidebar.tsx`, `AppShell.tsx` and `dashboardVisibility.ts` changes behind. Then repair the contract gaps the audit found, wire a local test database, and make the RLS and isolation suites run. No UI is built in this phase.

**Tech Stack:** TypeScript, Drizzle ORM over a direct Postgres pool, Express under Nitro via `src/server/expressBridge.ts`, Vitest, local Supabase on `127.0.0.1:55322`.

**Spec:** `docs/superpowers/specs/2026-09-09-gamified-v2-dashboard-spec.md`

## Global Constraints

- `DATABASE_URL` in `.env` points at **production** (`aws-1-ap-southeast-1.pooler.supabase.com:6543`). Local work uses `.env.local-browser` (`127.0.0.1:55322`). Never run a migration without asserting the host is local first.
- One local test process at a time. Never run two `vitest` or `playwright` invocations concurrently.
- Never commit, push, merge or reset unless the owner asks in the current turn.
- Never name Claude or any AI tool in a commit message, PR body, or file content.
- Verify from code; treat Markdown and comments as hints to check.
- Points: facts 20, questions 20, baseline 20, fault 40, page 40, community 30, review 10, experiment 50.
- Levels: Start 0, Ready 60, Improve 160, Learn 320, Maintain 550.
- Do not modify `client/src/components/AppShell.tsx`, `client/src/pages/home.tsx`, `client/src/components/dashboard-panels/*`, `client/src/index.css`, `src/routes/_app/dashboard.tsx`, or `src/routes/index.tsx` in this phase. `Sidebar.tsx` is untouched until Phase 3.

## Execution policy

Binding on every dispatch in this plan and every later phase.

**Model per role**

| Role                                                 | Model                       | Why                                                                                                  |
| ---------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Controller / orchestration                           | Opus                        | Holds the plan, rules on conflicts, owns the ledger.                                                 |
| Every task review and re-review                      | Opus                        | Review is reserved for the strongest model. Never delegate a review down.                            |
| Final whole-branch review                            | Opus                        |                                                                                                      |
| All UI construction and parity judgement             | Opus                        | Artboard parity is judged against the designs; never delegated. Phase 3 onward.                      |
| Backend implementation                               | Sonnet                      | Default implementer for this phase. Phase 1 contains no UI.                                          |
| Mechanical codemods, renames, bulk call-site removal | codex luna, `--effort high` | Strong at bounded mechanical edits.                                                                  |
| Provider calls exercised under test                  | `gpt-5.6-luna`              | Only where a real LLM call is the thing being verified. Conservative use; never for bulk generation. |

**codex luna contract.** Dispatch only through the repo wrapper, which inlines skills and fails on an empty artifact:

```sh
node scripts/codexDispatch.mjs --model luna --effort high \
  --skills unslop,principle-prove-it-works \
  --prompt <task file> --expect <output file> --log <log file>
```

- **A codex luna dispatch must never spawn its own subagents.** Nested codex agents drift off the task. Every dispatch prompt states this explicitly.
- Always pass `--expect`. A run that exits 0 and writes nothing is a failure, not a success.
- Keep a tight leash: read the produced artifact and the log on every return, and diff what it changed before accepting. Never accept a luna result on its summary alone.

**Concurrency**

- **Exactly one local test process at a time**, across every worktree and every agent. `vitest` and `playwright` are both covered. Before dispatching an agent whose steps run tests, confirm no other test process is live.
- Never run two implementation subagents in parallel against the same worktree.
- **Parallel worktrees are encouraged.** Independent phases and research run concurrently in separate worktrees; only the test rule serialises them.
- Research, audits and plan-writing may always run in parallel with implementation, since they run no tests and write no source.

**Codex first.** Prefer `codex luna` for mechanical and well-specified work and `codex terra` for work needing design judgement. Sonnet is the fallback, not the default. Never use terra's `ultra` effort — it self-delegates, which the no-nested-subagents rule forbids.

**Execution waves — tasks are batched, not run one at a time**

Two agents must never write to the same worktree concurrently. Parallelism therefore comes from (a) batching tasks that touch the same files into ONE dispatch, and (b) running independent batches in separate worktrees.

| Wave | Track | Tasks                                                            | Worktree        | Agent              |
| ---- | ----- | ---------------------------------------------------------------- | --------------- | ------------------ |
| A    | A1    | Task 3 — port the work domain                                    | `v2-foundation` | codex luna, high   |
| A    | A2    | Phase 2 plan authoring (no code)                                 | main checkout   | Opus, controller   |
| A    | A3    | Task 2 scoped re-review (no code)                                | —               | Opus subagent      |
| B    | B1    | Tasks 5 + 6 + 9 batched — all three edit `server/routes/work.ts` | `v2-foundation` | codex luna, high   |
| B    | B2    | Tasks 7 + 8 batched — two migrations plus two Drizzle mirrors    | `v2-migrations` | codex luna, medium |
| C    | C1    | Merge B2 into the foundation branch, then Tasks 4 + 10           | `v2-foundation` | codex terra, high  |
| D    | D1    | Task 11 verification gate                                        | `v2-foundation` | Opus, controller   |

**Why these batches.** Tasks 5, 6 and 9 all modify `server/routes/work.ts`; dispatching them separately would serialise three reviews over one file and invite conflicts. Tasks 7 and 8 are both "add a migration, mirror it in Drizzle, extend the shape test" and share no file with B1, so they run beside it in their own worktree and fast-forward back. Tasks 4 and 10 both need a live database and a running server, so they belong together and go to terra for the environment judgement.

**Reviews are batched too.** One Opus review per wave, not per task, over the wave's whole diff. A wave whose review returns findings gets one fix dispatch for the whole wave.

**Commit freely.** Commit after each task within a batch, on the batch's own branch. Never push, merge to `main`, or reset.

## File Structure

| File                                                                               | Responsibility                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/schema/work.ts`                                                            | Drizzle definitions for the 8 work tables. Ported unchanged.                                                                                                                                                                        |
| `shared/work/index.ts`                                                             | Shared types (`TaskType`, `TaskState`, `LevelDefinition`, …) consumed by both server and client.                                                                                                                                    |
| `migrations/0131_work_domain.sql` … `0134_baseline_opportunity_reader_columns.sql` | Ported from `codex/gamified-platform`, content unchanged but **renumbered from 0126-0129** — those numbers are already bound in the local Supabase ledger to the `design/gamified-ui-prototype` branch's migrations. See Ruling R7. |
| `migrations/0135_work_outcome_review_unique.sql`                                   | **New.** Unique index backing outcome-review idempotency.                                                                                                                                                                           |
| `migrations/0136_brand_fact_sheet_accepted_by.sql`                                 | **New.** Approval actor column.                                                                                                                                                                                                     |
| `server/domains/work/*`                                                            | Pure policy, repository, opportunity contracts, evidence readers. No I/O in `policy.ts`.                                                                                                                                            |
| `server/services/work/*`                                                           | Ownership gate, pagination, projection, reconciler.                                                                                                                                                                                 |
| `server/storage/work*.ts`                                                          | Drizzle queries and row→view mappers.                                                                                                                                                                                               |
| `server/routes/work.ts`                                                            | The 8 HTTP endpoints.                                                                                                                                                                                                               |
| `server/routes/workLinks.ts`                                                       | **Modified.** Ceases to be called from GET hot paths.                                                                                                                                                                               |
| `scripts/assert-local-db.ts`                                                       | **New.** Refuses to proceed unless `DATABASE_URL` resolves to localhost.                                                                                                                                                            |
| `tests/contract/workSummaryContract.test.ts`                                       | **New.** Fails if the server omits a field the client reads.                                                                                                                                                                        |

---

### Task 1: Isolated worktree and branch

**Files:**

- Create: worktree at `.worktrees/v2-foundation` on branch `feat/v2-work-foundation`

**Interfaces:**

- Produces: an isolated checkout off `main` that later tasks operate in. All subsequent paths in this plan are relative to that worktree.

- [ ] **Step 1: Confirm main is clean enough to branch from**

```bash
git -C C:/Users/yoges/OneDrive/Desktop/venturecite status --porcelain
```

Expected: only the known untracked entries (`.impeccable/`, `DESIGN.md`, `docs/research/`, `docs/superpowers/`, `server/storage/workStorage.ts`, `tests/unit/workRepository.test.ts`) and the two modified files (`.claude/launch.json`, `supabase/config.toml`). Do not commit them.

- [ ] **Step 2: Create the worktree**

```bash
git -C C:/Users/yoges/OneDrive/Desktop/venturecite worktree add .worktrees/v2-foundation -b feat/v2-work-foundation main
```

- [ ] **Step 3: Verify it is a clean checkout of main**

```bash
git -C .worktrees/v2-foundation status --porcelain
git -C .worktrees/v2-foundation log --oneline -1
```

Expected: empty status; head equals `main`'s head.

- [ ] **Step 4: Install dependencies in the worktree**

```bash
cd .worktrees/v2-foundation && npm ci
```

- [ ] **Step 5: Confirm the baseline is green before changing anything**

```bash
cd .worktrees/v2-foundation && npm run check
```

Expected: PASS. If it fails, stop — the baseline is broken and nothing after this is interpretable.

---

### Task 2: Local-only database guard

**Files:**

- Create: `scripts/assert-local-db.ts`
- Test: `tests/unit/assertLocalDb.test.ts`

**Interfaces:**

- Produces: `assertLocalDatabase(url: string | undefined): void` — throws `Error` unless the host is `localhost`, `127.0.0.1` or `::1`. Every migration step in this plan calls the script first.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/assertLocalDb.test.ts
import { describe, expect, it } from "vitest";
import { assertLocalDatabase } from "../../scripts/assert-local-db";

describe("assertLocalDatabase", () => {
  it("accepts a local host", () => {
    expect(() =>
      assertLocalDatabase("postgresql://postgres:postgres@127.0.0.1:55322/postgres"),
    ).not.toThrow();
  });

  it("rejects the production pooler", () => {
    expect(() =>
      assertLocalDatabase(
        "postgresql://u:p@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres",
      ),
    ).toThrow(/refusing to run against a non-local database/i);
  });

  it("rejects an absent url", () => {
    expect(() => assertLocalDatabase(undefined)).toThrow(/DATABASE_URL is not set/i);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/assertLocalDb.test.ts`
Expected: FAIL — cannot resolve `../../scripts/assert-local-db`.

- [ ] **Step 3: Implement the guard**

```ts
// scripts/assert-local-db.ts
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertLocalDatabase(url: string | undefined): void {
  if (!url) {
    throw new Error("DATABASE_URL is not set. Refusing to run.");
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run against a non-local database (host: ${host}). ` +
        "Load .env.local-browser, or set DATABASE_URL to the local Supabase instance.",
    );
  }
}

if (process.argv[1]?.endsWith("assert-local-db.ts")) {
  assertLocalDatabase(process.env.DATABASE_URL);
  console.log("DATABASE_URL is local. Safe to proceed.");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/assertLocalDb.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Prove it refuses the real production URL**

```bash
cd .worktrees/v2-foundation && npx tsx scripts/assert-local-db.ts
```

Expected: throws, naming `aws-1-ap-southeast-1.pooler.supabase.com`, because `.env` is the default. Then:

```bash
cd .worktrees/v2-foundation && npx cross-env-shell "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres npx tsx scripts/assert-local-db.ts"
```

Expected: prints `DATABASE_URL is local. Safe to proceed.`

- [ ] **Step 6: Commit**

```bash
git add scripts/assert-local-db.ts tests/unit/assertLocalDb.test.ts
git commit -m "chore(db): refuse migrations against a non-local database"
```

---

### Task 3: Port the work domain, backend only

**Files:**

- Create (copied from `codex/gamified-platform`): `shared/schema/work.ts`, `shared/work/` (all files), `server/domains/work/*`, `server/services/work/*`, `server/storage/workStorage.ts`, `server/storage/workOpportunityStorage.ts`, `server/routes/work.ts`, `server/routes/workLinks.ts`, `server/services/visibilityCoverage.ts`, `migrations/0131_work_domain.sql`, `0132_work_evidence_readers_rls.sql`, `0133_work_opportunity_reader_columns.sql`, `0134_baseline_opportunity_reader_columns.sql`
- Modify: `server/routes.ts` — one import and one `setupWorkRoutes(app);` call
- Test: the ported `tests/unit/work*.test.ts` and `tests/migrations/work*.test.ts`

**Interfaces:**

- Consumes: the clean branch from Task 1.
- Produces: `setupWorkRoutes(app: Express): void`; the 8 endpoints under `/api/brands/:brandId/work/*`; `TASK_POINTS`, `LEVELS` from `server/domains/work/policy.ts`.

- [ ] **Step 1: Enumerate exactly what will be copied, and prove nothing else is**

```bash
cd C:/Users/yoges/OneDrive/Desktop/venturecite
git diff --name-only main codex/gamified-platform | sort > /tmp/platform-all.txt
grep -E '^(shared/(schema/work|work/)|server/(domains/work/|services/work/|storage/work|routes/work)|migrations/012[6-9])' /tmp/platform-all.txt
```

Expected: the file list above and nothing under `client/`. Record the count.

- [ ] **Step 2: Confirm the excluded files really are excluded**

```bash
git diff --name-only main codex/gamified-platform -- client/src/components/Sidebar.tsx client/src/components/AppShell.tsx client/src/components/dashboard-panels server/services/dashboardVisibility.ts
```

Expected: four paths listed. **None of these may be copied.** This is the D2 boundary.

- [ ] **Step 3: Copy the allowed files into the worktree**

```bash
cd C:/Users/yoges/OneDrive/Desktop/venturecite
for f in $(grep -E '^(shared/(schema/work|work/)|server/(domains/work/|services/work/|storage/work|routes/work)|server/services/visibilityCoverage|migrations/012[6-9]|tests/(unit/work|migrations/work|integration/work))' /tmp/platform-all.txt); do
  mkdir -p ".worktrees/v2-foundation/$(dirname "$f")"
  git show "codex/gamified-platform:$f" > ".worktrees/v2-foundation/$f"
done
```

- [ ] **Step 4: Register the routes**

In `.worktrees/v2-foundation/server/routes.ts`, add next to the other `setupXRoutes` calls:

```ts
import { setupWorkRoutes } from "./routes/work";
```

and, after `app.use(enforceBrandOwnership)` alongside the other brand-scoped setups:

```ts
setupWorkRoutes(app);
```

- [ ] **Step 5: Typecheck**

Run: `cd .worktrees/v2-foundation && npm run check`
Expected: PASS. If it reports a missing import, a file was missed in Step 3 — add it and re-run rather than stubbing the symbol.

- [ ] **Step 6: Run the ported unit tests**

Run: `cd .worktrees/v2-foundation && npx vitest run tests/unit/workPolicy.test.ts tests/unit/workRepository.test.ts tests/unit/workService.test.ts tests/unit/workRoutes.test.ts`
Expected: PASS.

- [ ] **Step 7: Assert the economy matches the spec**

Run: `cd .worktrees/v2-foundation && npx vitest run tests/unit/workPolicy.test.ts -t "points"`
Expected: PASS, and the assertions name 20/20/20/40/40/30/10/50 and thresholds 0/60/160/320/550. If any value differs, stop and report — the spec is binding.

- [ ] **Step 8: Confirm the live dashboard is untouched**

```bash
cd .worktrees/v2-foundation
git status --porcelain -- client/ | grep -v '^?? client/src/features/work' || echo "no client changes"
```

Expected: `no client changes`.

- [ ] **Step 9: Commit**

```bash
git add shared server migrations tests
git commit -m "feat(work): add work domain schema, services and routes"
```

---

### Task 4: Test database and the integration suite

**Files:**

- Create: `.env.test`
- Modify: `package.json` — add a `test:integration:local` script

**Interfaces:**

- Produces: a running integration suite. Later tasks rely on `npm run test:integration:local` as the gate that RLS and isolation still hold.

- [ ] **Step 1: Read the gate the integration tests use**

```bash
cd .worktrees/v2-foundation && sed -n '1,30p' tests/integration/workIsolation.test.ts
```

Expected: a skip guard requiring `LOCAL_SUPABASE_TEST=1` and a `TEST_DATABASE_URL` **distinct from** `DATABASE_URL`. Note the exact variable names before writing `.env.test`.

- [ ] **Step 2: Create the test database**

```bash
docker exec supabase_db_venturecite psql -U postgres -d postgres -c "CREATE DATABASE venturecite_test;"
```

Expected: `CREATE DATABASE`. If it already exists, that is fine.

- [ ] **Step 3: Write `.env.test`**

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/venturecite_test
LOCAL_SUPABASE_TEST=1
```

- [ ] **Step 4: Add the script**

`dotenv-cli` is **not** a dependency of this repo (`dotenv` is, but it exposes no CLI), so the script sets the variables inline through `cross-env`, which is present. `.env.test` remains as documentation of the same values.

In `package.json` scripts:

```json
"test:integration:local": "cross-env NODE_ENV=test LOCAL_SUPABASE_TEST=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/venturecite_test vitest run tests/integration tests/migrations"
```

These are the published local-Supabase defaults on a loopback address, not secrets. Do not put a non-local host in this script under any circumstance.

- [ ] **Step 5: Migrate the test database**

```bash
cd .worktrees/v2-foundation
npx cross-env-shell "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/venturecite_test npx tsx scripts/assert-local-db.ts && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/venturecite_test npm run db:migrate"
```

Expected: migrations apply through `0134` with no error. If `0096`'s privilege guard aborts after `0126`, record the exact message and stop — that is spec gap 10 and needs a decision, not a workaround.

- [ ] **Step 6: Run the integration suite**

Run: `cd .worktrees/v2-foundation && npm run test:integration:local`
Expected: the previously-skipped tests now execute. Record the count that run and the count that pass.

- [ ] **Step 7: Fix or report**

If any isolation or RLS test fails, that is a real defect in the inherited work — report it with the failing assertion before changing any test. Never weaken an isolation assertion to make it pass.

- [ ] **Step 8: Commit**

```bash
git add .env.test package.json
git commit -m "test(work): run isolation and rls suites against a local test database"
```

---

### Task 5: Accept browser sessions on the work API

**Files:**

- Modify: `server/routes/work.ts` — the `bearerOnly` middleware and its 8 call sites
- Test: `tests/unit/workRoutes.test.ts`

**Interfaces:**

- Produces: work endpoints reachable by a cookie-session browser client, which Phase 3's UI depends on.

- [ ] **Step 1: Read the middleware and confirm the problem**

```bash
cd .worktrees/v2-foundation && grep -n "bearerOnly" -A 10 server/routes/work.ts | head -30
```

Expected: a handler that 401s when there is no `Authorization: Bearer` header, applied before `isAuthenticated` on every route.

- [ ] **Step 2: Write the failing test**

```ts
// append to tests/unit/workRoutes.test.ts
it("allows a cookie-session request with no bearer header", async () => {
  const res = await request(app)
    .get("/api/brands/brand-1/work/summary")
    .set("Cookie", "connect.sid=s%3Avalid");
  expect(res.status).not.toBe(401);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run tests/unit/workRoutes.test.ts -t "cookie-session"`
Expected: FAIL with `expected 401 not to be 401`.

- [ ] **Step 4: Remove the bearer-only gate**

Delete the `bearerOnly` function and its 8 usages, leaving `isAuthenticated` as the sole gate — the same posture every other route module in the repo uses.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/workRoutes.test.ts`
Expected: PASS, including the new test and every pre-existing one.

- [ ] **Step 6: Commit**

```bash
git add server/routes/work.ts tests/unit/workRoutes.test.ts
git commit -m "fix(work): accept session-authenticated requests on work routes"
```

---

### Task 6: Take task derivation off the read path

**Files:**

- Modify: `server/routes/factSheetV2.ts`, `server/routes/prompts.ts` — remove the `readWorkTaskLinks` calls
- Modify: `server/routes/work.ts` — add an explicit reconcile endpoint
- Test: `tests/unit/workLinks.test.ts`, `tests/unit/workRoutes.test.ts`

**Interfaces:**

- Produces: `POST /api/brands/:brandId/work/reconcile` returning `{ success: true, data: { links: WorkTaskLink[], count: number } }`. Phase 2's scheduler calls this; GET handlers no longer do.
- **Real signature, verified in source:** `reconcileBrandWorkOpportunities(input: { actor: RequestActor; brandId: string }, database?): Promise<readonly WorkTaskLink[] | undefined>`. It takes one object, not two positional arguments, and it resolves to a links array or `undefined` — never a `{created, dismissed}` count. The working call site is `server/routes/workLinks.ts:5-21`; copy its shape.

- [ ] **Step 1: Count the call sites**

```bash
cd .worktrees/v2-foundation && grep -n "readWorkTaskLinks\|withWorkTaskLinks" server/routes/factSheetV2.ts server/routes/prompts.ts | wc -l
```

Expected: 14. Record the exact line numbers before editing.

- [ ] **Step 2: Write the failing test for the new endpoint**

```ts
// append to tests/unit/workRoutes.test.ts
it("reconciles opportunities on demand", async () => {
  const res = await request(app)
    .post("/api/brands/brand-1/work/reconcile")
    .set("Authorization", "Bearer valid");
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    success: true,
    data: { links: expect.any(Array), count: expect.any(Number) },
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run tests/unit/workRoutes.test.ts -t "reconciles opportunities"`
Expected: FAIL with 404.

- [ ] **Step 4: Add the endpoint**

In `setupWorkRoutes`, alongside the other routes:

```ts
app.post(
  "/api/brands/:brandId/work/reconcile",
  isAuthenticated,
  asyncHandler(async (req, res) => {
    const brandId = await ownedBrand(req);
    if (!brandId) return;
    try {
      const { reconcileBrandWorkOpportunities } =
        await import("../services/work/productionOpportunities");
      const links = await reconcileBrandWorkOpportunities({
        actor: createRequestActor(req.user!.id),
        brandId,
      });
      return res.json({
        success: true,
        data: { links: links ?? [], count: links?.length ?? 0 },
      });
    } catch (error) {
      return respondError(res, error, "Unable to reconcile work opportunities");
    }
  }),
);
```

Import `createRequestActor` from `../lib/requestActor`. Unlike the old GET-path helper, this endpoint must **not** swallow failures — a reconcile that fails is a 5xx the caller needs to see, which is exactly what `respondError` gives.

- [ ] **Step 5: Remove the calls from the GET handlers**

Delete every `readWorkTaskLinks` / `withWorkTaskLinks` usage in `server/routes/factSheetV2.ts` and `server/routes/prompts.ts`, restoring each response body to its pre-branch shape.

- [ ] **Step 6: Prove the read paths are clean**

```bash
cd .worktrees/v2-foundation && grep -c "readWorkTaskLinks\|withWorkTaskLinks" server/routes/factSheetV2.ts server/routes/prompts.ts
```

Expected: `0` for both files.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/unit/workRoutes.test.ts tests/unit/workLinks.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/routes tests/unit
git commit -m "refactor(work): reconcile opportunities on demand instead of during reads"
```

---

### Task 7: Back outcome-review idempotency with a constraint

**Files:**

- Create: `migrations/0135_work_outcome_review_unique.sql`
- Modify: `shared/schema/work.ts` — add the unique index to `workOutcomeReviews`
- Test: `tests/migrations/workMigrationShape.test.ts`

**Interfaces:**

- Produces: unique index `work_outcome_reviews_task_cycle_key` on `(task_id, task_version, cycle_key)`.

- [ ] **Step 1: Write the failing shape test**

```ts
// append to tests/migrations/workMigrationShape.test.ts
it("constrains outcome reviews to one per task version and cycle", () => {
  const sql = readFileSync("migrations/0135_work_outcome_review_unique.sql", "utf8");
  expect(sql).toMatch(/work_outcome_reviews_task_cycle_key/);
  expect(sql).toMatch(/task_id,\s*task_version,\s*cycle_key/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/migrations/workMigrationShape.test.ts -t "one per task version"`
Expected: FAIL — no such file.

- [ ] **Step 3: Write the migration**

```sql
-- migrations/0135_work_outcome_review_unique.sql
-- Outcome-review idempotency is enforced in the repository by a read-then-insert on
-- (task_id, task_version, cycle_key). Two concurrent reviews can both pass that check,
-- so the tuple needs a constraint behind it.
CREATE UNIQUE INDEX IF NOT EXISTS work_outcome_reviews_task_cycle_key
  ON public.work_outcome_reviews (task_id, task_version, cycle_key);
```

- [ ] **Step 4: Mirror it in the Drizzle schema**

In `shared/schema/work.ts`, inside the `workOutcomeReviews` table's index block:

```ts
    uniqueIndex("work_outcome_reviews_task_cycle_key").on(
      table.taskId,
      table.taskVersion,
      table.cycleKey,
    ),
```

- [ ] **Step 5: Run the shape tests**

Run: `npx vitest run tests/migrations/workMigrationShape.test.ts`
Expected: PASS.

- [ ] **Step 6: Apply and verify against the test database**

```bash
cd .worktrees/v2-foundation
npx cross-env-shell "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/venturecite_test npx tsx scripts/assert-local-db.ts && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/venturecite_test npm run db:migrate"
docker exec supabase_db_venturecite psql -U postgres -d venturecite_test -c "\di work_outcome_reviews*"
```

Expected: the index is listed.

- [ ] **Step 7: Commit**

```bash
git add migrations/0135_work_outcome_review_unique.sql shared/schema/work.ts tests/migrations
git commit -m "fix(work): enforce one outcome review per task version and cycle"
```

---

### Task 8: Record who approved a fact

**Files:**

- Create: `migrations/0136_brand_fact_sheet_accepted_by.sql`
- Modify: `shared/schema/factAgent.ts` — add `acceptedBy`
- Test: `tests/migrations/workMigrationShape.test.ts`

**Interfaces:**

- Produces: `brand_fact_sheet.accepted_by varchar NULL REFERENCES users(id) ON DELETE SET NULL`. Phase 4's approve-or-amend flow (spec D12) writes it.

- [ ] **Step 1: Confirm the column is genuinely absent**

```bash
docker exec supabase_db_venturecite psql -U postgres -d postgres -c "\d brand_fact_sheet" | grep -i accepted
```

Expected: only `accepted_at`. If `accepted_by` already exists, stop — the audit was wrong and this task is unnecessary.

- [ ] **Step 2: Write the failing shape test**

```ts
// append to tests/migrations/workMigrationShape.test.ts
it("records the actor who accepted a fact", () => {
  const sql = readFileSync("migrations/0136_brand_fact_sheet_accepted_by.sql", "utf8");
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS accepted_by/i);
  expect(sql).toMatch(/REFERENCES public\.users\s*\(id\)\s*ON DELETE SET NULL/i);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run tests/migrations/workMigrationShape.test.ts -t "actor who accepted"`
Expected: FAIL — no such file.

- [ ] **Step 4: Write the migration**

```sql
-- migrations/0136_brand_fact_sheet_accepted_by.sql
-- accepted_at records when a fact was approved but not by whom, so an award has no actor.
-- SET NULL rather than CASCADE: the approval remains true after the user is deleted.
ALTER TABLE public.brand_fact_sheet
  ADD COLUMN IF NOT EXISTS accepted_by varchar
  REFERENCES public.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS brand_fact_sheet_accepted_by_idx
  ON public.brand_fact_sheet (accepted_by);
```

- [ ] **Step 5: Mirror it in the Drizzle schema**

In `shared/schema/factAgent.ts`, in the `brandFactSheet` table beside `acceptedAt`:

```ts
    acceptedBy: varchar("accepted_by").references(() => users.id, { onDelete: "set null" }),
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run tests/migrations/workMigrationShape.test.ts && npm run check`
Expected: PASS.

- [ ] **Step 7: Apply to the test database and verify**

```bash
cd .worktrees/v2-foundation
npx cross-env-shell "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/venturecite_test npm run db:migrate"
docker exec supabase_db_venturecite psql -U postgres -d venturecite_test -c "\d brand_fact_sheet" | grep -i accepted_by
```

Expected: the column is listed.

- [ ] **Step 8: Commit**

```bash
git add migrations/0136_brand_fact_sheet_accepted_by.sql shared/schema/factAgent.ts tests/migrations
git commit -m "feat(facts): record the actor who accepted a fact"
```

---

### Task 9: Make `/work/summary` serve what Today needs

**Files:**

- Modify: `server/routes/work.ts` — the summary handler
- Modify: `server/services/work/WorkService.ts` — extend `getToday`
- Test: `tests/unit/workRoutes.test.ts`

**Interfaces:**

- Consumes: `LEVELS` and `levelForProgress` from `server/domains/work/policy.ts` (currently uncalled in production).
- Produces: the summary response gains `currentLevel: { level: number; name: string; points: number }`, `nextThreshold: { level: number; name: string; points: number } | null`, and `goal: { title: string; statement: string } | null`. Phase 3's Today page reads exactly these names.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/unit/workRoutes.test.ts
it("returns the level and next threshold the today page reads", async () => {
  const res = await request(app)
    .get("/api/brands/brand-1/work/summary")
    .set("Authorization", "Bearer valid");
  expect(res.status).toBe(200);
  expect(res.body.data).toMatchObject({
    currentLevel: {
      level: expect.any(Number),
      name: expect.any(String),
      points: expect.any(Number),
    },
  });
  expect(res.body.data).toHaveProperty("nextThreshold");
  expect(res.body.data).toHaveProperty("goal");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/workRoutes.test.ts -t "level and next threshold"`
Expected: FAIL — `currentLevel` undefined.

- [ ] **Step 3: Read the real signature before calling it**

```bash
cd .worktrees/v2-foundation && sed -n '404,412p' server/domains/work/policy.ts
```

Expected: `levelForProgress(progress: LevelProgress): LevelDefinition`, whose body calls `milestones.has(...)`. **`milestones` is a `Set`, not an array** — passing the array from `capabilityState.map()` would silently never match and pin every brand at Level 1.

- [ ] **Step 4: Add a goal reader, because none exists**

`brand_goals` is a table with no code; `WorkService` has no `goal` anywhere. Add to `server/storage/workStorage.ts`:

```ts
export async function selectActiveBrandGoal(
  tx: WorkTransaction,
  brandId: string,
): Promise<{ title: string; statement: string } | null> {
  const [row] = await tx
    .select({ title: brandGoals.title, statement: brandGoals.statement })
    .from(brandGoals)
    .where(and(eq(brandGoals.brandId, brandId), eq(brandGoals.status, "active")))
    .limit(1);
  return row ?? null;
}
```

Expose it through `WorkService.getToday` as `goal` on the returned object.

- [ ] **Step 5: Extend the handler**

In the `/work/summary` handler, after `const summary = result.summary;`:

```ts
const points = summary?.awards.points ?? 0;
const milestoneList = summary?.capabilityState.map((m) => m.milestone) ?? [];
const current = levelForProgress({ points, milestones: new Set(milestoneList) });
const next = LEVELS.find((level) => level.level === current.level + 1) ?? null;
```

and add to the `data` object:

```ts
            currentLevel: { level: current.level, name: current.name, points: current.points },
            nextThreshold: next ? { level: next.level, name: next.name, points: next.points } : null,
            goal: result.goal ?? null,
```

Keep `milestones: milestoneList` in the response — the client reads the array, the policy needs the Set.

Import `LEVELS` and `levelForProgress` from `../domains/work/policy`.

- [ ] **Step 6: Run the test**

Run: `npx vitest run tests/unit/workRoutes.test.ts -t "level and next threshold"`
Expected: PASS.

- [ ] **Step 7: Verify a brand at zero points reports Level 1**

```ts
// append to tests/unit/workRoutes.test.ts
it("reports Start for a brand with no awards", async () => {
  const res = await request(app)
    .get("/api/brands/brand-empty/work/summary")
    .set("Authorization", "Bearer valid");
  expect(res.body.data.currentLevel).toMatchObject({ level: 1, name: "Start", points: 0 });
  expect(res.body.data.nextThreshold).toMatchObject({ level: 2, name: "Ready", points: 60 });
});
```

Run: `npx vitest run tests/unit/workRoutes.test.ts`
Expected: PASS.

- [ ] **Step 8: Prove the Set bug would have been caught**

Temporarily change `new Set(milestoneList)` back to `milestoneList`, re-run the Level test, and confirm it FAILS — a brand with awards and milestones should not report Level 1. Restore the `Set`. If it still passes, the fixture has no milestones and the test is not exercising the path; add a milestone to the fixture before continuing.

- [ ] **Step 9: Commit**

```bash
git add server/routes/work.ts server/services/work/WorkService.ts server/storage/workStorage.ts tests/unit/workRoutes.test.ts
git commit -m "feat(work): serve level, next threshold and goal from the work summary"
```

---

### Task 10: A contract test that cannot be satisfied by a mock

**Files:**

- Create: `tests/contract/workSummaryContract.test.ts`
- Modify: `package.json` — include `tests/contract` in `test:integration:local`

**Interfaces:**

- Consumes: the live route from Task 9 and the real database from Task 4.
- Produces: a guard that fails whenever the server stops sending a field the Today page reads. This is the test whose absence caused the original defect.

- [ ] **Step 1: Write the failing test**

```ts
// tests/contract/workSummaryContract.test.ts
import { describe, expect, it } from "vitest";

const TODAY_READS = [
  "brandId",
  "points",
  "pendingCount",
  "milestones",
  "nextTask",
  "waitingTasks",
  "mode",
  "currentLevel",
  "nextThreshold",
  "goal",
] as const;

describe("work summary contract", () => {
  it("sends every field the today page reads", async () => {
    const res = await fetch(
      `${process.env.CONTRACT_BASE_URL}/api/brands/${process.env.CONTRACT_BRAND_ID}/work/summary`,
      { headers: { Authorization: `Bearer ${process.env.CONTRACT_TOKEN}` } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const field of TODAY_READS) {
      expect(Object.keys(body.data)).toContain(field);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/contract/workSummaryContract.test.ts`
Expected: FAIL — no server running, or missing fields.

- [ ] **Step 3: Start the dev server against the local database**

Use the Browser pane's `preview_start` with the `dev-local` config. Do not start a server with Bash.

- [ ] **Step 4: Run the contract test with real values**

```bash
cd .worktrees/v2-foundation
npx cross-env-shell "CONTRACT_BASE_URL=http://localhost:5000 CONTRACT_BRAND_ID=<Venture PR brand id> CONTRACT_TOKEN=<local token> npx vitest run tests/contract/workSummaryContract.test.ts"
```

Expected: PASS. Obtain the brand id with:

```bash
docker exec supabase_db_venturecite psql -U postgres -d postgres -t -A -c "SELECT id FROM brands WHERE name='Venture PR' LIMIT 1;"
```

- [ ] **Step 5: Prove the guard bites**

Temporarily delete `currentLevel` from the handler's `data` object, re-run the contract test, and confirm it FAILS naming `currentLevel`. Restore the line.

- [ ] **Step 6: Commit**

```bash
git add tests/contract package.json
git commit -m "test(work): assert the summary contract against a running server"
```

---

### Task 11: Phase gate

**Files:** none — verification only.

- [ ] **Step 1: Full verification suite, one process at a time**

```bash
cd .worktrees/v2-foundation
npm run check
npm run lint
npm run format:check
npm test
npm run test:integration:local
```

Expected: all PASS. Run them sequentially, never concurrently.

- [ ] **Step 2: Prove the live dashboard is untouched**

```bash
git -C .worktrees/v2-foundation diff --name-only main -- client/ src/routes/_app/dashboard.tsx src/routes/index.tsx
```

Expected: **empty output**. Any file listed is a spec violation (D2, D6).

- [ ] **Step 3: Prove the eight endpoints answer**

With the dev server running against local, for the Venture PR brand id:

```bash
curl -s -o /dev/null -w '%{http_code} ' -H "Authorization: Bearer <token>" "http://localhost:5000/api/brands/<id>/work/summary"
curl -s -o /dev/null -w '%{http_code} ' -H "Authorization: Bearer <token>" "http://localhost:5000/api/brands/<id>/work/tasks"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <token>" "http://localhost:5000/api/brands/<id>/work/history"
```

Expected: `200 200 200`.

- [ ] **Step 4: Record what is still missing**

Append to this plan's Phase 2 notes the count of task types that still have no source (expected: 6 of 8) and the count of evidence kinds still returning `owned_unusable` (expected: 6 of 9). Phase 2 exists to close exactly those.

---

## Phases after this one

Each becomes its own plan, in its own worktree, written when its turn comes. Listed here for scope only.

**Parallelisation.** Phase 2 is backend and Phase 3 is UI, so once Phase 1 lands they run concurrently in separate worktrees — Phase 2 on Sonnet and codex luna, Phase 3 on Opus for parity. Phases 4 and 5 depend on Phase 3's shell and follow it. Plan-writing and research for a later phase always run in parallel with the current phase's implementation. The only global serialisation is the single test process.

- **Phase 2 — Close the economy.** Sources for the six unreachable task types; real evidence readers for the six `owned_unusable` kinds; the reconcile scheduler. Without this, no task above 20 points can exist.
- **Phase 3 — Shell and Today.** The `/v2/` shell at 200px with tint→fill buttons, then Today in every state across the four fixture brands.
- **Phase 4 — My work and Brand facts.** Task list, task detail, confirmation gate, buyer-guide editor, and the approve-or-amend flow (D12).
- **Phase 5 — Visibility.** Overview, evidence with prompt diagnosis, results review, and the `/v2/`-only failure-excluded denominator (D16).
- **Phase 6 — Learn prototype, and the "Gamified" sidebar entry.** The single permitted live-file edit lands last, once there is something worth linking to.
