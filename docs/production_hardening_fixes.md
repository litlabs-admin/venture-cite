# Production Hardening Fixes — Plain-English Walkthrough

This document explains every fix from Batches 1–4 in simple terms: what the code did before, what it does now, and why it matters. One entry per fix.

---

## Batch 1 — Security & Stability

### 1. Sanitize all Markdown before rendering
- **Files:** new `client/src/components/SafeMarkdown.tsx`; `client/src/pages/citations.tsx`, `client/src/pages/article-view.tsx`
- **Before:** We rendered Markdown from AI engines and articles with `<ReactMarkdown>` directly. Markdown can contain raw HTML, so a malicious or hallucinated response could inject a `<script>` or an `onerror` attribute and run code in the user's browser (XSS).
- **After:** A `<SafeMarkdown>` wrapper always runs `rehype-sanitize` over the content first. Dangerous tags/attributes are stripped before anything reaches the DOM. All existing Markdown renders now go through this wrapper.
- **Why it matters:** Prompt-injection attacks against LLM output are a known vector. This closes that door.

### 2. Global Error Boundary
- **Files:** new `client/src/components/ErrorBoundary.tsx`; `client/src/App.tsx`
- **Before:** If any component threw a render error (bad data, undefined access, etc.), React unmounted the entire app tree and the user saw a blank white screen with no way to recover.
- **After:** An `ErrorBoundary` wraps the whole app and each authenticated route. When something throws, the user sees a friendly "Something went wrong" card with Try Again / Reload buttons. The rest of the app stays alive.
- **Why it matters:** One bug in one component no longer takes down the product.

### 3. URL safety helpers
- **Files:** new `client/src/lib/urlSafety.ts`; used in `client/src/pages/brands.tsx` and `client/src/pages/pricing.tsx`
- **Before:**
  - Brand website was accepted by gluing `"https://"` on the front of whatever the user typed. No check that the result was a real URL. A `javascript:alert(1)` pasted into the field could end up rendered as an anchor href.
  - The Stripe checkout redirect used `window.location.href = data.url` with no validation — if the server ever returned a different host, we'd follow it blindly.
  - Pricing's "success" banner was triggered by `window.location.search.includes("success=true")`, so `?successfully=true` or `?noSuccess=true` also lit up the success banner.
- **After:**
  - `normalizeWebsite()` parses the input with `new URL()`, requires http/https, requires a domain with a dot, and returns `null` if invalid. Brand form shows a validation error instead of silently accepting junk.
  - `isAllowedStripeRedirect()` only permits `https://checkout.stripe.com` and `https://billing.stripe.com`. Any other URL is rejected with a toast.
  - Pricing reads flags via `URLSearchParams`, so `success` is only `"true"` when the literal `success=true` param is present.
  - Brand website anchors render through `safeExternalHref()`, which returns `undefined` for any non-http(s) URL — so `javascript:` URLs never reach the `href`.
- **Why it matters:** Prevents open-redirects, XSS via `javascript:` hrefs, and false success banners.

### 4. Per-user localStorage for active draft
- **Files:** new `client/src/lib/draftStore.ts`; `client/src/pages/content.tsx`
- **Before:** The Content page saved the "currently open draft id" under a single shared localStorage key, `venturecite-active-draft-id`. On a shared browser, logging out and logging in as a different user would show the previous user's draft id until the first mismatch was detected. That's a cross-account leak.
- **After:** The key is now `venturecite-active-draft-id:<userId>`. The page waits for `useAuth` to resolve, then reads/writes under the scoped key. Legacy keys are auto-migrated once on first read.
- **Why it matters:** Accounts don't leak state into each other on the same browser.

### 5. Disabled global `refetchOnWindowFocus`
- **File:** `client/src/lib/queryClient.ts`
- **Before:** Every React Query query refetched whenever the browser tab regained focus. Combined with our mutations that also imperatively `setQueryData` and `invalidateQueries`, this triggered duplicate network requests racing against each other — which caused occasional stale writes overwriting fresh ones.
- **After:** `refetchOnWindowFocus: false` globally. Specific queries that genuinely benefit from it (e.g. `/api/onboarding-status` in the sidebar) opt in individually.
- **Why it matters:** Fewer duplicate fetches, fewer races, cheaper for the backend.

### 6. `react-helmet` → `react-helmet-async`
- **Files:** every page using `<Helmet>` (14 files); `client/src/App.tsx` gains `<HelmetProvider>`
- **Before:** `react-helmet` v6 is unmaintained and produces React 18 strict-mode warnings. It also isn't safe for server-side rendering patterns.
- **After:** Swapped to `react-helmet-async` with a single `<HelmetProvider>` at the app root. Removed the old package and its types from `package.json`.
- **Why it matters:** No more deprecated-API warnings; future-proof against React 19.

---

## Batch 2 — Error Contract & Data Integrity

### 7. Typed `ApiError`
- **File:** `client/src/lib/queryClient.ts`; `client/src/pages/brands.tsx`
- **Before:** When an API call failed, we threw `new Error("404: {\"error\":\"Not found\"}")`. Callers that wanted the structured body had to `JSON.parse(error.message.replace(/^\d+:\s*/, ""))`. One typo in the regex and the whole error toast broke.
- **After:** A real class `ApiError { status, body, bodyText }` is thrown. Callers use `isApiError(err)` and then read `err.status` and `err.body` directly — no string surgery. Brands page migrated to the new style. For backward compatibility the `.message` still starts with `"<status>: ..."` so any older code keeps working.
- **Why it matters:** Error handling is now typed, reliable, and grep-able.

### 8. Fixed the content.tsx auto-save vs. polling race
- **File:** `client/src/pages/content.tsx`
- **Before:** The page used **one** `setTimeout` ref (`autoSaveTimer`) for two different debouncers: the form-field auto-save and the "generated content" textarea auto-save. Typing in the textarea would silently cancel a pending form-field save and vice versa. Meanwhile a `setInterval(3000)` polled the generation job with no backoff, no visibility check, no cancellation — a hung request would stack overlapping polls, and a failing backend would poll forever.
- **After:**
  - Two separate refs: `autoSaveTimer` for the form, `contentSaveTimer` for the content textarea. They never cancel each other.
  - Polling was rewritten as a self-scheduling `setTimeout` loop: each tick schedules the next one only after the previous finishes, so requests can't pile up.
  - Added an `AbortController` so in-flight requests are cancelled when the job changes or the component unmounts.
  - Added `document.visibilityState === "hidden"` check so the poll is a cheap no-op while the tab is backgrounded.
  - Added exponential backoff (3s → 30s) on consecutive failures, capped at 10 failures, after which we tell the user "Lost connection to generator" and stop.
- **Why it matters:** No more silent data loss while typing; no more runaway polling when the backend is slow or down.

### 9. `apiRequest` accepts an AbortSignal
- **File:** `client/src/lib/queryClient.ts`
- **Before:** No way to cancel an outbound request. A component that unmounted during a slow request would still call `setState` on the resolved response (React warning + wasted work).
- **After:** `apiRequest(method, url, data, { signal })` forwards the signal to `fetch()`. The content.tsx poll uses this.
- **Why it matters:** Clean cancellation, no unmounted-setState warnings.

### 10. AI Visibility rollback + NaN guard
- **File:** `client/src/pages/ai-visibility.tsx`
- **Before:** The progress-bar math did `Math.round((completed / total) * 100)`. If a brand had an engine with zero steps, `total` was `0` and the bar rendered `NaN%`.
  *(Optimistic update rollback was already in place from the prior engagement — verified, left alone.)*
- **After:** Both `getEngineProgress` and `getTotalProgress` guard with `total > 0 ? ... : 0`.
- **Why it matters:** No more `NaN%` ever appears in the UI.

---

## Batch 3 — Bundle Size & Performance

### 11. Lazy-load every Phase-1 feature page
- **File:** `client/src/App.tsx`
- **Before:** Every page (Content, Citations, Articles, Article-View, Brands, Keyword Research, AI Visibility, Pricing) was imported eagerly at the top of `App.tsx`. That meant a brand-new visitor to the landing page downloaded recharts, react-markdown, framer-motion, and every feature page's code before seeing anything.
- **After:** Only Home + auth pages (Login, Register, Forgot/Reset, Landing) stay eager. Everything else is `React.lazy()` + `<Suspense fallback={<spinner />}>`. Each page gets its own chunk, loaded on demand. Also deleted dead Phase-2 imports that were no longer used.
- **Why it matters:** Initial bundle is dramatically smaller. For example, `/citations` (with recharts + markdown) is now a 426 KB chunk that only loads when the user clicks Citations — not on the landing page.

### 12. Memoize hot paths
- **Files:** `client/src/pages/home.tsx`, `client/src/pages/ai-visibility.tsx`, `client/src/pages/citations.tsx`
- **Before:** Values like "the currently selected brand object," "articles filtered by brand," "best-performing platform," and "one outstanding high-priority step per engine" were recomputed on **every render**. When the user types in a form field somewhere, every derived value re-runs — including `flatMap().filter().sort()` over the entire AI Visibility step list.
- **After:** Wrapped these derivations in `useMemo(...)` with correct dependency arrays. They only recompute when the inputs actually change.
- **Why it matters:** Much less CPU work on keystrokes and tab switches.

### 13. Strip `data-testid` in production bundles
- **Files:** `vite.config.ts`; new devDep `babel-plugin-jsx-remove-data-test-id`
- **Before:** Every `data-testid="..."` attribute shipped to real users. Useful in dev/tests; pure bloat in prod.
- **After:** A Babel plugin runs during production builds (`NODE_ENV=production`) and removes them. Development and test builds keep them.
- **Why it matters:** Smaller HTML and a cleaner DOM tree in production.

---

## Batch 4 — Refactors & Safety Guards

### 14. Extract `<BrandFormFields>`
- **Files:** new `client/src/components/BrandFormFields.tsx`; `client/src/pages/brands.tsx`
- **Before:** The Create-brand dialog and the Edit-brand dialog had **the same 220-line form body** copy-pasted. Any change to a field had to be made twice, and the two copies had already started drifting (different `data-testid` suffixes).
- **After:** One `<BrandFormFields form={form} idSuffix="-edit"?>` component used in both dialogs. The suffix preserves the original testid differences. Brands.tsx dropped ~440 lines of duplicated JSX.
- **Why it matters:** One place to change, one place to test. Also a small bundle reduction.

### 15. Type-to-confirm brand delete
- **Files:** new `client/src/components/DeleteBrandDialog.tsx`; `client/src/pages/brands.tsx`
- **Before:** The delete confirmation was a generic "Delete brand and all data" button. One click and the brand + every article + every citation + every prompt was gone. No undo. Double-clicks could fire the mutation twice.
- **After:** GitHub-style confirmation: the user must type the brand's exact name into a text field. The Delete button stays disabled until the typed value matches, and it's further gated by `isPending` so double-clicks are impossible.
- **Why it matters:** Stops accidental nuclear deletes; no race on rapid clicks.

### 16. Citations: idempotency + double-click guards
- **File:** `client/src/pages/citations.tsx`
- **Before:**
  - The "Reset tracked prompts" action was an inline `onClick={async () => ...}` on `<AlertDialogAction>`. While the request was in flight, the button was not disabled — double-clicks created a second reset.
  - Run-check and Generate-prompts buttons checked `isPending` but not `!selectedBrandId`. In a brief window between brand selection and query settle, a click could fire against an empty brand id.
- **After:**
  - The reset is now a proper `useMutation` (`resetMutation`). The action button reads `resetMutation.isPending`, is `disabled` during the call, and shows "Resetting…" while pending.
  - Run and Generate buttons now check `isPending || !selectedBrandId` in **both** the `onClick` guard and the `disabled` prop.
- **Why it matters:** No duplicate runs from impatient clicks; no orphaned API calls with empty brand ids.

---

## Carried Forward From Earlier Work (not part of these batches, but relevant)

- **ai-visibility optimistic rollback** on `toggleStep` mutation failure — already shipped before this engagement. Verified still correct.
- **Sidebar onboarding** reading from cached `/api/brands` + `/api/articles` queries so step completion flips instantly — already shipped.

---

## Explicitly Out of Scope (still open)

These were called out during Batch 4 and deferred by agreement. For each, here's **what it would do** and **why it was too big to include now**.

### A. Split `content.tsx` (1,360 LOC) and `citations.tsx` (1,204 LOC) into subcomponents
- **What it would do:** Break each monolithic page into a tree of small, focused components — e.g. `<DraftsPanel>`, `<GenerationPanel>`, `<ScoreAnalysis>` for content; `<PromptsTab>`, `<ResultsTab>`, `<HistoryTab>`, `<ScheduleTab>` for citations. Each subcomponent owns only the state it needs; shared state moves into a small context or a `useReducer`. Result: every piece becomes individually testable, individually re-renderable, and much easier to reason about.
- **Why it's out of scope now:** Splitting 1,000+ LOC while preserving exact behavior is a high-risk refactor. These pages have subtle state interactions (auto-save + polling + draft switching in content; tab persistence + mutation invalidations + run history in citations). A single misplaced state boundary breaks something non-obvious, and regressions are hard to catch without a full UI test suite — which we don't have. It needs its own plan, its own review cycle, and probably manual QA across the golden path before merging.

### B. Migrate `content.tsx` from raw `useState` to `react-hook-form` + Zod
- **What it would do:** Replace the ~20 individual `useState` calls driving the content-generation form with a single `useForm` + Zod schema, matching the pattern already used in `brands.tsx`. Validation would become declarative (min/max lengths, required fields, URL shape) instead of scattered `if (!keywords) toast(...)` checks. Error messages would live next to their fields via `<FormMessage />`.
- **Why it's out of scope now:** This is tangled with refactor A. The form state is currently read and written from auto-save, polling callbacks, draft loading, "New Article" resets, and the generate mutation. Moving it all to `react-hook-form` means rewriting every one of those call sites in the same pass. Safer to first split the page, then migrate the form inside its new boundary.

### C. Zod-parse every API response at the fetch boundary
- **What it would do:** Every call through `apiRequest()` / `getQueryFn()` would run the response through a Zod schema before returning it. Today we trust the server and do `data?.data?.something` with `any` types everywhere — which means a server shape change silently breaks the UI without a type error. With Zod parsing, the failure happens at the boundary with a clear message, and downstream code gets proper types.
- **Why it's out of scope now:** The app talks to roughly 30+ endpoints, each returning a different shape. To do this right, we'd need to define a shared response schema for each in `@shared/schema` (so the server can use the same type), wire them into a generic `apiRequest<TSchema>()`, and migrate every caller. That's a multi-day effort on its own and belongs in a dedicated refactor.

### D. Server-side pagination + `react-window` for long lists
- **What it would do:** Today `/api/articles` and run-history endpoints return the entire list in one response, and the UI renders every row. At 500+ rows this gets visibly slow. The fix is cursor-based pagination on the server (`?limit=&cursor=`), plus `react-window` virtualization on the client so only visible rows are actually in the DOM.
- **Why it's out of scope now:** Requires backend work: new query params, new response shape (`{ items, nextCursor }`), new index to support efficient cursor scans, and adjustments to any code that currently depends on the full list being present in the cache (e.g. home.tsx's client-side brand filter). It's a coordinated frontend + backend + database change — too much to sneak into a hardening pass.

### E. Buffer OAuth CSRF `state` parameter
- **What it would do:** When the user clicks "Connect Buffer," we'd generate a random `state` value server-side, stash it in the user's session, include it in the Buffer OAuth redirect URL, and verify it matches on the callback. This prevents an attacker from tricking a logged-in user into linking the attacker's Buffer account.
- **Why it's out of scope now:** This is purely server-side work. The frontend just follows a redirect — it has no role in fixing this. It should be fixed before Buffer goes to real users, but it doesn't belong in a frontend hardening batch.

### F. Sentry / error telemetry
- **What it would do:** Wire up `@sentry/react` (or similar) so the `ErrorBoundary`'s `componentDidCatch`, unhandled promise rejections, and explicitly logged errors get reported with stack traces, user context, and breadcrumbs. Without this, we ship a `console.error` and hope somebody looks at their devtools.
- **Why it's out of scope now:** Needs a Sentry account, a DSN/API key stored as an environment variable, source-map upload configured in the build pipeline, and a PII-scrubbing policy decided. You said skip it for now; the `ErrorBoundary` is wired so a future Sentry hook-up is a one-line addition inside its `componentDidCatch`.

Each of these is a real, worth-doing piece of work. None of them were shipped because each is a multi-day engagement with its own risks, and bundling them into this hardening pass would have made the diff too big to review safely.
