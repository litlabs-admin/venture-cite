# B9 — UI/UX remainder: Board, ai-visibility, labels, welcome, dead link

Scope: `client/` only, per this task's brief. Picks up the five items
B7-11-ui-ux.md's "Identified but not fixed" section left open, and respects
its "Deliberately left alone" section throughout. Every item below was
verified against current code before any change — the brief warned that
five of seven carried-forward findings in this program turned out already
fixed, and that pattern held here too (see item 3).

## 1. `client/src/pages/internal/Board.tsx` — the largest gap

Verified all four defects against current code first (all real):

- `TicketCard` was a plain `<article draggable onClick>` — no `tabIndex`, no
  `role`, no `onKeyDown`. A keyboard user could not open a ticket.
- Moving a ticket between columns was native HTML5 drag-and-drop only:
  `onDragStart`/`onDragEnd`/a column's `onDrop`, nothing else.
- `TicketDialog` was a hand-rolled `<div className="fixed inset-0" onClick={onClose}>`
  with a manual `window` `keydown` listener for Escape — no `role="dialog"`,
  no focus trap.
- Delete called `onDelete(draft.id)` directly on click, no confirmation, on
  a board whose own header comment says: "the board lives on the server...
  a change is permanent and shared."

**Fixes** (all in `Board.tsx`):

- `TicketCard` gained `role="button"`, `tabIndex={0}`, and `onKeyDown`
  (Enter/Space → open), following `client/src/components/geo-tools/MentionCard.tsx`
  as instructed. `aria-label` describes the ticket so a screen reader
  doesn't need the visual layout to know what it's opening.
- A new "Move to" control on each card: a `DropdownMenuTrigger` (icon-only,
  `aria-label={'Move "<title>" to another column'}`) listing every column
  except the ticket's current one, wrapped in an isolating
  `onClick`/`onKeyDown` stopPropagation div — the same nested-interactive
  pattern `MentionCard.tsx`'s own `ActionsMenu` already uses, which is valid
  here (a real `<button>` inside a `role="button"` `<article>`, not a
  `<button>` inside a `<button>` — see item 2 for why that distinction
  matters). Radix's `DropdownMenu` is fully keyboard- and touch-operable,
  so this closes the "no button alternative, no touch support" gap
  directly, independent of whatever happens with the drag handlers (kept,
  for desktop mouse users who still like them).
- `TicketDialog` now renders through the shared `Dialog`/`DialogContent`
  primitive (`client/src/components/ui/dialog.tsx`, already used by
  `brands.tsx`) instead of a hand-rolled overlay — real `role="dialog"`,
  Radix's `FocusScope` (`trapped`) auto-focuses into it and traps Tab, and
  Escape/overlay-click-to-close come from the primitive instead of a
  manual listener.
- Delete is now behind an `AlertDialog` confirmation (`AlertDialogTrigger` →
  `AlertDialogContent` with the ticket's own title and the board's
  shared/no-undo language → `AlertDialogAction` fires the real delete),
  mirroring `articles.tsx`'s destructive-delete pattern as instructed.

**Evidence.** `tests/unit/boardKeyboardAccessibility.test.tsx` — 4 tests
against the real `Board` component (network mocked, not the UI):
Enter-to-open, move-via-menu (asserts the ticket actually re-renders under
the new column, not just that a menu opened), `role="dialog"` +
focus-trapped-on-open, and the full delete-confirmation flow (Cancel
preserves the ticket, only "Delete permanently" removes it). All 4 fail
against the pre-fix file (`git apply -R` on this file's own diff) — three
with real assertion failures, one with a React "cannot contain a nested
`<button>`" runtime error path avoided; all 4 pass with the fix restored.

**Verified live** at `/internal-page` → Engineering tasks (`dev-readonly`
launch config, no login needed — this board is intentionally public, per
B7-08): tabbed to a real ticket, opened it with Enter; clicked "Move to" →
"In progress" and watched the column counts and card actually move;
clicked Delete → saw the exact confirmation copy ("Delete 'Publish a read
API and an MCP server'?" / "This board is shared with everyone who has the
link and has no undo. The task will be gone for good.") → Cancel left the
ticket in place. Moved the ticket back to its original column afterward so
the shared/public board (`saved for everyone`) is unchanged — item counts
matched the pre-verification state exactly (20 items · 12 open · 2 blocked
· 8 done) before and after. Console showed no new errors.

## 2. `client/src/pages/ai-visibility.tsx` — nested interactive controls

Confirmed the defect exactly as flagged: the `Checkbox` (Radix, renders
`<button role="checkbox">`) was a **child** of `AccordionTrigger`'s own
`<button>` — a real `<button>` inside a real `<button>`, which is invalid
HTML per the spec (browsers silently break the DOM apart to cope with it)
and undefined for assistive tech.

**Fix.** Restructured so the checkbox is a sibling of the trigger, not a
descendant: both now sit inside one shared `<div className="flex items-center gap-4">`
row, with the trigger wrapped in its own `flex-1` div so the layout is
pixel-identical to before. Removed the now-meaningless
`onClick={stopPropagation}` on the checkbox (not needed once it's not
nested inside the button anymore) and added `aria-label` since it's now a
standalone control.

**Evidence.** `tests/unit/aiVisibilityChecklistNestedControls.test.tsx` — 2
tests against the real page (real `queryClient`, stubbed `fetch`):

- `trigger.contains(checkbox)` is `false` — fails against the pre-fix file
  (`expected true to be false`), and the pre-fix run also throws React's
  own dev-mode warning, `<button> cannot contain a nested <button>`, over
  the wire — direct confirmation the defect was real, not a false alarm.
- The accordion still expands via the trigger (`data-state` flips
  `closed`→`open`, detail text becomes visible) and the checkbox still
  toggles independently (`aria-checked` flips) without collapsing the
  panel the trigger opened. (This test's fetch mock had to be stateful —
  persisting `{engineId: [stepId]}` across GET/POST/DELETE — because the
  page's own effect re-syncs `completedSteps` from the server on every
  settle, including the refetch that follows a successful toggle; a
  mock that always answers empty would silently erase the optimistic
  toggle a moment later, for reasons unrelated to this fix.)

Both fail against the pre-fix file, pass with the fix restored. Not
verified live: `/ai-visibility` requires login (confirmed via `dev-readonly`
— redirects to Sign In), same constraint the prior B7-11 pass hit for this
exact file.

## 3. Unlabelled form inputs — verified count, not the reported one

The brief said "roughly 20" across `welcome.tsx` (~9), `brand-fact-sheet.tsx`,
and `community-engagement.tsx`. Verified each file against current code
before touching anything:

- **`community-engagement.tsx`** — **zero** remaining. Every field (the
  Generate Post dialog's Platform/Post Type/Community/Topic/Tone, and the
  Edit Draft dialog's Title/Content) already has a correct `htmlFor`/`id`
  pair. This is B7-11's fix #11, already shipped. Confirmed stale — not
  touched.
- **`brand-fact-sheet.tsx`** (the page itself) — **zero** remaining. Its
  only inputs are the Add Fact / Edit Fact dialog fields, and all eight
  already have correct `Label htmlFor` / `SelectTrigger id` pairs. Not
  touched.
- **`client/src/components/fact-sheet/ManualPasteCard.tsx`** (a component
  `brand-fact-sheet.tsx` renders on a scrape-failure path) — **one** real
  defect: the paste `Textarea` had no `<label>`, `aria-label`, or
  `aria-labelledby` at all, only a `placeholder` (not an accessible name,
  and it disappears once text is typed). Fixed with a visually-hidden
  `Label htmlFor` (the visible heading above it already gives sighted users
  context, so no visible duplicate label was added).
- **`welcome.tsx`** — **nine** real defects, matching the brief's count
  exactly once traced through the code:
  - The domain `Input` on the "input" scene had no label at all (bare
    placeholder "yourbrand.com"). Fixed with a screen-reader-only `Label`.
  - The Confirm scene's `FieldLabel` helper rendered a `<label>` with **no
    `htmlFor`**, as a sibling of its `Input`/`Textarea` (not wrapping it),
    for: Brand name, Industry, Target audience, Description, Brand voice,
    and the three `TagField`-driven fields (Products, Key values, Unique
    selling points) — 8 fields. Fixed by giving `FieldLabel` an `htmlFor`
    prop and `TagField` an `htmlId` prop, threading a matching `id` onto
    each paired control (`TagField`'s own tag-entry `<input>` included).

**Evidence.** `tests/unit/welcomeAndManualPasteLabels.test.tsx` — 3 tests:
`FieldLabel`/`TagField` (exported for direct testing, like `ActivationPanel`
in item 4) resolve via `getByLabelText`, and `ManualPasteCard`'s textarea
resolves via `getByLabelText(/paste your website's about text/i)`. All 3
fail against the pre-fix files (`getByLabelText` throws — no accessible
name exists to query by); all pass with the fix.

## 4. Two `welcome.tsx` defects — both confirmed real, then fixed

### 4a. Autopilot status poll can show "Working" forever

Confirmed exactly as reported. `ActivationPanel`'s Retry button rendered
only on `autopilot?.status === "failed"`. `autopilot` comes from
`autopilotResp?.data`, and `autopilotResp` came from a `useQuery` whose
`isError` was never read. A persistently-failing status _check_ (network
blip, a 500 on that one endpoint) leaves `autopilot` `null` forever —
`status` defaults to `"pending"`, which is indistinguishable from "still
working." Worse: the query's own `refetchInterval` —
`status && status !== "completed" && status !== "failed" ? 3000 : false` —
returned `false` the instant `status` was `undefined`, which is exactly
what an erroring fetch produces, so the poll didn't even keep retrying.

**Fix.**

- `refetchInterval` now stops only on a genuinely terminal status
  (`"completed"`/`"failed"`); an unresolved/erroring status keeps polling
  every 3s instead of falling silent.
- The query now reads and passes through `isError` (`autopilotIsError`) and
  `refetch` (`onRefetchStatus`).
- `ActivationPanel` (now exported for direct testing) computes a separate
  `checkFailed = autopilotIsError && !done`, distinct from the existing
  `jobFailed = status === "failed"`. Both feed a combined `failed`, which
  every existing "don't look like Working" branch (the phase spinner, the
  phase's "Working"/"Queued" label, the header icon/heading) already keyed
  off, closing the exact "stuck on Working forever" visual the brief
  described, not just the icon.
- The Retry button now dispatches to the right recovery: `onRetry`
  (restart the pipeline job) when the job itself failed, `onRefetchStatus`
  ("Check again," refetch only) when it's the status check that's failing —
  restarting the whole pipeline (a real, costly LLM job) over a transient
  fetch error on one status-polling endpoint would be the wrong fix.
- New `meta: { suppressErrorToast: true }` so the 3-second poll's repeated
  failures don't also stack a global toast on top of the panel's own
  inline message (per `queryClient.ts`'s established `suppressErrorToast`
  contract).

### 4b. A failed `/api/brands` re-triggers onboarding

Confirmed exactly as reported. `brandCount = existingBrands.data?.data?.length ?? 0`
and the only check gating the onboarding redirect was `brandCount > 0` — a
failed fetch (`data` stays `undefined`) is indistinguishable from a
genuinely brand-less account, so a returning customer hitting a transient
`/api/brands` failure saw the "Let's establish your brand" form instead of
being routed to `/dashboard` or told the check failed.

**Fix.** Three distinct, honest states for the "input" scene, matching the
`Dashboard.tsx` reference standard's own loading/failed/ok vocabulary:
`existingBrands.isLoading` → a real skeleton (not a blank panel);
`existingBrands.isError` → "Couldn't check your account" with a Try Again
button that calls `refetch()`; `existingBrands.isSuccess` → the ordinary
onboarding form (unchanged for the common case). The redirect effect now
also requires `existingBrands.isSuccess`, not just `brandCount > 0`.

**Evidence.** `tests/unit/welcomeActivationPanelAndBrandCount.test.tsx` — 6
tests. Three on `ActivationPanel` directly (ordinary in-progress state
still says "Working" with no button; an erroring check stops saying
"Working," shows "Setup interrupted," and its "Check again" button calls
`onRefetchStatus`; a genuine job failure keeps its own separate "Retry" →
`onRetry` path). Three on the full `Welcome` page (`@tanstack/react-query`
mocked by queryKey, matching the existing `dashboardHasError.test.ts`
pattern): loading state hides the form; an erroring `/api/brands` shows the
distinct error, not the form; a successful empty response still shows the
ordinary form. All 5 behavior-changing assertions fail against the pre-fix
file (two fail via a genuine "Element type is invalid" import error, since
reverting also removes `ActivationPanel`'s new `export` — itself evidence
the interface didn't exist before); the 6th (already-brandless case) is an
unchanged-behavior baseline and passes both before and after, as expected.
All 6 pass with the fix restored.

## 5. `ScrapeFailureState.tsx` → `/brands?edit=<id>` — verified both halves, then fixed

Verified independently, both true:

- `client/src/components/fact-sheet/ScrapeFailureState.tsx` links
  `<Link to="/brands" search={{ edit: brandId }}>` on all seven of its
  failure-kind branches.
- `client/src/pages/brands.tsx` never read an `edit` param anywhere — its
  Edit dialog opens only via `handleEdit(brand)`, called from the row's own
  Edit button `onClick`. `src/routes/_app/brands.tsx` declares no
  `validateSearch` (confirmed by reading the route file and
  `src/routes/-shared/searchSchemas.ts`, which documents a schema for every
  route that actually reads a query param — `/brands` isn't among them).

Chose "make the param work" over "make the link honest": the deep link is
genuinely useful (land the user on the exact brand that needs fixing, not
a list to search), and `articlesSearchSchema`'s `edit=<articleId>` pattern
for `/articles` already establishes the same semantics elsewhere in this
codebase.

**Constraint hit:** this task is scoped to `client/` only —
`src/routes/**` is explicitly out of bounds (owned by other agents this
session). So a typed `validateSearch` schema on `/_app/brands` (the
`articlesSearchSchema`-style fix) wasn't an option. Instead, `brands.tsx`
reads `edit` directly off `window.location.search` — the exact pattern
`brand-fact-sheet.tsx` already uses for its own `autoScrape` param, per
`searchSchemas.ts`'s own comment on that route. This works regardless of
the route's declared schema, since the global router's `parseSearch`/
`stringifySearch` (per that same file) is a plain string-in/string-out
`URLSearchParams` serializer — `Link`'s `search={{ edit: brandId }}` still
lands in the URL; only the _typed_ read side needed a workaround.

**Fix.** A `useEffect` in `brands.tsx`, gated on `brands` having loaded,
reads `edit` from the URL, calls the real `handleEdit(match)` (not a bare
`setEditingBrand` — `handleEdit` also seeds the edit form via `form.reset`,
which a bare state-set would have skipped, opening an empty form instead
of the brand's actual data) if a matching brand exists, then strips the
param via `history.replaceState` either way (so a stale/invalid id doesn't
leave the URL claiming an edit that never happened, and a refresh doesn't
re-trigger it). `handleEdit` itself was converted from a plain function to
a `useCallback` so it has a stable identity for the effect's own dependency
array (avoids an `exhaustive-deps` warning without silently ignoring it).

**Evidence.** `tests/unit/brandsEditDeepLink.test.tsx` — 4 tests against
the real `Brands` page (real `queryClient`, stubbed `fetch`): `?edit=<id>`
opens the Edit dialog pre-filled with that brand's actual data (proving
`handleEdit`, not a bare state-set, ran); the param is stripped from the
URL afterward; an id matching no brand opens nothing (and still clears the
param); no `?edit=` param opens nothing. The two behavior-changing
assertions (dialog opens; param clears) fail against the pre-fix file
(dialog never appears, `window.location.search` stays `?edit=brand-42`);
the two no-op cases pass both before and after, as expected. All 4 pass
with the fix restored.

## Left alone

- **`client/src/pages/competitors.tsx`'s five icon-only row actions**
  (Demote/Promote/Edit/Ignore/Delete). Re-confirmed against current code:
  all five still carry `title` and no `aria-label`
  (`grep -n "title=\|aria-label" client/src/pages/competitors.tsx` — only
  `title=` hits on those five lines). Left alone, for the same reason the
  prior pass gave: per the WAI-ARIA accessible-name computation, `title` IS
  a valid fallback accessible name when there is no text content and no
  `aria-label`/`aria-labelledby` — a best-practice gap, not a confirmed
  "blocks a screen reader" failure. This file was not touched in this pass.
- **`src/routes/**`** — out of scope for this task (`client/` only); the
  `ScrapeFailureState.tsx` fix above works around this rather than adding a
  route-level `validateSearch` schema, which would otherwise have been the
  more idiomatic fix (matching `articlesSearchSchema`).
- **`client/src/index.css`'s raw OKLCH tokens** and the **landing/pricing
  orange marketing identity** — untouched; no color values were touched by
  any fix in this pass (Board.tsx's new controls all use existing
  `var(--vc-*)`/shadcn tokens already in use elsewhere in that same file).
- **`client/src/lib/queryClient.ts`'s `QueryCache`** — built on, not
  duplicated: `meta.suppressErrorToast` used for the autopilot poll (item
  4a) and the `/api/brands` check (item 4b), since both already render
  their own inline states.

## Verification run

Only the files created/modified in this session, per the task's "run only
your own tests" rule:

```
npx vitest run \
  tests/unit/aiVisibilityChecklistNestedControls.test.tsx \
  tests/unit/boardKeyboardAccessibility.test.tsx \
  tests/unit/welcomeActivationPanelAndBrandCount.test.tsx \
  tests/unit/welcomeAndManualPasteLabels.test.tsx \
  tests/unit/brandsEditDeepLink.test.tsx

 Test Files  5 passed (5)
      Tests  19 passed (19)
```

Every behavior-changing assertion above was run against the pre-fix source
(`git apply -R` on that file's own diff, then re-applied — never
`git stash`/`checkout`, per the shared-worktree rules) and shown to fail
first, documented per-item above.

```
npx tsc --noEmit -p .        # clean, whole project, run after every edit
npx eslint <5 production files + 5 test files>   # 0 errors; all warnings
                                                   # pre-existing, none introduced
npx prettier --check <same 10 files>              # clean (3 files needed
                                                   # --write, then re-verified clean)
```

Live browser verification (`dev-readonly` launch config, `/internal-page` —
public, no login) covered Board.tsx's all four fixes end-to-end, as
detailed in item 1. `ai-visibility.tsx`, `welcome.tsx`, and `brands.tsx`
all sit behind auth (`/login` redirect confirmed live for each, no crash)
and were not created accounts against, per the task's constraint — proven
by component test instead, consistent with B7-11's own approach for
auth-gated surfaces.

## Files touched

Production (5): `client/src/pages/internal/Board.tsx`,
`client/src/pages/ai-visibility.tsx`, `client/src/pages/welcome.tsx`,
`client/src/components/fact-sheet/ManualPasteCard.tsx`,
`client/src/pages/brands.tsx`.

New tests (5, all under `tests/unit/`):
`boardKeyboardAccessibility.test.tsx`,
`aiVisibilityChecklistNestedControls.test.tsx`,
`welcomeActivationPanelAndBrandCount.test.tsx`,
`welcomeAndManualPasteLabels.test.tsx`, `brandsEditDeepLink.test.tsx`.

`.audit/B7/B7-20-ui-remainder.md` — this report.
