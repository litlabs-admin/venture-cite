import { z } from "zod";

// Phase 2 Task 8: `validateSearch` schemas for every route that actually
// reads a query-string param. Lives under `-shared/` (same
// routeFileIgnorePrefix as routeGates.tsx) so the router codegen does not
// treat it as a route of its own.
//
// Ground rules, per docs/.../native-api-contract.md and this task's brief:
//
// 1. `src/router.tsx` pins the whole app's parseSearch/stringifySearch to
//    plain string-in/string-out (URLSearchParams), deliberately, to match
//    this product's long-standing URL contract (bookmarked/hand-typed/
//    mailed-in-CTA links). Every field below is therefore a bare
//    `z.string()` — never a JSON-shaped/coerced type — so a schema here
//    can only ever narrow "is this key present as a string", never change
//    what a URL means.
// 2. Every field is `.optional().catch(undefined)`: a missing OR
//    type-mismatched value resolves to `undefined` instead of throwing.
//    Concretely, with the string-only parser above, the only way a field
//    could ever fail `z.string()` is if it weren't present at all — so
//    `.catch()` here is a defense-in-depth backstop (e.g. against a future
//    schema change), not a currently-reachable path. Unknown *values*
//    (`?tab=not-a-real-tab`) are NOT rejected — they pass through as
//    ordinary strings; it's each embedded component's job (e.g.
//    SpineShell falling back to `defaultTab`) to treat an unrecognized
//    value as "use the default", never to crash.
// 3. Every schema is `.passthrough()`: unknown keys are preserved, not
//    stripped. This matters because query params are shared across the
//    app in ways no single route "owns" — `brandId` (the global brand
//    selector, read by `useBrandSelection()` from nearly every
//    authenticated page) is the big one, but any future cross-cutting key
//    behaves the same way. Stripping unknown keys would silently break
//    those shared readers the moment a route below declared a schema at
//    all; passthrough makes adding a schema additive-only.

/** `/articles` — `?edit=<articleId>` deep-links into ViewEditDialog for
 *  that article (client/src/pages/articles.tsx; also the "Open in
 *  Articles" link on the embedded Content editor, content.tsx). */
export const articlesSearchSchema = z
  .object({
    edit: z.string().optional().catch(undefined),
  })
  .passthrough();

/** `/content` and `/content/$articleId` — seed params sent by Keyword
 *  Research's "Generate Content" action
 *  (`/content?keyword=...&industry=...&type=...&brandId=...`, see
 *  client/src/pages/keyword-research.tsx → handleGenerateContent). Read
 *  once, on first mount with no article yet resolved
 *  (client/src/pages/content.tsx's bootstrap effect); every field is
 *  optional because content.tsx falls back to reusing/creating a
 *  brand-default draft when any (or all) are absent. Declared identically
 *  on both route files since content.tsx is the exact same component
 *  mounted at either path (see content.$articleId.tsx's own comment on
 *  why there is no param plumbing between them). */
export const contentSearchSchema = z
  .object({
    keyword: z.string().optional().catch(undefined),
    industry: z.string().optional().catch(undefined),
    type: z.string().optional().catch(undefined),
    brandId: z.string().optional().catch(undefined),
  })
  .passthrough();

/** `/act` — `tab` is the active SpineShell tab (create/library/keywords/
 *  geo-assets/faq/community); SpineShell itself
 *  (client/src/components/SpineShell.tsx, out of this task's file scope)
 *  reads it straight off `location.searchStr` rather than through this
 *  schema, but it's declared here so `useSearch({ strict: false })` types
 *  it too wherever else it's read. `article` is Content's embedded-mode
 *  article id: when Content is mounted as the Act › Create tab (rather
 *  than standalone at /content), the active article rides on `?article=`
 *  instead of the path so switching drafts doesn't navigate the app out
 *  of the spine (see client/src/pages/content.tsx's `embedded` branch). */
export const actSearchSchema = z
  .object({
    tab: z.string().optional().catch(undefined),
    article: z.string().optional().catch(undefined),
  })
  .passthrough();

/** `/monitor` — `tab` is the active SpineShell tab (overview/citations/
 *  competitors/trends/mentions). `mention` opens MentionDetailSheet for a
 *  specific brand mention on the embedded Mentions tab
 *  (client/src/components/geo-tools/MentionsTab.tsx, out of this task's
 *  file scope — it currently reads `location.searchStr` directly rather
 *  than through this schema; declared here for the same
 *  whole-tree-typing reason as `/act`'s `tab`). `ptab` is the Citations
 *  tab's own inner tab bar (prompts/results/history/schedule) — the one
 *  sub-tab bar in the app that used to be localStorage-only
 *  (`usePersistedState("vc_citations_tab", ...)`) instead of URL-driven
 *  like every other tab here; client/src/pages/citations.tsx now reads it
 *  via `useSearch({ strict: false })`, falling back to the persisted
 *  last-used tab when absent. */
export const monitorSearchSchema = z
  .object({
    tab: z.string().optional().catch(undefined),
    mention: z.string().optional().catch(undefined),
    ptab: z.string().optional().catch(undefined),
  })
  .passthrough();

/** `/diagnose` — `tab` is the active SpineShell tab (hallucinations/
 *  signals/crawler). */
export const diagnoseSearchSchema = z
  .object({
    tab: z.string().optional().catch(undefined),
  })
  .passthrough();

/** `/setup` — `tab` is the active SpineShell tab (brands/fact-sheet/
 *  visibility). */
export const setupSearchSchema = z
  .object({
    tab: z.string().optional().catch(undefined),
  })
  .passthrough();

/** `/dashboard` — `brandId` arrives here from the Welcome activation flow
 *  (client/src/pages/welcome.tsx navigates to `/dashboard?brandId=` once
 *  autopilot setup completes) so the freshly-created brand is selected
 *  immediately instead of falling back to localStorage / first-brand. */
export const dashboardSearchSchema = z
  .object({
    brandId: z.string().optional().catch(undefined),
  })
  .passthrough();

/** `/brand-fact-sheet` — `autoScrape=<brandId>` auto-fires a re-scrape
 *  right after brand creation (client/src/pages/brands.tsx navigates here
 *  with it; client/src/pages/brand-fact-sheet.tsx, out of this task's
 *  file scope, reads it back off `window.location.search` directly — see
 *  this task's report for why that's a native read rather than a router
 *  one). This route is itself a SpineRedirect to `/setup?tab=fact-sheet`
 *  (src/routes/-shared/routeGates.tsx's `SpineRedirect`), which forwards
 *  every existing param — `autoScrape` included — via `useSearch({strict:
 *  false})`, so declaring it here also documents what survives that hop. */
export const brandFactSheetSearchSchema = z
  .object({
    autoScrape: z.string().optional().catch(undefined),
  })
  .passthrough();

/** `/geo-tools` — `brand=<brandId>` is sent by
 *  client/src/components/ScanCompletionListener.tsx's "View" toast
 *  action. Note this is `brand`, not `brandId`: `useBrandSelection()`
 *  (client/src/hooks/use-brand-selection.ts) only reads the `brandId` key,
 *  so this param does not currently drive brand selection on arrival —
 *  see this task's report. Declared (rather than left un-typed) so that
 *  fact is visible in the route's own schema instead of only in a search
 *  string nobody validates. This route is itself a SpineRedirect to
 *  `/act?tab=geo-assets`, which forwards it along unchanged. */
export const geoToolsSearchSchema = z
  .object({
    brand: z.string().optional().catch(undefined),
  })
  .passthrough();
