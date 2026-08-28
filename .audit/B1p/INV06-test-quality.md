# INV06 test quality

## Inventory

Test files: 258   Files importing no application code: 16   Files that skip without a database: 19

## Violations

### V-01 | critical | 1
File: tests/component/PreviewParam.test.tsx:7
What it claims to test:
The preview parameter allows LitLabs administrators and denies other users.
Why it does not test that:
The file imports no application code. It defines `isAdmin` inside the test.
What would still pass if the feature were deleted:
All three tests would pass after the preview parameter code was deleted.
Confidence: high

### V-02 | critical | 1
File: tests/unit/dashboardPreDataState.test.ts:4
What it claims to test:
The dashboard detects when its measurements are ready.
Why it does not test that:
The file imports no application code. It defines a local `hasMeasured` copy.
What would still pass if the feature were deleted:
All five tests would pass after the dashboard derivation was deleted or changed.
Confidence: high

### V-03 | high | 4
File: tests/helpers/destructiveDatabaseTest.ts:61
What it claims to test:
Nineteen files claim database behavior, RLS behavior, and database-backed API behavior.
Why it does not test that:
Without `TEST_DATABASE_URL`, the gate selects `describe.skip` or excludes the test body.
What would still pass if the feature were deleted:
`npm test` remains green while all 19 database test files skip.
Confidence: high

### V-04 | medium | 4
File: vitest.config.ts:22
What it claims to test:
Sixteen Playwright files claim complete browser user journeys.
Why it does not test that:
The `npm test` command excludes `tests/e2e/**`.
What would still pass if the feature were deleted:
`npm test` remains green when an E2E-only feature breaks.
Confidence: high

### V-05 | medium | 4
File: tests/e2e-optional/platformDetectLive.test.ts:33
What it claims to test:
Platform detection identifies live public sites.
Why it does not test that:
The suite skips unless `LIVE_DETECT` is set.
What would still pass if the feature were deleted:
The normal test command remains green without this corpus running.
Confidence: high

### V-06 | medium | 3
File: tests/unit/factScrapeCacheStorage.test.ts:22
What it claims to test:
The cache and scrape-log storage methods persist data.
Why it does not test that:
Two tests return without an assertion when the database has no brand or scrape run.
What would still pass if the feature were deleted:
Those tests pass against an empty database without calling either storage method.
Confidence: high

### V-07 | medium | 3
File: tests/unit/v2LifecycleStorage.test.ts:28
What it claims to test:
Lifecycle cleanup methods delete expired and old records.
Why it does not test that:
One test returns on an empty brands table. Another checks only that methods return numbers.
What would still pass if the feature were deleted:
Number-returning no-op cleanup methods pass the callability test.
Confidence: high

### V-08 | low | 5
File: tests/unit/billingSubscriptionGuards.test.ts:20
What it claims to test:
Billing routes prevent duplicate subscriptions and preserve period-end behavior.
Why it does not test that:
The assertions search source text instead of sending billing requests.
What would still pass if the feature were deleted:
Not applicable. A correct source refactor can fail these tests while billing still works.
Confidence: high

### V-09 | low | 5
File: tests/unit/citationCronUnconditional.test.ts:28
What it claims to test:
The citation selector excludes deleted and non-paying brands.
Why it does not test that:
The selector assertions search scheduler source text instead of executing the selector.
What would still pass if the feature were deleted:
Not applicable. A correct query refactor can fail these tests while selection still works.
Confidence: high

### V-10 | low | 5
File: tests/unit/planBeforeBrandGate.test.ts:18
What it claims to test:
First-run routing sends users to a usable destination after checkout.
Why it does not test that:
The assertions search route and page source text instead of rendering a route.
What would still pass if the feature were deleted:
Not applicable. A correct route refactor can fail these tests while navigation still works.
Confidence: high

### V-11 | low | 5
File: tests/unit/requestRlsMigrationShape.test.ts:8
What it claims to test:
Request-role migrations restrict fields and writes correctly.
Why it does not test that:
The assertions match migration text. They do not run the policies under database roles.
What would still pass if the feature were deleted:
Not applicable. Equivalent SQL formatting or structure can fail these tests.
Confidence: high

### V-12 | low | 5
File: tests/unit/rlsInitplanMigrationShape.test.ts:14
What it claims to test:
RLS policies use initplan-safe `current_setting` expressions.
Why it does not test that:
The assertions count and match migration tokens. They do not exercise a policy.
What would still pass if the feature were deleted:
Not applicable. An equivalent policy rewrite can fail these tests.
Confidence: high

### V-13 | low | 5
File: tests/unit/schedulerOrchestratorParity.test.ts:26
What it claims to test:
Every scheduler job has an external orchestrator step and a time cap.
Why it does not test that:
The test extracts names with regular expressions from two source files.
What would still pass if the feature were deleted:
Not applicable. A correct registration refactor can fail these tests.
Confidence: high

### V-14 | low | 5
File: tests/unit/schedulerMode.test.ts:81
What it claims to test:
Render assigns scheduled work to the in-process scheduler.
Why it does not test that:
The assertion matches YAML text instead of loading the deployment configuration.
What would still pass if the feature were deleted:
Not applicable. Equivalent YAML formatting can fail the test.
Confidence: high

### V-15 | low | 5
File: tests/unit/settingsPlanSwitch.test.ts:12
What it claims to test:
Settings lets a customer change a subscription plan correctly.
Why it does not test that:
The assertions search component source text. They do not render or operate the control.
What would still pass if the feature were deleted:
Not applicable. A correct component refactor can fail these tests.
Confidence: high

### V-16 | low | 5
File: tests/unit/stripeTestModeBanner.test.ts:14
What it claims to test:
The application announces Stripe test mode and hides the banner for live keys.
Why it does not test that:
The assertions search source files. They do not boot the API or render the banner.
What would still pass if the feature were deleted:
Not applicable. A correct source refactor can fail these tests.
Confidence: high

### V-17 | low | 5
File: tests/unit/stripeWebhookCoverage.test.ts:17
What it claims to test:
Webhook handling covers billing events and preserves payer access during retries.
Why it does not test that:
The assertions parse handler source text. They do not deliver signed webhook events.
What would still pass if the feature were deleted:
Not applicable. A correct handler refactor can fail these tests.
Confidence: high

## UNDETERMINED

- The 19 database-gated files need a controlled test database run to verify their asserted behavior.
