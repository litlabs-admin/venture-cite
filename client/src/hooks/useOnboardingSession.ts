// Drives the anonymous, pre-account onboarding session described in
// docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
//
// No auth header on any request here: the three endpoints this hook talks to
// (create, events, answers) are public. `POST /api/onboarding/claim` is a
// different, authenticated endpoint and is NOT called from this hook - the
// post-login welcome page owns that call.
//
// The session id is kept in sessionStorage so a reload resumes the same
// session instead of creating a new one and losing progress. The SSE stream
// replays everything already known when a client (re)connects, so resuming
// just means reopening the stream - state is rebuilt entirely from events.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  sessionEventSchema,
  sessionAnswersSchema,
  createSessionResponseSchema,
  type SessionEvent,
  type Site,
  type Profile,
  type Competitors,
  type Topic,
  type Readiness,
  type Probe,
  type Source,
  type Insight,
  type SessionAnswers,
} from "@shared/onboarding/session";

// `venturecite-` prefix: clearAllVentureCiteStorage() removes it at logout, so
// the next person on a shared browser cannot resume this onboarding session.
const SESSION_STORAGE_KEY = "venturecite-onboarding-session-id";
/** Reconnects before giving up and showing "connection lost". Backoff tops out at 4s. */
const MAX_STREAM_RETRIES = 5;

export type StepErrorInfo = { step: string; message: string };

export interface OnboardingSessionState {
  sessionId: string | null;
  /** True while the session is being created or the domain is unknown yet. */
  creating: boolean;
  createError: string | null;
  site: Site | null;
  loadingLines: string[] | null;
  profile: Profile | null;
  competitors: Competitors | null;
  topics: Topic[] | null;
  readiness: Readiness | null;
  probe: Probe | null;
  sources: Source[] | null;
  insight: Insight | null;
  /** Keyed by step name from `step_error` events. */
  errors: Partial<Record<StepErrorInfo["step"], string>>;
  done: boolean;
  /** True once the SSE connection has dropped twice (initial + one retry). */
  connectionLost: boolean;
}

const initialState: OnboardingSessionState = {
  sessionId: null,
  creating: false,
  createError: null,
  site: null,
  loadingLines: null,
  profile: null,
  competitors: null,
  topics: null,
  readiness: null,
  probe: null,
  sources: null,
  insight: null,
  errors: {},
  done: false,
  connectionLost: false,
};

function applyEvent(state: OnboardingSessionState, event: SessionEvent): OnboardingSessionState {
  switch (event.type) {
    case "site":
      return { ...state, site: event.data };
    case "loading_lines":
      return { ...state, loadingLines: event.data.lines };
    case "profile":
      return { ...state, profile: event.data };
    case "competitors":
      return { ...state, competitors: event.data };
    case "topics":
      return { ...state, topics: event.data.topics };
    case "readiness":
      return { ...state, readiness: event.data };
    case "probe":
      return { ...state, probe: event.data };
    case "sources":
      return { ...state, sources: event.data.sources };
    case "insight":
      return { ...state, insight: event.data };
    case "step_error":
      return { ...state, errors: { ...state.errors, [event.data.step]: event.data.message } };
    case "done":
      return { ...state, done: true };
    default:
      return state;
  }
}

function readStoredSessionId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSessionId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    else sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable (private mode) - the flow still works for
    // this tab's lifetime, it just won't survive a reload.
  }
}

export function useOnboardingSession() {
  const [state, setState] = useState<OnboardingSessionState>(() => ({
    ...initialState,
    sessionId: readStoredSessionId(),
  }));
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectedRef = useRef(false);

  const connect = useCallback((sessionId: string) => {
    reconnectedRef.current = false;

    // A stream can close before `done` without throwing: a proxy drops an
    // idle connection, the server restarts. The server replays every stored
    // event on reconnect and applyEvent is idempotent, so reconnecting until
    // `done` loses nothing. Seen live: the first read arrived 30s after the
    // insight, and the page kept waiting on a stream that had already ended.
    const open = async (attempt: number) => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      let sawDone = false;
      try {
        const res = await fetch(`/api/public/onboarding/sessions/${sessionId}/events`, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`events request failed: ${res.status}`);

        const reader = res.body.getReader();
        readerRef.current = reader;
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
            const dataLines: string[] = [];
            for (const line of rawEvent.split("\n")) {
              if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
            }
            if (!dataLines.length) continue;
            let parsedJson: unknown;
            try {
              parsedJson = JSON.parse(dataLines.join("\n"));
            } catch {
              continue;
            }
            const parsed = sessionEventSchema.safeParse(parsedJson);
            // Invalid events (a producer bug, a future event type this build
            // doesn't know) are ignored rather than crashing the flow.
            if (!parsed.success) continue;
            if (parsed.data.type === "done") sawDone = true;
            setState((prev) => applyEvent(prev, parsed.data));
          }
        }
      } catch {
        // Handled below: an error and a clean early close get the same retry.
      }
      if (sawDone || controller.signal.aborted) return;
      if (attempt >= MAX_STREAM_RETRIES) {
        reconnectedRef.current = true;
        setState((prev) => ({ ...prev, connectionLost: true }));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(4000, 500 * 2 ** attempt)));
      if (!controller.signal.aborted) void open(attempt + 1);
    };

    void open(0);
  }, []);

  const start = useCallback(
    async (domain: string) => {
      setState((prev) => ({ ...prev, creating: true, createError: null }));
      try {
        const res = await fetch("/api/public/onboarding/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((json && json.error) || `Could not start (${res.status})`);
        }
        const parsed = createSessionResponseSchema.safeParse(json);
        if (!parsed.success) throw new Error("Server returned an unexpected response");
        storeSessionId(parsed.data.sessionId);
        setState(() => ({
          ...initialState,
          sessionId: parsed.data.sessionId,
          creating: false,
        }));
        connect(parsed.data.sessionId);
        return parsed.data.sessionId;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          creating: false,
          createError: err instanceof Error ? err.message : "Could not start",
        }));
        return null;
      }
    },
    [connect],
  );

  const submitAnswers = useCallback(
    async (answers: SessionAnswers) => {
      if (!state.sessionId) return { ok: false as const, error: "No active session" };
      const parsed = sessionAnswersSchema.safeParse(answers);
      if (!parsed.success) {
        return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid answer" };
      }
      try {
        const res = await fetch(`/api/public/onboarding/sessions/${state.sessionId}/answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          return { ok: false as const, error: json?.error ?? `Could not save (${res.status})` };
        }
        return { ok: true as const };
      } catch {
        return { ok: false as const, error: "Could not reach the server" };
      }
    },
    [state.sessionId],
  );

  // Resume on mount if a session id survived a reload.
  useEffect(() => {
    if (state.sessionId) connect(state.sessionId);
    return () => {
      abortRef.current?.abort();
      readerRef.current?.cancel().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    storeSessionId(null);
    setState({ ...initialState });
  }, []);

  return { ...state, start, submitAnswers, reset };
}

export type UseOnboardingSession = ReturnType<typeof useOnboardingSession>;
