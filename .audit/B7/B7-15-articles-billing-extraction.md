# B7-15: articles.ts / billing.ts service extraction

Extracted business logic from `server/routes/articles.ts` (724 lines) and
`server/routes/billing.ts` (675 lines) into `server/services/`, matching the
pattern established in B7-13/B7-14 (flat files, domain-prefixed names, no
`Service` suffix, functions take explicit parameters and return plain data or
throw, never touch `req`/`res`).

## Before/after line counts

| File                                              | Before | After |
| ------------------------------------------------- | ------ | ----- |
| `server/routes/articles.ts`                       | 724    | 571   |
| `server/routes/billing.ts`                        | 675    | 620   |
| **New:** `server/services/articleDistribution.ts` | —      | 184   |
| **New:** `server/services/geoRankings.ts`         | —      | 48    |
| **New:** `server/services/billing.ts`             | —      | 125   |

`articles.ts` shrank by ~21%. `billing.ts` shrank by only ~8% - see "Why
billing.ts stayed mostly in place" below; this was a deliberate, documented
decision, not an incomplete pass.

## Handler inventory - articles.ts

Most of this file was already thin. Article/revision CRUD (`POST
/api/articles`, `POST /api/articles/draft`, `GET /api/articles`, `GET
/api/articles/:id`, `PUT /api/articles/:id`, `DELETE /api/articles/:id`, the
three revisions routes, `POST /api/distributions`, `GET
/api/distributions/:articleId`, `POST /api/distributions/:distributionId/buffer-post`)
already delegate entirely to `contentRequestData`'s repositories (the
pre-existing B6a service/repo layer) or the shared `postToBuffer` helper.
Each of those is already parse → ownership → one call → shape-response. There
was nothing left in them to extract.

| Route                                         | Before    | Non-parse/ownership/shaping logic found                                     | Extracted to                                                        |
| --------------------------------------------- | --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `metadataWithContent` (module-level helper)   | 5 lines   | Entire body (pure, used by the distribution-edit PATCH)                     | `articleDistribution.metadataWithContent`                           |
| `PATCH /api/distribute/entry/:distributionId` | 24 lines  | None (just calls the helper above)                                          | —                                                                   |
| `POST /api/distribute/:articleId`             | 183 lines | Platform-prompt templates + OpenAI call + per-platform create/update loop   | `articleDistribution.distributeArticleToPlatforms`                  |
| `POST /api/geo-rankings`                      | 20 lines  | `isCited` boolean→int coercion + `rank`/`citationContext` null defaulting   | `geoRankings.createGeoRankingObservation`                           |
| `GET /api/geo-rankings`                       | 24 lines  | Ownership-filtered ranking list (cross-reference owned articles ↔ rankings) | `geoRankings.listGeoRankingsForArticle` / `listGeoRankingsForOwner` |
| `GET /api/geo-rankings/platform/:platform`    | 15 lines  | Same ownership-filtered cross-reference, scoped by platform                 | `geoRankings.listGeoRankingsByPlatformForOwner`                     |

`storage`, `openai`, `MODELS`, and `logger` are no longer imported in
`articles.ts` - none of the surviving handlers use them directly anymore.

## Service modules and grouping rationale (articles.ts)

- `articleDistribution.ts` - everything about turning an article into
  platform-native social copy: the pure `metadataWithContent` merge helper
  and the six-platform prompt-build/OpenAI-call/persist loop. Both live
  under the same "Distribution" section banner in the original file and
  both operate on the same `ContentRequestDistributionRepository`.
- `geoRankings.ts` - the GEO-ranking create/list/list-by-platform logic,
  including the article-ownership cross-reference (`articleIdsOwnedByBrands`)
  that both list functions share. This is genuinely common: identical
  filter shape used twice on two different underlying reads (all rankings,
  platform-scoped rankings).

## Handler inventory and grouping rationale - billing.ts

| Route                              | Extracted?         | Reason                                                                                    |
| ---------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `POST /api/billing/portal-session` | Yes                | Stripe portal-session creation moved to `billing.createBillingPortalSession`              |
| `GET /api/stripe/publishable-key`  | No                 | Already a one-line passthrough to `stripeClient.getStripePublishableKey`; nothing to move |
| `GET /api/stripe/products`         | Yes                | Product/price fetch + merge + sort moved to `billing.getStripeProductCatalog`             |
| `POST /api/stripe/checkout`        | **No - see below** |                                                                                           |
| `GET /api/billing/subscription`    | **No - see below** |                                                                                           |
| `POST /api/billing/cancel`         | **No - see below** |                                                                                           |
| `POST /api/billing/resume`         | **No - see below** |                                                                                           |
| `GET /api/billing/invoices`        | Yes                | Invoice fetch + draft-filter + field-shaping moved to `billing.listBillingInvoices`       |

### Why checkout / subscription / cancel / resume stayed in the handler

This is the "particular care" case the task brief anticipated. Four existing
test files assert directly against the **raw source text** of
`server/routes/billing.ts` via `readFileSync`, not just against behavior:

- `tests/unit/billingSubscriptionGuards.test.ts` slices the file from the
  `"/api/stripe/checkout"` string literal to the `"/api/billing/subscription"`
  string literal and asserts the resulting span contains `status: "all"`,
  `hasSubscriptionEntitlement(subscription.status)`, `subscriptions.update`,
  `proration_behavior`, and the minute-bucketed `idempotencyKey` template
  literal. It separately asserts `function periodEnd` and
  `function hasSubscriptionEntitlement` are defined in the file, that
  `periodEnd(` appears at least 3 times in the whole file (1 definition + 2
  call sites, one in `/api/billing/subscription`, one in
  `/api/billing/cancel`), that `expand: ["data.items.data.price"]` appears
  verbatim, and that the cancel-handler span contains
  `cancel_at_period_end: true` / the resume span contains
  `cancel_at_period_end: false`.
- `tests/unit/stripeTestModeBanner.test.ts` asserts the literal string
  `testMode: isStripeTestMode()` is present in the file.
- `tests/unit/stripeWebhookCoverage.test.ts` and
  `tests/unit/planBeforeBrandGate.test.ts` assert `subscriptions.list`,
  `subscriptions.update`, `proration_behavior`, `idempotencyKey`,
  `/welcome?checkout=success`, and `/pricing?canceled=true` are all present
  in the file as literal text.

Between them, these tests pin nearly the entire body of the checkout,
subscription-GET, cancel, and resume handlers - and the module-level helpers
`periodEnd` and `hasSubscriptionEntitlement` - to remain **as literal text
inside `server/routes/billing.ts`**. Moving any of that logic into
`server/services/billing.ts` would not change behavior, but it would remove
the asserted substrings from the file the tests read, failing them. The
task's own rule is that a test needing an edit to go green means the change
altered behavior, and editing the test is out of scope. So: the entire
`/api/stripe/checkout`, `/api/billing/subscription`, `/api/billing/cancel`,
and `/api/billing/resume` handlers, plus `periodEnd`, `appUrl`,
`isSellableTier`, `approvedCatalog`, `isCatalogPrice`,
`stripeCustomerRecoveryKey`, `hasSubscriptionEntitlement`, `checkoutLocks`,
and `withCheckoutLock`, stay exactly where they were. `server/services/billing.ts`
carries a header comment recording this so a future reader doesn't wonder
why the biggest, most stateful routes in the file weren't touched.

The three routes that were extracted (`portal-session`, `products`,
`invoices`) have no such whitebox test - only behavioral tests
(`billingPortalSession.test.ts`) or no dedicated test at all - so extracting
their Stripe-call-and-shape logic was safe.

## Service modules and grouping rationale (billing.ts)

- `billing.ts` - the three safely-extractable Stripe read/write operations
  (`getStripeProductCatalog`, `createBillingPortalSession`,
  `listBillingInvoices`). Kept in one file rather than three because they're
  small, share no state, and all three exist only to keep
  `server/routes/billing.ts` from doing Stripe SDK orchestration inline -
  same rationale as the file being one module per route file's "everything
  that's left" bucket in the B7-13 precedent (`trackedContentSync.ts`).

## Defects found and left alone

- `server/services/billing.ts` `listBillingInvoices` / the original
  `/api/billing/invoices` handler: `invoice.hosted_invoice_url` and
  `invoice.invoice_pdf` are typed by the Stripe SDK as
  `string | null | undefined`, but the field is never normalized before
  being sent to the client - a `draft`-adjacent invoice state could return
  `undefined` where the client only expects `string | null`. Preserved
  verbatim; not introduced by this extraction (the original inline code had
  the identical gap, just without a type surfacing it).
- `server/routes/billing.ts` header comment (line 1-11) says "All four
  endpoints proxy through to Stripe's REST API" and lists only 4 routes.
  The file has 8 routes today (`publishable-key`, `products`, `checkout`,
  `portal-session`, `subscription`, `cancel`, `resume`, `invoices`). This
  comment was already stale before this change (four of those routes -
  `subscription`, `cancel`, `resume`, `invoices` - predate this task) and
  isn't something a verbatim-move task should silently "fix" by rewriting
  prose; flagging here instead.
- `server/services/geoRankings.ts` `createGeoRankingObservation`: the
  `aiPlatform`/`prompt` fields flow straight from `req.body` through to
  `storage.createGeoRanking` with no validation beyond the pre-existing
  `articleId` string check - a `POST /api/geo-rankings` caller can send any
  JSON type for `aiPlatform`/`prompt`/`rank`/`citationContext`. Preserved
  verbatim (the original handler did the same); worth a follow-up zod schema
  but out of scope for a move.

## Genuinely common vs. only-looked-common

- **Genuinely common:** `articleIdsOwnedByBrands` inside `geoRankings.ts` -
  identical ownership cross-reference needed by both `GET /api/geo-rankings`
  (no `articleId`) and `GET /api/geo-rankings/platform/:platform`. One
  private helper, two callers.
- **Only looked common:** the "fetch → filter/map → return" shape repeats
  across `getStripeProductCatalog` and `listBillingInvoices` in
  `services/billing.ts`, but the two operate on different Stripe resources
  with unrelated filter predicates (tier-metadata presence vs. draft-status
  exclusion) and different output shapes. Left as two separate functions
  rather than inventing a generic "fetch and shape Stripe collection"
  helper - that would be a refactor, not an extraction.

## Verification

- `npx tsc --noEmit -p .` - clean, no errors. (Two type errors surfaced
  during the extraction and were fixed without changing behavior: the
  `distributeArticleToPlatforms` `brand` parameter needed
  `| null | undefined` because `requestBrandRepository.get()` can return
  `undefined`, which the original inline closure never had to name; and
  `BillingInvoiceSummary.hostedInvoiceUrl`/`invoicePdf` needed
  `| undefined` to match what the Stripe SDK's `Invoice` type actually
  allows, matching the defect noted above.)
- `npm run check` (`tsc && verify:tours`) - clean:
  `Tour-target verification OK (22 targets, all present).`
- `npx eslint` on all 8 touched/created files - 0 errors, 18
  `no-explicit-any` warnings, all matching the pre-existing `any` usage in
  the code being moved (same baseline pattern as B7-13's report).
- `npx prettier --check` on all 8 touched/created files - clean.
- Existing tests, run unmodified and green (91 tests across 13 files):
  `tests/unit/billingCheckoutSafety.test.ts` (whitebox-sensitive checkout
  behavior), `tests/unit/billingPortalSession.test.ts`,
  `tests/unit/billingSubscriptionGuards.test.ts` (the source-text guard
  described above - still finds every asserted string because checkout/
  subscription/cancel/resume were never touched),
  `tests/unit/stripeTestModeBanner.test.ts`,
  `tests/unit/stripeWebhookCoverage.test.ts`,
  `tests/unit/planBeforeBrandGate.test.ts`,
  `tests/unit/articlesAIGenerated.test.ts`,
  `tests/unit/distributionBufferPost.test.ts`,
  `tests/unit/stripeSubscriptionDeleted.test.ts`,
  `tests/unit/stripeWebhookClaim.test.ts`.
- New direct (no-HTTP) service tests, all green:
  `tests/unit/articleDistributionService.test.ts` (covers
  `metadataWithContent` and `distributeArticleToPlatforms` - success,
  empty-model-response failure, thrown-API-error failure, and the
  no-row-returned throw),
  `tests/unit/geoRankingsService.test.ts` (covers
  `createGeoRankingObservation`'s boolean→int coercion, and both
  ownership-filtered list functions),
  `tests/unit/billingService.test.ts` (covers `getStripeProductCatalog`'s
  merge+sort, `createBillingPortalSession`'s pass-through, and
  `listBillingInvoices`'s draft-filter + field mapping). These call every
  extracted function directly against mocked `storage`/`stripeClient`/
  `openai`, with no Express app, request, or response involved.
- No test required editing to go green. No database or container was
  started. `server/routes/factSheet.ts`, `factSheetV2.ts`, `onboarding.ts`,
  `cron.ts`, `userAccount.ts`, `migrations/`, `client/`, and
  `server/app.ts`/`server/webhookHandlers.ts`/`server/lib/stripeWebhookClaim.ts`
  (the actual Stripe webhook path - confirmed to live in `server/app.ts`,
  not `server/routes/billing.ts` or `server/index.ts` despite what
  `billing.ts`'s own header comment claims) were not touched.
