// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EducationAssistant from "@/components/EducationAssistant";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "test@test.com" } }),
}));
vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({
    selectedBrandId: "brand-1",
    selectedBrand: { id: "brand-1", name: "Acme" },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/lib/authStore", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}));

const apiRequestMock = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

const TEST_THREAD_ID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function wrap(ui: React.ReactNode, threads: any[] = []) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Resolves the threads list and any messages query.
        queryFn: async ({ queryKey }) => {
          const url = String(queryKey[0]);
          if (url === "/api/assistant/threads") {
            return { success: true, data: { threads } };
          }
          if (url.startsWith("/api/assistant/threads") && queryKey[2] === "messages") {
            return { success: true, data: { messages: [] } };
          }
          return null;
        },
      },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("EducationAssistant", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows welcome state with starter prompts when there are no threads", async () => {
    wrap(<EducationAssistant />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor"));
    expect(await screen.findByText(/I'm your VentureCite tutor/i)).toBeInTheDocument();
    expect(screen.getByText(/difference between GEO/i)).toBeInTheDocument();
  });

  it("creates a thread and streams a response when sending the first message", async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === "POST" && url === "/api/assistant/threads") {
        return jsonResponse({
          success: true,
          data: {
            thread: {
              id: TEST_THREAD_ID,
              title: "New chat",
              brandId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messageCount: 0,
            },
          },
        });
      }
      throw new Error(`unexpected apiRequest ${method} ${url}`);
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeSseResponse([
          `data: ${JSON.stringify({ type: "delta", content: "Hello " })}\n\n`,
          `data: ${JSON.stringify({ type: "delta", content: "back" })}\n\n`,
          `data: ${JSON.stringify({ type: "done", inputTokens: 10, outputTokens: 5 })}\n\n`,
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    wrap(<EducationAssistant />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor"));
    fireEvent.click(await screen.findByText(/difference between GEO/i));

    await waitFor(() => expect(screen.getByText("Hello back")).toBeInTheDocument());

    // Verify the request body contained threadId.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.threadId).toBe(TEST_THREAD_ID);
  });

  it("renders friendly card on 429 budget_exceeded", async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === "POST" && url === "/api/assistant/threads") {
        return jsonResponse({
          success: true,
          data: {
            thread: {
              id: TEST_THREAD_ID,
              title: "New chat",
              brandId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messageCount: 0,
            },
          },
        });
      }
      throw new Error(`unexpected ${method} ${url}`);
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          code: "budget_exceeded",
          error: "Daily AI tutor budget reached. Resets at midnight UTC.",
        },
        429,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    wrap(<EducationAssistant />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor"));
    fireEvent.click(await screen.findByText(/difference between GEO/i));

    await waitFor(() =>
      expect(screen.getByText(/Daily AI Tutor limit reached/i)).toBeInTheDocument(),
    );
  });

  it("auto-loads the most recent thread when one exists", async () => {
    const threads = [
      {
        id: TEST_THREAD_ID,
        title: "How do I get started?",
        brandId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 4,
      },
    ];
    wrap(<EducationAssistant />, threads);
    fireEvent.click(screen.getByLabelText("Open AI Tutor"));
    // Active thread title appears in the header chip.
    expect(await screen.findByText("How do I get started?")).toBeInTheDocument();
  });

  it("shows Stop button while streaming in-flight", async () => {
    apiRequestMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          thread: {
            id: TEST_THREAD_ID,
            title: "New chat",
            brandId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messageCount: 0,
          },
        },
      }),
    );
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}) as Promise<Response>);
    vi.stubGlobal("fetch", fetchMock);
    wrap(<EducationAssistant />);
    fireEvent.click(screen.getByLabelText("Open AI Tutor"));
    fireEvent.click(await screen.findByText(/difference between GEO/i));
    await waitFor(() => {
      expect(screen.getByLabelText("Stop generating")).toBeInTheDocument();
    });
  });
});
