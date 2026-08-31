# Why the open-hallucination count climbs on repeated runs

`.audit/B6/B6a-08-why-nothing-caught-it.md` recorded that one brand's
open-hallucination count rose monotonically — 35, 37, 38, 39, 40, 41, 42, 43 —
while the autopilot re-ran the same prompt set every ~18 minutes for 34 hours.
That document said plainly it could not tell, from the ledger alone, whether the
detector was non-deterministic or whether repeated runs genuinely surfaced
different model output, and left the question open.

It is the second, plus a dedup key that cannot absorb it. Neither half is a bug
in the detector.

## The mechanism

**The response text genuinely differs run to run.** Every citation engine either
grounds natively (Perplexity) or is given the OpenRouter `web_search` plugin —
see `webSearchTool` in `server/lib/modelConfig.ts` and the call sites in
`server/citationChecker.ts`. `temperature` is pinned to `0`, but temperature
fixes sampling, not input: live web results change between runs as pages are
indexed and rankings move, so the model is handed different retrieved context
and writes something different. That is inherent to measuring citations against
the live web, and the code says as much where it enables the tool.

**The dedup key hashes that unstable text.** `brand_hallucinations` is
deduplicated by the unique index `brand_hallucinations_dedup_idx` on
`(brand_id, ai_platform, md5(claimed_statement))`, created in
`migrations/0026_hardening_dedup_and_correlation.sql`. `claimed_statement` is
the judge's quotation or paraphrase of the AI's own wording
(`server/lib/hallucinationDetector.ts`). When the underlying response is worded
differently, the same underlying contradiction produces a different
`claimed_statement`, misses the exact-hash match, and inserts a new row instead
of bumping `seen_count` on the existing one.

So the count grows by roughly one per run: not a new hallucination, the same one
restated.

## What was ruled out

Checked directly rather than assumed, on the path from `citationChecker.ts`
through `hallucinationDetector.ts` to `signalsStorage.ts`:

- No `Math.random()` anywhere on the path.
- `Date.now()` appears only in latency logging and deadline arithmetic. It never
  reaches a prompt or a dedup key.
- `Set` and `Map` are used for in-memory bookkeeping, not for ordering anything
  that reaches a prompt or a persisted key.
- The judge call also pins `temperature: 0`. Given identical input it would very
  likely reproduce the same `claimed_statement`, so it is second-order — the
  input is already different before the judge sees it.
- The within-run concurrency race was closed earlier by the upsert. That is a
  different problem: duplicate inserts inside one run, not new rows across runs.

## What would fix it, and why it is not done here

The fix is to key dedup on something the judge produces stably across
paraphrases — the fact-sheet-derived `contradicting_fact` and category pair, say,
rather than the AI's own restatement. That is a product decision before it is a
code change, because it defines what counts as "the same hallucination", and it
needs a migration that collapses existing rows under the new key.

Two places change together when that is decided:

- `migrations/0026_hardening_dedup_and_correlation.sql` — the
  `brand_hallucinations_dedup_idx` definition
- `server/storage/signalsStorage.ts` — the `ON CONFLICT` target

The migration was deliberately not written. Validating a backfill that collapses
real duplicate rows requires running it against real duplicate data, and writing
one that has never been executed would be exactly the "looks done, isn't proven"
work this repository's rules forbid.

## What to do with the number meanwhile

Treat a rising open-hallucination count on a brand with repeated runs as
suspect rather than as signal. Compare `seen_count` and
`contradicting_fact` across rows before concluding anything has got worse.
