# INV05-concurrency concurrent write safety

## The rule as implemented
File: server/lib/usageLimit.ts:66
Rule: The quota code locks a user row before it reads and changes a quota value.

File: server/outbox/outboxRepository.ts:94
Rule: The outbox claims one command with `FOR UPDATE SKIP LOCKED` and a lease token.

File: server/databaseStorage.ts:1555
Rule: A content worker changes a job only when its lease token still matches.

No shared write layer enforces these rules for every server write path.

## Complete inventory
| Item | Defined at | Satisfies invariant? | Evidence |
|---|---|---|---|
| Analytics singleton creation and update | server/databaseStorage.ts:189 | No, see V-15. | The code selects rows, then inserts or updates one selected row. |
| Tour state patch | server/databaseStorage.ts:387 | Yes. | One transaction reads the user row with `FOR UPDATE` before it writes JSON. |
| Article and brand quotas | server/lib/usageLimit.ts:66 | Yes. | The transaction locks the user row and changes the counter in the same transaction. |
| Monthly article usage reset | server/databaseStorage.ts:1927 | No, see V-13. | A read of `usageResetDate` leads to an unconditional reset. |
| Beta invite redemption | server/databaseStorage.ts:1992 | Yes. | One conditional SQL update checks remaining uses and increments `used_count`. |
| Content job queue claim | server/databaseStorage.ts:1481 | Yes. | The claim uses `FOR UPDATE SKIP LOCKED`. |
| Content job slice and terminal update | server/databaseStorage.ts:1555 | Yes. | Lease-token predicates guard every worker update. |
| Agent task claim | server/databaseStorage.ts:4135 | Yes. | One conditional update changes queued work to in-progress. |
| Durable outbox claim and completion | server/outbox/outboxRepository.ts:94 | Yes. | The command claim uses row locking and completion checks the lease token. |
| Stripe webhook claim | server/lib/stripeWebhookClaim.ts:15 | Yes. | The upsert and token predicates allow one active processor. |
| Source rate bucket | server/lib/rateLimitBuckets.ts:78 | Yes. | The transaction locks the bucket row before refill and decrement. |
| Onboarding state patch | server/routes/onboarding.ts:97 | Yes. | One `jsonb ||` update merges the allowed top-level keys. |
| Provider LLM slot | server/lib/llmConcurrency.ts:47 | No, see V-01. | The count and insert share one statement but do not lock a provider scope. |
| General LLM daily budget | server/lib/llmBudget.ts:45 | No, see V-02. | The code reads spend before an external call and writes spend later. |
| Chatbot daily and hourly budget | server/lib/chatbotBudget.ts:35 | No, see V-03. | The code reads two totals before a later atomic usage increment. |
| Chatbot usage increment | server/lib/chatbotBudget.ts:51 | Yes for the increment. | The upsert adds the token values in SQL. Admission remains unsafe. |
| Prompt generation number | server/databaseStorage.ts:1187 | No, see V-11. | The next number is `existing.length + 1`. |
| Prompt generation and reset | server/routes/prompts.ts:52 | No, see V-11. | The route checks tracked rows before it starts paid generation. |
| Prompt suggestion refresh | server/lib/suggestionGenerator.ts:195 | No, see V-12. | The worker reads tracked rows, calls an LLM, then inserts suggestions. |
| Prompt promotion and manual add | server/routes/prompts.ts:151 | No, see V-10. | The route checks the cap before it promotes or inserts a prompt. |
| Prompt audience generation | server/lib/audienceGenerator.ts:105 | No, see V-12. | The worker reads active prompts, calls an LLM, then inserts audiences. |
| Prompt Set Health audit | server/lib/promptSetHealthAuditor.ts:131 | No, see V-12. | The worker reads prompts and rankings, calls an LLM, then inserts a run. |
| Prompt phrasing generation | server/lib/phrasingGenerator.ts:39 | No, see V-12. | The worker reads a prompt, calls an LLM, then inserts phrasings. |
| Citation runner | server/citationChecker.ts:1456 | Yes. | A dynamic advisory lock serializes a run for one brand. |
| Citation run aggregate | server/databaseStorage.ts:1337 | No, see V-14. | The aggregate uses a separate ranking read and run update. |
| Perception summary score | server/lib/perceptionRun.ts:42 | No, see V-06. | The score reads evidence, calls an LLM, then inserts a run. |
| Perception probe run creation | server/lib/perceptionProbes.ts:183 | No, see V-04. | Run creation has no idempotency key or active-run constraint. |
| Perception probe execution | server/lib/perceptionProbes.ts:341 | No, see V-05. | Pending probes have no claim before provider calls start. |
| Brand activation ledger | server/lib/brandActivation.ts:97 | No, see V-08. | The code reads a JSON ledger, runs work, then replaces the ledger. |
| Mention scan start | server/routes/mentions.ts:386 | No, see V-09. | The active-job and cooldown reads precede a job insert. |
| Mention scan execution | server/lib/runMentionScan.ts:16 | No, see V-09. | The status read precedes an unconditional running update. |
| Weekly report scheduler | server/scheduler.ts:39 | Yes for concurrent runs. | Each current call path also takes a scheduler advisory lock. |
| Weekly digest sender | server/lib/weeklyDigestEmitter.ts:40 | No, see V-07. | The cooldown read precedes the email and the stamp update. |
| Workflow advance | server/lib/workflowEngine.ts:153 | Yes. | A per-run PostgreSQL advisory lock wraps state changes. |
| Workflow cancellation | server/lib/workflowEngine.ts:615 | No, see V-16. | Cancellation reads and writes without the workflow lock or a version check. |
| Fact conflict acceptance | server/databaseStorage.ts:3916 | No, see V-17. | The target update returns values used by a second conflicting-row update. |
| Fact scrape state and counters | server/databaseStorage.ts:3668 | Yes. | Status uses compare-and-set and counters use SQL increment expressions. |
| Monthly fact scrape cost | server/databaseStorage.ts:3837 | Yes. | The primary key and `ON CONFLICT` add the delta in SQL. |
| Tracked content URL upsert | server/databaseStorage.ts:2913 | Yes for data integrity. | The unique index prevents duplicate source rows. A losing request returns a conflict error. |
| Competitor and mention deduplication | server/databaseStorage.ts:2037 | Yes. | Conflict targets or unique indexes prevent duplicate rows. |
| Prompt tags and audience links | server/databaseStorage.ts:935 | Yes. | Unique link indexes and `ON CONFLICT DO NOTHING` make retries safe. |
| Site health history | server/lib/siteHealthHistory.ts:33 | Yes on its current call path. | The completed scrape path holds a per-brand advisory lock before it calls this writer. |
| Source health failure counter | server/lib/sourceHealth.ts:68 | No, see V-18. | The code reads the counter before it writes a replacement value. |
| FAQ AI surface score recomputation | server/routes/contentTypes.ts:882 | No, see V-19. | The route reads old FAQ values before it writes a derived score. |
| Fact sheet direct work and persistence | server/routes/factSheetV2.ts:157 | No, see V-20. | Direct routes start page work and merge facts without a page or brand claim. |
| Fact re-verification | server/lib/factAgent/v2/reverifyFact.ts:82 | No, see V-21. | The code reads a fact before external work and a later derived update. |
| Generic LLM job finalization | server/lib/llmJobs.ts:289 | No, see V-22. | The finalizer runs before the job state changes to terminal. |
| Keyword and FAQ finalizer deduplication | server/routes/content.ts:149 | No, see V-23. | Both finalizers read current rows before they insert results. |
| Citation name-variation append | server/databaseStorage.ts:2138 | No, see V-24. | Parallel citation workers replace an array built from a stale read. |
| Checkout session creation | server/routes/billing.ts:382 | No, see V-25. | Subscription lookup and checkout creation lack a shared lock. |
| Subscription cancel and resume | server/routes/billing.ts:549 | No, see V-26. | The routes read Stripe state and issue conflicting later updates. |
| Webhook subscription state | server/webhookHandlers.ts:203 | No, see V-27. | Event claims do not order different events for one subscription. |
| Visibility guide first-visit stamp | server/routes.ts:491 | No, see V-28. | The route reads an empty stamp before it writes a timestamp. |
| Chatbot first-message title | server/routes/assistant.ts:233 | No, see V-29. | The route reads `New chat` before it writes a derived title. |

## Violations
### V-01 | critical
Item: Provider LLM slot acquisition.
Defined at: server/lib/llmConcurrency.ts:47
Why it violates the invariant: The statement counts live slots without a lock for the provider.
How it fails: Twenty requests each read nineteen live OpenAI slots. Each request inserts one slot. The table then has thirty-nine slots.
Confidence: high

### V-02 | high
Item: General LLM daily budget admission.
Defined at: server/lib/llmBudget.ts:45
Why it violates the invariant: `assertWithinBudget` reads total spend. `recordSpend` writes after the provider call. No reservation exists.
How it fails: Two requests read 900 tokens under a 1,000-token cap. Both call a provider for 200 tokens. Both later record spend. The account spends 1,300 tokens.
Confidence: high

### V-03 | high
Item: Chatbot daily token and hourly message limits.
Defined at: server/lib/chatbotBudget.ts:35
Why it violates the invariant: The checks run before the user message, provider stream, and usage upsert. The upsert cannot repair an overspent limit.
How it fails: Two chat requests read nine messages under a ten-message limit. Both stream an answer. The final usage rows record eleven messages.
Confidence: high

### V-04 | high
Item: Perception probe run creation.
Defined at: server/lib/perceptionProbes.ts:183
Why it violates the invariant: The code inserts a new pending run and thirty probes without an idempotency key or an active-run unique constraint.
How it fails: A client retry arrives after the first response is lost. Both requests create a run. The client or cron can process sixty paid probes.
Confidence: high

### V-05 | critical
Item: Perception probe execution.
Defined at: server/lib/perceptionProbes.ts:341
Why it violates the invariant: The code selects pending probes and starts provider calls before it claims any probe or engine.
How it fails: A browser advance and the cron advance select the same pending engine. Both issue five provider calls and one judge call. Each overwrites the same rows.
Confidence: high

### V-06 | high
Item: Perception summary scoring.
Defined at: server/lib/perceptionRun.ts:42
Why it violates the invariant: The code reads evidence, calls an LLM, and inserts a new score row. No brand claim or request key exists.
How it fails: Two dashboard requests pass the same cooldown check. Both score the same evidence and insert separate perception rows after two paid calls.
Confidence: high

### V-07 | critical
Item: Weekly digest email emission.
Defined at: server/lib/weeklyDigestEmitter.ts:40
Why it violates the invariant: The code reads `lastWeeklyDigestSentAt`, sends an email, and only then writes the cooldown stamp.
How it fails: Two workflow completions read an old stamp. Both send a digest. Both then set the stamp. The user receives two emails.
Confidence: high

### V-08 | high
Item: Brand activation ledger.
Defined at: server/lib/brandActivation.ts:97
Why it violates the invariant: The code reads one JSON ledger, runs each due job, and replaces the ledger after each job. It has no lock or compare-and-set.
How it fails: Two scheduler requests read an empty ledger. Both run the perception and mention jobs. Each writes similar timestamps after duplicate provider work.
Confidence: high

### V-09 | high
Item: Mention scan start and execution.
Defined at: server/routes/mentions.ts:386
Defined at: server/lib/runMentionScan.ts:16
Why it violates the invariant: Active-job checks and job status checks use separate reads and unconditional writes. No unique active-job constraint or claim exists.
How it fails: Two start requests see no active job and insert two jobs. A retry can also run one queued job twice because both workers set it to running.
Confidence: high

### V-10 | high
Item: Prompt cap, duplicate, and promotion checks.
Defined at: server/routes/prompts.ts:151
Defined at: server/routes/prompts.ts:232
Why it violates the invariant: The route counts tracked prompts and checks duplicates before separate promotion or insertion writes.
How it fails: Two add requests both see nine tracked prompts under a ten-prompt cap. Both promote or insert. The brand has eleven tracked prompts and double weekly work.
Confidence: high

### V-11 | high
Item: Initial prompt generation, reset, and generation numbering.
Defined at: server/routes/prompts.ts:52
Defined at: server/lib/promptGenerator.ts:194
Defined at: server/databaseStorage.ts:1187
Why it violates the invariant: The code checks for tracked prompts, calls an LLM, archives rows, counts generations, and inserts new rows without a brand lock.
How it fails: Two generate requests both see no tracked prompts. Both buy a generation. Both calculate the same next generation number and create competing tracked sets.
Confidence: high

### V-12 | high
Item: Suggested prompts, audiences, Set Health, and phrasings.
Defined at: server/lib/suggestionGenerator.ts:195
Defined at: server/lib/audienceGenerator.ts:105
Defined at: server/lib/promptSetHealthAuditor.ts:131
Defined at: server/lib/phrasingGenerator.ts:39
Why it violates the invariant: Each function reads current rows, calls an LLM, and writes derived rows without a brand claim or idempotency key.
How it fails: A retry and a second request use the same prompt set. Both buy model calls. Suggestions and tests can duplicate. Audience name conflicts only discard some duplicate output.
Confidence: high

### V-13 | high
Item: Monthly article usage reset.
Defined at: server/databaseStorage.ts:1927
Why it violates the invariant: `getUserUsage` reads the old month, then calls an unconditional counter reset outside a transaction.
How it fails: One request reads last month at five articles. Another request claims quota and increments to six. The first request then writes zero and loses the new usage.
Confidence: high

### V-14 | medium
Item: Citation run aggregate recomputation.
Defined at: server/databaseStorage.ts:1337
Why it violates the invariant: The code reads all ranking rows, computes totals in memory, then updates the run in a separate statement.
How it fails: Worker A reads ten rankings. Worker B writes five rankings and stores totals of fifteen. Worker A then stores totals of ten.
Confidence: high

### V-15 | medium
Item: Analytics singleton creation and update.
Defined at: server/databaseStorage.ts:189
Defined at: server/databaseStorage.ts:232
Why it violates the invariant: Both methods select the table before they decide to insert or update. No singleton constraint exists.
How it fails: Two first requests see no row and insert two rows. Later updates select different first rows and split the analytics state.
Confidence: high

### V-16 | medium
Item: Workflow cancellation.
Defined at: server/lib/workflowEngine.ts:615
Why it violates the invariant: Cancellation does not use the per-run lock that protects advancement. It also does not use a status predicate.
How it fails: An advancing worker reads a running workflow. A user cancels it. The worker later writes its saved step state and changes the cancelled workflow again.
Confidence: high

### V-17 | medium
Item: Conflicting fact acceptance.
Defined at: server/databaseStorage.ts:3916
Why it violates the invariant: The first update returns the accepted fact. A second unguarded update dismisses its conflict peer.
How it fails: Two users accept opposite facts at once. Each accepts one fact and dismisses the other. Both rows can become accepted and dismissed.
Confidence: high

### V-18 | medium
Item: Source health failure counter.
Defined at: server/lib/sourceHealth.ts:68
Why it violates the invariant: The helper reads `consecutiveFailures`, adds one in memory, and upserts the replacement value.
How it fails: Two failing scans read one failure. Both write two failures. The source needs one extra failed scan before it pauses.
Confidence: high

### V-19 | medium
Item: FAQ AI surface score recomputation.
Defined at: server/routes/contentTypes.ts:882
Why it violates the invariant: The route derives `aiSurfaceScore` from a prior question and answer without a version predicate.
How it fails: One request changes the question. Another changes the answer. The final score uses one stale value and mismatches the stored FAQ.
Confidence: high

### V-20 | high
Item: Direct fact sheet work and persistence.
Defined at: server/routes/factSheetV2.ts:157
Defined at: server/lib/factAgent/persistFacts.ts:181
Defined at: server/lib/factAgent/v2/persistUserFacts.ts:22
Defined at: server/lib/factAgent/v2/persistPasteFacts.ts:20
Why it violates the invariant: Direct V2 routes do not take the full-scrape brand lock. They do not claim a page before provider work. Their fact merge and replacement writes use stale state.
How it fails: Two direct requests process one page. Both call the provider and increment run counters. Their fact merges can lose a source. Two user or paste enrichments can also delete and replace each other's fact set.
Confidence: high

### V-21 | high
Item: Fact re-verification.
Defined at: server/lib/factAgent/v2/reverifyFact.ts:82
Why it violates the invariant: The function reads a fact and its JSON payload, performs external work, then writes a merge without a claim or version predicate.
How it fails: A cron run and an admin request read the same alternatives. Each finds a different new source. The last update removes the other alternative after duplicate work.
Confidence: high

### V-22 | critical
Item: Generic LLM job finalization.
Defined at: server/lib/llmJobs.ts:289
Why it violates the invariant: `applyResponseToRow` calls `handler.finalize` before it claims a finalizing state. Its later status update is too late.
How it fails: A browser poll and the cron drain read one running completed job. Both run the handler. Both write product rows. One later job-status update loses, but both side effects remain.
Confidence: high

### V-23 | high
Item: Keyword and FAQ finalizer deduplication.
Defined at: server/routes/content.ts:149
Defined at: server/routes/contentTypes.ts:108
Why it violates the invariant: Both handlers use a read-side deduplication check. Neither target table has a matching unique constraint.
How it fails: Two valid jobs return the same keyword or FAQ. Both see no matching row. Both insert it. The result list contains duplicate research or FAQ rows.
Confidence: high

### V-24 | medium
Item: Citation name-variation append.
Defined at: server/databaseStorage.ts:2138
Defined at: server/databaseStorage.ts:2154
Why it violates the invariant: Parallel citation workers read the same variation array and each write a different replacement array.
How it fails: One worker adds `Alpha`. Another adds `Alpha AI`. Both read an empty array. The last update removes the other variation.
Confidence: high

### V-25 | critical
Item: Checkout session creation.
Defined at: server/routes/billing.ts:382
Defined at: server/routes/billing.ts:420
Why it violates the invariant: The subscription check occurs before checkout creation. The lock is process-local. The Stripe key changes with the requested price.
How it fails: Two instances receive checkout requests for different plans. Both find no subscription. Both create a session. Completing both sessions creates two recurring subscriptions and charges.
Confidence: high

### V-26 | medium
Item: Subscription cancel and resume.
Defined at: server/routes/billing.ts:549
Defined at: server/routes/billing.ts:591
Why it violates the invariant: Each route reads Stripe state before it sends a conflicting subscription update. No version or shared lock orders the actions.
How it fails: A cancel and resume request run together. Both return success. The last Stripe update wins, so the final cancellation state is not tied to either response order.
Confidence: high

### V-27 | high
Item: Webhook subscription state.
Defined at: server/webhookHandlers.ts:203
Defined at: server/webhookHandlers.ts:341
Why it violates the invariant: The webhook claim only serializes one event ID. It does not order distinct subscription events or compare event time.
How it fails: A deletion sets a user to `readonly`. A delayed active update then writes a paid tier from stale event data. The user regains access after cancellation.
Confidence: high

### V-28 | low
Item: Visibility guide first-visit stamp.
Defined at: server/routes.ts:491
Why it violates the invariant: The route reads an empty timestamp and updates by user ID without requiring that the timestamp remains empty.
How it fails: Two first visits read no stamp. Both write different times. The later write replaces the true first-visit time.
Confidence: high

### V-29 | low
Item: Chatbot first-message title.
Defined at: server/routes/assistant.ts:233
Why it violates the invariant: The route checks for `New chat` and then writes a title without a compare-and-set predicate.
How it fails: Two first messages read `New chat`. Both write a derived title. The later write gives the thread an arbitrary first-message title.
Confidence: high

## Retry idempotency failures
- Weekly digest sends before it writes `lastWeeklyDigestSentAt`. A crash after the provider accepts the email repeats the email.
- Weekly report sends before it writes `lastWeeklyReportSentAt`. The scheduler lock does not stop a later retry after a crash.
- Perception probes and summary scoring send provider requests before a durable claim or idempotency record.
- Mention scans have no durable claim. A retry can repeat source fetches and sentiment calls.
- Brand activation writes its ledger after each job. A crash after a paid job repeats that job on the next sweep.
- Prompt generation, suggestions, audiences, Set Health, and phrasings have no request idempotency key.
- Direct fact-sheet routes do not key fact persistence to a page, source, or input version. A retry can repeat or replace facts.
- Fact re-verification can repeat provider work and lose a concurrent alternative merge.
- LLM job finalization can run twice before either caller writes the terminal job state.
- Keyword and FAQ rows have no unique key for the finalizer deduplication rule.
- Citation metrics history uses bare inserts. A crash after a metric write can add duplicate run snapshots.

## UNDETERMINED
- The audit reads `shared/schema.ts` and migration files. It cannot prove that every deployed database applied those unique indexes.
- `recordSpend` is idempotent only when a caller supplies `idempotencyKey`. The static audit does not establish provider acceptance after a process crash.
