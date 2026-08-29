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

## Symptom 2: 34 duplicate alerts to one user

The loop was not quiet. It sent the brand's owner 34 `new_hallucinations`
alerts between 2026-08-28 06:50 and 2026-08-29 05:45 - one per run, each
re-reporting the same finding.

For scale, `alert_history` holds 145 `new_hallucinations` rows across all
brands since 2026-05-27. This single brand's loop produced 34 of them, 23% of
that alert type's entire history, in one day.

The signal existed and pointed at the right brand. Nothing connected "the same
alert 34 times" to "something is looping".

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
2. **A repeat-run circuit breaker.** The autopilot path bypassed the existing
   cadence gate entirely: `isBrandDueForCitation` reads `lastAutoCitationAt`,
   and the looping brand's was `null` the whole time, because only the
   scheduler stamps it and the autopilot never does. A bound on runs-per-brand
   per window, enforced where the run is created rather than where it is
   scheduled, would have stopped this at run 2 or 3.
3. **Duplicate-alert suppression.** Sending the same alert type for the same
   brand 34 times in a day is a bug on its own terms, independent of the loop
   that caused it here.

Item 2 is the one that would have prevented this incident. Item 1 is what
would have made it visible in minutes rather than 34 hours.
