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

vi.mock("@/v2/shell/useV2Mode", () => ({
  useV2Mode: () => ({ mode: "guided" as const, setMode: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouterState: () => "/v2/settings/integrations",
  useSearch: () => ({ brandId: "brand-venture-pr" }),
}));

const { Board25Screen } = await import("@/v2/screens/b25-integrations/Screen");
const { board25Fixture } = await import("@/v2/screens/b25-integrations/fixture");
const { useBoard25Data } = await import("@/v2/screens/b25-integrations/data");

function renderScreen(data = board25Fixture) {
  return render(<Board25Screen data={data} />);
}

function renderDataHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useBoard25Data(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubIntegrationsFetch(options: { pending?: boolean; fail?: boolean } = {}) {
  const payload = {
    slack: { connected: true, lastTriggered: "2026-09-09T07:01:00Z" },
    buffer: { connected: false },
    recentActivity: [
      {
        id: "act-1",
        alertType: "slack_test",
        message: "Sent a test Slack message from Settings.",
        sentVia: "slack",
        sentAt: "2026-09-09T07:01:00Z",
      },
    ],
    requests: [{ provider: "hubspot", requestedAt: "2026-09-08T09:00:00Z" }],
  };
  const fetchMock = vi.fn(() => {
    if (options.pending) return new Promise<Response>(() => {});
    if (options.fail)
      return Promise.resolve(jsonResponse({ success: false, error: "failed" }, 500));
    return Promise.resolve(jsonResponse({ success: true, data: payload }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Board 25 screen", () => {
  it("renders the no-backend providers, Slack, Buffer, and activity regions", () => {
    renderScreen();

    expect(screen.getByText("Connect evidence and business outcomes")).toBeInTheDocument();
    expect(screen.getByText("Google Search Console")).toBeInTheDocument();
    expect(screen.getByText("GA4")).toBeInTheDocument();
    expect(screen.getByText("HubSpot")).toBeInTheDocument();
    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByText("Salesforce")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("Send test")).toBeInTheDocument();
    expect(screen.getByText("Buffer")).toBeInTheDocument();
    expect(screen.getByText("Connect")).toBeInTheDocument();
    expect(screen.getByText("Sent a test Slack message from Settings.")).toBeInTheDocument();
  });

  it("shows the connect form instead of manage actions when Slack is not connected", () => {
    renderScreen({
      ...board25Fixture,
      slack: { connected: false, lastTriggered: null },
    });

    expect(screen.getByLabelText("Slack webhook URL")).toBeInTheDocument();
    expect(screen.queryByText("Send test")).not.toBeInTheDocument();
  });
});

describe("Board 25 live adapter", () => {
  it("maps the real integrations response, including the static no-backend providers", async () => {
    stubIntegrationsFetch();
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.slack).toEqual({
      connected: true,
      lastTriggered: "2026-09-09T07:01:00Z",
    });
    expect(result.current.data?.buffer).toEqual({ connected: false });
    expect(result.current.data?.requestedProviders).toEqual(["hubspot"]);
    expect(result.current.data?.noBackendProviders.map((provider) => provider.id)).toEqual([
      "google_search_console",
      "ga4",
      "hubspot",
      "salesforce",
    ]);
    expect(result.current.data?.recentActivity[0]).toEqual({
      id: "act-1",
      message: "Sent a test Slack message from Settings.",
      detail: "Sent to Slack",
      at: "2026-09-09T07:01:00Z",
    });
  });

  it("reports loading while the integrations request is pending", () => {
    stubIntegrationsFetch({ pending: true });
    const { result } = renderDataHook();

    expect(result.current.state.kind).toBe("loading");
  });

  it("reports an error when the integrations request fails", async () => {
    stubIntegrationsFetch({ fail: true });
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
  });
});
