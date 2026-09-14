// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  },
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const { Board03Screen } = await import("@/v2/screens/b03-task-list/Screen");
const { board03Fixture } = await import("@/v2/screens/b03-task-list/fixture");
const { useBoard03Data } = await import("@/v2/screens/b03-task-list/data");

function renderScreen(data = board03Fixture) {
  return render(<Board03Screen data={data} />);
}

function renderDataHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    client,
    ...renderHook(() => useBoard03Data(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}

function stubWorkFetch(options: { pending?: boolean; fail?: boolean } = {}) {
  const summary = {
    brandId: "brand-venture-pr",
    points: 120,
    pendingCount: 3,
    milestones: ["baseline_ready"],
    currentLevel: { level: 2, name: "Ready", points: 60 },
    nextThreshold: { level: 3, name: "Improve", points: 160 },
    goal: null,
    nextTask: null,
    waitingTasks: [],
    mode: "guided",
  };
  const task = {
    id: "task-1",
    brandId: "brand-venture-pr",
    goalId: null,
    taskKey: "task-key-1",
    taskVersion: 1,
    type: "repair_confirmed_access_or_factual_fault",
    state: "suggested",
    revision: 1,
    title: "Correct service region",
    desiredResult: "India is the correct region.",
    buyerNeed: "Where does this company operate?",
    recommendedChange: "Update the services page.",
    reason: "Confirmed conflict",
    confidence: 0.9,
    effort: 15,
    points: 40,
    completionRule: { required: ["fault_repair"] },
    measurementScope: null,
    nextCheckAt: null,
    ownerId: "user-1",
    ownerName: "You",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
  const detail = {
    ...task,
    evidence: [
      {
        id: "evidence-1",
        taskId: "task-1",
        brandId: "brand-venture-pr",
        taskVersion: 1,
        evidenceVersion: 1,
        role: "trigger",
        kind: "source",
        status: "verified",
        sourceUrl: "https://venturepr.example/services",
        finalUrl: null,
        canonicalUrl: null,
        retrievedAt: "2026-09-08T00:00:00.000Z",
        observedAt: null,
        excerpt: "Worldwide",
        structuredFinding: null,
        createdAt: "2026-09-08T00:00:00.000Z",
      },
    ],
    history: [],
  };
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (options.pending) return new Promise<Response>(() => {});
    if (options.fail) {
      return Promise.resolve(new Response(JSON.stringify({ error: "failed" }), { status: 500 }));
    }
    const url = String(input);
    const data = url.includes("/work/summary")
      ? summary
      : url.endsWith("/work/tasks/task-1")
        ? detail
        : { items: [task], nextCursor: null };
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Board 03 screen", () => {
  it("renders every task-list region from the fixture", () => {
    renderScreen();

    expect(screen.getByText("Turn findings into verified work")).toBeInTheDocument();
    expect(
      screen.getByText("Choose a task, record the change, and check the result."),
    ).toBeInTheDocument();
    expect(screen.getByText("To do")).toBeInTheDocument();
    expect(screen.getAllByText("Correct service region").length).toBeGreaterThan(0);
    expect(screen.getByText("Confirmed conflict")).toBeInTheDocument();
    expect(screen.getByText("Improve your buyer guide")).toBeInTheDocument();
    expect(screen.getByText("Update pricing page")).toBeInTheDocument();
    expect(screen.getByText("Crawler access repaired")).toBeInTheDocument();
    expect(screen.getByText("Baseline reviewed")).toBeInTheDocument();
    expect(screen.getAllByText("Evidence").length).toBeGreaterThan(0);
    expect(
      screen.getByText("The published page conflicts with your approved region."),
    ).toBeInTheDocument();
    expect(screen.getByText("40 points after verification · Awarded once")).toBeInTheDocument();
  });

  it("renders an unavailable task value as a state label", () => {
    const unavailable = {
      ...board03Fixture,
      tasks: board03Fixture.tasks.map((task, index) =>
        index === 0
          ? {
              ...task,
              evidenceLabel: { kind: "not-measured", reason: "No evidence" },
              detail: {
                ...task.detail,
                oldValue: { kind: "not-measured", reason: "No observation" },
              },
            }
          : task,
      ),
    };

    renderScreen(unavailable);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThan(0);
    expect(screen.queryByText("Worldwide")).not.toBeInTheDocument();
  });
});

describe("Board 03 live adapter", () => {
  it("maps the real work response into the screen data", async () => {
    stubWorkFetch();
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.tasks[0].title).toBe("Correct service region");
    expect(result.current.data?.tasks[0].points).toEqual({ kind: "measured", value: 40 });
    expect(result.current.data?.tasks[0].detail.sourcePath).toEqual({
      kind: "measured",
      value: "/services",
    });
  });

  it("reports loading while work requests are pending", () => {
    stubWorkFetch({ pending: true });
    const { result } = renderDataHook();

    expect(result.current.state.kind).toBe("loading");
  });

  it("reports an error when a work request fails", async () => {
    stubWorkFetch({ fail: true });
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
  });
});
