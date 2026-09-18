// Streaming client for one Ask thread. COPIED in shape from useChatbot.ts's
// fetch + getReader() + AbortController pattern - not imported, per
// docs/ask-feature/07-integration-and-hardening.md §0 (independence). The
// event union this hook reduces over is far richer than the tutor's
// delta/error/done, which is the whole reason the two aren't shared code.
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/authStore";
import { safeParseAskEvent, type AskEvent } from "@shared/ask/events";
import type { AskBlock, EvidenceItem } from "@shared/ask/blocks";
import type { AskActionCard } from "@shared/ask/actions";

export type AskStepView = {
  stepId: string;
  ordinal: number;
  label: string;
  category: string;
  summary: string | null;
  durationMs: number | null;
  status: "running" | "ok" | "failed";
};

export type AskMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  // Null for a message not yet round-tripped through the server (the
  // optimistic push in `run()` below sets it locally instead). Only the
  // user bubble reads this (AskMessage.tsx's "You · 12:51 PM"); the
  // assistant bubble shows elapsed duration instead.
  createdAt: string | null;
  steps: AskStepView[];
  blocks: AskBlock[];
  evidence: EvidenceItem[];
  actionCards: AskActionCard[];
  suggestions: string[];
  statusLine: { verb: string; object: string } | null;
  runStatus: "running" | "ok" | "degraded" | "stopped" | "error";
  degradedReasons: string[];
  pagesRead: number;
  durationMs: number | null;
  truncated: boolean;
};

function newAssistantMessage(): AskMessageView {
  return {
    id: `pending-${Date.now()}`,
    role: "assistant",
    content: "",
    createdAt: null,
    steps: [],
    blocks: [],
    evidence: [],
    actionCards: [],
    suggestions: [],
    // Seeded, not null: the orb + shimmer text (AskThinking.tsx) render from
    // this the same frame Send is pressed, before the network round trip -
    // the server emits its own "Thinking" status a moment later
    // (loop.ts), which just overwrites this with the identical text.
    statusLine: { verb: "Thinking", object: "through your question" },
    runStatus: "running",
    degradedReasons: [],
    pagesRead: 0,
    durationMs: null,
    truncated: false,
  };
}

export function useAskRun(threadId: string | null) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<AskMessageView[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgetExceeded, setBudgetExceeded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // A REF, not the `isRunning` STATE, guards re-entry into run() - state
  // updates are batched and asynchronous, so two calls arriving back to
  // back (React StrictMode double-invokes an effect's first call
  // synchronously in development; a fast double Enter/click can do the same
  // in any build) would both still read `isRunning` as `false` and both
  // send a request. A ref is mutated the instant it's assigned, so the
  // second call sees the guard immediately, before it does anything at
  // all - not partway through, after it has already duplicated the
  // request. `isRunning` state still exists and still drives the UI
  // (disabling Send, showing Stop); it's just no longer the guard itself.
  const runningRef = useRef(false);

  const loadHistory = useCallback((loaded: AskMessageView[]) => {
    setMessages(loaded);
  }, []);

  const applyEvent = useCallback((event: AskEvent) => {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (!last || last.role !== "assistant") return prev;
      const msg = { ...last };

      switch (event.type) {
        case "run_started":
          break;
        case "status":
          msg.statusLine = { verb: event.verb, object: event.object };
          break;
        case "step_started":
          msg.steps = [
            ...msg.steps,
            {
              stepId: event.stepId,
              ordinal: event.ordinal,
              label: event.label,
              category: event.category,
              summary: null,
              durationMs: null,
              status: "running",
            },
          ];
          break;
        case "step_result":
          msg.steps = msg.steps.map((s) =>
            s.stepId === event.stepId
              ? { ...s, summary: event.summary, durationMs: event.durationMs, status: event.status }
              : s,
          );
          break;
        case "block":
          msg.blocks = [...msg.blocks, event.block];
          break;
        case "evidence":
          msg.evidence = [...msg.evidence, ...event.items];
          break;
        case "action_card":
          msg.actionCards = [...msg.actionCards.filter((c) => c.id !== event.card.id), event.card];
          break;
        case "text_delta":
          msg.content = msg.content + event.content;
          msg.statusLine = null;
          break;
        case "text_reset":
          // The model streamed lead-in text, then decided to call a tool
          // (shared/ask/events.ts's own comment) - drop what rendered so
          // far. The step trace that follows explains what happened; the
          // eventual real answer arrives as fresh text_delta events.
          msg.content = "";
          break;
        case "suggestions":
          msg.suggestions = event.items;
          break;
        case "done":
          msg.id = event.messageId;
          msg.runStatus = event.runStatus;
          msg.degradedReasons = event.degradedReasons;
          msg.pagesRead = event.pagesRead;
          msg.durationMs = event.durationMs;
          msg.truncated = event.truncated;
          msg.statusLine = null;
          break;
        case "error":
          msg.runStatus = "error";
          msg.statusLine = null;
          break;
      }
      copy[copy.length - 1] = msg;
      return copy;
    });
  }, []);

  const run = useCallback(
    // `targetThreadId` overrides the hook's own `threadId` - needed the
    // instant a thread is created from an empty state (AskWorkspace.handleSend):
    // `threadId` there is still null on that render (state hasn't re-rendered
    // yet), so closing over it silently dropped the first message. Callers
    // that already have an active thread can omit it.
    async (message: string, targetThreadId?: string) => {
      const runThreadId = targetThreadId ?? threadId;
      if (!runThreadId || runningRef.current) return;
      runningRef.current = true;

      // Ids captured up front (not re-derived later) so a pre-stream
      // failure can remove EXACTLY this call's own optimistic pair -
      // never a later message that happens to also be last.
      const userMessageId = `user-${Date.now()}`;
      const assistantMessage = newAssistantMessage();
      setMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          role: "user",
          content: message,
          createdAt: new Date().toISOString(),
        } as AskMessageView,
        assistantMessage,
      ]);
      setIsRunning(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      // Flips true only once the response body actually starts being read.
      // Before that, this run has produced nothing worth keeping on a
      // failure - the optimistic pair above should simply vanish, not sit
      // stuck on "Thinking" forever (the bug: a rejected/failed request
      // used to leave its placeholder behind permanently). After that,
      // real progress (steps, partial text) may already be visible, so a
      // later failure marks it failed in place instead of erasing it.
      let streamStarted = false;

      const discardOptimisticPair = () => {
        setMessages((prev) =>
          prev.filter((m) => m.id !== userMessageId && m.id !== assistantMessage.id),
        );
      };

      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/ask/threads/${runThreadId}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => null);
          if (res.status === 429 && json?.code === "budget_exceeded") {
            discardOptimisticPair();
            setBudgetExceeded(true);
            return;
          }
          if (res.status === 409) {
            discardOptimisticPair();
            setError(json?.error || "A run is already in progress on this thread");
            return;
          }
          throw new Error(json?.error || "Failed to run Ask");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        streamStarted = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              const raw = JSON.parse(line.slice(6));
              const event = safeParseAskEvent(raw);
              if (event) applyEvent(event);
            } catch {
              // ignore malformed frame
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant" && last.runStatus === "running") {
              copy[copy.length - 1] = { ...last, runStatus: "stopped" };
            }
            return copy;
          });
          return;
        }
        if (streamStarted) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.id === assistantMessage.id) {
              copy[copy.length - 1] = { ...last, runStatus: "error", statusLine: null };
            }
            return copy;
          });
        } else {
          discardOptimisticPair();
        }
        setError((err as Error).message || "Failed to run Ask");
      } finally {
        runningRef.current = false;
        setIsRunning(false);
        abortRef.current = null;
        queryClient.invalidateQueries({ queryKey: ["/api/ask/threads"] });
      }
    },
    [threadId, applyEvent, queryClient],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, loadHistory, run, stop, isRunning, error, budgetExceeded, setBudgetExceeded };
}
