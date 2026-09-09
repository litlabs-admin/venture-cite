# Gamified v2 dashboard — specification

**Date:** 2026-09-09
**Status:** Approved for planning
**Owner decisions captured in this document are binding on every plan that cites it.**

## Goal

Ship a second, fully wired dashboard at `/v2/` that reproduces the approved artboard
designs with 100% parity, covers the five Guided areas across every state, and reads
real data for every brand — without changing the existing dashboard beyond a single
additive sidebar link.

## Locked decisions

| #   | Decision                | Value                                                                                                                                                                   |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Trunk                   | The work domain from `codex/gamified-platform` only. `codex/gamified-backend` is a strict content subset and is deleted.                                                |
| D2  | Excluded from D1        | The branch's `Sidebar.tsx` rewrite, `AppShell.tsx` geometry change (200→267px rail, 56→118px mobile header) and `dashboardVisibility.ts` hero rework. None of it lands. |
| D3  | Points economy          | Canonical: facts 20, buyer questions 20, baseline 20, fault repair 40, page improvement 40, community 30, results review 10, experiment 50.                             |
| D4  | Levels                  | Start 0, Ready 60, Improve 160, Learn 320, **Maintain 550**. All five built. Each level also requires its capability milestone.                                         |
| D5  | Routes                  | `/v2/...`. Live for every authenticated user.                                                                                                                           |
| D6  | Live-dashboard edit     | Exactly one: an additive "Gamified" nav entry in `client/src/components/Sidebar.tsx`. No other live file changes.                                                       |
| D7  | Sidebar width           | **200px** — the live rail, not the artboard's 244px.                                                                                                                    |
| D8  | Buttons                 | **Live behaviour**: primary rests as a tint, fills on hover. Not the artboard's solid rest fill.                                                                        |
| D9  | Everything else         | 100% parity with the artboard designs, including how data is presented. The artboard content column reflows to 200px; it is never rescaled.                             |
| D10 | Brand coverage          | Every screen works for every brand, including brands with no data.                                                                                                      |
| D11 | States                  | All four are distinct and separately designed: **Not measured**, **Inactive**, **Failed**, **No finding**. Never collapsed.                                             |
| D12 | Fact approval actor     | Attribute to the brand owner, **and** require an explicit accept-or-amend step from them. Approval is never silent.                                                     |
| D13 | Learn area              | Deferred. Build a navigable prototype only.                                                                                                                             |
| D14 | Live dashboard's future | Undecided. Both dashboards must be able to coexist indefinitely.                                                                                                        |
| D15 | Integration tests       | `TEST_DATABASE_URL` is configured and the RLS/isolation suites run.                                                                                                     |
| D16 | Live visibility numbers | Unchanged. The failure-excluded denominator applies to `/v2/` only; the live dashboard keeps today's arithmetic. The defect is recorded, not fixed here.                |

## Global constraints

- **`DATABASE_URL` in `.env` points at production** (`aws-1-ap-southeast-1.pooler.supabase.com:6543`).
  Local work uses `.env.local-browser` (`127.0.0.1:55322`). No plan step may run a migration
  or a destructive query without an explicit local-host assertion first.
- **One local test run at a time.** Never start a second `vitest`/`playwright` process concurrently.
- **Never commit, push, merge or reset** unless the owner asks in the current turn.
- **Never name Claude or any AI tool** in a commit message, PR, or file content.
- **Verify from code.** Markdown and comments are hints to check, never evidence.
- Verification commands: `npm run check`, `npm run lint`, `npm run format:check`, `npm test`.
  `npm run test:integration` requires the test database.

## Agent policy

- **Opus** — orchestration, planning, review, verification, and all UI work. UI parity is
  judged by Opus against the artboards, never delegated to a cheaper model.
- **Sonnet subagents** — free use for research, non-UI implementation, and test writing.
- **Codex luna** (`node scripts/codexDispatch.mjs --model luna --effort high`) — permitted for
  mechanical, well-bounded work. **Must not spawn its own subagents.** Every dispatch carries
  `--expect` and is reviewed on return; a run that exits 0 and writes nothing is a failure.
- **LLM calls under test** — `gpt-5.6-luna` only, sparingly, and only where a real provider
  call is the thing being verified.
- Worktrees and parallel agents are encouraged, subject to the single-test-run rule.

## Data reality (local Supabase, verified 2026-09-09)

| Brand           | rankings | runs | facts | prompts | competitors | site health |
| --------------- | -------: | ---: | ----: | ------: | ----------: | ----------: |
| Venture PR      |     2245 |   47 |    38 |      70 |         143 |           0 |
| Notion          |     1966 |   44 |    52 |      85 |         201 |           0 |
| Samsung         |     1678 |   35 |    19 |      74 |         176 |           0 |
| Apple           |      632 |   13 |    24 |      52 |         153 |           0 |
| FeatherHQ       |      360 |    4 |    15 |      70 |          19 |           0 |
| Narwal          |      230 |    4 |     0 |      10 |          33 |           0 |
| RACAM           |       90 |    1 |     0 |      15 |          18 |           0 |
| DROS AI         |       60 |    1 |    13 |      10 |          45 |           1 |
| E2E Brand       |        0 |    0 |     3 |       0 |           0 |           0 |
| Feather         |        0 |    0 |     0 |       0 |           8 |           0 |
| Smoke Aggregate |        0 |    0 |     2 |       0 |           0 |           0 |

Fixture roles: **Venture PR** = rich, **Narwal** = thin (no facts), **DROS AI** = only brand with
site health, **Feather** = empty. Every screen is reviewed against all four.

**Site health is absent for 10 of 11 brands.** Any artboard element sourced from it renders
**Not measured**, not zero. This is the single most common honest-empty case in the build.

## Known gaps in the inherited work domain

These are defects to fix, not features to admire.

1. **`/work/summary` under-serves its client.** It returns `points, pendingCount, milestones,
nextTask, waitingTasks, mode`. The Today design needs `currentLevel`, `nextThreshold`,
   `goal`, `visibility`, `freshness`. Absent fields are optional in the client schema, so the
   page degrades silently to "Level unavailable" forever.
2. **Component tests mock fields the server never sends**, which is why (1) was never caught.
   Tests must assert against the real response contract.
3. **Six of eight task types have no source.** Only `approve_essential_brand_facts` and
   `approve_buyer_question_set` can be created. The 40- and 50-point economy is unreachable.
4. **Six of nine evidence kinds return `owned_unusable`** (`artifact`, `fault_repair`,
   `authored_work`, `confirmation`, `decision`, `experiment`). `approve_buyer_question_set`
   requires `artifact`, so it can be created but never verified.
5. **Levels are computed nowhere.** `levelForProgress` has no production caller.
6. **`work_outcome_reviews` has no unique index** on `(task_id, task_version, cycle_key)`,
   though its idempotency depends on that tuple.
7. **`bearerOnly`** on every work route rejects cookie-session clients.
8. **Derivation runs inside GET handlers** for fact-sheet and prompt endpoints, opening a write
   transaction on a hot read path.
9. **`brand_goals` and `business_result_events`** are tables with no code.
10. **Migration number collision**: `0126` is claimed by both `work_domain.sql` (platform) and
    `action_awards.sql` (ui-prototype).
11. **`brand_fact_sheet` has no `accepted_by`**, so an approval has no actor (needed by D12).

## Screens in scope

Five Guided areas. Each screen is designed in all applicable states from D11 plus loading,
error, and first-run.

- **Today** — ranked next task, progress rail, waiting-for-observation, observed visibility.
- **My work** — task list (to do / in progress / waiting / completed), task detail, the
  confirmation gate, the buyer-guide editor.
- **Brand facts** — fact table, source excerpt, approve-or-amend (D12).
- **Visibility** — overview, evidence, results review.
- **Learn** — navigable prototype only (D13).

Diagnostics prompt-diagnosis is designed as part of Visibility evidence, not a sixth area.

## Out of scope

- Any change to the live dashboard's layout, behaviour or numbers (D2, D6, D16).
- The `design/gamified-ui-prototype` economy, detectors and Arena — parked for later harvest.
- Expert mode, GEO assistant, prompt portfolio, client-safe report packages, operator view.
- Academy content (D13).

## Acceptance

1. `/v2/` renders all five areas for all four fixture brands with no console errors.
2. Every screen matches its artboard at 100% parity except D7 and D8.
3. The four states of D11 are visually distinct and correct per brand.
4. A dead detector never reports reassurance; absent data reads **Not measured**.
5. The live dashboard is byte-identical except the one `Sidebar.tsx` nav entry.
6. `npm run check`, `lint`, `format:check`, `test` pass; `test:integration` runs and passes.
7. Points and levels match D3/D4 exactly, and no award can be earned twice.
