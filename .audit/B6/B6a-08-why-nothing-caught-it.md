# Why the autopilot loop ran for 34 hours unnoticed

The fix for the loop is in `569f746`. This records why nobody saw it, which is
a separate defect and the more expensive one: the loop was not silent. It
produced two visible symptoms for 34 hours and neither reached anyone.

## Symptom 1: spend, unmeasurable by construction

`api_costs.est_cost_cents` is an `integer`, and cost is rounded per call. Any
call costing under half a cent records zero. Measured over the incident window:

| Model                        | Calls | Rows recording zero |
| ---------------------------- | ----: | ------------------: |
| google/gemini-3.1-flash-lite |  1178 |  1178 (all of them) |
| deepseek/deepseek-v4-flash   |  1177 |  1177 (all of them) |
| perplexity/sonar             |  1177 |  1177 (all of them) |
| openai/gpt-5.6-luna          |  1182 |          1033 (87%) |
| anthropic/claude-haiku-4.5   |  1178 |           359 (30%) |
| x-ai/grok-4.3                |  1176 |                   0 |

Three of six engines have recorded exactly zero for their entire history. The
prices are present and correct in `server/lib/llmPricing.ts`; the column type
is the defect. Any dashboard or query built on this table understates the
total, and understates it most for the cheapest-per-call, highest-volume work,
which is exactly the shape a runaway loop produces.

## Symptom 2: 34 alerts to one user in a day

The loop was not quiet. It sent the brand's owner 34 `new_hallucinations`
alerts between 2026-08-28 06:50 and 2026-08-29 05:45, one per run.

CORRECTION, verified 2026-08-30. An earlier revision of this document called
these duplicates and recommended suppressing them. That was wrong, and the
error came from reading a `min(message)` sample taken across ALL brands and
assuming it was this brand's repeated text.

They are not duplicates. This brand's messages climb monotonically:

    35 open total -> 37 -> 38 -> 39 -> 40 -> 41 -> 42 -> 43

and `metrics_history` shows the snapshot rising in step (39, 40, 41, 42). The
alert logic in `server/lib/runChangeAlerts.ts` is correct: `recordCurrentMetrics`
writes the snapshot BEFORE `detectHallucinationsForRun`, so
`live unresolved - snapshot` is genuinely what that run newly flagged. Each of
the 34 alerts reported real new findings. There is no defect here to fix.

What the data does show is worth recording separately: re-running the same
prompt set roughly every 18 minutes produced about one NEW unresolved
hallucination per run, taking the brand from single digits to 43 open. Either
the detector is non-deterministic across identical inputs, or repeated runs
genuinely surface different model output. This audit cannot distinguish those
from the ledger alone, and it is a detector-quality question rather than a
lifecycle defect, so it is noted and not acted on.

For scale, `alert_history` holds 145 `new_hallucinations` rows across all
brands since 2026-05-27. This single brand's loop produced 34 of them, 23% of
that alert type's entire history, in one day - accurate alerts about state
that only existed because of the loop.

## The actual gap: no operational alerting exists

`alert_settings` and `alert_history` are a product feature, not monitoring.
Every alert type is a brand outcome for the customer:

    new_hallucinations   145 rows
    visibility_drop       27 rows
    prompts_lost           3 rows

All `sent_via = 'in_app'`. `alert_settings` has **0 rows**, so no threshold is
configured anywhere; the alerts above fire from hard-coded product logic.

There is no category for operational conditions. Nothing watches run frequency
per brand, job retry counts, queue depth, or spend. A brand running 114
citation runs in 34 hours is not a condition the system can express, let alone
raise.

## What this argues for

Ranked by cost to build against incidents prevented:

1. **Make cost measurable.** `est_cost_cents integer` to a numeric type, or
   store tenths of a cent. Without this, no spend-based check can work,
   because the input is wrong for the cheap-and-frequent case that matters.
   DONE in `0eac2a3` - the column is `numeric(12,6)` and `estimateCostCents`
   keeps six decimal places. Historical rows are still 0 and are recomputable;
   the query is in B6a-11 and has deliberately not been run.
2. **A repeat-run circuit breaker.** The autopilot path bypassed the existing
   cadence gate entirely: `isBrandDueForCitation` reads `lastAutoCitationAt`,
   and the looping brand's was `null` the whole time, because only the
   scheduler stamps it and the autopilot never does. A bound on runs-per-brand
   per window, enforced where the run is created rather than where it is
   scheduled, would have stopped this at run 2 or 3.
   DONE in `eee641b` - three automatic creations per brand per rolling hour,
   enforced in `runBrandPrompts`, manual runs exempt.
3. ~~Duplicate-alert suppression.~~ WITHDRAWN. The alerts were not duplicates;
   see the correction under Symptom 2. There is nothing to fix here.

Item 2 is the one that would have prevented this incident. Item 1 is what
would have made it visible in minutes rather than 34 hours. Both are now in
place, so a recurrence is bounded at three runs and measurable while it
happens.

## Still missing

Nothing in items 1 and 2 raises a signal to a human. The bound refuses the
run and writes a `logger.warn`; the ledger now records the true value but
nothing reads it. Operational alerting - a category `alert_settings` has no
concept of - remains absent, so the next unbounded condition of a different
shape is still found by someone noticing, not by the system saying so.
