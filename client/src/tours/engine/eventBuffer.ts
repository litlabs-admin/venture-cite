// client/src/tours/engine/eventBuffer.ts
//
// Buffers tour events in memory; flushes on a timer, immediately on
// terminal events, and synchronously via sendBeacon on beforeunload.

export interface BufferedEvent {
  id?: string; // injected on push if missing
  tourId: string;
  tourVersion: number;
  stepId?: string | null;
  stepIndex?: number | null;
  eventType: string;
  triggerType?: "auto" | "manual" | "preview" | null;
  brandId?: string | null;
  dwellMs?: number | null;
  occurredAt: string;
}

type Sender = (events: BufferedEvent[]) => Promise<void>;

const IMMEDIATE_FLUSH_EVENTS = new Set(["tour_completed", "tour_suppressed"]);

export class EventBuffer {
  private queue: BufferedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(
    private send: Sender,
    private opts: { intervalMs: number; capacity: number },
  ) {
    this.timer = setInterval(() => this.flush(), opts.intervalMs);
  }

  push(event: Omit<BufferedEvent, "id">): void {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    this.queue.push({ ...event, id });
    if (this.queue.length > this.opts.capacity) {
      this.queue.splice(0, this.queue.length - this.opts.capacity);
    }
    if (IMMEDIATE_FLUSH_EVENTS.has(event.eventType)) {
      void this.flush();
    }
  }

  size(): number {
    return this.queue.length;
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await this.send(batch);
    } catch {
      // Single retry with backoff
      await new Promise((r) => setTimeout(r, 1000));
      try {
        await this.send(batch);
      } catch {
        // Drop
      }
    } finally {
      this.flushing = false;
    }
  }

  flushSyncBeacon(url: string): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      const blob = new Blob([JSON.stringify({ events: batch })], { type: "application/json" });
      navigator.sendBeacon?.(url, blob);
    } catch {
      // best-effort
    }
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
