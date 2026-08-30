# B8 — Orphaned-page problem: verification and resolution

Scope: every route under `src/routes/`, every component under
`client/src/pages/`, and the API surface those pages call. The task warned
that an earlier audit's claims about `/internal-page` ("12 unauthenticated
write endpoints") and an `/admin/scrape` pair were unverified, and that five
of six carried-forward findings from that audit had already turned out to be
fixed. This report re-derives the current state from code, not from that
audit.

## Bottom line

- **No genuine security finding.** The public board/KPI surface is real, is
  exactly 12 endpoints, but only 6 of the 12 are writes (PUT) — the audit's
  "12 unauthenticated write endpoints" conflated "12 public endpoints" with
  "write endpoints." All 12 are a **deliberate, extensively documented**
  design (public collaborative kanban + aggregate KPI dashboard for the
  internal team), not a lapsed gate. `/admin/scrape` and its API routes are
  fully gated (`isAuthenticated` + `isAdmin`), including the one write
  (`POST /api/admin/scrape/fact/:factId/reverify`). Nothing was found that
  needed silent fixing or prominent flagging as live.
- **One genuinely orphaned page found and fixed**: `/privacy`. Real content,
  real SEO metadata, registered route — but nothing in the app linked to it,
  not even the "Privacy Policy" text in the signup disclaimer. Wired in.
- Every other page in `client/src/pages/` is reachable, either from primary
  navigation, from a spine-page tab, from cross-page links, or as a
  deliberately-documented direct-URL-only surface (legacy redirects, the
  admin tool, the public board).

## Task 1 — every client route, with verdict

Route inventory taken from `src/routeTree.gen.ts` (generated, so it's the
ground truth for what actually resolves) cross-checked against
`src/routes/**/*.tsx` and `client/src/pages/**/*.tsx`.

### Top-level (outside `_app`, mostly public/SSR)

| Route                   | Verdict                   | Evidence                                                                                                                                                      |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | Linked (primary)          | Marketing landing for logged-out visitors; auto-redirects authenticated users to `/dashboard` (`src/routes/index.tsx`).                                       |
| `/glossary`             | Linked                    | Reached from `PageHeader.tsx`'s per-page "(i)" explainer popover (`href="/glossary#${concept}"`), used across the app via `client/src/lib/pageExplainers.ts`. |
| `/pricing`              | Linked                    | Linked from `TrialGate.tsx` (in-app upsell) in two places.                                                                                                    |
| `/privacy`              | **Orphaned → fixed**      | See "Task 3" below.                                                                                                                                           |
| `/health`               | Direct-URL-only by design | Infra health check (`src/routes/health.ts`), not a UI page — consumed by uptime/monitoring tooling, not humans clicking a link.                               |
| `/internal-page`        | Direct-URL-only by design | See Task 2 — extensively documented as deliberately public, no sign-in, reached only by URL.                                                                  |
| `/api/$`, `/webhooks/$` | N/A                       | API/webhook catch-alls, not pages.                                                                                                                            |
| `/$` (root 404)         | By design                 | Catch-all `NotFound` page (`client/src/pages/not-found.tsx`) — must be unreachable by any link; that's its job.                                               |

### `_app/*` (authenticated spine + legacy redirects)

| Route                                                                                                                                                                                                     | Verdict                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard` (and `/`)                                                                                                                                                                                    | Linked (Sidebar)                         | `client/src/components/Sidebar.tsx` — first item in the spine nav.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/setup`, `/monitor`, `/diagnose`, `/act`, `/report`                                                                                                                                                      | Linked (Sidebar)                         | The five spine stages in `Sidebar.tsx`, each with a `data-tour-id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/settings`                                                                                                                                                                                               | Linked (account menu)                    | `Sidebar.tsx` dropdown → "Account settings" → `navigate({ to: "/settings" })`.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`                                                                                                                             | Linked (auth flow)                       | Cross-linked from each other (`register.tsx` ↔ `/login`, etc.) and reached pre-auth.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/welcome`                                                                                                                                                                                                | Reachable, not link-driven               | Programmatic first-run redirect (`FirstRunGate` in `routeGates.tsx`) plus a manual "replay tour" action in `brands.tsx` (`navigate({ to: "/welcome" })`). Intentional, not orphaned.                                                                                                                                                                                                                                                                                                                                                   |
| `/brands`, `/articles`, `/content`, `/content/$articleId`, `/prompts`, `/prompts/$promptId`, `/prompts/$promptId/diagnose`, `/keyword-research`, `/perception`, `/site-health`                            | Linked (cross-page + dashboard panels)   | Verified each has a real `<Link to=…>` or `navigate({ to: … })` call site outside its own file, e.g. `dashboard-panels/primitives.tsx` (`perception`, `siteHealth`, `prompts`), `articles.tsx` ↔ `content.tsx`, `ScrapeFailureState.tsx` → `/brands`.                                                                                                                                                                                                                                                                                  |
| `/admin/scrape`, `/admin/scrape/$runId`                                                                                                                                                                   | Direct-URL-only by design, auth-gated    | See Task 2. Linked to each other (list → detail), not from any nav; operator tool, reached by URL, same pattern `admin-scrape-runs.tsx`'s own header comment states ("Gated to admin via server-side isAdmin middleware").                                                                                                                                                                                                                                                                                                             |
| `/ai-visibility`, `/brand-fact-sheet`, `/citations`, `/community`, `/competitors`, `/crawler-check`, `/faq-manager`, `/geo-analytics`, `/geo-signals`, `/geo-tools`, `/opportunities`, `/ai-intelligence` | Deliberate legacy redirect, not orphaned | Each is a thin `SpineRedirect` to a modern spine URL+tab (e.g. `/citations` → `/monitor?tab=citations`). Comments in each file and in `routeGates.tsx` explain these exist so old bookmarks/external links (search results, historical URLs) keep resolving instead of 404ing. The underlying page **components** these used to render (`client/src/pages/citations.tsx`, `competitors.tsx`, etc.) are still imported — as tabs inside the new spine pages (`monitor.tsx`, `act.tsx`, `diagnose.tsx`, `setup.tsx`), confirmed by grep. |
| `/home2`                                                                                                                                                                                                  | Deliberate legacy redirect               | `<Navigate to="/" />`, commented as a historical URL kept alive rather than 404ing.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/$articleId` under content, `/$promptId`, `/$runId` under admin.scrape                                                                                                                                   | Route params, not pages                  | Parameterized leaves of the routes above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Verdict count:** 1 orphaned (`/privacy`, fixed below). Everything else is
either actively linked, a documented direct-URL-only surface, or a
documented backward-compat redirect.

## Task 2 — the security claim, verified endpoint by endpoint

### `/internal-page` and its API

`src/routes/internal-page.tsx` and `client/src/pages/internal-page.tsx` both
carry long comments stating this is **deliberately public**: no sign-in, a
shared kanban board (5 boards: engineering/marketing/content/aeo/ben) plus a
read-only KPI dashboard, reachable only by whoever has the URL (`noindex`
keeps it out of search but is explicitly called out as not access control).

Endpoints this page calls, checked against `PUBLIC_API_ROUTES` in
`server/auth.ts:180-249`:

| Endpoint                     | In `PUBLIC_API_ROUTES`? | Method | Write?  | Deliberate?                                        |
| ---------------------------- | ----------------------- | ------ | ------- | -------------------------------------------------- |
| `GET /api/board`             | Yes                     | GET    | No      | Yes — legacy alias for the engineering board.      |
| `PUT /api/board`             | Yes                     | PUT    | **Yes** | Yes — see `server/routes/board.ts` header comment. |
| `GET /api/board/engineering` | Yes                     | GET    | No      | Yes                                                |
| `PUT /api/board/engineering` | Yes                     | PUT    | **Yes** | Yes                                                |
| `GET /api/board/marketing`   | Yes                     | GET    | No      | Yes                                                |
| `PUT /api/board/marketing`   | Yes                     | PUT    | **Yes** | Yes                                                |
| `GET /api/board/content`     | Yes                     | GET    | No      | Yes                                                |
| `PUT /api/board/content`     | Yes                     | PUT    | **Yes** | Yes                                                |
| `GET /api/board/aeo`         | Yes                     | GET    | No      | Yes                                                |
| `PUT /api/board/aeo`         | Yes                     | PUT    | **Yes** | Yes                                                |
| `GET /api/board/ben`         | Yes                     | GET    | No      | Yes                                                |
| `PUT /api/board/ben`         | Yes                     | PUT    | **Yes** | Yes                                                |
| `GET /api/internal/kpis`     | Yes                     | GET    | No      | Yes                                                |

That's **12 public board/KPI endpoints total, of which 6 are writes
(PUT)**, not "12 unauthenticated write endpoints." The stale audit's number
(12) is the right count of public endpoints, but it mislabeled all 12 as
writes when half are reads. On the writes themselves: `server/routes/board.ts`
caps the payload (`MAX_TICKETS = 500`, `MAX_FIELD = 4000` chars per field),
whitelists `column`/`kind` enums, and drops any malformed ticket rather than
storing it — so a write can replace a board's _content_ but can't be used to
store arbitrary bulk data or escalate to anything else. Both `server/auth.ts`
(lines 226-235) and `server/routes/board.ts`'s own header comment state this
is a deliberate, reversible decision ("Put the write behind `isAuthenticated`
if the boards must become read-only for the public") — not a lapsed gate.

**Verdict: the "12 unauthenticated write endpoints" claim is stale/wrong as
stated, but not because the endpoints don't exist — they exist and are
public by design.** No fix applied; this is intentional product behavior,
not a security bug. Flagging the mischaracterization here as requested,
without silently changing behavior.

### `/admin/scrape` and `/admin/scrape/$runId`

Both routes are wrapped in `AuthenticatedRoute` client-side
(`src/routes/_app/admin.scrape.tsx`, `admin.scrape.$runId.tsx`). Server-side,
every endpoint in `server/routes/adminScrapeInspector.ts` carries
`isAuthenticated, isAdmin` directly on the route registration:

| Endpoint                                  | Method | `isAuthenticated`+`isAdmin`? | Write?  |
| ----------------------------------------- | ------ | ---------------------------- | ------- |
| `/api/admin/scrape/:runId`                | GET    | Yes (line 21-23)             | No      |
| `/api/admin/scrape/fact/:factId/reverify` | POST   | Yes (line 114-116)           | **Yes** |
| `/api/admin/scrape/runs/recent`           | GET    | Yes (line 166-168)           | No      |

None of these three appear in `PUBLIC_API_ROUTES`, so they are also caught
by the global `requireAuthForApi` gate before even reaching the route-level
`isAdmin` check — a double gate. The one write (`reverify`) is
admin-authenticated. **No unauthenticated write exists here.** This
confirms the "/admin/scrape pair" half of the stale audit's claim was
already fixed before this task started.

### Existing regression coverage for this gate

`tests/unit/requireAuthForApi.test.ts` (already in the tree, from a
concurrent B6b task) mounts the real `requireAuthForApi` middleware and:

- Pins the exact `PUBLIC_API_ROUTES` set by reading it out of
  `server/auth.ts`'s source text (it cannot be imported — it's a private
  `const`), and asserts it equals the same 13-entry (well, 12-unique after
  a documented duplicate) list this report derived independently by hand.
  `/api/admin/scrape/*` is absent from that pinned list, which is itself a
  regression guard against someone adding it to the public set by accident.
- Proves a route outside the allowlist gets a real `401` and the handler is
  never invoked.
- Proves the match is exact-string, not prefix (`POST /api/auth/loginextra`
  stays gated despite sharing a prefix with an allowlisted route).

`.audit/B6/B6b-01-mutation-auth-ownership.md` documents the mutation testing
behind this: it found (before this test existed) that neutering
`requireAuthForApi` entirely left the whole 1734-test suite green, which is
exactly the kind of silent-regression risk this task's rules ask about. That
gap is now closed by the test above. This task added no duplicate of that
work — see "What was changed" below for what it added instead (the no-PII
check, which that suite does not cover).

### `/api/internal/kpis` no-PII guarantee

`server/routes/internalKpis.ts`'s header claims "aggregate counts only...
never emails, names, ids, stripe ids, or any other per-user/per-row data."
Read every one of its 12 `db.select(...)` calls line by line:

- 6 are `count(*)::int` (optionally `filter (where …)` or grouped by
  `accessTier`/`status`) — pure counts, no row data.
- `payingUsersRow`/`payingByTierRows` filter on
  `stripeSubscriptionId is not null` but **select only the count**, never
  the subscription id's value.
- Every field written into the JSON response (`totalUsers`, `activeBrands`,
  `usersByTier`, `payingUsers`, `payingByTier`, `signups7d`, `signups30d`,
  `totalArticles`, `totalPrompts`, `totalCitationRuns`,
  `citationRunsByStatus`, `totalCitationChecks`, `citedChecks`) is a number
  or a `{ tier/status: number }` group map. None is an email, id, or name.

**Verdict: the no-PII guarantee holds** against the actual SELECT list, not
just the comment. Locked in by a new test (below) so a future added field
can't silently violate it.

## Task 3 — what was changed

### Fixed: `/privacy` wired into navigation

`client/src/pages/privacy.tsx` (route `src/routes/privacy.tsx`) renders the
real privacy policy (`docs/privacy-policy.md`) with real SSR `head()`
metadata for search engines. `grep -rn "privacy" client/src src -i` (outside
the route/page files themselves and the generated route tree) turned up
exactly one reference: `register.tsx`'s disclaimer text, "By signing up, you
agree to our Terms of Service and Privacy Policy" — plain text, not a link.
Nothing else in the app referenced it. This matches the task's orphan
definition exactly: reachable by direct URL, registered, real content, but
nothing routes to it, and no comment claims that's deliberate (unlike
`/internal-page`, `/admin/scrape`, or the legacy redirects, all of which
explain themselves).

Chose "wire into navigation" over delete (the content and route are real and
legally relevant — deleting a privacy policy page is not a cleanup) or
"document as direct-URL-only" (there's no plausible deliberate reason for a
privacy policy to be unlinked; unlike `/internal-page`, hiding it serves no
purpose).

**Change:** `client/src/pages/register.tsx` — the "Privacy Policy" segment
of the signup disclaimer is now a real `<a href="/privacy">` link, with a
comment explaining why and pointing at this report. "Terms of Service" stays
plain text because no such page exists in this codebase (`find . -iname
"*terms*"` and a grep for `/terms` came up empty outside unrelated
`highlightTermsRehype.ts`) — creating one is a separate, out-of-scope gap,
not an orphaned-page problem, so it was not invented here.

Proof: `tests/unit/registerPagePrivacyLink.test.tsx` renders the real
`Register` component and asserts the "Privacy Policy" text is an `<a>` with
`href="/privacy"`, and that "Terms of Service" has no link. Verified by
mutation: changed the `href` to a wrong value, confirmed the test failed
with a clear diff, then restored the correct value and confirmed `git diff`
on the source file was byte-identical to the intended change (no stray
edits left behind).

### Added: no-PII regression test for `/api/internal/kpis`

`tests/unit/internalKpisNoPii.test.ts` mounts the real route handler
(`server/db` and the OpenAI-instantiating `routesShared` module stubbed out)
and asserts: every leaf value in the JSON response is a plain `number`
(never a string that could carry an email/id), no key name matches an
identifier-shaped pattern (`email`, `stripeCustomerId`,
`stripeSubscriptionId`, `...Id`, `...name`), and the top-level key set
matches exactly the 13 known-safe aggregate fields.

Proof by mutation: added a literal `lastSignupEmail: "leak@example.com"`
field to the route's `res.json(...)` call, reran the test — 3 of 4
assertions failed immediately (the key-pattern check, the plain-number leaf
check, and the exact-shape check), each with a clear diff naming
`lastSignupEmail`. Removed the mutation; `git diff` on
`server/routes/internalKpis.ts` is empty, confirming a clean revert.

### Not changed

- `/internal-page`, `/admin/scrape`, `/admin/scrape/$runId`, and all 12 legacy
  `SpineRedirect` routes: already correctly documented and/or gated. No
  code change made; this report is the verification.
- No file under the "do not modify" list (`server/auth.ts`,
  `server/lib/ownership.ts`, `server/outbox/`, `server/scheduler.ts`,
  `shared/schema/platform.ts`, `server/storage/platformStorage.ts`) was
  touched. Nothing in this task's findings required changing any of them —
  the board/KPI public-access design and the admin/scrape auth gate are both
  already correct as-is.

## Note on the shared working tree

Mid-task, a `git stash` executed by a concurrent process on this branch
captured the in-progress `register.tsx` edit along with unrelated WIP from
other agents (migration/storage/schema changes). Rather than `git stash
pop` (which risked clobbering other agents' further edits to those same
files, made after the stash), the `register.tsx` change was reapplied
directly from the diff already captured above, and reverified. `stash@{0}`
still exists in the stash list, untouched, for whichever agent's work it
belongs to.

## Verification run

```
npx vitest run tests/unit/registerPagePrivacyLink.test.tsx tests/unit/internalKpisNoPii.test.ts
 Test Files  2 passed (2)
      Tests  6 passed (6)
```

Only these two new/modified test files were run, per this task's "run only
the tests you create or modify" rule. No container or database was started;
neither test needs one.

## Files touched

- `client/src/pages/register.tsx` — Privacy Policy text is now a link.
- `tests/unit/registerPagePrivacyLink.test.tsx` — new, proves the link.
- `tests/unit/internalKpisNoPii.test.ts` — new, proves the no-PII guarantee.
- `.audit/B7/B7-08-orphaned-pages.md` — this report.
