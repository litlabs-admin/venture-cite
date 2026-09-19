// @vitest-environment happy-dom
//
// Covers useOnboardingSession's SSE handling: events are parsed with
// sessionEventSchema and accumulated per type, an invalid event is ignored
// rather than crashing the flow, a stream that ends before `done` (by error or
// by a clean close) reconnects and recovers via the server's replay, and
// answers are posted with the exact body shape sessionAnswersSchema expects.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useOnboardingSession } from "@/hooks/useOnboardingSession";

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

function erroringResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("connection dropped"));
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const SITE_EVENT = {
  type: "site",
  data: { domain: "venturepr.com", title: "Venture PR", faviconUrl: "https://x/y.png" },
};
const PROFILE_EVENT = {
  type: "profile",
  data: {
    name: "Venture PR",
    industry: "PR agency",
    descriptor: "PR agency for disruptive tech",
    description: "A PR agency.",
    audience: "Tech founders",
  },
};

describe("useOnboardingSession", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      sessionStorage.clear();
    } catch {
      /* noop */
    }
  });

  it("creates a session and accumulates typed state from parsed events", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/public/onboarding/sessions") {
        return Promise.resolve(
          new Response(JSON.stringify({ sessionId: "11111111-1111-1111-8111-111111111111" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(url).includes("/events")) {
        return Promise.resolve(
          sseResponse([SITE_EVENT, PROFILE_EVENT, { type: "done", data: {} }]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useOnboardingSession());

    await act(async () => {
      await result.current.start("venturepr.com");
    });

    await waitFor(() => expect(result.current.done).toBe(true));

    expect(result.current.site?.domain).toBe("venturepr.com");
    expect(result.current.profile?.name).toBe("Venture PR");
    expect(sessionStorage.getItem("venturecite-onboarding-session-id")).toBe(
      "11111111-1111-1111-8111-111111111111",
    );
  });

  it("ignores an event that fails sessionEventSchema validation", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/public/onboarding/sessions") {
        return Promise.resolve(
          new Response(JSON.stringify({ sessionId: "22222222-2222-2222-8222-222222222222" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(url).includes("/events")) {
        return Promise.resolve(
          sseResponse([
            { type: "site", data: { domain: 12345 } }, // invalid: domain must be a string
            PROFILE_EVENT,
            { type: "done", data: {} },
          ]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useOnboardingSession());

    await act(async () => {
      await result.current.start("venturepr.com");
    });

    await waitFor(() => expect(result.current.done).toBe(true));

    expect(result.current.site).toBeNull();
    expect(result.current.profile?.name).toBe("Venture PR");
  });

  it("retries once after the stream drops, and recovers via the server's replay", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/public/onboarding/sessions") {
        return Promise.resolve(
          new Response(JSON.stringify({ sessionId: "33333333-3333-3333-8333-333333333333" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(url).includes("/events")) {
        const call = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/events")).length;
        if (call === 1) return Promise.resolve(erroringResponse());
        return Promise.resolve(
          sseResponse([SITE_EVENT, PROFILE_EVENT, { type: "done", data: {} }]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useOnboardingSession());

    await act(async () => {
      await result.current.start("venturepr.com");
    });

    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.profile?.name).toBe("Venture PR");

    const eventsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/events"));
    expect(eventsCalls.length).toBe(2);
  });

  // Seen live: the stream closed cleanly (no error) after the insight, before
  // the probe, and the page waited forever on a stream that had ended.
  it("reconnects when the stream closes cleanly before `done`, and picks up the rest", async () => {
    const PROBE_EVENT = {
      type: "probe",
      data: { results: [], promptsTested: 0, brandAppearances: 0, competitorAppearances: 0 },
    };
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/public/onboarding/sessions") {
        return Promise.resolve(
          new Response(JSON.stringify({ sessionId: "55555555-5555-4555-8555-555555555555" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(url).includes("/events")) {
        const call = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/events")).length;
        // First stream ends cleanly after two events; the replay has everything.
        if (call === 1) return Promise.resolve(sseResponse([SITE_EVENT, PROFILE_EVENT]));
        return Promise.resolve(
          sseResponse([SITE_EVENT, PROFILE_EVENT, PROBE_EVENT, { type: "done", data: {} }]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useOnboardingSession());
    await act(async () => {
      await result.current.start("venturepr.com");
    });

    await waitFor(() => expect(result.current.done).toBe(true), { timeout: 3000 });
    expect(result.current.probe).not.toBeNull();
    expect(result.current.connectionLost).toBe(false);
  });

  it("posts answers to the session's /answers endpoint with the given shape", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/public/onboarding/sessions") {
        return Promise.resolve(
          new Response(JSON.stringify({ sessionId: "44444444-4444-4444-8444-444444444444" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(url).includes("/events")) {
        return Promise.resolve(sseResponse([{ type: "done", data: {} }]));
      }
      if (String(url).endsWith("/answers")) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({ audience: "client", agencyName: "Northside Partners" });
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useOnboardingSession());

    await act(async () => {
      await result.current.start("venturepr.com");
    });
    await waitFor(() => expect(result.current.done).toBe(true));

    let response: { ok: boolean };
    await act(async () => {
      response = await result.current.submitAnswers({
        audience: "client",
        agencyName: "Northside Partners",
      });
    });
    expect(response!.ok).toBe(true);
  });

  it("rejects answers missing an agency name for a client audience before hitting the network", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/public/onboarding/sessions") {
        return Promise.resolve(
          new Response(JSON.stringify({ sessionId: "55555555-5555-5555-8555-555555555555" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(url).includes("/events"))
        return Promise.resolve(sseResponse([{ type: "done", data: {} }]));
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useOnboardingSession());
    await act(async () => {
      await result.current.start("venturepr.com");
    });
    await waitFor(() => expect(result.current.done).toBe(true));

    const answersCallsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/answers"),
    ).length;
    let response: { ok: boolean; error?: string };
    await act(async () => {
      response = await result.current.submitAnswers({ audience: "client" });
    });
    expect(response!.ok).toBe(false);
    const answersCallsAfter = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/answers"),
    ).length;
    expect(answersCallsAfter).toBe(answersCallsBefore);
  });
});
