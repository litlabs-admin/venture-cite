// @vitest-environment happy-dom
//
// Tests server the exact regression the owner reported: one question sent
// twice. Root cause was `run()`'s re-entry guard reading `isRunning` REACT
// STATE, which is batched/asynchronous - two calls arriving back to back
// (React StrictMode double-invokes an effect's first call synchronously in
// development; a fast double Enter/click can do the same in any build)
// both read it as `false` and both sent a request. The fix is a ref, set
// synchronously at the top of `run()`, checked here by calling `run()`
// twice without awaiting the first call - the closest a test can get to
// StrictMode's synchronous double-invoke without actually rendering under
// StrictMode.
//
// Also covers the two related fixes in the same commit: a pre-stream
// failure (409/429/network) removes its own optimistic pair instead of
// leaving a "Thinking" placeholder stuck forever, and a MID-stream failure
// marks the message failed in place instead of erasing real progress.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/authStore", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}));

import { useAskRun } from "@/hooks/useAskRun";

function sseFrame(event: object): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function sseResponse(events: object[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(sseFrame(e)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

// A stream that stays open until `push`/`fail`/`close` is called - lets a
// test inspect state mid-run, and exercise a failure (or a clean end) that
// happens AFTER some real events already landed.
function openSseResponse(): {
  response: Response;
  push: (e: object) => void;
  fail: () => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    push: (e: object) => controllerRef.enqueue(encoder.encode(sseFrame(e))),
    fail: () => controllerRef.error(new Error("connection dropped")),
    close: () => controllerRef.close(),
  };
}

function errorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return wrapper;
}

describe("useAskRun", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends exactly one request when run() is called twice without awaiting the first", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { type: "text_delta", content: "Hello." },
        {
          type: "done",
          messageId: "m1",
          durationMs: 10,
          stepCount: 0,
          pagesRead: 0,
          runStatus: "ok",
          degradedReasons: [],
          truncated: false,
        },
      ]),
    );

    const { result } = renderHook(() => useAskRun("thread-1"), { wrapper: makeWrapper() });

    // NOT awaited between calls - this is what a synchronous StrictMode
    // double-invoke (or a double-click before React re-renders) looks like.
    act(() => {
      result.current.run("why has our visibility moved?");
      result.current.run("why has our visibility moved?");
    });

    await waitFor(() => expect(result.current.isRunning).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // One user turn, one assistant turn - not two of each.
    expect(result.current.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(result.current.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(result.current.messages.at(-1)?.content).toBe("Hello.");
  });

  it("removes its own optimistic pair on a 409 (run already in progress), instead of leaving it stuck", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(409, { success: false, error: "A run is already in progress on this thread" }),
    );

    const { result } = renderHook(() => useAskRun("thread-1"), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.run("hello");
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBe("A run is already in progress on this thread");
    expect(result.current.isRunning).toBe(false);
  });

  it("removes its own optimistic pair on a 429 budget_exceeded response", async () => {
    fetchMock.mockResolvedValue(errorResponse(429, { success: false, code: "budget_exceeded" }));

    const { result } = renderHook(() => useAskRun("thread-1"), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.run("hello");
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.budgetExceeded).toBe(true);
  });

  it("marks the message failed IN PLACE, not removed, when the stream breaks after real progress landed", async () => {
    const { response, push, fail } = openSseResponse();
    fetchMock.mockResolvedValue(response);

    const { result } = renderHook(() => useAskRun("thread-1"), { wrapper: makeWrapper() });

    act(() => {
      result.current.run("hello");
    });

    push({
      type: "step_started",
      stepId: "s1",
      ordinal: 0,
      label: "Checking visibility",
      category: "visibility",
    });
    await waitFor(() => expect(result.current.messages.at(-1)?.steps).toHaveLength(1));

    fail();

    await waitFor(() => expect(result.current.isRunning).toBe(false));

    // Still there, still carrying the step it already received - not wiped
    // back to nothing the way a pre-stream failure is.
    expect(result.current.messages).toHaveLength(2);
    const assistant = result.current.messages.at(-1);
    expect(assistant?.steps).toHaveLength(1);
    expect(assistant?.runStatus).toBe("error");
    expect(result.current.error).toBeTruthy();
  });

  it("a second run() call is a no-op while the first is still in flight, even awaited sequentially", async () => {
    const first = openSseResponse();
    fetchMock.mockResolvedValueOnce(first.response);

    const { result } = renderHook(() => useAskRun("thread-1"), { wrapper: makeWrapper() });

    let firstRunSettled = false;
    act(() => {
      result.current.run("first question").then(() => {
        firstRunSettled = true;
      });
    });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    // Fires while the first run is still open - must be refused.
    await act(async () => {
      await result.current.run("second question, sent too soon");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(result.current.messages[0].content).toBe("first question");
    expect(firstRunSettled).toBe(false);

    first.push({
      type: "done",
      messageId: "m1",
      durationMs: 5,
      stepCount: 0,
      pagesRead: 0,
      runStatus: "ok",
      degradedReasons: [],
      truncated: false,
    });
    first.close();

    await waitFor(() => expect(firstRunSettled).toBe(true));
  });
});
