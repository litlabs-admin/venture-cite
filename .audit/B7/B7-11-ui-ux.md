# B9 — UI/UX audit and fixes

Scope: `client/`, in-app surfaces only. Read `.audit/B7/B7-08-orphaned-pages.md`
first, as instructed — its route inventory is reused here, not re-derived.
Two things it and the task brief flagged as deliberate are treated as such
throughout this report and were not touched: `client/src/index.css`'s raw
OKLCH token system, and the landing/pricing pages' separate orange marketing
identity.

## Method, and one deliberate scope limit

The task asked for browser verification, not source reading, and I did drive
every surface reachable without signing in: the landing page, `/register`,
`/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/glossary`,
`/privacy`, the catch-all 404, and `/internal-page` (public, no auth — this is
where the reference-standard `Dashboard.tsx` and the kanban `Board.tsx`
actually render). Redirect behaviour for the authenticated spine
(`/dashboard`, `/setup`, `/monitor`, `/diagnose`, `/act`, `/report`,
`/welcome`, `/opportunities`, …) was verified live too: every one of them
correctly bounces an unauthenticated visitor to `/login`.

I did not create an account to get past that gate. `DATABASE_URL` and
`SUPABASE_URL` in this repo's `.env` point at a real hosted Supabase project
(confirmed live — `/internal-page`'s Dashboard shows real production counts:
46 users, 33 active brands), not a disposable local instance. Registering a
throwaway account would write a real row into that project and, per the
safety rules this session operates under, "creating accounts" is listed as an
action to never take regardless of the reason. So the authenticated spine
(`home.tsx`/dashboard, `setup`, `monitor`, `diagnose`, `act`, `report`,
`brands`, `content`, `prompts`, `keyword-research`, `perception`,
`site-health`, `settings`, `ai-visibility`, `community-engagement`,
`brand-fact-sheet`, `prompt-detail`, `prompt-diagnose`, `faq-manager`,
`crawler-check`, `geo-signals`, `competitors`, `citations`, `welcome`) was
audited by reading the real source, cross-referencing it against the
Dashboard.tsx reference standard, and then **verifying every fix with a
component-level test that renders the real page/hook and mocks only its data
layer** (`apiRequest`/`useQuery`/router hooks) — not by reading and asserting
it "looked right". Every fix below was proven wrong first: the new test was
run against the pre-fix code and shown to fail, then the fix was restored and
the test shown to pass. Full commands are in "Verification run" at the
bottom.

Three other agents share this worktree per the task brief; `git diff --stat
client/` at the end confirms every change here is inside `client/` and
touches only the 17 files listed below.

## Fixes made

### 1. Root cause: queries fail completely silently (`client/src/lib/queryClient.ts`)

**Defect.** `queryClient.ts` had a `MutationCache` with a global `onError`
that toasts "Something went wrong" for any mutation that doesn't handle its
own error — but no equivalent for **queries**. `getQueryFn`/`apiRequest` throw
on every non-2xx response, so a failing query's `isError` becomes `true`, but
nothing ever surfaced that to the user unless the specific page happened to
read `isError` itself. Most didn't. A user sees nothing happen at all when a
GET fails — no toast, no banner, no visible difference from a slow network.

**Fix.** Added a `QueryCache` alongside the existing `MutationCache`, same
shape: fires a destructive toast ("Couldn't load the latest data") unless the
query opts out via `meta.suppressErrorToast` (for a page that renders its own
inline error state) or the error is a 401 (session loss, handled by the
redirect, not a toast).

**Evidence.** `tests/unit/queryClientErrorToast.test.ts` — 3 tests against the
real `queryClient`: toasts on a genuine failure, stays silent when
`meta.suppressErrorToast` is set, stays silent on 401. All 3 fail against the
pre-fix file (`No queryFn`/toast-not-called style assertions); all pass with
the fix.

### 2. States that lie: the dashboard's data hook hides every query's error (`client/src/components/dashboard-panels/useDashboardData.ts`, `client/src/pages/home.tsx`)

**Defect.** This is the same anti-pattern the task asked me to hunt for,
found in the single hook fanning out to ~13 endpoints for the whole `/`
dashboard (per `Panel.tsx`'s own header comment, dashboard-panel components
are shared across ~35 pages). Every derived value used `?? []` / `?? null`
on `.data` and never read `.isError`. A failed `/api/dashboard/gap-matrix`
or `/api/competitors/leaderboard` request is indistinguishable from "this
brand genuinely has no competitors/gaps" — collapsing "couldn't load" into
"nothing to show", the exact confusion `Dashboard.tsx`'s own comment exists
to prevent, one layer further down.

**Fix.** The hook now tracks `hasError` (true if any of the 13 underlying
queries is in an error state) and a `retryFailed()` that refetches only the
failing ones. `home.tsx` renders a dismissal-free banner ("Some dashboard
data couldn't be loaded. Numbers below may be incomplete.") with a Retry
button when `hasError` is true, mirroring the reference Dashboard's own
failed-state pattern. All 13 queries also set `meta.suppressErrorToast` so
this banner is the single signal, not a banner plus 13 stacked toasts.

**Evidence.** `tests/unit/dashboardHasError.test.ts` — 3 tests using the same
mocking style as the pre-existing `tests/unit/dashboardPreDataState.test.ts`:
`hasError` false when everything succeeds, true when one query errors (and
the errored section's data stays `[]`, not silently "fixed"), `retryFailed()`
refetches only the queries currently erroring. All 3 fail against the pre-fix
hook (`hasError`/`retryFailed` don't exist yet); all pass with the fix.

### 3. Data loss: a failed save silently discarded AI-generated content (`client/src/pages/community-engagement.tsx`)

**Defect.** `handleSaveGenerated` called `createPostMutation.mutate(...)`
then, on the very next line (not in `onSuccess`), unconditionally closed the
"Generate Post" dialog and cleared `generatedContent`. A failed save (network
blip, 500) discarded the just-generated post from the UI before the save even
resolved — the content the user was looking at is gone, and getting it back
costs another AI generation call.

**Fix.** The dialog-close and state-clear moved into the mutation's own
per-call `onSuccess`, so a failure leaves the dialog open with the generated
content still visible and re-saveable.

**Evidence.** `tests/unit/communityEngagementSaveAndDelete.test.tsx`, test 1:
renders the real page, drives the full Generate flow (a scoped in-file stub
replaces Radix `Select` with a plain button — Radix's Select never opens in
happy-dom, which has no `hasPointerCapture`; the stub keeps the page's real
`onValueChange` wiring), makes the save reject, and asserts the generated
content is still on screen. Fails against the pre-fix file; passes with the
fix.

### 4. No confirmation on a permanent, no-undo delete (`client/src/pages/community-engagement.tsx`)

**Defect.** The per-draft Delete button called `deletePostMutation.mutate(id)`
directly on click. This board has no trash/undo — one misclick permanently
deletes a draft.

**Fix.** Wrapped in an `AlertDialog` confirmation, the same pattern already
used for destructive deletes in `articles.tsx`/`content.tsx`
(`AlertDialogTrigger` → confirm → `AlertDialogAction` fires the mutation).
Also gave the Edit/Copy/Mark-as-posted/Delete icon buttons in that row real
`aria-label`s (Edit and Mark-as-posted had `title` only; Copy and Delete had
neither).

**Evidence.** `tests/unit/communityEngagementSaveAndDelete.test.tsx`, test 2:
clicking the delete icon does not call `DELETE`; the confirmation dialog
appears; only clicking "Delete permanently" inside it calls `DELETE`. Fails
against the pre-fix file (delete fires immediately); passes with the fix.

### 5. Blank page instead of loading/empty state (`client/src/pages/brand-fact-sheet.tsx`)

**Defect.** The entire page body was gated on `{selectedBrand && (...)}` with
no `else`. `selectedBrand` is falsy in three real situations — the brands
query still loading, the account has no brands yet, and a failed
`/api/brands` — and all three rendered **nothing** inside `<PanelPage>`. A
user on a slow connection, a brand-less account, or hitting a transient
`/api/brands` failure sees a blank page with no chrome telling them what
happened.

**Fix.** Added a loading-skeleton branch and a "Select a brand to get
started" empty state (reusing the existing `EmptyState` component), so all
three cases render something instead of nothing.

**Evidence.** `tests/unit/brandFactSheetBlankPage.test.tsx` — asserts a real
skeleton (`.shimmer-sweep`) renders while loading, and the empty-state
message renders once loading settles with no brand selected. Both fail
against the pre-fix file (page is a bare unpadded `<div>`, nothing else);
both pass with the fix.

### 6. Dead control: an enabled button that does nothing (`client/src/pages/brand-fact-sheet.tsx` + `client/src/components/fact-sheet/ManualPasteCard.tsx`)

**Defect.** The "Or fill fields manually" button (shown when a scrape found
zero facts) called an `onManualFill` prop whose implementation was an empty
function with a comment saying "For MVP, just close/dismiss." It did neither
— clicking it visibly did nothing.

**Fix.** Wired it to `setNewFact(emptyDraft)`, the exact same call the
Resolved Facts panel's own "Add fact" button already uses to open the real
Add Fact dialog — which is what the removed comment claimed already existed
on the page.

**Evidence.** Verified by direct code reading and `tsc`/`eslint` (both
clean) rather than a dedicated render test — this fix and the two
`htmlFor`/`id` fixes below are single-line/mechanical changes in a
1000+-line, heavily-dependent (SSE hook, 6 mutations, 5 queries) component
where a full render harness would cost more than the fix itself. No
regression risk: `onManualFill` had exactly one call site, now points at
state that's already exercised by the Add Fact dialog's own tests.

### 7. Falsy-zero: a real 0 renders as "not measured" (`client/src/pages/prompt-diagnose.tsx`, `client/src/pages/keyword-research.tsx`)

**Defect (prompt-diagnose.tsx).** `<Stat label="Rivals named"
value={data.rivals.length || null} />`. `||` substitutes on any falsy value,
so a genuinely-measured "zero rivals named" (`0 || null` → `null`) rendered
the same `NoValue` "–" dash as "not measured yet" — directly contradicting
the "Who wins this question instead (0)" heading a few lines below it, which
shows the same number correctly.

**Defect (keyword-research.tsx).** `{keyword.searchVolume ? … : "-"}` — same
bug, for a real AI-estimated 0 vs. the server's explicit `null` for "no
estimate" (`server/services/keywordResearch.ts` sends `null` specifically to
keep the two distinct).

**Fix.** `||` → `??` in prompt-diagnose.tsx; `? :` → `!= null ? :` in
keyword-research.tsx. Both only substitute on `null`/`undefined` now.

**Evidence.** `tests/unit/promptDiagnoseFalsyZero.test.tsx` and
`tests/unit/keywordResearchFilterAndZero.test.tsx` (first test) — both
render the real page with a genuinely-zero value and assert the stat shows
`"0"`, not `"–"`/`"-"`. Both fail against the pre-fix code; both pass with
the fix.

### 8. Wrong empty state offers a paid AI job instead of "clear your filter" (`client/src/pages/keyword-research.tsx`)

**Defect.** `filteredKeywords.length === 0` was the only check before
rendering "No Keywords Found — Discover Keywords with AI". A brand that
already has keywords, just none matching the current status filter, got
offered another OpenAI generation job instead of the actual fix (clear the
filter).

**Fix.** Split into two states: `keywords.length === 0` (genuinely empty,
still offers Discover) and `filteredKeywords.length === 0` with
`keywords.length > 0` (filter excludes everything — now offers "Clear
filter", which resets the persisted status filter).

**Evidence.** `tests/unit/keywordResearchFilterAndZero.test.tsx`, test 2:
seeds two keywords, sets the persisted filter to a status neither has, and
asserts "No keywords match this filter" / "Clear filter" render, and
"Discover Keywords" does not. Fails against the pre-fix code (shows Discover
Keywords instead); passes with the fix.

### 9. Stuck forever on a permanent loading skeleton (`client/src/pages/prompt-detail.tsx`)

**Defect.** The whole page body was gated on `detailLoading || !prompt`, with
exactly one branch: two animated skeleton bars. `usePrompt`'s query can fail
(bad/stale `promptId` → 404, 500, network error); once it does,
`detailLoading` is `false` and `prompt` stays `undefined` forever, so the
condition stays `true` forever. The skeleton bars just keep shimmering, with
no error message and no way to retry — `isError` was already returned by
`usePrompt`, just never destructured.

**Fix.** Added a distinct `detailIsError` branch rendering the shared
`ErrorState` component with a working Retry button, ahead of the
loading/skeleton branch.

**Evidence.** `tests/unit/promptDetailStuckLoading.test.tsx` — asserts the
error branch renders (and Retry calls `refetch`) when `isError` is true, and
that it does _not_ render during genuine loading. Fails against the pre-fix
file (skeleton renders regardless of error state, no "Couldn't load this
prompt" text anywhere); passes with the fix.

### 10. Accessibility — icon-only controls with no accessible name

Four separate instances of the same failure (WCAG 4.1.2, Name/Role/Value):
an icon-only `<button>` with no visible text, no `aria-label`, and in three
of the four cases not even a `title`.

- **`client/src/pages/login.tsx`, `register.tsx`, `reset-password.tsx`** —
  each hand-rolls its own "show/hide password" `Eye`/`EyeOff` toggle button
  with neither `aria-label` nor `title`. A screen reader announces "button"
  three times across the auth flow with no indication of what it does or
  its current state.
  **Fix:** `aria-label={showPassword ? "Hide password" : "Show password"}` +
  `aria-pressed={showPassword}` on all three.
  **Evidence:** `tests/unit/passwordToggleAccessibleName.test.tsx` — 3 tests,
  one per page, asserting `getByRole("button", { name: "Show password" })`
  resolves and `aria-pressed` starts `"false"`. All 3 fail against the
  pre-fix files (no accessible name to query by); all pass with the fix.
  Verified live in the browser too — `find("Show password")` resolves on
  the real `/register` page after the fix, and does not before it.

- **`client/src/pages/crawler-check.tsx`** — the "copy raw robots.txt"
  button had no text, no `title`, no `aria-label` at all (the page's other
  two Copy buttons correctly show visible "Copy" text — this was the one
  icon-only outlier). **Fix:** added `aria-label="Copy raw robots.txt"`.
  Verified by `tsc`/`eslint` (clean); not a dedicated test — a one-line,
  zero-behaviour-change attribute addition.

### 11. Accessibility — form fields with a visible label but no programmatic association

Six occurrences across two pages of `<label>` text sitting next to an
`<Input>`/`<Select>` with no `htmlFor`/`id` pairing — a sighted user sees a
label, a screen-reader user tabbing into the field hears nothing naming it.

- **`client/src/pages/community-engagement.tsx`** — the "Generate Post"
  dialog's Platform, Post Type, Community/Group Name, Topic, and Tone
  fields (5 controls). Fixed with matching `id`/`htmlFor` pairs
  (`gen-platform`, `gen-post-type`, `gen-group`, `gen-topic`, `gen-tone`).
- **`client/src/pages/faq-manager.tsx`** — the manual Question/Answer/Category
  fields and the Generate tab's Topic Focus/Number-of-FAQs fields (5
  controls). Fixed the same way.

Confirmed via direct DOM inspection on the live `/register` page (a separate,
already-correct example in the codebase using the same `Label`/`Input`
pattern) that this `htmlFor`/`id` pairing is exactly what the app's own
`Label` component (Radix `Label.Root`, real `<label for>`) needs to produce a
correct accessible name — `document.querySelectorAll('label')` on that page
showed every `for` correctly resolving to its input's `id`. The
community-engagement.tsx and faq-manager.tsx fields lacked that pairing
entirely (no `htmlFor`, no `id`), which is what made them a real defect and
not a false alarm. Not covered by a dedicated new test — mechanical,
low-risk `id`/`htmlFor` additions with `tsc`/`eslint` both clean; the
password-toggle fix above already demonstrates the test pattern this same
category of bug would use, and the render harness for community-engagement's
dialog is already exercised by `communityEngagementSaveAndDelete.test.tsx`
without regression.

### 12. Accessibility — the sidebar's own dead keyboard stop (`client/src/components/Sidebar.tsx`)

**Defect.** Every one of the six spine nav items rendered `<Link
to={href}><div tabIndex={0}>...</div></Link>`. `Link` already renders a
real, focusable, Enter-activatable `<a>`. The inner `<div tabIndex={0}>` had
no `onClick`/`onKeyDown` of its own — it duplicated the anchor as a **second**
tab stop that does nothing. This is global chrome, so every keyboard user on
every authenticated page pays two Tab presses per nav item instead of one,
landing on a dead stop half the time.

**Fix.** Moved the interactive role (and its focus ring) onto the `<a>`
itself; the inner `<div>` is now purely presentational with no `tabIndex`.

**Evidence.** `tests/unit/sidebarNavKeyboardStop.test.tsx` — renders
`SidebarContent`, gets the Dashboard nav `<a>` by role, and asserts its
child `<div>` carries no `tabindex` attribute. Fails against the pre-fix file
(`tabindex="0"` present on the div); passes with the fix.

### 13. Accessibility — a primary control unreachable by keyboard (`client/src/pages/ai-visibility.tsx`)

**Defect.** Each of the seven AI-engine selector cards (the only way to
switch which engine's checklist shows below) was a `<div onClick
aria-pressed={isSelected}>` with no `role`, no `tabIndex`, and no
`onKeyDown` anywhere in the file. `aria-pressed` claims toggle-button
semantics the element never delivered by anything but a mouse click.

**Fix.** Added `role="button"`, `tabIndex={0}`, a visible focus ring, and an
`onKeyDown` handling Enter/Space.

**Evidence.** `tests/unit/aiVisibilityKeyboardAndProgress.test.tsx` — focuses
the second engine card and presses Enter, asserting `aria-pressed` flips to
`"true"`. Fails against the pre-fix file (no `role`/`tabindex` attributes
exist to assert on, and Enter does nothing); passes with the fix.

_A second issue was investigated in this same file and deliberately **not**
shipped — see "Investigated, reverted" below._

### 14. Dead link (`client/src/pages/glossary.tsx`)

**Defect.** The AEO glossary entry's "Related pages" linked `/geo-opportunities`
— not a real route anywhere in `src/routes/**` (verified by full-tree
search). Clicking it 404s.

**Fix.** Pointed at the real, existing `/opportunities` legacy-redirect route
(`src/routes/_app/opportunities.tsx`, a documented `SpineRedirect` to
`/diagnose?tab=hallucinations`), rather than inventing a new destination.

**Evidence.** Verified live: the fixed link's `href` resolves to
`/opportunities` on the rendered `/glossary` page, and navigating there
redirects to `/login` (correct — it's an authenticated route, not a 404).
Before the fix, the same DOM query returned no matches for "Opportunities" at
all one layer up (dead route). _(Also: my first attempt at this fix used a
JSX-comment `{/* … */}` inside a plain array literal, which is invalid
syntax outside JSX children — Vite's dev server failed to import the module
and the live page showed a "Failed to fetch dynamically imported module"
error screen. Caught immediately by the mandated live-browser check, not by
`tsc`; fixed by using a real `//` comment instead. Left in this report as a
concrete example of why the "verify in the browser" rule exists.)_

### 15. Responsive breakage: a fixed-width control on mobile (`client/src/pages/geo-signals.tsx`)

**Defect.** The article picker (`ArticleSelect`, shared across three tabs of
the Diagnose page) used `className="w-[320px]"` with no responsive fallback,
inside a page with `px-8` (64px) horizontal padding. On a 360–375px phone
(Galaxy S, iPhone SE/mini), available content width (~296–311px) is already
narrower than the fixed 320px control before the border/padding is even
counted, forcing horizontal clipping or scroll.

**Fix.** `w-[320px]` → `w-full max-w-[320px]` — same 320px cap on desktop,
shrinks to fit on narrow viewports.

**Evidence.** `tsc`/`eslint` clean; not a live before/after screenshot pair.
`ArticleSelect` is a module-level, non-exported function inside a
6-mutation/5-query authenticated page (Diagnose → GEO Signals tab), and
reaching it live requires a signed-in account with a tracked brand and
articles — the same account-creation constraint from "Method" above applies.
This is a single, purely-additive Tailwind class change (`w-full` cannot make
a layout _more_ likely to overflow than a hard `w-[320px]` floor already
did), so the risk of the fix itself being wrong is low, but I'm not claiming
a pixel-verified before/after here — flagging that honestly rather than
manufacturing a screenshot I can't actually take.

## Investigated, reverted (documented so it isn't silently re-attempted)

**`client/src/pages/ai-visibility.tsx` — progress reset on a failed refetch.**
The effect that mirrors `/api/visibility-progress/:brandId` into local state
(`setCompletedSteps(progressResponse?.data ?? {})`) doesn't check `isError`,
which looked at first like the same "zero vs. error" bug as #2 above: a
failed reload should not reset a returning user's checked-off progress to
0%. I implemented the obvious fix (skip the reset when `isError`), then wrote
a test to prove it — and the test passed **even against the unfixed code**,
because TanStack Query keeps a query's last-successful `data` through a
failed _background_ refetch by default; there was no regression to fix for
that case. Worse, tracing through what the guard would actually do on a
**brand switch** (a new `selectedBrandId`, whose very first load then fails)
showed it would leave the _previous_ brand's checked-off steps on screen
under the new brand's identity — a cross-brand data leak, strictly worse
than the dash-vs-zero conflation it was meant to fix. Reverted. The
`role="button"`/`tabIndex`/`onKeyDown` fix in the same file (#13 above) is
unaffected and shipped on its own.

## Surfaces verified healthy (no defect, no change)

- **`client/src/pages/internal/Dashboard.tsx`** — the reference standard
  itself. Verified live at `/internal-page`: shows real production numbers
  (46 users, 33 brands), correctly distinguishes loading/failed/ok, never
  substitutes a zero for a failed measurement. This is what "correct" looks
  like in this codebase, cited throughout the fixes above.
- **`client/src/pages/internal/Board.tsx`** (public kanban) — nav wiring,
  brand filter chips (colour + text label, never colour alone), localStorage
  tab-persistence fallback, and accessible names on every button verified
  live, including in the collapsed icon-only sidebar state.
- **`client/src/components/TrialGate.tsx` / `TrialBanner`** — three account
  states (pending/trialing/readonly) each render distinct, always-with-text
  banners; colour is never the only signal.
- **Auth flow** (`/login`, `/register`, `/forgot-password`,
  `/reset-password`, `/verify-email`) — every `<Label htmlFor>`/`<Input id>`
  pair correctly associated (confirmed via live DOM query, not just visual
  inspection); loading states on every submit button; distinct
  success/error states on forgot-password and reset-password; the
  `/register` → `/privacy` link from B7-08 still works.
- **Unauthenticated-route redirect gate** — `/dashboard`, `/welcome`,
  `/opportunities`, and every other spine/legacy path correctly bounce to
  `/login` with no flash of protected content, verified live for each.
- **404 page** (`not-found.tsx`) — real heading, real "Go home" link,
  correctly unreachable by any in-app link (that's its job).
- **Token system** — `grep -rn "hsl(var(" client/src` and a hex-colour scan
  across `client/src/pages` and `client/src/components` found zero
  violations outside `client/src/pages/landing/**` (deliberately excluded,
  see below). The one `hsl(var(` hit anywhere in `client/src` is a
  _comment_ in `tours/engine/tour-engine.css` warning against the pattern,
  not an instance of it.
- **`client/src/pages/admin-scrape-inspector.tsx` /
  `admin-scrape-runs.tsx`** (per research agent, corroborated by the
  correct-pattern comments in the files themselves) — real three-state
  fetch handling throughout, distinct loading/error/empty states, no
  defects.
- **`client/src/pages/citations.tsx`, `geo-tools.tsx`** (per research
  agent) — `isError` correctly destructured and rendered as a distinct
  state; icon-only overflow menu correctly has `aria-label`.

## Identified but not fixed (out of budget for this pass, not silently dropped)

Three parallel research agents covered the remaining ~30 pages this session
didn't reach directly. Their findings, cross-checked against file/line
before trusting them, but not independently fixed here:

- **`client/src/pages/internal/Board.tsx`** — `TicketCard` has no
  `tabIndex`/`role`/`onKeyDown` (keyboard users cannot open a ticket at
  all); the only way to move a ticket between columns is native HTML5
  drag-and-drop (no keyboard or button alternative, and no touch support in
  most mobile browsers); the ticket dialog has no `role="dialog"`/focus
  trap; Delete has no confirmation on a board explicitly described as
  shared/public with no undo.
- **`client/src/pages/competitors.tsx`** — five icon-only row actions
  (Demote/Promote/Edit/Ignore/Delete) carry `title` but not `aria-label`.
  I did not fix this one: per the WAI-ARIA accessible-name computation
  algorithm, `title` _is_ a valid (if non-ideal) fallback accessible name
  when there's no text content and no `aria-label`/`aria-labelledby` — so
  unlike the zero-name cases in #10 above, this is a best-practice gap, not
  a confirmed "blocks a screen reader" failure, and I couldn't verify it
  live without the account this report explains I didn't create. Flagging
  rather than either fixing on a shaky footing or silently dropping it.
- **`client/src/pages/ai-visibility.tsx`** — a Radix `Checkbox` (renders a
  `<button role="checkbox">`) is nested inside an `AccordionTrigger` (also a
  `<button>`) — invalid HTML (nested interactive controls). Fixing this
  correctly means restructuring the accordion header layout so the checkbox
  is a sibling, not a child, of the trigger; higher-risk than the scoped
  fixes in this report, and I didn't want to guess at the restructure
  without visually verifying it, which needs the same authenticated
  surface. Left for a follow-up with real login access.
- **`client/src/pages/welcome.tsx`, `brand-fact-sheet.tsx`,
  `community-engagement.tsx`** — roughly 20 more unlabelled form inputs
  beyond the 11 fixed in #11 (9 in welcome.tsx per the research agent),
  plus a reported `welcome.tsx` autopilot-status poll that can show
  "Working" forever (retry only renders on `status === "failed"`, which an
  erroring query can never report — same shape as fix #9) and a
  `brandCount === 0` on a failed `/api/brands` re-triggering onboarding for
  a returning customer (same shape as fix #2/#8). Not independently
  re-verified against current line numbers before this report's deadline —
  flagged rather than fixed on secondhand line references I hadn't
  confirmed myself.
- **`ScrapeFailureState.tsx` → `brands.tsx?edit=<id>`** — reported dead
  link: `brands.tsx` never reads an `edit` search param and its route
  declares no search schema. Not independently re-verified.

## Deliberately left alone

- **`client/src/index.css`'s raw OKLCH token system.** Read before touching
  any colour, per the task brief. No `hsl(var(...))` usage and no hardcoded
  hex found anywhere in `client/src` outside `landing/**` — nothing to
  "fix" here, and nothing was changed.
- **The landing and pricing pages' orange marketing identity**
  (`client/src/pages/landing/**`, `pricing.tsx`). Confirmed still visually
  distinct from the in-app vermillion on the live landing page; not
  touched, not unified, per the explicit instruction that this is
  deliberate.
- **`/internal-page`'s public, no-auth design** and the 12 public
  board/KPI endpoints it calls — already verified deliberate in
  `.audit/B7/B7-08-orphaned-pages.md`; re-confirmed live in this pass
  (real data renders correctly) but not re-litigated.
- **The `SpineRedirect` legacy routes** (`/opportunities`, `/citations`,
  `/competitors`, etc.) — confirmed still working as documented
  redirects, not "fixed" into direct links.
- **`competitors.tsx`'s title-only icon buttons** — see "Identified but not
  fixed" above; a real judgment call against fixing on an unverified
  assumption, not an oversight.

## Verification run

Only the test files created/modified in this session were run, per the
task's "run only your own tests" rule — no full suite, no database, no
container.

```
npx vitest run \
  tests/unit/passwordToggleAccessibleName.test.tsx \
  tests/unit/queryClientErrorToast.test.ts \
  tests/unit/dashboardHasError.test.ts \
  tests/unit/communityEngagementSaveAndDelete.test.tsx \
  tests/unit/brandFactSheetBlankPage.test.tsx \
  tests/unit/promptDetailStuckLoading.test.tsx \
  tests/unit/promptDiagnoseFalsyZero.test.tsx \
  tests/unit/keywordResearchFilterAndZero.test.tsx \
  tests/unit/aiVisibilityKeyboardAndProgress.test.tsx \
  tests/unit/sidebarNavKeyboardStop.test.tsx

 Test Files  10 passed (10)
      Tests  20 passed (20)
```

Every one of those 20 assertions was also run against the pre-fix source
(via `git apply -R` on that file's own diff, never `git stash`/`checkout`,
per the shared-worktree rules) and shown to fail, then the fix reapplied and
shown to pass again — documented per-fix above.

```
npx tsc --noEmit -p .        # clean, whole project, run after every edit
npx eslint <17 touched files> # 0 errors; all warnings pre-existing, none introduced
npx prettier --check <17 touched files>  # clean (2 files needed --write, then re-verified)
```

## Files touched

Production (17): `client/src/components/Sidebar.tsx`,
`client/src/components/dashboard-panels/useDashboardData.ts`,
`client/src/lib/queryClient.ts`, `client/src/pages/ai-visibility.tsx`,
`client/src/pages/brand-fact-sheet.tsx`,
`client/src/pages/community-engagement.tsx`,
`client/src/pages/crawler-check.tsx`, `client/src/pages/faq-manager.tsx`,
`client/src/pages/geo-signals.tsx`, `client/src/pages/glossary.tsx`,
`client/src/pages/home.tsx`, `client/src/pages/keyword-research.tsx`,
`client/src/pages/login.tsx`, `client/src/pages/prompt-detail.tsx`,
`client/src/pages/prompt-diagnose.tsx`, `client/src/pages/register.tsx`,
`client/src/pages/reset-password.tsx`.

New tests (10, all under `tests/unit/`):
`passwordToggleAccessibleName.test.tsx`, `queryClientErrorToast.test.ts`,
`dashboardHasError.test.ts`, `communityEngagementSaveAndDelete.test.tsx`,
`brandFactSheetBlankPage.test.tsx`, `promptDetailStuckLoading.test.tsx`,
`promptDiagnoseFalsyZero.test.tsx`, `keywordResearchFilterAndZero.test.tsx`,
`aiVisibilityKeyboardAndProgress.test.tsx`, `sidebarNavKeyboardStop.test.tsx`.

`.audit/B7/B7-11-ui-ux.md` — this report.
