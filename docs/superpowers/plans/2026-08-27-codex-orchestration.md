# Codex Worker Orchestration

**Role split:** the orchestrator plans, dispatches, reviews and verifies. Codex workers implement.
The orchestrator never edits code a worker was assigned — controller fixes skip review and
pollute the controller's context.

**Everything below was verified by running it on 2026-08-27** against codex-cli 0.150.0.

---

## 1. Policy constraints

These are project rules, not preferences. They override any model-selection reasoning downstream.

| Rule                                                    | Status                                                                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Use **Luna** and **Terra** only                         | Enforced in all `.codex/agents/*.toml`                                                                                                        |
| **Never Sol**                                           | Removed from `reviewer.toml` and `production-safety.toml`                                                                                     |
| Luna is the default; Terra only where the work needs it | See §3                                                                                                                                        |
| **No OpenAI API key**                                   | `auth.json` → `OPENAI_API_KEY` is null/empty                                                                                                  |
| **No OpenRouter**                                       | Not used by Codex at all; OpenRouter is the _application's_ runtime path (`server/lib/openrouterClient.ts`) and is unrelated to orchestration |
| Use the signed-in ChatGPT account                       | `auth.json` → `auth_mode = "chatgpt"`, OAuth tokens present, refreshed 2026-08-26                                                             |

No dispatch in this design passes an API key or a base URL. Codex uses the machine's existing
ChatGPT session.

---

## 2. The models, and what the docs say each is for

Source: OpenAI's model documentation (`developers.openai.com/codex/models` → `learn.chatgpt.com/docs/models`).

| Model                 | Documented purpose                                                                                                                                                         | Cost / speed                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **`gpt-5.6-luna`**    | _"Choose Luna for specific, high-volume tasks when you know what a good result looks like, such as extraction, classification, transformation, and structured summaries."_ | Fastest, lowest cost in the family                                                      |
| **`gpt-5.6-terra`**   | _"Choose Terra for everyday work that needs strong reasoning and tool use when you do not need Sol's full depth."_                                                         | Balanced; competitive with GPT-5.5 at lower cost                                        |
| `gpt-5.6-sol`         | _"…ambiguous, difficult, or high-value tasks that need extra analysis, judgment, or polish."_                                                                              | **Excluded by policy**                                                                  |
| `gpt-5.3-codex-spark` | Near-instant coding iteration                                                                                                                                              | **Not used** — text-only research preview, ChatGPT Pro only, so not a dependable target |

> **Correction.** An earlier version of this document stated there is no `terra`. That was wrong.
> It was based on `terra` being absent from this repo, `.codex/`, and `~/.codex/` — which is true —
> but absence from local config says nothing about what the account offers. Probed directly,
> `gpt-5.6-terra` returns exit 0 and a correct answer. Both models are live on this account.

### The reasoning ladder that actually works here

The docs list six levels (Low, Medium, High, Extra High, Max, Ultra). **Two of them do not work on
this account.** Probed one at a time:

| Effort   | Result                                                                                  |
| -------- | --------------------------------------------------------------------------------------- |
| `low`    | exit 0                                                                                  |
| `medium` | exit 0                                                                                  |
| `high`   | exit 0                                                                                  |
| `xhigh`  | **hard error** — `spawn allowlist — V2 accepts only V2-capable presets and hard-errors` |
| `max`    | exit 0                                                                                  |
| `ultra`  | **hard error** — same message                                                           |

So the usable ladder is **low → medium → high → max**. `max` is the top rung, and it works on both
Luna and Terra.

This was a live breakage: `deep-worker.toml` and `docs-worker.toml` both specified `xhigh`, so both
profiles would have failed on first use. Both are now `max`.

---

## 3. Assignment: Luna by default, Terra where the work needs reasoning

The rule follows the documentation. Luna is for work where _you already know what a good result
looks like_ — which is exactly true of a task whose plan text contains the code to write. Terra is
for work needing judgement across files, or judgement about someone else's work.

| Task                        | Model     | Effort | Sandbox                     | Why this model                                                                 |
| --------------------------- | --------- | ------ | --------------------------- | ------------------------------------------------------------------------------ |
| 1 — `RETURNING *`           | **luna**  | low    | workspace-write             | Two mechanical edits, code given verbatim                                      |
| 2 — Composite indexes       | **luna**  | low    | workspace-write             | SQL written verbatim in the plan                                               |
| 3 — Batch insert            | **luna**  | high   | workspace-write             | Transformation of a known loop, but must verify the real conflict target       |
| 4 — Metrics aggregate       | **terra** | high   | workspace-write             | Must preserve exact snapshot numbers while changing how they are computed      |
| 5 — Citation trend          | **luna**  | high   | workspace-write             | Query is given; zero-fill semantics are specified                              |
| 6 — Gap-matrix N+1          | **luna**  | high   | workspace-write             | Mechanical batching; response shape is pinned                                  |
| 7 — Advisory locks          | **terra** | max    | workspace-write             | Concurrency semantics across four files — highest blast radius in the plan     |
| 8 — Retention + constraints | **luna**  | high   | workspace-write             | Repetitive SQL, but must query live distinct values first                      |
| 9 — Runtime role            | **terra** | max    | read-only → workspace-write | Enumerate breakage before changing anything                                    |
| Reviews of 1, 2, 5, 6, 8    | **luna**  | high   | **read-only**               | Checking a mechanical diff against an explicit spec with a fixed output schema |
| Reviews of 3, 4, 7, 9       | **terra** | max    | **read-only**               | Judgement review of judgement work                                             |

Six of nine implementation tasks and five of nine reviews run on Luna. Terra is reserved for the
four places where the plan cannot fully specify the answer in advance.

The `.codex/agents/*.toml` profiles were updated to match, so the in-session multi-agent feature
obeys the same policy: `worker` (luna/high), `deep_worker` (luna/max), `spark_worker` (luna/low),
`inventory` (luna/high, read-only), `reviewer` (terra/high, read-only), `production_safety`
(terra/max, read-only). Sol appears in none of them, and `spark_worker` was repointed off
`gpt-5.3-codex-spark`. Backup of the originals: `.codex/agents.bak-20260827/`.

These profiles do **not** apply to `codex exec` — see the `-p` warning in §4. For orchestration,
the table above is enforced by explicit flags on every dispatch.

---

## 4. The dispatch contract

| Flag                               | Why it matters                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `-m, --model`                      | Pick luna or terra per task                                                   |
| `-c model_reasoning_effort=`       | low / medium / high / max only                                                |
| `-s, --sandbox`                    | `read-only` for reviewers, `workspace-write` for implementers                 |
| `-C, --cd`                         | Pin the working root                                                          |
| `-p, --profile`                    | **Do not use.** See the warning below.                                        |
| `--output-schema <FILE>`           | **JSON Schema for the final response** — turns a worker into a typed function |
| `-o, --output-last-message <FILE>` | Final message to a file, so it never enters the orchestrator's context        |
| `--json`                           | JSONL event stream for progress                                               |
| `--ephemeral`                      | No session files on disk                                                      |

`--output-schema` and `-o` carry the design. The first makes a worker's return value _checkable_
rather than prose; the second keeps its output out of the controller's context, which is the main
cost driver in a long orchestration.

> ### `-p/--profile` is unsafe here — always pass `-m`, `-c` and `-s` explicitly
>
> `codex exec -p worker` returns exit 0. So does
> `codex exec -p definitely_not_a_real_profile_xyz`. An unknown profile name is **silently
> ignored** — no error, no warning — and the run proceeds on the configured defaults.
>
> `-p` resolves `[profiles.<name>]` tables in `config.toml`. It does **not** read
> `.codex/agents/*.toml`; those files drive the in-session multi-agent feature, not `codex exec`.
> There are no `[profiles.*]` tables in either config file here, so `-p` does nothing at all.
>
> The consequence is a policy landmine: the global default model was `gpt-5.6-sol`, so any dispatch
> that omitted `-m` — or relied on a mistyped `-p` — would have run on Sol, silently violating the
> never-Sol rule. Two mitigations are now in place:
>
> 1. `~/.codex/config.toml` default changed to `model = "gpt-5.6-luna"`, so an omitted `-m` fails
>    safe rather than failing to Sol.
> 2. **Every dispatch in this design passes `-m`, `-c model_reasoning_effort=` and `-s` explicitly.**
>    Never rely on a default or a profile.
>
> Note also that asking a model to self-report its slug is not a verification method — prompted for
> its own identity, Luna answered `gpt-5`. Trust the config and the flags, not the model's word.

**Implementer dispatch (Luna):**

```powershell
codex exec `
  -m gpt-5.6-luna `
  -c model_reasoning_effort="high" `
  -s workspace-write `
  -C "C:\Users\yoges\OneDrive\Desktop\venturecite" `
  --output-schema .superpowers\schemas\task-report.json `
  -o .superpowers\sdd\backend-remediation\task-3-report.json `
  "Read docs/superpowers/plans/2026-08-27-backend-remediation.md, Task 3 ONLY.
   Implement it exactly as written, including the tests.
   Do not touch any file the task does not name. Do not commit.
   Do not dispatch subagents."
```

**Reviewer dispatch (Terra, read-only — cannot alter the diff it judges):**

```powershell
codex exec `
  -m gpt-5.6-terra `
  -c model_reasoning_effort="max" `
  -s read-only `
  -C "C:\Users\yoges\OneDrive\Desktop\venturecite" `
  --output-schema .superpowers\schemas\review-verdict.json `
  -o .superpowers\sdd\backend-remediation\task-7-review.json `
  "Review the diff in .superpowers/sdd/backend-remediation/task-7.diff against
   Task 7 of docs/superpowers/plans/2026-08-27-backend-remediation.md.
   Verify every claim against the code. Report spec compliance and quality
   separately. Do not modify files."
```

Schemas live at `.superpowers/schemas/task-report.json` and
`.superpowers/schemas/review-verdict.json`.

---

## 5. Fixes applied to make this run

All found by executing Codex, not by reading config.

**5.1 Global config rejected** _(fixed)_ — `~/.codex/config.toml` had `service_tier = "default"`;
the CLI accepts only `fast` or `flex`. Commented out, so the server default applies.
Backup: `~/.codex/config.toml.bak-20260827`.

**5.2 Project config rejected** _(fixed)_ — `.codex/config.toml` had a flat `[agents]` settings
block, but the CLI parses `[agents]` as a map of _named agent roles_. The seven files in
`.codex/agents/*.toml` are a separate, still-valid mechanism carrying the same settings, so nothing
was lost. Backup: `.codex/config.toml.bak-20260827`.

**5.3 CLI 20 versions behind** _(fixed)_ — installed build was 0.130.0-alpha.5; npm `latest` was
0.150.0. The server advertises the `max` reasoning level that the old build could not deserialize,
so model refresh failed and `codex exec` exited 1. `codex update` refuses to help — it cannot detect
its own install method, because the binary is desktop-app-managed. Fixed with
`npm i -g @openai/codex@latest`.

> **Two installs exist.** `codex` on PATH is `AppData\Roaming\npm\codex.ps1` (0.150.0, the working
> one). The desktop app's binary is still 0.130.0-alpha.5. If the desktop app self-updates past
> 0.150, drop the npm copy (`npm rm -g @openai/codex`).

**5.4 Buffer MCP poisoned every exit code** _(fixed)_ — `BUFFER_MCP_TOKEN` is unset or expired. The
failed handshake was fatal to the MCP transport worker, and runs that produced a **correct answer
still exited 255**. Orchestration depends on exit codes meaning something, so the
`[mcp_servers.buffer]` block is commented out. Workers need nothing from Buffer. Re-enable when a
valid token exists.

**5.5 `xhigh` in two agent profiles** _(fixed)_ — see §2.

**5.6 Global default model was Sol** _(fixed)_ — `~/.codex/config.toml` had
`model = "gpt-5.6-sol"`. Combined with `-p` silently ignoring unknown profile names (§4), any
dispatch missing `-m` would have run on the one model policy forbids. Changed to
`model = "gpt-5.6-luna"` so the default fails safe.

**5.7 Sol in two agent profiles** _(fixed)_ — `reviewer.toml` and `production-safety.toml` both
specified `gpt-5.6-sol`. Both now use Terra, at `high` and `max` respectively.

---

## 6. The loop the orchestrator runs

Per task, in order:

1. **Record BASE** — `git rev-parse HEAD`.
2. **Dispatch one implementer.** Never two in parallel — they conflict in the working tree. The
   prompt names the plan file and task number only; it never pastes prior-task history.
3. **Read the report file.** On `BLOCKED`/`NEEDS_CONTEXT`, supply what is missing and re-dispatch.
   On repeated failure, escalate effort (`high` → `max`) or move Luna → Terra. Never retry the same
   configuration unchanged.
4. **Package the diff to a file** — `git diff -U10 BASE..HEAD > …/task-N.diff`. The diff never
   enters the orchestrator's context.
5. **Dispatch the reviewer read-only** against that diff path.
6. **Fix loop, max five rounds.** Rounds 1–3 resume the same implementer with the findings verbatim.
   Rounds 4–5 escalate one rung. Every round ends in a scoped re-review of the fix diff only.
7. **Ledger the outcome** to `.superpowers/sdd/backend-remediation/progress.md`.

**What the orchestrator verifies itself and never delegates:**

- Runs `npm test` and `npm run check` and reads the real output. A worker claiming green is not evidence.
- Re-queries `pg_stat_statements` after Tasks 1–6. The audit's row counts are the baseline; the fix
  is unproven until they move.
- Re-runs the Supabase advisors after Tasks 2 and 8.
- Confirms no already-applied migration file was edited.

**What stops the loop and goes to a human:** anything irreversible or destructive, anything
security-sensitive, any side effect outside the worktree (a merge, a push, a production
`DATABASE_URL` change), and a plan defect where every path forward is a guess. Task 9's cutover is
in this category by construction.

---

## 7. Guardrails

- Reviewers run `-s read-only`. Enforced by sandbox, not by instruction.
- `--dangerously-bypass-approvals-and-sandbox` is never used.
- Every agent profile carries: change only assigned files, no secret values, no subagents, no commits.
- Implementer concurrency stays at 1. Read-only reviewers and inventory agents may run in parallel —
  they take no locks on the tree.
- `.agents/skills/`, `.superpowers/`, and `*.bak-20260827` should be gitignored.
