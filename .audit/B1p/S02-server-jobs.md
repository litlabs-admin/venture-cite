# Slice S02-server-jobs

Files assigned: 4
Files read in full: 4
Total lines read: 3026

## Findings

### F-S02-server-jobs-001 | high | correctness
File: server/scheduler.ts:194-215, 247-312; shared/schema.ts:312
What the code does: `selectBrandsForCitationScan` runs `SELECT b.*` and casts each raw row to a camelCase brand type. `isBrandDueForCitation` reads `lastAutoCitationAt`.
Why it is wrong: PostgreSQL returns the column as `last_auto_citation_at`. The TypeScript cast does not rename the property.
How it fails: A completed run writes `last_auto_citation_at`. The next hourly tick reads `undefined`, treats the brand as new, and runs it again.
Confidence: high

### F-S02-server-jobs-002 | high | security
File: server/scheduler.ts:208-215, 247-277; shared/schema.ts:60-64
What the code does: The auto-citation selector excludes soft-deleted brands and filters owners only by `access_tier`.
Why it is wrong: The selector does not exclude users with `deleted_at` set. User deletion keeps the user row during the grace period.
How it fails: A paying user can request account deletion while the brand remains live during the grace period. The selector can still send citation requests before purge.
Confidence: high

### F-S02-server-jobs-003 | high | correctness
File: server/citationChecker.ts:322-330, 703-717, 879-896, 1117-1137, 1252-1266
What the code does: A failed platform request sets `fetchError`, then the worker still writes a geo-ranking row with `isCited` set to zero. Any run with one saved row receives `status: "succeeded"`.
Why it is wrong: A failed request is not evidence that the platform did not cite the brand.
How it fails: If a provider key is missing or both request attempts fail, the run stores a not-cited result. The run reports a lower citation rate or a false successful zero-rate result.
Confidence: high

### F-S02-server-jobs-005 | high | correctness
File: server/citationChecker.ts:461-467, 1367-1418
What the code does: `kickoffBrandPromptsRun` creates a running row before calling `runBrandPrompts`. `runBrandPrompts` returns early when no runnable prompts exist, before it reads or updates the supplied `runId`.
Why it is wrong: The early return does not finalize the row created by the kickoff.
How it fails: When every stored prompt is paused, kickoff returns an active `runId` but leaves its row running. Later kickoffs hit the one-active-run constraint, and later advance calls take the same early return.
Confidence: high

### F-S02-server-jobs-006 | high | availability
File: server/scheduler.ts:39-180; server/routes/cron.ts:168-182, 502-503; server/lib/jobDebounce.ts:103-108
What the code does: The weekly report loops through eligible users and brands and calls full citation runs without a deadline argument. The orchestrator gives this step a 20-second deadline, but the callback ignores it.
Why it is wrong: The step can continue after its budget and after the function approaches its 60-second limit.
How it fails: A report with enough users or brands can time out after sending some emails. A retry can resend those emails because the job completion marker is written only after the whole job returns.
Confidence: high

### F-S02-server-jobs-004 | medium | correctness
File: server/citationChecker.ts:1117-1146, 1187-1210, 1233-1266
What the code does: The worker catches a failed `createGeoRanking` insert and then counts the task as completed. Finalization uses only persisted rankings.
Why it is wrong: The queue loses a pair when the insert fails. The run does not retry the pair before it becomes terminal.
How it fails: One transient database error removes one prompt and platform pair. The cursor reaches the queue end, progress reaches 100 percent, and a run with the remaining rows reports success.
Confidence: high

### F-S02-server-jobs-007 | medium | scheduling
File: server/scheduler.ts:530-535, 598-602, 821-845, 879-906, 922-927
What the code does: The scheduler labels several cron expressions as UTC but calls `cron.schedule` without a timezone option.
Why it is wrong: `node-cron` uses the process timezone when no timezone is supplied.
How it fails: With `TZ=Asia/Calcutta`, the account purge expression runs at 03:00 local time, not at 03:00 UTC. The same shift affects the other labeled UTC jobs.
Confidence: high

### F-S02-server-jobs-008 | medium | resource-lifecycle
File: server/contentGenerationWorker.ts:184-197, 200-253, 348-353, 417-430
What the code does: The worker cancels a provider response only when it cannot link a newly created response. A later slice returns immediately for a database job that is already cancelled.
Why it is wrong: The worker has no provider-cancel path after a saved `openaiResponseId` becomes cancelled in the database.
How it fails: A slice saves an in-progress response ID, then the user cancels the job. Later slices stop at the terminal-status check, so the provider response receives no cancel request from this worker.
Confidence: medium

### F-S02-server-jobs-009 | low | dead code
File: server/contentGenerationWorker.ts:438-481
What the code does: The file exports `enqueueContentGenerationJob` as the programmatic enqueue path.
Why it is wrong: The repository has no importer or caller for this export.
How it fails: The advertised agent-task enqueue path cannot run through this helper. The function remains unreachable code.
Confidence: high

### F-S02-server-jobs-010 | low | correctness
File: server/citationJudge.ts:102-113
What the code does: The parser converts `parsed.cited` with `Boolean` without checking its type.
Why it is wrong: Boolean conversion treats every non-empty string as true.
How it fails: A valid JSON response such as `{"cited":"false","rank":null,"relevance":20}` returns `cited: true`.
Confidence: high

## Files with no findings
- None.

## UNDETERMINED
- The production process timezone is not established by these files. Verify it before deciding whether the conditional shift in F-S02-server-jobs-007 occurs in production.
