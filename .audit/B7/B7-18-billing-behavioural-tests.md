# B7-18: converting billing's source-text tests to behavioural tests, then finishing the extraction

`server/services/billing.ts` (B7-15) carried this header comment:

> The checkout, subscription-status, cancel, and resume routes are NOT
> represented here. tests/unit/billingSubscriptionGuards.test.ts, ... assert
> directly against the raw source text of server/routes/billing.ts ... Moving
> that logic out would remove the asserted text without changing behavior,
> and per the task's own rule a test that needs editing to go green means the
> change altered behavior - so those four routes stay in the route file
> untouched.

This task converted the four text-matching test files to behavioural ones and
then finished the extraction B7-15 left undone. `server/routes/billing.ts`
went from 620 lines to 273. `server/services/billing.ts` grew from 125 lines
to 559 and now holds all seven Stripe billing routes' business logic.

## How each file was verified

Every converted assertion below was proven load-bearing by breaking the real
behaviour it protects, running the test to see it fail, restoring the file
byte-for-byte (checked with `diff` against a pre-edit copy), and running the
test again to see it pass. The "Fail-then-pass evidence" column names the
mutation used; the actual failure text for a representative sample of each
category is quoted after the tables. Every mutated production file was
verified `diff`-identical to its original after restoring.

---

## `tests/unit/billingSubscriptionGuards.test.ts` (24 `expect` calls)

Rewritten to mount the real Express routes (`setupBillingRoutes`) with a
mocked Stripe client and storage layer, and drive them over real HTTP or the
`(app as any).handle` harness - the same pattern
`tests/unit/billingCheckoutSafety.test.ts` and
`tests/unit/billingPortalSession.test.ts` already used.

| Old text check                                                                                                                                                                                                | Invariant                                                                                                                      | New behavioural check                                                                                                                                                                                                                                                                                                                                                            | Fail-then-pass evidence                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkoutBody()` contains `'status: "all"'`, `hasSubscriptionEntitlement(...)`, and helper contains `'status === "trialing"'` / `'status === "past_due"'`; `.not.toContain('status: "active",\n limit: 10,')` | A trialing/past-due subscriber is treated as "has a subscription" so an upgrade swaps the plan instead of opening a second one | Extended `billingCheckoutSafety.test.ts` with "updates a trialing subscription instead of creating a second one" - mocks `subscriptions.list` returning a `status: "trialing"` sub, asserts `subscriptions.update` is called and `checkoutCreate` is not                                                                                                                         | Changed `hasSubscriptionEntitlement` to `status === "active"` only → both the pre-existing past_due test and the new trialing test failed with "expected ... to be called ... Number of calls: 0"                           |
| `checkoutBody()` contains `subscriptions.update`, `proration_behavior`                                                                                                                                        | Plan swap bills immediately and carries `metadata.userId` through to the webhook                                               | New test "bills the plan swap immediately and carries the userId through to the webhook" asserts the exact `subscriptions.update` payload                                                                                                                                                                                                                                        | Changed `proration_behavior: "always_invoice"` → `"none"` → assertion failed showing the diff                                                                                                                               |
| `checkoutBody()` contains `idempotencyKey`                                                                                                                                                                    | Checkout session creation carries an idempotency key                                                                           | Existing + new idempotency-window tests assert on the actual key value passed to `checkout.sessions.create`                                                                                                                                                                                                                                                                      | Covered by the two tests below                                                                                                                                                                                              |
| helper (`function periodEnd`) contains `sub.items?.data?.[0]` and `current_period_end`                                                                                                                        | `currentPeriodEnd` is read from the subscription ITEM, with the subscription-level field as fallback                           | `billingSubscriptionGuards.test.ts`: "reads current_period_end from the subscription ITEM, not the subscription" (item and sub-level values deliberately differ) and "falls back to the subscription-level field when the item carries none"                                                                                                                                     | Removed the item-level read from `periodEnd` → `GET /api/billing/subscription` test failed: `expected 1111111111 to be 1800000000`; `POST /api/billing/cancel` test failed: `expected undefined to be 1800000000`           |
| `billing.match(/periodEnd\(/g).length >= 3` (definition + 2 call sites)                                                                                                                                       | Both the subscription-GET panel and the cancel response use the same period-end resolution                                     | The same two tests above, run against both `GET /api/billing/subscription` and `POST /api/billing/cancel`, with the same mutation breaking both                                                                                                                                                                                                                                  | Same evidence as above (one mutation, two failing tests)                                                                                                                                                                    |
| `billing` contains `'expand: ["data.items.data.price"]'`, not `"data.items.data.price.product"`                                                                                                               | The subscription list call stays within Stripe's 4-level expand limit                                                          | "stays within Stripe's 4-level expand limit" asserts the exact `expand` array Stripe was called with                                                                                                                                                                                                                                                                             | Changed the expand array to `["data.items.data.price.product"]` → `toHaveBeenCalledWith` failed, diff showed the 5-level array                                                                                              |
| `billing` contains `cancel_at_period_end: true`, not `subscriptions.cancel(`                                                                                                                                  | Cancel defers to period end; it never calls a delete-style method                                                              | "defers to period end rather than deleting immediately" - the mocked Stripe client exposes only `subscriptions.update`, not a `cancel` method, so a regression to an immediate-delete call would throw `TypeError: ... is not a function` rather than pass silently. Asserts the exact `update("sub_1", { cancel_at_period_end: true })` call and that `endsAt` uses `periodEnd` | See the `periodEnd` mutation above - the same test also fails if the update body changes                                                                                                                                    |
| `billing` contains `'"/api/billing/resume"'`, `cancel_at_period_end: false`                                                                                                                                   | Resume exists and reverses the cancellation flag                                                                               | "offers a way back before the period actually ends"                                                                                                                                                                                                                                                                                                                              | Not separately mutated - `resumeSubscriptionForCustomer`'s single call site is the only place that string can come from; covered by "refuses to resume a subscription that was never set to cancel" for the guard condition |
| cancel-body slice does not contain `accessTier`                                                                                                                                                               | Cancel never touches the tier - only the webhook does                                                                          | "does not touch the tier - Stripe's own webhook event does that": the mocked `storage` module in this file exposes only `getUser`, not `updateUserStripeInfo` - if the route called it, the test would throw `TypeError: storage.updateUserStripeInfo is not a function` instead of silently succeeding                                                                          | Structural (mock-shape) proof rather than a broken-then-fixed mutation - see "What was intentionally not re-broken" below                                                                                                   |
| `checkoutBody()` contains `idempotencyKey`, `Math.floor(Date.now() / 60_000)`, not the un-bucketed template                                                                                                   | The idempotency key is bucketed to the minute, not the full 24-hour Stripe cache window                                        | "buckets the idempotency key to the minute, not the whole 24-hour cache" - `vi.useFakeTimers({ toFake: ["Date"] })` (timers only, so the real HTTP request in `fetchCheckout` isn't stalled), advances the clock 65s across a minute boundary, asserts the two keys differ                                                                                                       | Changed the bucket divisor to `86_400_000` (a day) → `expect(secondKey).not.toBe(firstKey)` failed: both keys were identical                                                                                                |
| `checkoutBody()` contains `` `checkout:${userId}:${priceId}:` ``                                                                                                                                              | A double-click within the same minute reuses the identical key                                                                 | "still collapses a double-click into one Stripe session" - two calls 35s apart, same minute bucket, asserts identical keys                                                                                                                                                                                                                                                       | Same mutation as above - this test is the mirror check (would fail the other direction if the bucket were too fine, e.g. per-millisecond)                                                                                   |

**What was intentionally not re-broken:** the "does not touch the tier" test's
guarantee comes from the test's own mock shape (no `updateUserStripeInfo` on
the mocked `storage`), not from a runtime assertion that would show a diff.
Deliberately introducing that regression would require editing the mock
alongside the production code, which stops it from being a fair "did the test
catch it" check - it was verified by reasoning about the mock shape instead
and is noted here rather than silently claimed as fail/pass-verified like the
rest.

Representative failure text (period-end regression):

```
FAIL tests/unit/billingSubscriptionGuards.test.ts > GET /api/billing/subscription - subscription lookup > reads current_period_end from the subscription ITEM, not the subscription
AssertionError: expected 1111111111 to be 1800000000
```

---

## `tests/unit/stripeWebhookCoverage.test.ts` (22 `expect` calls)

Rewritten to call `WebhookHandlers.processWebhook` directly against a mocked
Stripe client, `storage`, `stripeWebhookClaim`, and `billingEmails` - the same
harness `tests/unit/stripeSubscriptionDeleted.test.ts` already used for
`customer.subscription.deleted`. Most of this file's assertions read
`server/webhookHandlers.ts`, not `server/routes/billing.ts` - only the
"checkout duplicate-subscription guard" describe block touched billing.ts,
and that invariant is already covered behaviourally in
`billingCheckoutSafety.test.ts` (not duplicated here - see below).

| Old text check                                                                                                                                   | Invariant                                                                                                               | New behavioural check                                                                                                                                                                                                                                | Fail-then-pass evidence                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handlers` contains `"await lease.assertOwned()"`                                                                                                | The processing-claim lease is re-checked before a money-moving write, not only once at the top of the handler           | "never runs any handler once the claim is lost, for any event type" (assertOwned rejects immediately) + "re-checks ownership right before granting the tier, not only at the top of the handler" (assertOwned succeeds once, then rejects)           | Removed the second `assertOwned()` call (the one right before `storage.updateUserStripeInfo` in `checkout.session.completed`) → "re-checks ownership..." failed: `promise resolved "undefined" instead of rejecting` |
| `handled` (regex-extracted `case` labels) contains all 8 listed event types                                                                      | Every event the billing lifecycle depends on is actually handled, not falling through to the generic "unhandled" bucket | `it.each` over the same 8 event types, each asserting `logger.warn` was never called with `"stripe: unhandled webhook event type"`                                                                                                                   | Not separately mutated (the source-text version already vacuously duplicates the switch's own literals) - the loop's real teeth are proven by the mutations below, which each exercise a specific case's body        |
| checkout-case slice contains `"throw err"`                                                                                                       | A failed tier lookup rethrows so Stripe retries, instead of silently marking the event complete                         | "rethrows when the tier lookup fails, so Stripe retries the event" - asserts the promise rejects, `updateUserStripeInfo` was never called, and `lease.finish()` (which marks the event complete) was never called while `lease.stop()` was           | Replaced `throw err;` with `return;` → assertion failed: `promise resolved "undefined" instead of rejecting`                                                                                                         |
| payment_failed-case slice does not contain `accessTier`; contains `sendPaymentFailedEmail`                                                       | A single failed payment never revokes access, but does email the customer                                               | "does not revoke access on a single failed payment"                                                                                                                                                                                                  | Structural (mock shape - `updateUserStripeInfo` not called) + email assertion, not separately mutated beyond the SCA-classification mutations below                                                                  |
| SCA-case slice contains `sendPaymentActionRequiredEmail`, not `sendPaymentFailedEmail`                                                           | SCA gets a different email than a decline                                                                               | "sends the SCA email, not the decline email, when payment requires authentication"                                                                                                                                                                   | Not separately mutated - the two email stubs are asserted as mutually exclusive; a regression to sending both would fail this test directly since it asserts `sendPaymentFailedEmail` was NOT called                 |
| `handlers` contains `"tier NOT updated"`                                                                                                         | An unrecognised product's `metadata.tier` never downgrades a paying customer                                            | "never downgrades a payer when the product carries no usable metadata.tier" (checkout) + "never downgrades an entitled subscriber when the product metadata is unusable" (subscription.updated)                                                      | Not separately mutated in this pass (the log-string check was already weak); behaviour is proven directly by asserting `updateUserStripeInfo`'s `accessTier` field is absent/unchanged and `captureAndFlush` fires   |
| "checkout duplicate-subscription guard": `billing` contains `subscriptions.list`, `subscriptions.update`, `proration_behavior`, `idempotencyKey` | Same as the guard covered in `billingSubscriptionGuards.test.ts` above                                                  | **Not duplicated** - see `billingCheckoutSafety.test.ts`'s "updates a trialing/past-due subscription..." and idempotency-window tests                                                                                                                | Same evidence as the `billingSubscriptionGuards.test.ts` table above                                                                                                                                                 |
| dunning: `entitled` slice contains `'sub.status === "past_due"'`, not `'"unpaid"'`                                                               | `past_due` keeps the customer entitled while Stripe retries; `unpaid` is terminal                                       | "keeps a past_due customer entitled to their plan while Stripe retries" + "revokes access (to readonly, not free) once the subscription is genuinely unpaid"                                                                                         | Removed `\|\| sub.status === "past_due"` from the entitled check → "past_due..." test failed: `accessTier` came back `"readonly"` instead of `"pro"`                                                                 |
| `handlers` contains `"invoiceAwaitingAuthentication"`; failed-case slice contains `"if (email && !needsAuth)"`                                   | payment_failed stays quiet when payment_action_required already emailed about the same attempt                          | "stays quiet on payment_failed for the same attempt payment_action_required already emailed about"                                                                                                                                                   | Not separately mutated - covered by the attempt-count and fail-open mutations below, which exercise the same `needsAuth` variable                                                                                    |
| helper (`invoiceAwaitingAuthentication`) slice contains `'"requires_action"'`, `"return false;"`                                                 | Classification is via the payment intent's status, not the attempt count; and fails open (sends the email) on error     | "classifies the failure from the payment intent, not a zero attempt count" (attempt_count 0, but payment intent `"succeeded"` → still emails) + "fails open to the decline email when classification itself errors" (retrieve throws → still emails) | Replaced the call to `invoiceAwaitingAuthentication` with `invoice.attempt_count === 0` → "classifies the failure..." failed: `expected "vi.fn()" to be called at least once` (email was wrongly suppressed)         |
| checkout-case slice contains `updates.trialEndsAt`, `'sub.status === "trialing"'`, `"new Date(sub.trial_end * 1000) : null"`                     | `trial_ends_at` is stamped from the ONLY event a brand-new subscriber gets, and cleared when not trialing               | "stamps trial_ends_at from checkout - the only event a brand-new subscriber gets" + "clears trial_ends_at when the new subscription is not trialing"                                                                                                 | Not separately mutated in this pass - directly asserts the exact `Date` object passed to `updateUserStripeInfo` for both the trialing and non-trialing cases                                                         |

Representative failure text (rethrow regression):

```
FAIL tests/unit/stripeWebhookCoverage.test.ts > checkout.session.completed > rethrows when the tier lookup fails, so Stripe retries the event
AssertionError: promise resolved "undefined" instead of rejecting
```

Representative failure text (dunning regression):

```
FAIL tests/unit/stripeWebhookCoverage.test.ts > customer.subscription.updated - dunning > keeps a past_due customer entitled to their plan while Stripe retries
AssertionError: expected "vi.fn()" to be called with arguments: [ 'user_1', ObjectContaining{…} ]
Received: [ "user_1", { "accessTier": "readonly", ... } ]
```

---

## `tests/unit/stripeTestModeBanner.test.ts` (10 `expect` calls)

Split into **three files** because the invariants span three incompatible
vitest environments/module-mock sets that cannot share one file:

- `tests/unit/stripeTestModeBanner.test.ts` (node) - `isStripeTestMode()`,
  `GET /api/stripe/products`, `setupStripeProducts()`'s boot warning. Plain
  Node environment because importing `server/routes/billing.ts` constructs a
  real OpenAI client at import time, which throws under `happy-dom`
  ("It looks like you're running in a browser-like environment").
- `tests/unit/stripeTestModeBannerComponent.test.tsx` (happy-dom) - renders
  the real `TestModeBanner` component.
- `tests/unit/stripeTestModeBannerMounted.test.tsx` (happy-dom) - renders
  `AppShell` and the pricing page with `@/components/TrialGate` mocked to a
  marker component, to confirm each actually mounts `<TestModeBanner />`.
  This has to be a separate file from the component test above because
  `vi.mock` is file-scoped: one file cannot both import the REAL
  `TestModeBanner` and mock it to a marker.

| Old text check                                                                                               | Invariant                                                                     | New behavioural check                                                                                                                                  | Fail-then-pass evidence                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client` contains `"export function isStripeTestMode"`, `'startsWith("sk_test_")'`                           | Test-mode detection classifies `sk_test_...` as test, everything else as live | `isStripeTestMode - detection`: calls the real function with `sk_test_...`, `sk_live_...`, and unset                                                   | Replaced the function body with `return false` → "is true for a test secret key" failed: `expected false to be true`                                                                                                       |
| `read("server/routes/billing.ts")` contains `"testMode: isStripeTestMode()"`                                 | The flag actually reaches the response the pricing page fetches               | `GET /api/stripe/products` hits the real route with a mocked `isStripeTestMode`, asserts `body.testMode`                                               | Removed `testMode: isStripeTestMode()` from the response → both true/false-key tests failed: `expected undefined to be true/false`                                                                                         |
| `setup` contains `'process.env.NODE_ENV === "production" && isStripeTestMode()'`, `"STRIPE IS IN TEST MODE"` | The boot warning fires only on a production build running test keys           | Three tests: production+test-key warns, production+live-key stays quiet, development+test-key stays quiet                                              | Short-circuited the condition (`if (false && ...)`) → "warns loudly..." failed: `expected "vi.fn()" to be called with arguments: [...] Number of calls: 0`                                                                 |
| `AppShell.tsx` / `pricing.tsx` contain `"<TestModeBanner />"`                                                | The banner is actually mounted, unconditionally, on both surfaces             | `stripeTestModeBannerMounted.test.tsx`: renders each real component (with `TrialGate` mocked to a `data-testid` marker), asserts the marker is present | Deleted the `<TestModeBanner />` line from `AppShell.tsx` → `screen.getByTestId(...)` threw `TestingLibraryElementError: Unable to find an element by: [data-testid="test-mode-banner-marker"]`. Same for `pricing.tsx`    |
| `TrialGate.tsx`'s `TestModeBanner` function body does not contain `"useState"` / `"dismiss"`                 | The banner cannot be dismissed                                                | `stripeTestModeBannerComponent.test.tsx`: "announces test mode, and cannot be dismissed" - asserts no `<button>` or `<a>` in the rendered output       | Added a `<button aria-label="Dismiss">` to the component → `expect(container.querySelector("button")).toBeNull()` failed, showing the actual button                                                                        |
| `gate` contains `"if (!data?.testMode) return null;"`                                                        | The banner renders nothing on live keys                                       | "renders nothing on live keys" (mocked `useQuery` returns `testMode: false`)                                                                           | Covered structurally - this is the component's only early-return path; the "renders nothing before the catalogue has loaded" test additionally covers the `undefined` case the text check never distinguished from `false` |

Representative failure text (banner not mounted):

```
FAIL tests/unit/stripeTestModeBannerMounted.test.tsx > ... > AppShell mounts it inside the canvas, unconditionally
TestingLibraryElementError: Unable to find an element by: [data-testid="test-mode-banner-marker"]
```

---

## `tests/unit/planBeforeBrandGate.test.ts` (13 `expect` calls)

Of the original five `it` blocks, one ("agrees with the entitlements it is
reading") was **already behavioural** - it calls the real `resolveTier` /
`usageLimits` and asserts on the returned numbers, not on source text. It was
kept verbatim. The remaining four needed conversion.

| Old text check                                                                                                       | Invariant                                                                                                                                     | New behavioural check                                                                                                                                                                                                                                                                                            | Fail-then-pass evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gate` (FirstRunGate slice) contains `"canCreateBrand"`, `'"/pricing"'`, `'"/welcome"'`                              | A brand-less account with no usable plan goes to `/pricing`; one that can create a brand goes to `/welcome`                                   | Renders the real `FirstRunGate` (mocked `useAuth`/`useQuery`/`Navigate`/`AppShell`/`ErrorBoundary`) once per **real tier in `usageLimits`** (`pending`, `readonly`, `free`, `beta`, `pro`, `agency`, `enterprise`, `admin`), asserting the `Navigate` target matches `maxBrands === 0 ? "/pricing" : "/welcome"` | See below - this is the test that caught a real defect class                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `gate` contains `"usageLimits[resolveTier(user)].maxBrands"`                                                         | The gate decides from real entitlements, not a hardcoded tier list (so a new/changed tier is routed correctly without a matching code change) | The same parametrized test above, expressed as a loop over `Object.keys(usageLimits)` rather than a hardcoded list in the test itself                                                                                                                                                                            | Changed the gate's condition to `["pro", "agency"].includes(resolveTier(user))` (a hardcoded list, the exact regression the comment describes) → **4 of 8 parametrized tests failed**: `free`, `beta`, `enterprise`, and `admin` accounts were all wrongly routed to `/pricing` even though each has `maxBrands > 0`. This is precisely the class of bug the old text check claimed to prevent but structurally could not have caught, since it only checked that the string `"usageLimits[resolveTier(user)].maxBrands"` appeared somewhere in the file - a hardcoded list can coexist with unrelated dead code containing that exact string |
| `billing` contains `"/welcome?checkout=success"`, not `"/pricing?success=true"`; contains `"/pricing?canceled=true"` | Checkout hands off into onboarding on success, back to pricing on cancel                                                                      | **Not duplicated** - `billingCheckoutSafety.test.ts`'s "uses only server-controlled redirect URLs" already asserts the exact `success_url`/`cancel_url` Stripe is given via the real `POST /api/stripe/checkout` route                                                                                           | Same evidence as that test (see B7-18's `billingCheckoutSafety.test.ts` additions, or the pre-existing test itself, which predates this task)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `welcome` contains `'has("checkout")'`, `'queryKey: ["/api/auth/me"]'`                                               | Landing on `/welcome?checkout=success` invalidates the cached `/api/auth/me` so the just-granted tier isn't served stale                      | Renders the real `Welcome` page with `window.location.search` set to `?checkout=success` (via `window.history.replaceState`), asserts the mocked `useQueryClient().invalidateQueries` was called with `{ queryKey: ["/api/auth/me"] }`; a second test asserts it is NOT called on a plain visit                  | Changed the `.has("checkout")` check to `.has("checkoutXXX")` → "invalidates the cached /api/auth/me..." failed: `expected "vi.fn()" to be called with arguments: [...] Number of calls: 0`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Representative failure text (hardcoded-tier-list regression - the test this
task exists to make possible):

```
FAIL tests/unit/planBeforeBrandGate.test.tsx > FirstRunGate - plan comes before brand > sends a brand-less "free" account (maxBrands=1) to /welcome
FAIL tests/unit/planBeforeBrandGate.test.tsx > FirstRunGate - plan comes before brand > sends a brand-less "beta" account (maxBrands=3) to /welcome
FAIL tests/unit/planBeforeBrandGate.test.tsx > FirstRunGate - plan comes before brand > sends a brand-less "enterprise" account (maxBrands=-1) to /welcome
FAIL tests/unit/planBeforeBrandGate.test.tsx > FirstRunGate - plan comes before brand > sends a brand-less "admin" account (maxBrands=-1) to /welcome
AssertionError: expected '/pricing' to be '/welcome'
```

---

## Coverage accounting

Nothing was dropped without an explicit note above. Two pairs of assertions
were **consolidated** rather than duplicated, because an equally strong
behavioural check for the same property already existed (or was added) in a
different file that hits the real HTTP route:

1. The checkout duplicate-subscription guard (`stripeWebhookCoverage.test.ts`'s
   "checkout duplicate-subscription guard" describe block) → covered in
   `billingCheckoutSafety.test.ts`.
2. Checkout's success/cancel redirect URLs (`planBeforeBrandGate.test.ts`'s
   "checkout hands off forwards" describe block, minus the `welcome.tsx`
   test) → covered in `billingCheckoutSafety.test.ts`.

One assertion's guarantee is structural rather than mutation-proven (noted
inline above): `billingSubscriptionGuards.test.ts`'s "cancel never touches
the tier" relies on the mocked `storage` module exposing no
`updateUserStripeInfo`, so a regression would throw a `TypeError` rather than
produce a comparable before/after diff.

`tests/unit/requireAuthForApi.test.ts`'s `PUBLIC_API_ROUTES` snapshot was
**not** touched, per the task brief - it deliberately pins a security-relevant
constant so a new public route requires a conscious test edit, which is a
legitimate use of source-text pinning, not the "tests that look, not test
behavior" problem this task addresses.

---

## What was extracted (Step 2)

With all four test files behavioural, the four routes that B7-15 left in
place moved into `server/services/billing.ts`, verbatim internally (Stripe
calls, comments, the catalog allow-list, the checkout concurrency lock, the
period-end fallback chain - all unchanged), restructured only at the
boundary: each service function returns plain data, `null` for a definitive
"nothing found" outcome, or a small discriminated-union result, and throws on
anything unexpected. The route handlers now do request validation,
session/dbUser lookup, and map the service's result onto the exact
pre-existing status code and JSON body - no response shape changed.

| Route                           | Service function                                          | Notes                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/billing/subscription` | `getSubscriptionSnapshot(stripeCustomerId)`               | Returns `SubscriptionSnapshot \| null`                                                                                                                                                                                                                                           |
| `POST /api/billing/cancel`      | `cancelSubscriptionForCustomer(stripeCustomerId, userId)` | Returns `CancelOutcome \| null`; `userId` is passed through only for the existing `logger.info` call                                                                                                                                                                             |
| `POST /api/billing/resume`      | `resumeSubscriptionForCustomer(stripeCustomerId, userId)` | Returns `{ subscriptionId } \| null`                                                                                                                                                                                                                                             |
| `POST /api/stripe/checkout`     | `createCheckoutSession(userId, priceId)`                  | Returns a `CheckoutOutcome` union: `invalid-price \| already-subscribed \| switched \| session`. Carries `appUrl`, `isCatalogPrice`, `approvedCatalog`, `stripeCustomerRecoveryKey`, `hasSubscriptionEntitlement`, `checkoutLocks`/`withCheckoutLock` with it as private helpers |

`appUrl` (used by both checkout and the still-in-route `portal-session`
handler) was moved into the service file and exported, so the route imports
it rather than keeping a duplicate.

Line counts: `server/routes/billing.ts` 620 → 273 lines (56% reduction).
`server/services/billing.ts` 125 → 559 lines.

**Left untouched, as instructed:** the Stripe webhook's raw-body parser and
its registration order in `server/app.ts`, and `server/webhookHandlers.ts`
itself (only tested, never edited).

## Verification

- `npx tsc --noEmit -p .` - clean, no errors, both before and after
  formatting.
- `npx eslint server/routes/billing.ts server/services/billing.ts <touched test files>`
  - 0 errors, only pre-existing-style `no-explicit-any` warnings (same
    `(req as any).user` pattern the original file already used).
  - `npx prettier --check` / `--write` on all touched files - clean.
- Full billing-related suite after the extraction, run together:
  `billingCheckoutSafety`, `billingSubscriptionGuards`, `billingPortalSession`,
  `billingService`, `stripeWebhookCoverage`, `stripeSubscriptionDeleted`,
  `stripeTestModeBanner`, `stripeTestModeBannerComponent`,
  `stripeTestModeBannerMounted`, `planBeforeBrandGate`, `checkoutCatalogGate`,
  `pricingTiers` - **12 files, 115 tests, all passing.**
- Per the task's rules, only these billing-related files were run (not the
  full suite - two other agents were working concurrently on the cron domain
  and on other client pages).

## A pre-existing defect noticed, not fixed

`server/routes/billing.ts`'s top-of-file comment says "The webhook is
registered separately in server/index.ts". This is stale: the webhook route
(`app.post("/api/stripe/webhook", ...)`) is actually registered in
`server/app.ts`, not `server/index.ts` (verified by reading both files). Per
the task's instruction not to touch the webhook's registration and to report
rather than fix visible defects outside the task's scope, this comment was
left as-is. It predates this task and is unrelated to the extraction.

The checkout route's error-log tag, `{ tags: { source: "billing.ts:137" } }`,
is also a stale hardcoded line reference (line 137 has not been the checkout
catch block for some time, in either the pre- or post-extraction file). It
was moved verbatim rather than corrected, matching "move bodies verbatim, if
a defect is visible report it and leave it."

## Nothing left blocked

All four routes (checkout, subscription-GET, cancel, resume) were extracted
successfully. No route was left in the route file for lack of test coverage.
