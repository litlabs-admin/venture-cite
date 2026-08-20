# Provider side-effect audit

Date: 2026-08-21

## Scope

This audit classifies provider calls by their current application contract.

The audit uses executable call sites and current route behavior as evidence.

No provider call, production write, or deployment occurred during this audit.

## Implement now

### Generic OpenAI jobs

The generic `llm_jobs` flow already returns a job identifier before completion.

Move only its OpenAI Responses kickoff into the transactional outbox.

Keep response retrieval and finalization direct because the provider response identifier makes those reads repeatable.

Evidence: `server/lib/llmJobs.ts` and the two current generic job callers.

### Content cost records

The article completion transaction now creates one content-cost outbox command.

The bounded drain records the cost with a database uniqueness constraint.

Evidence: `server/outbox/contentCostOutboxAdapter.ts`, `server/outbox/contentCostOutboxDrain.ts`, and migrations 0099 through 0100.

## Keep synchronous

### Stripe

Keep checkout, customer recovery, subscription changes, and billing portal sessions synchronous.

These routes need provider objects or URLs before they can return a valid response.

Keep Stripe catalog synchronization as an explicit administration operation.

Do not add a Stripe outbox adapter until a route contract can return a pending operation.

Evidence: `server/routes/billing.ts`, `server/webhookHandlers.ts`, and the Stripe catalog synchronization code.

### Buffer

Keep direct Buffer posts synchronous.

The API returns the provider post identifier and updates the distribution state immediately.

An outbox conversion requires a new pending distribution contract first.

Evidence: `server/routes/buffer.ts` and the article distribution route.

### OpenAI and OpenRouter response routes

Keep routes that need an LLM result in the current HTTP response synchronous.

This group includes assistant streaming, formatting, analysis, suggestions, onboarding, and fact extraction.

Do not move these calls until each route has an explicit job state and polling contract.

Evidence: the provider call sites under `server/routes/` and `server/lib/`.

## Defer with a required design

### Article content generation

Defer the `content_generation_jobs` OpenAI kickoff.

Its lease, cancellation, quota, article state, and deadline rules form one separate protocol.

Design and test that complete protocol before an outbox conversion.

Evidence: `server/contentGenerationWorker.ts`, `server/routes/content.ts`, and the content job storage methods.

### Email delivery

The welcome email is a suitable future outbox candidate.

Weekly reports, weekly digests, and billing emails are also suitable after the application stores durable intent snapshots.

Each intent needs a deterministic identifier, recipient snapshot, template version, retention rule, and cancellation rule.

Persist enterprise inquiries before the application moves their email delivery into the outbox.

Evidence: the welcome, scheduled report, billing email, and enterprise inquiry call sites.

## Decision

Implement one provider wave now: the generic `llm_jobs` OpenAI kickoff.

Do not create a general provider framework.

Add each later adapter only after its route or workflow has a durable asynchronous contract.
