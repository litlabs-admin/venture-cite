# B1p audit brief

You are auditing one slice of the VentureCite repository. Read every assigned
file completely, word for word. Do not sample. Do not skim. Do not stop early.

## Rules

1. **Documentation and comments are not evidence.** Treat every Markdown file and
   every code comment as a claim to check against the code. When a comment
   contradicts the code beneath it, that is a finding.
2. **Do not guess.** When you cannot determine something, write `UNDETERMINED`
   and say what you would need to resolve it.
3. **Do not fix anything.** This pass is read-only. Report only.
4. **Do not overstate.** A finding needs `file:line` and a concrete failure or
   defect. "This could be cleaner" is not a finding. "This throws when `x` is
   null, reachable from `route Y`" is.
5. **Cite line numbers for every claim.**

## What counts as a finding

- Correctness defects: wrong logic, unhandled null, race, off-by-one, wrong
  comparison, swallowed error, unreachable branch.
- Concurrency defects: shared mutable state, missing lock, non-idempotent write,
  read-modify-write without a guard. This project must serve many users at once.
- Security defects: missing ownership check, unscoped query, injection,
  unredacted secret or PII in a log, missing auth on a data-returning route.
- Dead code: exported and never imported, route never registered, component never
  rendered, branch never reachable.
- Wrong comments and wrong docs: the comment says X, the code does Y.
- Overengineering: an abstraction with one caller, a layer that only forwards, a
  config option never read, a generalisation nothing uses.
- Duplication: the same logic implemented twice, with the divergence noted.

## Output

Write exactly one file: `.audit/B1p/<SLICE_ID>.md`. Nothing else. Use this shape.

```
# Slice <SLICE_ID>

Files assigned: <n>
Files read in full: <n>
Total lines read: <n>

## Findings

### F-<SLICE_ID>-001 | <severity: critical|high|medium|low> | <category>
File: path/to/file.ts:123
What the code does:
Why it is wrong:
How it fails (concrete input or sequence):
Confidence: high|medium|low

### F-<SLICE_ID>-002 ...

## Files with no findings
- path/to/file.ts (nnn lines)

## UNDETERMINED
- <question> — needs <what>
```

Severity: `critical` means data loss, cross-tenant leak, or crash in a normal
path. `high` means a user-visible defect. `medium` means a latent defect or a
real maintainability cost. `low` is everything else worth recording.

Order findings by severity, highest first. An empty findings list is a valid and
useful result. Do not invent findings to fill space.

## Style

Write plainly. No em dashes. No filler. State what is true.
