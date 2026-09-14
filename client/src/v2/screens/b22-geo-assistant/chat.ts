// The GEO assistant's own chat data layer.
//
// Reuses the general chatbot's thread storage and REST surface
// (`/api/assistant/threads...`, server/routes/assistant.ts) for thread
// list/create/messages, so a GEO assistant conversation is a chatbot thread
// like any other and shows up in the same `chatbot_threads` /
// `chatbot_messages` history. The send path calls
// `POST /api/v2/geo-assistant/chat` (server/routes/v2Assistant.ts) instead
// of the general `/api/assistant/chat`: that route grounds its answer in
// this board's richer verified-data context (tracked questions, cited
// sources, tracked competitors), which the general endpoint does not
// compute. See that file for why a new route exists instead of a client-side
// patch to the general one.
//
// This is a deliberate fork of `client/src/hooks/useChatbot.ts`, not an edit
// of it - that hook is outside this board's ownership and its `messages`
// wire shape (an array replayed on every send) does not match the
// single-message shape this board's endpoint takes.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/authStore";

export type Board22ChatMessage = { role: "user" | "assistant"; content: string };

export type Board22Thread = {
  id: string;
  title: string;
  brandId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

const THREADS_KEY = ["/api/assistant/threads"] as const;
const messagesKey = (threadId: string) => ["/api/assistant/threads", threadId, "messages"] as const;
const NOOP_KEY = ["v2", "b22", "no-active-thread"] as const;

export function useBoard22Chat(brandId: string) {
  const queryClient = useQueryClient();

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Board22ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgetExceeded, setBudgetExceeded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const threadsQuery = useQuery<{ success: boolean; data: { threads: Board22Thread[] } }>({
    queryKey: THREADS_KEY,
    enabled: Boolean(brandId),
    staleTime: 15_000,
  });
  const threads = (threadsQuery.data?.data.threads ?? []).filter((t) => t.brandId === brandId);

  const messagesQuery = useQuery<{ success: boolean; data: { messages: Board22ChatMessage[] } }>({
    queryKey: activeThreadId ? messagesKey(activeThreadId) : NOOP_KEY,
    enabled: Boolean(activeThreadId),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!activeThreadId) return;
    if (messagesQuery.data?.data.messages) {
      setMessages(
        messagesQuery.data.data.messages.map((m) => ({ role: m.role, content: m.content })),
      );
      setError(null);
      setBudgetExceeded(false);
    }
  }, [activeThreadId, messagesQuery.data]);

  const selectThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setError(null);
    setBudgetExceeded(false);
  }, []);

  const newChat = useCallback(() => {
    setActiveThreadId(null);
    setMessages([]);
    setError(null);
    setBudgetExceeded(false);
  }, []);

  const createThread = useCallback(async (): Promise<string> => {
    const res = await apiRequest("POST", "/api/assistant/threads", { brandId });
    const json = (await res.json()) as { data: { thread: Board22Thread } };
    void queryClient.invalidateQueries({ queryKey: THREADS_KEY });
    return json.data.thread.id;
  }, [brandId, queryClient]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setBudgetExceeded(false);

      let threadId = activeThreadId;
      if (!threadId) {
        try {
          threadId = await createThread();
          setActiveThreadId(threadId);
        } catch (e) {
          setError((e as Error).message || "Couldn't start a new conversation");
          return;
        }
      }

      const next: Board22ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = await getAccessToken();
        const res = await fetch("/api/v2/geo-assistant/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ threadId, message: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => null);
          if (res.status === 429 && json?.code === "budget_exceeded") {
            setBudgetExceeded(true);
            setMessages(messages);
            return;
          }
          throw new Error(json?.error || "Failed to send message");
        }

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("text/event-stream")) {
          throw new Error("Unexpected response from GEO assistant");
        }

        setMessages((m) => [...m, { role: "assistant", content: "" }]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "delta") {
                setMessages((m) => {
                  const copy = [...m];
                  const last = copy[copy.length - 1];
                  if (last?.role === "assistant") {
                    copy[copy.length - 1] = { ...last, content: last.content + (data.content ?? "") };
                  }
                  return copy;
                });
              } else if (data.type === "error") {
                setError(data.error || "GEO assistant error");
              }
            } catch {
              // ignore malformed chunk
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Failed to send message");
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        void queryClient.invalidateQueries({ queryKey: THREADS_KEY });
      }
    },
    [activeThreadId, createThread, isStreaming, messages, queryClient],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    threads,
    threadsLoading: threadsQuery.isLoading,
    activeThreadId,
    selectThread,
    newChat,
    messages,
    isStreaming,
    error,
    budgetExceeded,
    send,
    stop,
  };
}
