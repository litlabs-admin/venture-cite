// SSE consumer hook for /api/brand-fact-sheet/runs/:runId/stream.
//
// Why manual fetch + getReader and not EventSource: EventSource cannot pass
// `Authorization: Bearer <token>` headers (Spec 2 §4.5 final paragraph).
// Mirror reference: client/src/pages/welcome.tsx:170-249.
//
// Reconnect protocol: server emits `event: slice_pending` with
// `data: {lastEventId: "<pageId>:<factId>"}` when its 50s budget runs out.
// The hook automatically reopens the stream with `?last_event_id=...`.

import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/authStore";

export type ScrapeStreamEvent =
  | { type: "plan"; plan: unknown; expectedLanguages: string[] }
  | {
      type: "page";
      id: string;
      url: string;
      status: string;
      factCount: number;
      bytes: number | null;
      errorKind: string | null;
      lang: string | null;
    }
  | {
      type: "fact";
      id: string;
      domain: string;
      subcategory: string;
      factKey: string;
      factValue: string;
      valueType: string;
      valuePayload: unknown;
      confidence: number | null;
      sourceUrl: string | null;
      sourceExcerpt: string | null;
    }
  | {
      type: "progress";
      status: string;
      pagesDone: number;
      pagesTotal: number;
      factsExtracted: number;
      costCents: number;
    }
  | { type: "error"; kind: string; message: string }
  | {
      type: "done";
      status: string;
      stats: {
        pagesFetched: number;
        factsExtracted: number;
        costCents: number;
        errorKind: string | null;
      };
    }
  | { type: "slice_pending"; lastEventId: string; reason: string };

export type ScrapeStreamStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "reconnecting"
  | "done"
  | "error";

export interface UseScrapeRunStreamResult {
  events: ScrapeStreamEvent[];
  status: ScrapeStreamStatus;
  isStreaming: boolean;
  error: string | null;
  start: (runId: string) => void;
  stop: () => void;
}

export function useScrapeRunStream(): UseScrapeRunStreamResult {
  const [events, setEvents] = useState<ScrapeStreamEvent[]>([]);
  const [status, setStatus] = useState<ScrapeStreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  // HIGH 4: ref-mirror of status so the EOF reconnect branch inside `consume`
  // (whose deps are []) can read the live value, not the captured snapshot.
  const statusRef = useRef<ScrapeStreamStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const consume = useCallback(async (runId: string, retryCount: number = 0) => {
    setStatus("connecting");
    const controller = new AbortController();
    abortRef.current = controller;
    runIdRef.current = runId;

    const token = await getAccessToken();
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (lastEventIdRef.current) headers["Last-Event-ID"] = lastEventIdRef.current;

    const qs = lastEventIdRef.current
      ? `?last_event_id=${encodeURIComponent(lastEventIdRef.current)}`
      : "";

    try {
      const res = await fetch(`/api/brand-fact-sheet/runs/${runId}/stream${qs}`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Stream request failed: ${res.status}`);
      }

      setStatus("streaming");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx: number;
        // SSE events separated by blank line ("\n\n").
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);

          // Skip comment-only frames (": heartbeat\n").
          const lines = rawEvent.split("\n");
          const dataLines: string[] = [];
          currentEvent = "message";
          for (const line of lines) {
            if (line.startsWith(":")) continue; // comment / heartbeat
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trimStart());
            }
          }
          if (!dataLines.length) continue;
          const payload = dataLines.join("\n");
          let data: unknown;
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }
          const evt = { type: currentEvent, ...(data as object) } as ScrapeStreamEvent;
          setEvents((prev) => [...prev, evt]);

          if (currentEvent === "page" && typeof (data as any)?.id === "string") {
            const pageId = (data as any).id as string;
            lastEventIdRef.current = `${pageId}:${(lastEventIdRef.current ?? "").split(":")[1] ?? ""}`;
          }
          if (currentEvent === "fact" && typeof (data as any)?.id === "string") {
            const factId = (data as any).id as string;
            const [p] = (lastEventIdRef.current ?? "").split(":");
            lastEventIdRef.current = `${p ?? ""}:${factId}`;
          }
          if (currentEvent === "slice_pending") {
            const next = (data as any).lastEventId as string | undefined;
            if (next) lastEventIdRef.current = next;
            setStatus("reconnecting");
            // Reopen the stream.
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            // Recurse with a fresh AbortController + cursor.
            void consume(runId, retryCount + 1);
            return;
          }
          if (currentEvent === "done") {
            setStatus("done");
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            return;
          }
          if (currentEvent === "error") {
            setError((data as any).message ?? "Stream error");
          }
        }
      }

      // Stream closed without `done` — treat as reconnect candidate.
      if (statusRef.current === "streaming") {
        setStatus("reconnecting");
        void consume(runId, retryCount + 1);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      // Network blip / laptop sleep — bounded reconnect with backoff.
      if (retryCount < 5 && runIdRef.current) {
        setStatus("reconnecting");
        setTimeout(
          () => {
            if (statusRef.current !== "idle" && statusRef.current !== "done") {
              void consume(runIdRef.current!, retryCount + 1);
            }
          },
          2000 * (retryCount + 1),
        );
        return;
      }
      setError(err?.message ?? "Stream failed");
      setStatus("error");
    }
  }, []);

  const start = useCallback(
    (runId: string) => {
      setEvents([]);
      setError(null);
      lastEventIdRef.current = null;
      void consume(runId);
    },
    [consume],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    events,
    status,
    isStreaming: status === "streaming" || status === "connecting" || status === "reconnecting",
    error,
    start,
    stop,
  };
}
