# Content cost outbox adapter design

## Problem

Content generation commits the article and then records LLM spend in a separate operation.
That gap can lose the cost event after a successful article commit.

## Usage

The completion transaction will enqueue one `content_cost.record` command with the content job ID, provider response ID, model, service, and token counts.
The outbox worker will pass the command to a content-cost handler.
The handler will write one `api_costs` row using the outbox idempotency key.

## Shape

The domain transaction owns job, article, revision, and outbox writes.
The adapter owns payload mapping and idempotent cost persistence.
The worker owns leasing and terminal outbox state.
The database unique key owns duplicate convergence.

## Decision

Add a stable idempotency key to API cost rows.
Use `content-cost:{contentJobId}:{providerResponseId}` for the first adapter.
Keep all other provider adapters out of scope.

## Tradeoffs

Content generation records its cost only through the outbox command.
Other LLM flows keep their existing direct spend calls until their own migrations.
The first adapter writes analytics data only and does not call a provider.

## Release note

Migration 0099 creates a regular unique index inside the release transaction.
Run this migration during a low-write period because PostgreSQL can pause cost inserts during the index scan.
The unique index uses a regular transactional build.
Schedule migration 0099 during a controlled release because index creation can lock writes.
