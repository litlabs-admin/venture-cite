// Telemetry writer for the fact-sheet pipeline.
//
// Every callable here is FIRE-AND-FORGET — emitEvent never throws and
// never blocks the caller meaningfully. Events accumulate in an in-
// process buffer and flush every FLUSH_INTERVAL_MS, when the buffer
// hits FLUSH_BATCH_SIZE, or on explicit flushNow() (called at scrape
// completion). A bounded buffer means a database outage can't OOM the
// scraper.
//
// Read pattern: GET /api/admin/scrape/:runId/events queries directly
// against the `fact_scrape_events` table indexed by (run_id, created_at).
//
// What to log:
//   - sitemap_probe / sitemap_parse: discovery layer
//   - url_select: tier scoring outcome
//   - page_fetch: HTTP fetcher outcome (status, bytes, latency)
//   - page_guard_skip: which guard fired and why
//   - llm_call: per-call (provider, model, input_chars, output_chars,
//     cost_cents)
//   - facts_emitted / facts_dropped: post-extraction with reasons
//   - consolidate: merge result
//   - terminal: final status with errorKind
//
// What NOT to log:
//   - Full HTML bodies (size). The inspector hits the source URL on
//     demand if it needs to show body content.
//   - LLM prompts/responses (size + cost). The inspector can re-fetch
//     these from a separate prompt-cache table later (phase 2 deliverable).

// NOTE: `db` is imported lazily inside flush() — that keeps unit tests
// for sourceStatic / runFullScrape / reverifyFact from needing a live
// DATABASE_URL just to call emitEvent() (which is fire-and-forget and
// the buffer can drain into a no-op without breaking tests).
import * as schema from "@shared/schema";
import { logger } from "../../logger";
import type { InsertFactScrapeEvent } from "@shared/schema";

const FLUSH_INTERVAL_MS = 2_000;
const FLUSH_BATCH_SIZE = 50;
const MAX_BUFFER_SIZE = 2_000;

export type EventOutcome = "ok" | "skipped" | "failed";

export interface EventInput {
  runId: string;
  brandId: string;
  stepName: string;
  outcome?: EventOutcome;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

class EventBuffer {
  private buffer: InsertFactScrapeEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private droppedDueToBackpressure = 0;

  push(event: EventInput): void {
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      // Backpressure: never block the caller. Drop the event and count
      // it so we can surface the loss in an aggregated metric later.
      this.droppedDueToBackpressure++;
      return;
    }
    this.buffer.push({
      runId: event.runId,
      brandId: event.brandId,
      stepName: event.stepName,
      outcome: event.outcome ?? "ok",
      durationMs: event.durationMs ?? null,
      metadata: (event.metadata ?? {}) as InsertFactScrapeEvent["metadata"],
    });
    this.scheduleFlush();
    if (this.buffer.length >= FLUSH_BATCH_SIZE) {
      void this.flush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const toWrite = this.buffer.splice(0, this.buffer.length);
    try {
      // Lazy import: only pay the db connection cost when there's
      // actually something to flush. Lets unit tests of the consumer
      // modules (sourceStatic, etc.) emit events without DATABASE_URL.
      const { db } = await import("../../../db");
      // Drizzle batch insert. If the table grows huge we can shard by
      // hash but for current scale (~100 events per run × ~50 runs/day)
      // single-shot insert is fine.
      await db.insert(schema.factScrapeEvents).values(toWrite);
      if (this.droppedDueToBackpressure > 0) {
        logger.warn(
          { dropped: this.droppedDueToBackpressure },
          "eventLog: events dropped due to buffer backpressure",
        );
        this.droppedDueToBackpressure = 0;
      }
    } catch (err) {
      // Don't put events back in the buffer — that would amplify the
      // problem during DB outages. Log and move on. Operators can spot
      // the gap by comparing event counts vs scrape counts.
      logger.warn({ err, batchSize: toWrite.length }, "eventLog: flush failed (events lost)");
    } finally {
      this.flushing = false;
    }
  }

  /** Drain everything currently buffered AND anything that lands while
   *  the previous batch is in flight. Used by flushEvents() at scrape
   *  completion so the SSE/inspector sees the full timeline before the
   *  Vercel function returns. A bounded MAX_DRAIN_ITERATIONS protects
   *  against pathological producers. */
  async drain(): Promise<void> {
    const MAX_DRAIN_ITERATIONS = 5;
    for (let i = 0; i < MAX_DRAIN_ITERATIONS; i++) {
      // Wait for any in-flight flush to land before checking the buffer.
      while (this.flushing) {
        await new Promise((r) => setTimeout(r, 10));
      }
      if (this.buffer.length === 0) return;
      await this.flush();
    }
    if (this.buffer.length > 0) {
      logger.warn(
        { buffered: this.buffer.length },
        "eventLog: drain exceeded iteration cap — some events not persisted",
      );
    }
  }

  /** Drop any pending flush timer so the process can exit cleanly.
   *  Tests use this to detach the timer. */
  stopTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

const buffer = new EventBuffer();

/** Fire-and-forget event emit. Never throws; never blocks. */
export function emitEvent(event: EventInput): void {
  try {
    buffer.push(event);
  } catch (err) {
    // The buffer.push path itself shouldn't throw, but if anything
    // goes wrong (e.g. circular metadata) we swallow.
    logger.warn({ err, event }, "eventLog: emit failed");
  }
}

/** Force a complete drain. Call at the end of a run (and ideally in a
 *  `finally` block) so the inspector has the full timeline immediately,
 *  not after the next tick. The drain handles events that land while
 *  the in-flight batch is being written, so terminal events like
 *  "pipeline_complete" or "force_terminate" are not lost when the
 *  Vercel function exits seconds later. */
export async function flushEvents(): Promise<void> {
  await buffer.drain();
}

/** Convenience wrapper: time a callable and emit an event with the
 *  duration. The event's outcome is `failed` if the callable throws
 *  (and the error is re-thrown so the caller sees it). */
export async function withEvent<T>(
  event: Omit<EventInput, "durationMs" | "outcome"> & {
    outcomeOnSuccess?: EventOutcome;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    emitEvent({
      ...event,
      outcome: event.outcomeOnSuccess ?? "ok",
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    emitEvent({
      ...event,
      outcome: "failed",
      durationMs: Date.now() - start,
      metadata: {
        ...(event.metadata ?? {}),
        errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      },
    });
    throw err;
  }
}

// Cleanup for tests + graceful shutdown. Drains everything (not just
// a single flush()) and clears the pending timer so the process loop
// doesn't keep the function alive past the response.
export async function _stop(): Promise<void> {
  buffer.stopTimer();
  await buffer.drain();
}
