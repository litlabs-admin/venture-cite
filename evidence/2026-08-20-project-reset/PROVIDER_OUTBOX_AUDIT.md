# Provider side-effect audit

Date: 2026-08-21

## Current decision

Use the outbox only when the application can return a durable asynchronous state.

Keep provider calls synchronous when the current HTTP response needs the provider result or URL.

No provider call or production write occurred during this audit.

## Implemented outbox paths

### Generic OpenAI jobs

The `llm_jobs` transaction stores the job and an OpenAI kickoff command together.

The outbox handler starts the provider response with a stable idempotency key.

Response retrieval and finalization use the stored provider response identifier.

Evidence: `server/lib/llmJobs.ts`, `server/outbox/openAiLlmJobAdapter.ts`, and migration 0102.

### Content cost records

The content completion transaction stores one content-cost command.

The content-cost drain records one `api_costs` row per outbox idempotency key.

The database-backed test submits the same key twice and proves that one row exists.

Evidence: `server/outbox/contentCostOutboxAdapter.ts`, `server/outbox/contentCostOutboxDrain.ts`, migrations 0099 and 0100, and `tests/integration/localContentCostIdempotency.test.ts`.

## Synchronous provider paths

### Stripe

Checkout, customer recovery, subscription changes, and billing portal sessions remain synchronous.

These routes need a provider object or URL before they return.

Stripe catalog synchronization remains an explicit administration operation.

### Buffer

Buffer posting remains synchronous.

The route returns the provider post identifier and updates the distribution state in the same request flow.

### OpenAI and OpenRouter response routes

Routes that need model output in the current response remain synchronous.

This group includes streaming, formatting, analysis, suggestions, onboarding, and fact extraction.

Local fake-provider mode now blocks live OpenAI access during browser verification.

## Deferred provider paths

### Article generation provider kickoff

The request command path now owns enqueue, advance, cancel, quota, and article state transitions.

The OpenAI content worker still calls the provider directly.

Do not move this provider call until one outbox design preserves its lease, deadline, cancellation, and response-link rules.

### Email delivery

Email delivery remains direct.

Do not add it to the outbox until each email has a durable intent, recipient snapshot, template version, retention rule, and cancellation rule.

### Stripe and Buffer

Do not add these providers to the outbox until their routes return a pending operation instead of an immediate provider result.

## Release decision

The current outbox scope is complete for generic OpenAI kickoff and content-cost recording.

Provider-wide outbox conversion is not a release requirement for this wave.

Production remains unchanged.
