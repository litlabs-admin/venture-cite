// useChatbot — single source of truth for the chatbot's data layer.
//
// Owns: list of threads, active thread id, transcript of active thread,
// streaming send (with AbortController), create/archive/restore mutations.
// All server interactions go through TanStack Query so cache invalidation
// is automatic.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/authStore";

export type Msg = { role: "user" | "assistant"; content: string };

export type ThreadSummary = {
  id: string;
  title: string;
  brandId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

const THREADS_KEY = ["/api/assistant/threads"] as const;
const messagesKey = (threadId: string) => ["/api/assistant/threads", threadId, "messages"] as const;

export function useChatbot(opts: { enabled: boolean; brandId: string | null }) {
  const { enabled, brandId } = opts;
  const queryClient = useQueryClient();

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgetExceeded, setBudgetExceeded] = useState(false);
  const [brandSwitchNotice, setBrandSwitchNotice] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastBrandIdRef = useRef<string | null>(brandId);

  // ------------- Threads list -------------
  const threadsQuery = useQuery<{
    success: boolean;
    data: { threads: ThreadSummary[] };
  }>({
    queryKey: THREADS_KEY,
    enabled,
    staleTime: 30_000,
  });

  const threads = threadsQuery.data?.data.threads ?? [];

  // Auto-select most recent thread on first load
  useEffect(() => {
    if (!enabled || activeThreadId) return;
    if (threads.length > 0) {
      setActiveThreadId(threads[0].id);
    }
  }, [enabled, threads, activeThreadId]);

  // Brand-switch handling. When the user changes the active brand at the
  // app level AND the current thread was started under a different brand,
  // automatically detach so the next send creates a fresh thread under the
  // new brand. We don't create the thread eagerly — a no-op switch (open
  // panel, change brand, close panel) shouldn't litter the history list.
  useEffect(() => {
    if (!enabled) return;
    const prev = lastBrandIdRef.current;
    lastBrandIdRef.current = brandId;
    if (prev === brandId) return;
    if (!activeThreadId) return;
    const active = threads.find((t) => t.id === activeThreadId);
    if (!active) return;
    if (active.brandId === brandId) return;
    // Different brand AND the thread has actual content — start fresh.
    if (active.messageCount > 0) {
      setActiveThreadId(null);
      setMessages([]);
      setError(null);
      setBudgetExceeded(false);
      setBrandSwitchNotice("Brand changed — your next message will start a new chat.");
    }
  }, [enabled, brandId, activeThreadId, threads]);

  // Clear the brand-switch notice once the user starts typing/sending.
  const dismissBrandSwitchNotice = useCallback(() => {
    setBrandSwitchNotice(null);
  }, []);

  // ------------- Messages for active thread -------------
  const messagesQuery = useQuery<{
    success: boolean;
    data: { messages: Msg[] };
  }>({
    queryKey: activeThreadId ? messagesKey(activeThreadId) : ["__noop__"],
    enabled: enabled && !!activeThreadId,
    staleTime: 30_000,
  });

  // Sync server-fetched messages into local state when thread switches.
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    if (messagesQuery.data?.data.messages) {
      setMessages(
        messagesQuery.data.data.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      );
      setError(null);
      setBudgetExceeded(false);
    }
  }, [activeThreadId, messagesQuery.data]);

  // ------------- Mutations -------------
  const createThread = useMutation<ThreadSummary, Error, { brandId?: string | null }>({
    mutationFn: async (vars) => {
      const res = await apiRequest("POST", "/api/assistant/threads", {
        brandId: vars.brandId ?? null,
      });
      const json = (await res.json()) as { data: { thread: ThreadSummary } };
      return json.data.thread;
    },
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY });
      setActiveThreadId(thread.id);
      setMessages([]);
      setError(null);
      setBudgetExceeded(false);
    },
  });

  const archiveThread = useMutation<void, Error, string>({
    mutationFn: async (threadId) => {
      await apiRequest("DELETE", `/api/assistant/threads/${threadId}`);
    },
    onSuccess: (_v, threadId) => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY });
      if (activeThreadId === threadId) {
        // Pick next-most-recent remaining thread, or null.
        const remaining = threads.filter((t) => t.id !== threadId);
        setActiveThreadId(remaining[0]?.id ?? null);
        setMessages([]);
      }
    },
  });

  const restoreThread = useMutation<void, Error, string>({
    mutationFn: async (threadId) => {
      await apiRequest("POST", `/api/assistant/threads/${threadId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: THREADS_KEY });
    },
  });

  // ------------- Send (with streaming) -------------
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setBudgetExceeded(false);
      setBrandSwitchNotice(null);

      // Ensure we have a thread to write into. If not, create one first.
      let threadId = activeThreadId;
      if (!threadId) {
        try {
          const t = await createThread.mutateAsync({ brandId });
          threadId = t.id;
        } catch (e) {
          setError((e as Error).message || "Couldn't start a new conversation");
          return;
        }
      }

      const next: Msg[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = await getAccessToken();
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            threadId,
            messages: next,
            brandId: brandId || undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => null);
          if (res.status === 429 && json?.code === "budget_exceeded") {
            setBudgetExceeded(true);
            // Roll back optimistic user message so retry is clean.
            setMessages(messages);
            return;
          }
          throw new Error(json?.error || "Failed to send message");
        }

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("text/event-stream")) {
          throw new Error("Unexpected response from AI tutor");
        }

        // Optimistically append empty assistant message and stream into it.
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
                    copy[copy.length - 1] = {
                      ...last,
                      content: last.content + (data.content ?? ""),
                    };
                  }
                  return copy;
                });
              } else if (data.type === "error") {
                setError(data.error || "AI Tutor error");
              }
            } catch {
              // ignore malformed chunk
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // User clicked stop — keep partial output.
          return;
        }
        setError((err as Error).message || "Failed to send message");
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        // Refresh threads list (title, updated_at, count all change).
        queryClient.invalidateQueries({ queryKey: THREADS_KEY });
      }
    },
    [activeThreadId, brandId, createThread, isStreaming, messages, queryClient],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const trimmed = messages.slice(0, i);
        setMessages(trimmed);
        send(messages[i].content);
        return;
      }
    }
  }, [messages, send]);

  const newChat = useCallback(() => {
    createThread.mutate({ brandId });
  }, [createThread, brandId]);

  const selectThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setError(null);
    setBudgetExceeded(false);
  }, []);

  return {
    // Threads
    threads,
    threadsLoading: threadsQuery.isLoading,
    threadsError: threadsQuery.isError,
    refetchThreads: threadsQuery.refetch,
    activeThreadId,
    selectThread,
    // Active thread state
    messages,
    messagesLoading: messagesQuery.isLoading,
    isStreaming,
    error,
    budgetExceeded,
    brandSwitchNotice,
    dismissBrandSwitchNotice,
    // Actions
    send,
    stop,
    regenerate,
    newChat,
    archiveThread,
    restoreThread,
    isCreatingThread: createThread.isPending,
  };
}
