// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  Link: ({
    children,
    to,
    onClick,
  }: {
    children?: React.ReactNode;
    to?: string;
    onClick?: () => void;
  }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
  useSearch: () => ({}),
}));

const { Board43Screen } = await import("@/v2/screens/b43-notifications/Screen");
const { board43Fixture } = await import("@/v2/screens/b43-notifications/fixture");
const { useBoard43Data } = await import("@/v2/screens/b43-notifications/data");

type Board43ActionProps = {
  onMarkRead?: (key: string) => void;
  onMarkAllRead?: (keys: string[]) => void;
  onSettingsChange?: (patch: Record<string, boolean>) => void;
};

function renderScreen(data = board43Fixture, actions: Board43ActionProps = {}) {
  return render(<Board43Screen data={data} {...actions} />);
}

function renderDataHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useBoard43Data(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

// Shaped exactly like server/routes/v2Notifications.ts's real response -
// captured from the live composition logic reading alert_history and
// citation_runs for the Venture PR brand (curl-verified during the build:
// GET /api/brands/470b15fe-.../alerts and GET
// /api/brand-prompts/470b15fe-.../history both returned real rows for this
// brand; the notification route wraps that same storage layer).
function stubNotificationsFetch(options: { pending?: boolean; fail?: boolean } = {}) {
  const notifications = {
    brandName: "VenturePR",
    notifications: [
      {
        key: "alert:7f27be81-72bb-4477-9d10-9a9136fd374a",
        category: "updates",
        kind: "new_hallucinations",
        title: "New hallucinations detected",
        description: "1 new unresolved hallucination detected this run (17 open total).",
        evidenceTitle: "Citation run result",
        evidenceType: "Measurement change",
        occurredAt: "2026-08-31T02:39:56.328Z",
        target: { kind: "visibility-evidence" },
        actionLabel: "View results",
        read: false,
      },
      {
        key: "run:f5511e67-6c2f-4a11-bbb2-827dc061167a",
        category: "updates",
        kind: "results_ready",
        title: "Results ready",
        description: "New measurement results are available (5 of 60 checks cited).",
        evidenceTitle: "Citation run",
        evidenceType: "Measurement run",
        occurredAt: "2026-08-31T02:39:51.848Z",
        target: { kind: "visibility-evidence" },
        actionLabel: "View results",
        read: true,
      },
      {
        key: "task_award:award-1",
        category: "completed",
        kind: "task_completed",
        title: "Task completed",
        description:
          '"Review the tracked buyer-question set" was verified and earned 20 work points.',
        evidenceTitle: "Review the tracked buyer-question set",
        evidenceType: "Task · Verified",
        occurredAt: "2026-09-09T12:53:32.543Z",
        target: { kind: "task-detail", taskId: "da3aa7c0-8163-4d56-a5f9-01cb572a60ff" },
        actionLabel: "View task",
        read: false,
      },
    ],
  };
  const settings = {
    emailEnabled: false,
    slackEnabled: false,
    slackConnected: false,
    weeklyReportEnabled: true,
  };
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (options.pending) return new Promise<Response>(() => {});
    if (options.fail) {
      return Promise.resolve(new Response(JSON.stringify({ error: "failed" }), { status: 500 }));
    }
    const url = String(input);
    const data = url.includes("/notification-settings") ? settings : notifications;
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

describe("Board 43 screen", () => {
  it("renders the header, tabs, and needs-action rows by default", () => {
    renderScreen();

    expect(screen.getByText("Updates that need your attention")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Needs action/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Updates/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Completed/ })).toBeInTheDocument();
    expect(screen.getByText("Fact conflict")).toBeInTheDocument();
    expect(screen.getByText("Task ready for review")).toBeInTheDocument();
    // "Results ready" belongs to the Updates tab, not the default Needs
    // action tab.
    expect(screen.queryByText("Results ready")).not.toBeInTheDocument();
  });

  it("switches tabs and shows the completed award notification", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("tab", { name: /^Completed/ }));

    expect(await screen.findByText("Task completed")).toBeInTheDocument();
    expect(screen.queryByText("Fact conflict")).not.toBeInTheDocument();
  });

  it("calls onMarkRead from the row action and the mark-read link", () => {
    const onMarkRead = vi.fn();
    renderScreen(board43Fixture, { onMarkRead });

    fireEvent.click(screen.getByText("Review facts"));
    expect(onMarkRead).toHaveBeenCalledWith("fact_conflict:fact-user-1:fact-scraped-1");
  });

  it("disables Mark all read when nothing is unread", () => {
    const allRead: typeof board43Fixture = {
      ...board43Fixture,
      notifications: board43Fixture.notifications.map((item) => ({ ...item, read: true })),
    };
    renderScreen(allRead);

    expect(screen.getByText("Mark all read").closest("button")).toBeDisabled();
  });

  it("renders the settings rail from real columns only", () => {
    renderScreen();

    expect(screen.getByText("Notification settings")).toBeInTheDocument();
    expect(screen.getByText("Email notifications")).toBeInTheDocument();
    expect(screen.getByText("Slack notifications")).toBeInTheDocument();
    expect(screen.getByText("Weekly report")).toBeInTheDocument();
    // No column backs "Critical failures" or "Quiet hours" anywhere in the
    // schema, so the live board never renders them.
    expect(screen.queryByText("Critical failures")).not.toBeInTheDocument();
    expect(screen.queryByText("Quiet hours")).not.toBeInTheDocument();
    // Nor does this product have a team or lesson model.
    expect(screen.queryByText("Teammate handoff")).not.toBeInTheDocument();
    expect(screen.queryByText("Lesson reminder")).not.toBeInTheDocument();
  });
});

describe("Board 43 live adapter", () => {
  it("maps the real notifications + settings response", async () => {
    stubNotificationsFetch();
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.brandName).toBe("VenturePR");
    expect(result.current.data?.notifications).toHaveLength(3);
    expect(result.current.data?.notifications[0].kind).toBe("new_hallucinations");
    expect(result.current.data?.settings).toEqual({
      emailEnabled: false,
      slackEnabled: false,
      slackConnected: false,
      weeklyReportEnabled: true,
    });
  });

  it("reports loading while the requests are pending", () => {
    stubNotificationsFetch({ pending: true });
    const { result } = renderDataHook();

    expect(result.current.state.kind).toBe("loading");
  });

  it("reports an error when a request fails", async () => {
    stubNotificationsFetch({ fail: true });
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
  });
});
