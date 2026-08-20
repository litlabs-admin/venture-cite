# Tour Engine — Authoring Guide

## Adding a new tour

1. Create `client/src/tours/<scope>/<id>.tour.ts` exporting a `TourConfig`.
2. Add the ID to `KNOWN_TOUR_IDS` in `server/lib/tourRegistry.ts`.
3. Add the import + entry to `client/src/tours/registry.ts`.
4. Add `data-tour-id="..."` attributes to every target referenced by your steps.
5. Run `npm run verify:tours` — fix any missing targets.
6. Run `npm run check` and `npm test`.

## Versioning
- Bump `version` when content materially changes (new step, target moved, copy rewritten).
- Cosmetic copy fixes do NOT bump.
- Bumping causes the tour to re-fire for users who completed an older version.

## Copy guidelines
- Second-person, present tense, action-oriented.
- ≤80 chars per line, ≤2 lines per step.
- No jargon. Assume the reader is opening this product for the first time.
- Use function-style content for state-dependent copy: `(ctx) => "You have " + ctx.counts.brands + " brands"`.

## Preview without deploying
- Append `?previewTour=<tourId>` to any URL while logged in as a `@litlabs.io` user.
- The tour fires regardless of state. Useful for QA.

## PR review
- Every PR that touches `client/src/tours/` requires a non-engineer reviewer (founder, support, marketing).
