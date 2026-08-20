# Tour Engine — Runbook

## "Tour didn't fire for a user"
1. Check `users.onboarding_state.tours` for that user — is it suppressed (`perUserSuppressed`)?
2. Check `tours.global.completedAt` (or `perBrand[id][tourId].completedAt`) — already completed at current version?
3. Check `tour_events` — are `tour_step_target_missing` events present? Means a `data-tour-id` is missing in the deployed bundle.
4. Check Sentry for `shepherd-init` or `tour.state.patch_failed` errors in that user's session.

## "Lots of `tour_step_target_missing` events"
- A target was renamed/removed without updating tour configs.
- CI verifier should have caught this — check why the PR bypassed it.
- Short-term: bump tour version + remove the broken step.

## "Auto-fire count for global welcome diverges from new-signup count"
- Backfill logic for pre-launch users: users with `guidedSeen=true` get `global` backfilled. Expected to suppress tour for them. Should be near zero after 30 days.
- Otherwise: orchestrator misfire, check `App.tsx` mount.

## "User reports duplicate auto-fires"
- Multi-tab is explicit out-of-scope for v1. Document and dismiss.

## "Suppression rate >30% for tour X"
- The tour itself is the problem. Trigger content review.
- Common causes: tour too long, tour fires on a page where users want to act not learn, copy doesn't match what user sees.

## Hard rollback
- Set `VITE_TOUR_ENGINE_ENABLED=false`, redeploy. Engine disappears.
- Optionally: `TRUNCATE tour_events`. Optionally: `UPDATE users SET onboarding_state = onboarding_state - 'tours'`.
