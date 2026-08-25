# Content cost outbox adapter design

## Problem

Content generation commits the article and then records LLM spend in a separate operation.
That gap can lose the cost event after a successful article commit.

## Implemented flow

The completion transaction enqueues one `content_cost.record` command.

The command contains the job ID, provider response ID, model, service, and token counts.

The outbox drain passes the command to the content-cost handler.

The handler writes one `api_costs` row with the outbox idempotency key.

## Shape

The domain transaction owns job, article, revision, and outbox writes.
The adapter owns payload mapping and idempotent cost persistence.
The worker owns leasing and terminal outbox state.
The database unique key owns duplicate convergence.

## Decision

API cost rows have a stable idempotency key.
Use `content-cost:{contentJobId}:{providerResponseId}` for the first adapter.
Other provider adapters remain separate changes.

## Tradeoffs

Content generation records its cost through the outbox command.
Other LLM flows keep their existing direct spend calls until their own migrations.
The first adapter writes analytics data only and does not call a provider.

## Release note

Migration 0099 creates the unique idempotency index inside the release transaction.

Run this migration during a low-write period. The index build can pause cost inserts.
