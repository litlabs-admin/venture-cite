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

const { Board42Screen } = await import("@/v2/screens/b42-team-handoff/Screen");
const { board42Fixture } = await import("@/v2/screens/b42-team-handoff/fixture");
const { useBoard42Data } = await import("@/v2/screens/b42-team-handoff/data");

function renderScreen(data = board42Fixture) {
  return render(<Board42Screen data={data} />);
}

function renderDataHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useBoard42Data(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function stubTeamFetch(options: { pending?: boolean; fail?: boolean } = {}) {
  const overview = {
    owner: { id: "user-1", name: "Jamie Founder", email: "jamie@venturepr.com" },
    assignedBrandCount: 2,
    seatsUsed: 1,
    invitations: [
      {
        id: "invite-1",
        email: "teammate@venturepr.com",
        role: "editor",
        status: "pending",
        createdAt: "2026-09-10T00:00:00.000Z",
      },
    ],
    auditEvents: [
      {
        id: "audit-1",
        action: "team.invitation_created",
        entityType: "v2_team_invitation",
        entityId: "invite-1",
        occurredAt: "2026-09-10T00:00:00.000Z",
        summary: "Invited teammate@venturepr.com as editor",
      },
    ],
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
        state: "in_progress",
        revision: 1,
        title: "Clarify services page",
        desiredResult: "Clear region.",
        buyerNeed: "Where do you work?",
        recommendedChange: "Clarify the region.",
        reason: "Service region is unclear to buyers.",
        confidence: 0.9,
        effort: 15,
        points: 40,
        nextCheckAt: "2026-09-09T00:00:00.000Z",
        ownerId: "user-1",
        ownerName: "Jamie Founder",
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
    const data = url.includes("/team/") ? overview : tasks;
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

describe("Board 42 screen", () => {
  it("renders the one real team member, not the reference render's fixture roster", () => {
    renderScreen();

    expect(screen.getByText("Assign work without losing evidence")).toBeInTheDocument();
    expect(screen.getByText("Team members (1)")).toBeInTheDocument();
    expect(screen.getAllByText("Jordan Diaz").length).toBeGreaterThan(0);
    expect(screen.getByText("Task handoff")).toBeInTheDocument();
    expect(screen.getByText("Pending invitations (1)")).toBeInTheDocument();
    expect(screen.getAllByText("chris@venturepr.com").length).toBeGreaterThan(0);
  });

  it("shows an honest empty state when there are no pending invitees to hand a task to", () => {
    renderScreen({ ...board42Fixture, invitations: [] });
    expect(
      screen.getByText("Invite a teammate first - there is no one else to hand this off to yet."),
    ).toBeInTheDocument();
  });
});

describe("Board 42 live adapter", () => {
  it("maps the real team overview and work-task response", async () => {
    stubTeamFetch();
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.member.name).toBe("Jamie Founder");
    expect(result.current.data?.member.activeTaskCount).toBe(1);
    expect(result.current.data?.invitations[0].email).toBe("teammate@venturepr.com");
    expect(result.current.data?.tasks[0].title).toBe("Clarify services page");
  });

  it("reports loading while team requests are pending", () => {
    stubTeamFetch({ pending: true });
    const { result } = renderDataHook();

    expect(result.current.state.kind).toBe("loading");
  });

  it("reports an error when a team request fails", async () => {
    stubTeamFetch({ fail: true });
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
  });
});
