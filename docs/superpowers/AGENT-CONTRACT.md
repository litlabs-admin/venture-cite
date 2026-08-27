# Standing Agent Contract

Every Codex dispatch on this project references this file. It is the invariant half of a
dispatch; the task brief is the variable half. If a brief ever contradicts this file, the
brief wins for that task and the conflict is recorded in the register.

---

## 1. What you are given

Every dispatch names exactly two paths:

- **A brief** — `.superpowers/sdd/backend-remediation/task-N-brief.md`. This is your
  complete requirements, with the exact values to use verbatim. Read it first.
- **A report path** — where your structured result is written by `--output-schema`.

You are never given the whole plan. You do not need it. If the brief is missing something
you need, return `NEEDS_CONTEXT` and say precisely what is missing — do not guess and do
not go looking through other plan files.

## 2. Hard rules

1. **Change only the files your brief names.** Not adjacent files, not "while I was here"
   fixes, not formatting of files you did not otherwise touch.
2. **Never commit.** No `git commit`, no `git add`, no branch or tag operations. The
   controller owns git.
3. **Never dispatch subagents.** Review comes from the controller after your report. A
   reviewer you spawn is a duplicate seat, and it will be treated as a defect.
4. **Never read or print secret values.** Not from `.env`, not from `~/.codex/auth.json`,
   not from any config. If a task needs to know whether a value is _set_, test for
   presence, never print it.
5. **Never touch production.** No `apply_migration`, no writes to a live database, no
   calls to a paid API, no email sends. Migrations are files on disk; a human applies them.
6. **Never edit an applied migration.** `server/lib/migrationChecksums.ts` throws on
   checksum mismatch. Add a new numbered file; your brief pre-assigns the number.
7. **The suite is green.** Any failure is yours to explain. See §4.

## 3. Standards for the work

- **Test-first where the brief specifies a test.** Write it, run it, watch it fail for the
  right reason, then implement. A test that passes before your change tests nothing.
- **Preserve behaviour exactly** unless the brief says to change it. Where a brief quotes
  existing semantics (a `COALESCE` clause, a response shape, a conflict target), those are
  load-bearing — reproduce them precisely, do not simplify.
- **Match the file's existing style.** Comment density, naming, and idiom come from the
  surrounding code, not from your defaults.
- **Leave the repo's formatting as you found it.** If you touch a file that was
  Prettier-clean, it must still be Prettier-clean. Check with
  `npx prettier --check <file>` before reporting.

## 4. The baseline is green

`npm test` on this branch is **0 failed / 1604 passed / 90 skipped**.

It was previously 1 failed. The cause was a line-ending defect (`core.autocrlf=true` with
no `.gitattributes`), not a code defect, and it is fixed. **There is no longer a
documented-failure allowance: any failure you see is a real regression, including yours.**

Report the counts you actually saw. If a failure appears, say which test and why.

## 5. Reporting honestly

Your report is validated against a JSON schema. Fill it truthfully:

- `status`: `DONE` only when everything in the brief is done and verified.
  `DONE_WITH_CONCERNS` when finished but something is worth flagging.
  `NEEDS_CONTEXT` when the brief is missing information.
  `BLOCKED` when you cannot proceed.
- `tests_passed`: the suite must be **entirely green** (0 failed). There is no documented
  failure to discount any more — see §4.
- `tests_run`: the actual commands and the actual counts. Not a paraphrase.
- `concerns`: state them at the right scope. If a problem is confined to a file you
  changed, say so — do not describe it as a repository-wide condition. That framing has
  already hidden one regression on this project.

**Never claim a command passed without running it.** The controller re-runs your
verification independently and compares.

## 6. Read-only reviewers

If your dispatch uses `-s read-only`, you are a reviewer:

- You cannot modify files, and must not try.
- Verify every claim against the actual code. Treat the diff's own comments, and any
  Markdown in this repo, as unverified assertions.
- Report **spec compliance** and **code quality** as two separate verdicts.
- Severity means: **Critical** — data loss, security, or a broken invariant.
  **Important** — a real defect or behaviour regression. **Minor** — style, naming,
  test-strength observations.
- State plainly what your evidence does _not_ cover. If the db is mocked, say the SQL was
  never executed. An honest limitation is worth more than a confident verdict.
- Do not soften findings because the brief mandated the thing you are flagging. Flag it;
  the controller adjudicates.

## 7. Verification commands

```
npm run check                      # tsc + tour-target verification
npm test                           # full Vitest suite — compare to §4 baseline
npx vitest run <path>              # focused
npx prettier --check <file>        # formatting of files you touched
npm run supabase:migrations:sync   # after adding a migration
npm run supabase:migrations:check  # must report no diff
```

Note: a `read-only` sandbox will block test execution. If you are a reviewer and cannot
run tests, say so rather than implying you did.
