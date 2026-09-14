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

const { Board39Screen } = await import("@/v2/screens/b39-work-queue/Screen");
const { board39Fixture } = await import("@/v2/screens/b39-work-queue/fixture");
const { useBoard39Data } = await import("@/v2/screens/b39-work-queue/data");

function renderScreen(data = board39Fixture) {
  return render(<Board39Screen data={data} />);
}

function renderDataHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useBoard39Data(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function stubWorkFetch(options: { pending?: boolean; fail?: boolean } = {}) {
  const summary = {
    brandId: "brand-venture-pr",
    points: 120,
    pendingCount: 0,
    milestones: ["baseline_ready"],
    currentLevel: { level: 2, name: "Ready", points: 60 },
    nextThreshold: { level: 3, name: "Improve", points: 160 },
    goal: { title: "PR progress", statement: "Move VenturePR forward with high-impact PR work" },
    nextTask: null,
    waitingTasks: [],
    mode: "guided",
  };
  const tasks = {
    items: [
      {
        id: "task-1",
        brandId: "brand-venture-pr",
        goalId: null,
        taskKey: "task-key-1",
        taskVersion: 1,
        type: "repair_confirmed_access_or_factual_fault",
        state: "suggested",
        revision: 1,
        title: "Confirm service region",
        desiredResult: "Clear region.",
        buyerNeed: "Where do you work?",
        recommendedChange: "Clarify the region.",
        reason: "Service region is unclear to buyers.",
        confidence: 0.9,
        effort: 15,
        points: 40,
        completionRule: { required: ["fault_repair"] },
        measurementScope: null,
        nextCheckAt: "2026-09-09T00:00:00.000Z",
        ownerId: "user-1",
        ownerName: "You",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
      },
    ],
    nextCursor: null,
  };
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (options.pending) return new Promise<Response>(() => {});
    if (options.fail) {
      return Promise.resolve(new Response(JSON.stringify({ error: "failed" }), { status: 500 }));
    }
    const url = String(input);
    const data = url.includes("/work/summary") ? summary : tasks;
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

describe("Board 39 screen", () => {
  it("renders the queue table and capacity rail regions", () => {
    renderScreen();

    expect(screen.getByText("Your useful work")).toBeInTheDocument();
    expect(
      screen.getByText("Goal: Move VenturePR forward with high-impact PR work"),
    ).toBeInTheDocument();
    expect(screen.getByText("Your top priority")).toBeInTheDocument();
    expect(screen.getByText("Correct the service description")).toBeInTheDocument();
    expect(screen.getByText("Confirm service region")).toBeInTheDocument();
    expect(screen.getByText("Improve startup buyer guide")).toBeInTheDocument();
    expect(screen.getByText("Add pricing evidence")).toBeInTheDocument();
    expect(screen.getByText("Review PR visibility results")).toBeInTheDocument();
    expect(screen.getByText("Connect qualified inquiry data")).toBeInTheDocument();
    expect(screen.getByText("Your weekly capacity")).toBeInTheDocument();
    expect(screen.getByText("6h 0m")).toBeInTheDocument();
    expect(screen.getByText("Your progress")).toBeInTheDocument();
    expect(screen.getByText("No blockers")).toBeInTheDocument();
    expect(screen.getByText("No tasks waiting")).toBeInTheDocument();
  });

  it("renders an unavailable due date as a state label", () => {
    const unavailable = {
      ...board39Fixture,
      tasks: board39Fixture.tasks.map((task, index) =>
        index === 0 ? { ...task, dueDate: { kind: "not-measured", reason: "No due date" } } : task,
      ),
      weeklyCapacity: {
        ...board39Fixture.weeklyCapacity,
        usedMinutes: { kind: "not-measured", reason: "No time ledger" },
      },
    };

    renderScreen(unavailable);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sep 9")).not.toBeInTheDocument();
  });
});

describe("Board 39 live adapter", () => {
  it("maps the real work response and keeps unavailable queue fields honest", async () => {
    stubWorkFetch();
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.tasks[0].title).toBe("Confirm service region");
    expect(result.current.data?.tasks[0].points).toEqual({ kind: "measured", value: 40 });
    expect(result.current.data?.tasks[0].dueDate).toEqual({
      kind: "not-measured",
      reason: "The work API provides a next check, not a due date.",
    });
    expect(result.current.data?.weeklyCapacity.usedMinutes.kind).toBe("not-measured");
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
