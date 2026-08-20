# Internal defect and chore backlog

These items came off the board on 2026-08-10. The board is public, so it now carries
features and upgrades only. Each item names the file that proves it.

Source: the codebase audit in `docs/trakkr-clone/compare-01` to `compare-04`.

## Content type never changes the article length

- Kind: bug
- Weight: high
- Area: Content
- Evidence: `server/contentGenerationWorker.ts, content type length map`

The worker keys its length map with capitals, for example "Article". The client sends lowercase, for example "article". No key matches. Every job falls through to the generic prompt. The per-type length control has never worked.

## The visibility arrow measures a different number from the headline

- Kind: bug
- Weight: high
- Area: Dashboard
- Evidence: `server/routes/dashboard.ts, hero delta`

The hero shows the visibility score. The delta beside it compares citation rates. The two numbers can move in opposite directions. The arrow can therefore point the wrong way.

## A failed judge still records a citation

- Kind: bug
- Weight: high
- Area: Citations
- Evidence: `server/citationJudge.ts`

The string matcher decides isCited. The model judge then adds rank and relevance. If the judge fails, the code still writes the citation, with no rank and no relevance. Citation counts inflate without a warning.

## Sentiment is not sentiment

- Kind: bug
- Weight: medium
- Area: Perception
- Evidence: `server/citationJudge.ts, relevance to sentiment mapping`

The code derives sentiment from the relevance number. A score of 70 or more counts as positive. A score of 40 or more counts as neutral. No sentiment model runs. Rename the field, or measure sentiment properly.

## The daily orchestrator never runs

- Kind: bug
- Weight: high
- Area: Platform
- Evidence: `server/routes/cron.ts and vercel.json`

The codebase holds 8 in-process crons and a 26 step daily orchestrator. No entry in vercel.json calls the orchestrator. Confirm whether the schedule is missing, or delete the orchestrator.

## agent_tasks is built but unreachable

- Kind: bug
- Weight: high
- Area: Actions
- Evidence: `shared/schema.ts agent_tasks, no route in server/routes/`

The table, the data access layer and the executor all exist. No HTTP route exposes them. No client file reads them. The product has no work queue that a user can open.

## CLAUDE.md misleads every session

- Kind: chore
- Weight: high
- Area: Docs
- Evidence: `CLAUDE.md and shared/schema.ts lines 84 to 100`

The audit found 11 wrong claims. Examples: it says the router is Wouter, but the app uses TanStack Router. It says server/routes.ts holds 7000 lines, but the file holds 529 and the split already happened. It says Express 4, but the app uses Express 5. A second stale block sits in shared/schema.ts and describes plan tiers that no longer exist.

## Protect the strengths we already hold

- Kind: chore
- Weight: high
- Area: Quality
- Evidence: `compare-01 to compare-04 in docs/trakkr-clone`

The audit found real advantages: hallucination detection, the 57 step visibility checklist, prompt shape enforcement, the five source fact sheet engine with a cost cap, Schema Lab, Chunk Engineer, the article editor with a revision diff and a conflict guard, and Buffer publishing. Keep every one. Add a test for each before any rebuild starts.
