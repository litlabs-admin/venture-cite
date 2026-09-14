// @vitest-environment happy-dom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: {
      id: "brand-venture-pr",
      name: "VenturePR",
      companyName: "VenturePR Inc.",
      industry: "Public relations software",
      website: "https://venturepr.com",
      description: "AI visibility monitoring for PR teams.",
      targetAudience: "B2B marketing teams",
      autoCitationSchedule: "weekly",
      version: 3,
    },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  },
}));

const authStub = vi.hoisted(() => ({
  value: {
    user: {
      id: "user-1",
      email: "founder@venturepr.com",
      firstName: "Jamie",
      lastName: "Rivera",
      timezone: "America/New_York",
      accessTier: "pro",
    },
    isLoading: false,
  },
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => authStub.value,
}));

vi.mock("@/v2/shell/useV2Mode", () => ({
  useV2Mode: () => ({ mode: "guided" as const, setMode: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouterState: () => "/v2/settings",
  useSearch: () => ({ brandId: "brand-venture-pr" }),
}));

const { Board24Screen } = await import("@/v2/screens/b24-settings/Screen");
const { board24Fixture } = await import("@/v2/screens/b24-settings/fixture");
const { useBoard24Data } = await import("@/v2/screens/b24-settings/data");

function renderScreen(data = board24Fixture) {
  return render(<Board24Screen data={data} />);
}

function renderDataHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useBoard24Data(), {
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

function stubSettingsFetch(options: { pending?: boolean; competitorsFail?: boolean } = {}) {
  const competitors = [
    {
      id: "comp-1",
      brandId: "brand-venture-pr",
      name: "Adidas",
      domain: "adidas.com",
      tier: "core",
    },
  ];
  const auditLog = [
    {
      id: "audit-1",
      action: "user.password.changed",
      entityType: "user",
      entityId: "user-1",
      createdAt: "2026-09-08T10:03:00Z",
    },
  ];
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (options.pending) return new Promise<Response>(() => {});
    const url = String(input);
    if (url.includes("/api/competitors")) {
      if (options.competitorsFail) {
        return Promise.resolve(jsonResponse({ success: false, error: "failed" }, 500));
      }
      return Promise.resolve(jsonResponse({ success: true, data: competitors }));
    }
    if (url.includes("/api/v2/settings/") && url.includes("/audit-log")) {
      return Promise.resolve(jsonResponse({ success: true, data: auditLog }));
    }
    return Promise.resolve(jsonResponse({ success: false, error: "unexpected url: " + url }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Board 24 screen", () => {
  it("renders the brand profile, measurement, account, and audit-history regions", () => {
    renderScreen();

    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("VenturePR")).toBeInTheDocument();
    expect(screen.getByDisplayValue("VenturePR Inc.")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Adidas")).toBeInTheDocument();
    expect(screen.getByText("New Balance")).toBeInTheDocument();
    expect(screen.getByText("founder@venturepr.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jamie")).toBeInTheDocument();
    expect(screen.getByText("Audit history")).toBeInTheDocument();
  });

  it("renders an honest empty state when audit history is not measured", () => {
    renderScreen({
      ...board24Fixture,
      auditHistory: { kind: "not-measured", reason: "Audit history could not be loaded." },
    });

    expect(screen.getByText("Audit history could not be loaded.")).toBeInTheDocument();
  });
});

describe("Board 24 live adapter", () => {
  it("maps the real brand, competitor, and audit responses", async () => {
    stubSettingsFetch();
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.brand.name).toBe("VenturePR");
    expect(result.current.data?.cadence).toBe("weekly");
    expect(result.current.data?.engines).toContain("ChatGPT");
    expect(result.current.data?.competitors).toEqual([
      { id: "comp-1", name: "Adidas", domain: "adidas.com", tier: "core" },
    ]);
    expect(result.current.data?.account.email).toBe("founder@venturepr.com");
    expect(result.current.data?.auditHistory).toEqual({
      kind: "available",
      value: [
        {
          id: "audit-1",
          action: "user.password.changed",
          entityType: "user",
          createdAt: "2026-09-08T10:03:00Z",
        },
      ],
    });
  });

  it("reports loading while settings requests are pending", () => {
    stubSettingsFetch({ pending: true });
    const { result } = renderDataHook();

    expect(result.current.state.kind).toBe("loading");
  });

  it("reports an error when the competitor set fails to load", async () => {
    stubSettingsFetch({ competitorsFail: true });
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
  });
});
