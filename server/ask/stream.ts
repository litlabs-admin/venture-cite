// SSE writer for an Ask run. COPIED from server/routes/assistant.ts's
// streaming setup (:301-320), not imported - see docs/ask-feature/07 §0 for
// why this ~40 lines of transport code is deliberately duplicated rather
// than shared. Keeps the 15s heartbeat, the same headers, and the same
// write-after-close guard the tutor's shipped endpoint already proved out.
import type { Response } from "express";
import type { AskEvent } from "@shared/ask/events";

const HEARTBEAT_MS = 15_000;

export type AskSseWriter = {
  send(event: AskEvent): void;
  close(): void;
};

export function openAskSse(res: Response): AskSseWriter {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;

  const heartbeat = setInterval(() => {
    if (!closed) {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        // ignore - write after close
      }
    }
  }, HEARTBEAT_MS);
  // Not held open by an idle process (mirrors assistant.ts's own interval,
  // which has no explicit unref but is always cleared in a finally - this
  // one also unrefs so a slow client can never hold the event loop open
  // past process shutdown).
  (heartbeat as unknown as { unref?: () => void }).unref?.();

  return {
    send(event: AskEvent) {
      if (closed) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // ignore - write after close
      }
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      try {
        res.end();
      } catch {
        // ignore
      }
    },
  };
}
