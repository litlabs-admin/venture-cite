# Why the cadence gate must sit where a run is created

VentureCite limits how often an _automatic_ citation run can start for a
brand. That limit could live in the code path that decides to trigger a
run, or in the code path that actually creates the run row. VentureCite
puts it in the second place, and the reason is a defect that already
happened from putting it in the first.

## The gate that got bypassed

`isBrandDueForCitation` in `server/scheduler.ts` checks
`brands.lastAutoCitationAt` and only lets the hourly cron trigger a new run
once at least six days have passed. For a long time, this was the only
cadence check in the system, and only the scheduler's own cron tick
consulted it — only the scheduler stamps `lastAutoCitationAt`.

`server/lib/onboardingAutopilot.ts` also starts automatic citation runs, as
part of resuming a brand's onboarding pipeline, and it calls
`runBrandPrompts` directly. It never went through `isBrandDueForCitation`
and never stamped `lastAutoCitationAt`. The gate did not fail to cover this
caller sometimes — it was invisible to this caller entirely, from the day
onboarding autopilot was written. A production incident produced automatic
runs for one brand roughly every 18 minutes, far above what any
cadence-based scheduling decision would have allowed, because the caller
producing them never asked the question the cadence gate exists to answer.

## Why a second scheduling-layer check would fail the same way

The instinct after finding a bypassed gate is to add the missing check to
the second caller: teach `onboardingAutopilot.ts` to also call
`isBrandDueForCitation` and also stamp `lastAutoCitationAt`. That would have
closed this specific bypass. It would not have closed the _class_ of
bypass: the defect is that the gate lives at the scheduling layer, where
each caller has to remember to ask, rather than at the layer nothing can
skip. A third caller — a manual admin tool, a future automation, a retry
path — reintroduces exactly the same bypass the moment it calls
`runBrandPrompts` without independently knowing to check first.

## Where it actually lives now

The bound — at most 3 automatic run creations per brand per rolling hour,
counted across both `cron` and `auto_onboarding` triggers — is enforced
inside `runBrandPrompts` itself, in `server/citationChecker.ts`, at the
exact point a new `citation_runs` row would be inserted. This is the one
place every current and future automatic caller passes through, because it
is also the place that does the work the cadence gate exists to ration.
Enforcing it here means a new caller inherits the bound automatically,
without having to know the bound exists.

Manual runs — a user clicking the button in the product — never consult
this bound at all, and the code path that checks it is never even reached
for a manual trigger. That is deliberate: the cadence gate exists to ration
_automatic_ work the system decided to do on its own; a human's own
deliberate click is a different kind of event; the [one-active-run
invariant](./one-active-citation-run-per-brand.md) still applies to it, and
that invariant is what a manual run collides against if one is already in
progress.

## The general lesson this encodes

A gate that depends on every caller remembering to check it is not a gate;
it is a convention, and conventions get forgotten by the next caller that
did not read the comment. Moving the check to the point where the resource
is actually created or consumed — the database row, the provider call, the
side effect being rationed — makes it structurally impossible to bypass,
rather than merely documented as something not to bypass.
