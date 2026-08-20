# In-App Tour Engine — Design Spec

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

**Date:** 2026-05-05
**Status:** Draft for review
**Owner:** owner@example.test
**Target ship:** v1, content-complete, 4–5 weeks

---

## 1. Goal

Production-grade in-app guided tour system covering VentureCite's 18 sidebar pages and ~45 tabs. Helps real users understand features, learn navigation, perform key actions, and reach value quickly — without overwhelming experienced users or rotting silently when the codebase changes.

**v1 content scope:**

- 1 auto-firing global welcome tour (5–7 steps).
- 6 manual-replay page tours (Dashboard, Brands, AI Visibility, Citations, GEO Tools, AI Intelligence).
- 10 contextual nudges (single-step coach marks at high-value moments).
- Chatbot fallback for the long tail (any feature without a dedicated tour).

---

## 2. Architecture overview

### High-level

```
CLIENT (React + Wouter + TanStack Query)
  TourConfigs (TS)  ─┐
  data-tour-id ──────┤
                     ├──> TourOrchestrator (1 instance, app-root)
                     │      ├─ subscribes: route, brandId, tourState, nudge predicates
                     │      ├─ activeTourRef (StrictMode guard)
                     │      └─ on brand-switch: cancel + re-evaluate
                     │
                     ├──> shepherdAdapter (Shepherd.js wrapper)
                     │      ├─ runTour(config, ctx, mode)
                     │      ├─ waitForTarget (MutationObserver, 3s timeout)
                     │      └─ emits events to eventBuffer
                     │
                     ├──> eventBuffer
                     │      ├─ flush every 5s
                     │      ├─ flush immediately on tour_completed/tour_suppressed
                     │      └─ sendBeacon on beforeunload
                     │
                     └──> copyResolver (string | (ctx) => string)

SERVER (Express + Drizzle + Postgres)
  /api/tours/state    GET, PATCH        (whitelisted ops)
  /api/tours/events   POST              (batched, idempotent)
  /api/admin/tours/metrics  GET         (admin-gated)
  Daily cron: DELETE FROM tour_events WHERE occurred_at < now() - 90 days

POSTGRES
  users.onboarding_state.tours (JSONB extension)
  tour_events (new table, 90d window)
```

### Tech choices (locked)

- **Tour library:** Shepherd.js ^14.0.0 (mobile-friendly, no React-version coupling, imperative API).
- **State:** `users.onboarding_state.tours` JSONB extension. No new state table.
- **Events:** new `tour_events` table, 90-day rolling retention via in-process cron.
- **Targeting:** `data-tour-id` attributes + CI verifier.
- **Configs:** TypeScript files in `client/src/tours/`.

### Scope boundaries

- Tours run on routes the user can already access — auth + brand-ownership are pre-existing concerns.
- Chatbot tutor is the fallback for any un-toured page (the "?" button opens it pre-prompted).
- Mobile (<768px): coach marks degrade to bottom-sheets. Acceptable v1 quality.
- i18n: English-only v1. Resolver supports locales for v2.
- Multi-tab sync: explicitly out of scope. Duplicate auto-fire across tabs is accepted.
- PostHog / external analytics: out of scope. Schema is migration-ready.
- A/B testing of copy: out of scope. Resolver supports it for v2.
- DB-backed copy overrides: out of scope. Resolver supports it for v2.

### Eight silent-failure modes designed-out

1. **SPA route changes** — orchestrator subscribes to Wouter `useLocation`, re-evaluates on every transition.
2. **Tour vs. data race** — `waitForTarget` per step (default true), 3s timeout, `MutationObserver` on `document.body`.
3. **Brand switch mid-tour** — orchestrator listens for brand change, calls `Shepherd.cancel()`, emits `tour_abandoned` with reason `"brand_switched"`.
4. **Multi-tab** — explicit out-of-scope, documented.
5. **Tab crash mid-tour** — `eventBuffer` flushes immediately on `tour_completed`/`tour_suppressed` and via `navigator.sendBeacon` on `beforeunload`.
6. **Shepherd CSS bleed** — Shepherd theme imported into `tour-engine.css`, all selectors prefixed with `[data-tour-engine]` via PostCSS. Z-index `--tour-overlay-z: 60` (above Radix Dialog 50, below toasts 100).
7. **StrictMode double-fires** — `activeTourRef`; auto-fire effect bails if a tour is already active.
8. **Survivorship bias** — `tour_suppressed` is a tracked metric; admin dashboard surfaces suppression rate alongside completion rate.

---

## 3. State model

### Storage

`users.onboarding_state.tours` (JSONB sub-tree, additive to existing onboarding flags):

```ts
{
  global: { v: 1, completedAt: "..." },
  perUserSuppressed: ["mentions", "citations"],   // includes "*" for wildcard
  perBrand: {
    [brandId]: {
      mentions:   { v: 1, completedAt: "..." },
      citations:  { v: 1, skippedAt: "..." }
    }
  }
}
```

### Three independent entry points per tour

1. **Auto-fire (state-gated):**
   - If `perUserSuppressed` includes the tour ID (or `"*"`) → never auto-fire.
   - Else if `perBrand[currentBrandId][tourId].completedAt` exists at the current version → don't fire.
   - Else fire automatically on the trigger condition (route visit, predicate, etc.).
2. **"?" button manual replay (always on):**
   - Every page header has a "?" icon. Click runs the tour, ignoring all state.
   - Replay does **not** write completion state.
3. **"Skip and don't show again":**
   - Available on every auto-fired tour. Writes `perUserSuppressed`.
   - Manual replay still works after this.

### State writes per event

| Event                      | Writes state? | Field                                          |
| -------------------------- | ------------- | ---------------------------------------------- |
| `tour_auto_fired`          | No            | —                                              |
| `tour_manual_replayed`     | No            | —                                              |
| `tour_step_viewed`         | No            | —                                              |
| `tour_completed` (auto)    | Yes           | `global` or `perBrand[id][tourId].completedAt` |
| `tour_completed` (manual)  | No            | —                                              |
| `tour_skipped`             | Yes           | same path, `skippedAt`                         |
| `tour_suppressed`          | Yes           | `perUserSuppressed += tourId`                  |
| `tour_abandoned`           | No            | —                                              |
| `tour_step_target_missing` | No            | —                                              |

State writes use whitelisted PATCH ops (`markCompleted`, `markSkipped`, `suppress`, `clearBrand`). Server validates via Zod, idempotent at the JSON path.

### Brand-delete cascade

Brand-delete handler strips `state.perBrand[brandId]` after the existing cascade — one new line in `databaseStorage.ts`.

### Backfill for pre-launch users

On first `GET /api/tours/state` after launch: if `users.onboarding_state.guidedSeen === true` and `tours.global` is unset, server backfills `tours.global = { v: 1, completedAt: user.createdAt }`. One-time logic in the GET handler. Removed after 30 days.

---

## 4. Components

### Server (4 new + 2 modifications + 1 migration)

1. **`migrations/00XX_tour_engine.sql`** — creates `tour_events` table with 11-column schema, indexes, unique constraint on `id`. Single transaction.
2. **`server/routes/tours.ts`** — `GET/PATCH /api/tours/state`, `POST /api/tours/events`, `GET /api/admin/tours/metrics`. ~250 LOC.
3. **`server/lib/tourRegistry.ts`** — `KNOWN_TOUR_IDS`, `KNOWN_EVENT_TYPES`. Single source of truth. ~50 LOC.
4. **`server/scheduler.ts`** (modify) — add daily retention cron (`DELETE FROM tour_events WHERE occurred_at < now() - 90 days`).
5. **`server/databaseStorage.ts`** (modify) — `getTourState`, `patchTourState`, `recordTourEvents`. Brand-delete handler clears `perBrand[brandId]`.
6. **`shared/schema.ts`** (modify) — Drizzle table for `tour_events`.

### Client (10 new + ~6 modifications)

1. **`client/src/tours/types.ts`** — `TourConfig`, `TourStep`, `TourContext`, `TourTrigger`. `content: string | (ctx) => string`. `waitForTarget: boolean` (default true), `waitTimeoutMs` (default 3000).
2. **`client/src/tours/registry.ts`** — `TOURS: Record<string, TourConfig>` master registry.
3. **`client/src/tours/global-welcome.tour.ts`** — the auto-firing tour, 5–7 steps.
4. **`client/src/tours/pages/{dashboard,brands,ai-visibility,citations,geo-tools,ai-intelligence}.tour.ts`** — 6 manual-replay tours.
5. **`client/src/tours/nudges/*.nudge.ts`** — 10 single-step contextual nudges.
6. **`client/src/tours/engine/TourOrchestrator.tsx`** — single component, app-root mount, ~200 LOC.
7. **`client/src/tours/engine/shepherdAdapter.ts`** — Shepherd wrapper with `runTour(config, ctx, mode)`, `waitForTarget`, event emission. ~150 LOC.
8. **`client/src/tours/engine/eventBuffer.ts`** — buffer, flush rules, beacon, retry/drop, 200-event cap. ~80 LOC.
9. **`client/src/tours/engine/copyResolver.ts`** — `getCopy(tourId, stepId, ctx) => string`. v1 pass-through. ~30 LOC.
10. **`client/src/tours/engine/tour-engine.css`** — scoped Shepherd theme + `--tour-overlay-z`.
11. **`client/src/components/PageHeaderHelp.tsx`** — "?" icon. Click → orchestrator manual replay. Falls through to chatbot pre-prompt for un-toured routes.
12. **`client/src/components/Sidebar.tsx`** (modify) — add `data-tour-id` on nav group headers, brand selector, chatbot button.
13. **6 page components** (modify) — embed `<PageHeaderHelp tourId="..." />` + `data-tour-id` on referenced elements.
14. **`client/src/lib/queryClient.ts`** (modify) — `useTourState()` hook.
15. **`client/src/pages/settings.tsx`** (modify) — "Don't auto-show tours" toggle (writes `perUserSuppressed: ["*"]`).
16. **`client/src/App.tsx`** (modify) — mount `<TourOrchestrator />` once, inside auth gate, outside route switch.

### CI

- **`scripts/verify-tour-targets.ts`** — loads `client/src/tours/registry.ts`, walks every step, greps `client/src/**/*.tsx` for matching `data-tour-id="..."`. Fails on missing target. Wired into `npm run check` and Husky pre-commit.

### Totals

~32 new files, ~10 modifications, ~2,000–2,500 LOC.

---

## 5. Data flow

### Flow 1 — Auto-fire (global welcome, first login)

App boot → orchestrator fetches state → evaluates `global-welcome` tour → eligible → `activeTourRef = "global-welcome"` → `shepherdAdapter.runTour(config, ctx, 'auto')` → emit `tour_auto_fired` → for each step: `waitForTarget` → render → `tour_step_viewed` → user advances → `tour_step_advanced` (with dwell_ms) → final step → `tour_completed` (immediate flush) → PATCH state `markCompleted` → cache invalidated → orchestrator idle.

### Flow 2 — Manual replay ("?")

User clicks "?" → registry lookup → `orchestrator.replay(tourId)` → cancel any active tour → `runTour(config, ctx, 'manual')` → `tour_manual_replayed` → run all steps → `tour_completed (mode=manual)` → **no state write** (replay is read-only on completion state) → events flushed.

### Flow 3 — Contextual nudge (first scan completes)

Mentions tab renders first result → orchestrator predicate evaluator polls on route+state change → `firstScanComplete` predicate true → `runTour(nudge, ctx, 'auto')` single step → `waitForTarget('mentions.firstResult')` → render coach mark → user dismisses → `tour_completed` → PATCH `state.perBrand[brandId]['first-scan-complete'] = { v:1, completedAt }` → predicate now false → never fires for this brand again.

Brand-switch mid-nudge → cancel + `tour_abandoned (reason="brand_switched")` → no state write → re-evaluate for new brand.

### Flow 4 — Skip and don't show again

User clicks button mid-tour → `tour_suppressed` (immediate flush) → PATCH `op="suppress"` → server appends to `perUserSuppressed` (idempotent) → cancel tour → cache invalidated → tour never auto-fires again → "?" still works.

### Flow 5 — Tab close mid-tour (sendBeacon)

`beforeunload` → `eventBuffer.flushSync()` → synthesize `tour_abandoned (reason="unload", stepIndex)` → `navigator.sendBeacon('/api/tours/events', batch)` → server processes idempotent upsert → no state write → next session re-evaluates from current state.

### Concurrency

- **Single active tour per session.** `activeTourRef` enforces serialization.
- **Event ordering best-effort.** Analytics use `occurred_at` (client time), not `server_received_at`.
- **State writes last-write-wins.** Two-tab race → one PATCH wins, other is no-op.

---

## 6. Error handling

Default user-visible behavior on failure: **silence**. The page works normally. Tours that fail to start, advance, or persist do so invisibly. The only exception is `getCopy()` returning the fallback string `"(content unavailable)"`, which renders as visible coach-mark text.

### Network / API

| Failure                        | System                                                  | Telemetry                                |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------- |
| `GET /api/tours/state` fails   | Withhold auto-fire until state loads. TanStack retries. | `logger.warn`. No Sentry.                |
| `PATCH /api/tours/state` fails | One retry, then drop. Tour re-fires next session.       | `logger.error` + Sentry.                 |
| `POST /api/tours/events` fails | One retry, then drop batch.                             | `logger.warn`. Sentry on >5 consecutive. |
| `sendBeacon` fails on unload   | Lost. Acceptable.                                       | None — beforeunload can't reliably log.  |

### DOM targeting

| Failure                           | System                                         | Telemetry                            |
| --------------------------------- | ---------------------------------------------- | ------------------------------------ |
| Target never appears (3s timeout) | Skip step, continue.                           | `tour_step_target_missing` event.    |
| Target hidden (zero-area)         | Treat as missing.                              | Same.                                |
| Two elements same ID              | First match wins.                              | Author error. Documented limitation. |
| Target unmounts mid-step          | Shepherd repositions; cancel after 1s missing. | `tour_step_target_lost`.             |

### Engine internals

| Failure                | System                                    | Telemetry                             |
| ---------------------- | ----------------------------------------- | ------------------------------------- |
| Shepherd init throws   | Log, abort, clear ref.                    | Sentry `tags.source="shepherd-init"`. |
| Malformed step         | Skip step. Malformed config: don't start. | Zod in dev. Sentry in prod.           |
| `getCopy()` throws     | Fallback `"(content unavailable)"`.       | Sentry.                               |
| Predicate throws       | Treated as `false`.                       | Sentry.                               |
| StrictMode double-fire | `activeTourRef` bails.                    | None.                                 |
| Brand switch           | Cancel + `tour_abandoned`.                | Standard event.                       |
| Logout                 | Orchestrator unmount cleanup cancels.     | `tour_abandoned (reason="logout")`.   |

### State integrity

| Failure               | System                               | Telemetry             |
| --------------------- | ------------------------------------ | --------------------- |
| Malformed PATCH op    | 400.                                 | Server `logger.warn`. |
| Blob shape corruption | Parse failure → default empty shape. | Sentry.               |
| Concurrent PATCH      | `jsonb_set` atomic, last-write-wins. | None.                 |

### Idempotency

- Same event UUID twice → server upsert no-op.
- UUID collision across users → astronomically rare, accepted.
- Out-of-order arrivals → ordered by `occurred_at` in queries.

### Performance

- EventBuffer cap: 200; oldest dropped on overflow.
- MutationObserver: one active per step, scoped to body, disposed on step complete.
- Shepherd start delayed by one `requestAnimationFrame` after target found.
- `tour_events` retention: 90 days via daily cron.

### Sentry capture rules

**Capture:** state PATCH failures, Shepherd init throws, `getCopy()`/predicate throws, blob corruption, >5 consecutive event-batch failures.
**Log only:** single batch failure, target missing, state fetch failure, buffer overflow.
**Silent:** beacon failure, duplicate `data-tour-id`.

---

## 7. Testing strategy

**4 layers, ~58 automated tests + CI verifier + manual checklist.**

### Unit (Vitest, ~25 tests)

- `tourOrchestrator.eligibility.test.ts` (~10) — `shouldAutoFire` matrix.
- `copyResolver.test.ts` (~3) — string, function, throw fallback.
- `eventBuffer.test.ts` (~6) — accumulate, timer flush, immediate flush, cap, UUID, retry/drop.
- `tourState.zod.test.ts` (~3) — valid, malformed → empty, unknown IDs pruned.
- `tourEvents.routes.test.ts` (~3) — enum validation, registry validation, idempotency.

### Integration (Vitest + real Postgres, ~12 tests)

- `tours.routes.test.ts` (~8) — GET default, PATCH ops, ownership scoping, validation.
- `tourEvents.test.ts` (~3) — batch, idempotent upsert, admin metrics.
- `tourRetention.test.ts` (~1) — cron deletes >90d, retains <90d.

### Component (Vitest + Testing Library + mocked Shepherd, ~15 tests)

- `TourOrchestrator.test.tsx` (~6) — mount, auto-fire, suppress, route cancel, brand cancel, StrictMode idempotency.
- `PageHeaderHelp.test.tsx` (~4) — render, replay, chatbot fallback, no state write.
- `SuppressFlow.test.tsx` (~3) — suppress writes state, blocks auto-fire, replay still works.
- `PreviewParam.test.tsx` (~2) — admin yes, non-admin no.

### E2E (Playwright, ~6 scenarios)

1. Happy path — global welcome.
2. Manual replay.
3. `waitForTarget` race (target appears late).
4. `waitForTarget` timeout (target never appears).
5. Brand switch mid-tour.
6. Tab close mid-tour (beacon).

### CI

- All unit + integration + component tests on every PR.
- `verify-tour-targets.ts` in `npm run check` and Husky pre-commit.
- Playwright e2e on main branch only.

### Manual checklist

In `docs/superpowers/tours/manual-test-plan.md`:

- Global welcome: signup, persistence, settings toggle.
- Each page tour: "?" visible, fires, no skipped steps, empty/populated copy.
- Each nudge: per-(user,brand) re-fire correctness.
- Mobile (<768px): legibility, tap targets ≥44px.
- Suppression: works, replay still works.
- Admin metrics: numbers match seeded data.

### Fixtures

`tests/fixtures/tourState.ts`: empty, completedGlobal, suppressedMentions, wildcardSuppressed, multiBrand.

### Out of scope

Shepherd internals, deep browser-matrix testing, A/B resolver, DB override resolver, visual regression.

---

## 8. Rollout & migration

### Coexistence

Tour engine ships **alongside** the existing checklist (`onboardingSteps.ts`, `SidebarOnboarding`, `OnboardingProgressRing`) and the chatbot tutor. No replacement in v1. State namespaced under `users.onboarding_state.tours` — additive, no collision with existing keys (`guidedSeen`, `checklistDismissed`, etc.).

### Migration

One DB migration: `migrations/00XX_tour_engine.sql` creating `tour_events` table + indexes + unique constraint. Single transaction. Reversible via DROP. No change to `users` table — `onboarding_state` JSONB already exists.

### Phases (within the 4–5 week ship)

- **Phase 0 (week 1):** Migration, server routes, registry, Zod, server tests. Ship server-only — endpoints exist but client doesn't call them yet.
- **Phase 1 (week 2):** Shepherd install, engine code, sidebar `data-tour-id` attributes, global welcome tour, `?previewTour=`, component tests. Ship behind `VITE_TOUR_ENGINE_ENABLED` flag (off in prod).
- **Phase 2 (week 3):** 6 page tours, `<PageHeaderHelp />` integration, `data-tour-id` on page elements, CI verifier wired. Internal dogfooding starts.
- **Phase 3 (week 4):** 10 nudges, trigger predicates, admin metrics page, settings toggle, Playwright e2e. Internal dogfooding continues.
- **Phase 4 (week 5):** Manual checklist, mobile QA, accessibility (WCAG AA: keyboard nav, Escape dismiss, ARIA), privacy policy update, flip flag in production, monitor.

### Feature flag

`VITE_TOUR_ENGINE_ENABLED` (build-time). Off → `<TourOrchestrator />` returns null, `<PageHeaderHelp />` returns null, no event POSTs, no state fetches. Zero footprint. Flip is a redeploy, not runtime — acceptable for v1.

No per-user gradual rollout in v1.

### Backwards compatibility

- Existing checklist behavior unchanged.
- Existing onboarding flags untouched.
- Chatbot tutor untouched (called via existing public API).
- `PATCH /api/onboarding/state` unchanged. New routes live at `/api/tours/*`.
- No localStorage keys added. State is server-side via `users.onboarding_state`.

### Mid-deploy users

- Mid-checklist users: zero impact.
- Mid-tour users (post-v1 deploys): active tour cancels on refresh, re-evaluates with new state/version.
- Stale `tour_id` in completed state (after rename): registry lookup fails silently → tour treated as never seen → re-fires. Worst case: one re-fire.

### Privacy

One paragraph added to privacy policy: tour telemetry is essential first-party product data, retained 90 days, not shared with third parties. No cookie consent banner change.

### Rollback

1. **Soft (instant):** flag off, redeploy, tour engine disappears, state and events stay.
2. **Per-tour:** remove from `registry.ts`, ship in next deploy. CI verifier ensures consistency.
3. **Hard:** truncate `tour_events`, clear `users.onboarding_state.tours` sub-key. No effect on existing onboarding.

### Launch monitoring

Daily for first 2 weeks (admin metrics page):

- Auto-fire count for global welcome should match new-signup count ±10%.
- `tour_step_target_missing` near zero.
- `tour_suppressed` rate per tour <30%.
- Sentry: `tour.state.patch_failed` near zero.
- Sentry: `shepherd-init` errors zero.

Weekly post-launch: review completion rates and drop-off steps. Tours <40% completion → content review.

### Communication

- Internal team week 4: Slack + 5-min standup demo.
- Existing users: no in-app announcement. Backfill logic prevents global welcome from firing for users with `guidedSeen=true`.

### Documentation deliverables (Phase 4)

- `docs/superpowers/tours/authoring-guide.md` — config syntax, copy guidelines, version bumping.
- `docs/superpowers/tours/manual-test-plan.md` — manual checklist.
- `docs/superpowers/tours/runbook.md` — failure modes + admin-page diagnosis.

---

## 9. Open questions

| #   | Question                                                         | Default                                                                                                                     |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Admin role check for `?previewTour=` and `/admin/tour-analytics` | Use existing admin flag if present; else gate by `@litlabs.io` email.                                                       |
| Q2  | Shepherd version                                                 | `^14.0.0` (~25KB gzipped).                                                                                                  |
| Q3  | `<TourOrchestrator />` mount point                               | After `<Sidebar />` in authenticated layout, outside route switch.                                                          |
| Q4  | Tour copy voice                                                  | Second-person, present tense, action-oriented, ≤80 chars/line, ≤2 lines/step, no jargon. Approved by founder before week 3. |
| Q5  | Settings toggle location                                         | Wherever existing notification preferences live. Confirmed Phase 1.                                                         |
| Q6  | Mobile in v1                                                     | Ship with degraded coach-marks on <768px. Toggle to desktop-only is one conditional.                                        |
| Q7  | Dogfooding minimum                                               | 5 business days between Phase 3 ship and Phase 4 launch.                                                                    |

---

## 10. Risks

| #   | Risk                                     | Impact × Likelihood           | Mitigation                                                                                            |
| --- | ---------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| R1  | Authoring debt undermines launch         | High × Med                    | Mandatory founder review of copy. 2 days/tour for content.                                            |
| R2  | `data-tour-id` rot from unrelated PRs    | Med × High                    | Verifier in `npm run check` + Husky pre-commit.                                                       |
| R3  | Shepherd CSS specificity wars            | Med × Med                     | Scoped CSS via PostCSS. Manual visual QA. Shadow DOM is v2 nuclear option.                            |
| R4  | Tour timing races on slow networks       | Med × Med                     | `tour_step_target_missing` instrumented from day one. Raise timeout to 5s if >5% skips in production. |
| R5  | Tour fatigue from over-firing            | Low × Med                     | Wildcard suppress in Settings. Weekly suppression-rate review.                                        |
| R6  | Privacy policy gap                       | Low × Low (high cost if hits) | Phase 4 update. Existing data-deletion flow purges `tour_events`.                                     |
| R7  | Backfill misclassifies user              | Low × Low                     | Test on staging snapshot. Reversible via SQL.                                                         |
| R8  | `tour_events` grows faster than expected | Low × Low                     | 90-day retention. Sample high-volume events if it overruns.                                           |

---

## 11. v2 roadmap

| Order | Item                              | Effort  | Trigger                                       |
| ----- | --------------------------------- | ------- | --------------------------------------------- |
| v2.1  | Per-tour-step copy A/B testing    | 1 wk    | When VentureCite adopts a flag system.        |
| v2.2  | DB-backed copy overrides          | 1 wk    | When a content writer joins.                  |
| v2.3  | Authoring UI                      | 3–4 wk  | When non-engineer makes >2 edits/wk.          |
| v2.4  | Long-tail page tours              | Ongoing | Support-ticket data shows where users stick.  |
| v2.5  | i18n                              | 2 wk    | Non-English market targeted.                  |
| v2.6  | PostHog migration                 | 1 wk    | Analytics needs grow past ad-hoc SQL.         |
| v2.7  | Multi-tab state sync              | 3 days  | If users complain about duplicate auto-fires. |
| v2.8  | Behavioral triggers (dwell-based) | 2 wk    | When v1 data shows where this would matter.   |

---

## 12. Summary

- **v1:** 1 global welcome tour + 6 page tours + 10 nudges + chatbot fallback.
- **Architecture:** Shepherd.js + `data-tour-id` + `users.onboarding_state.tours` JSONB + new `tour_events` table.
- **Coexists** with existing checklist + chatbot. Additive, zero-replacement.
- **Eight silent-failure modes designed-out** at architecture level.
- **~58 automated tests + CI verifier + manual checklist + admin metrics dashboard.**
- **Phased rollout** behind a feature flag, content-complete launch.
- **4–5 weeks of work, ~32 new files, ~10 modifications, ~2,000–2,500 LOC.**
