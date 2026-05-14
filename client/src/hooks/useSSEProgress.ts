// SSE consumer for `source-update` events from /api/brand-fact-sheet/runs/:runId/stream.
//
// Uses fetch + getReader + manual SSE parsing (NOT EventSource) because the
// project's auth pattern is `Authorization: Bearer <jwt>` and EventSource
// cannot pass custom headers. Mirrors useScrapeRunStream's auth approach.

import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/authStore";
import type { ScrapeProgressSources } from "@/components/fact-sheet/ScrapeProgressCardV2";

const INITIAL: ScrapeProgressSources = {
  userEnrich: { status: "pending", facts: 0 },
  staticPages: { status: "pending", facts: 0 },
  searchLlm: { status: "pending", facts: 0 },
};

interface SourceUpdateEvent {
  source: "userEnrich" | "staticPages" | "searchLlm";
  status: "pending" | "in_progress" | "done" | "failed";
  facts: number;
  total?: number;
  done?: number;
  failed?: number;
}

export function useSSEProgress(runId: string | null): ScrapeProgressSources {
  const [state, setState] = useState<ScrapeProgressSources>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!runId) {
      setState(INITIAL);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const token = await getAccessToken();
        const headers: Record<string, string> = { Accept: "text/event-stream" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`/api/brand-fact-sheet/runs/${runId}/stream`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);

            const lines = rawEvent.split("\n");
            let currentEvent = "message";
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith(":")) continue;
              if (line.startsWith("event:")) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trimStart());
              }
            }
            if (!dataLines.length) continue;
            if (currentEvent !== "source-update") continue;

            try {
              const data = JSON.parse(dataLines.join("\n")) as SourceUpdateEvent;
              setState((prev) => ({
                ...prev,
                [data.source]: { ...prev[data.source], ...data },
              }));
            } catch {
              // ignore malformed event
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Silent failure — progress card just stays at the latest state.
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [runId]);

  return state;
}
