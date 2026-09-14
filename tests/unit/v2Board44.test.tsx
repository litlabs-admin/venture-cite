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

const authStub = vi.hoisted(() => ({
  value: {
    user: { id: "user-1", firstName: "Jamie", lastName: "Founder", email: "jamie@venturepr.com" },
    isLoading: false,
  },
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => authStub.value,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const { Board44Screen } = await import("@/v2/screens/b44-billing/Screen");
const { board44Fixture } = await import("@/v2/screens/b44-billing/fixture");
const { useBoard44Data } = await import("@/v2/screens/b44-billing/data");

function renderScreen(data = board44Fixture) {
  return render(<Board44Screen data={data} />);
}

function renderDataHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useBoard44Data(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function stubBillingFetch(
  options: { pending?: boolean; fail?: boolean; noSubscription?: boolean } = {},
) {
  const usage = {
    tier: "pro",
    brandsUsed: 1,
    brandsLimit: 3,
    trackedQuestionsUsed: 4,
    trackedQuestionsCap: 10,
    citationRunsThisPeriod: 6,
    periodDays: 30,
    contentGeneratedUsed: 0,
    contentGeneratedLimit: 0,
  };
  const subscription = options.noSubscription
    ? null
    : {
        status: "active",
        planName: "Pro",
        tier: "pro",
        amount: 9900,
        currency: "usd",
        interval: "month",
        currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
        cancelAtPeriodEnd: false,
        trialEnd: null,
      };
  const invoices = [
    {
      id: "in_1",
      number: "VC-1",
      status: "paid",
      amountPaid: 9900,
      amountDue: 0,
      currency: "usd",
      created: Math.floor(Date.now() / 1000),
      hostedInvoiceUrl: "https://invoice.stripe.com/i/1",
      invoicePdf: "https://invoice.stripe.com/i/1.pdf",
    },
  ];
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (options.pending) return new Promise<Response>(() => {});
    if (options.fail) {
      return Promise.resolve(new Response(JSON.stringify({ error: "failed" }), { status: 500 }));
    }
    const url = String(input);
    if (url.includes("/v2/billing/")) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: usage }), { status: 200 }),
      );
    }
    if (url.includes("/api/billing/subscription")) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: subscription }), { status: 200 }),
      );
    }
    if (url.includes("/api/billing/invoices")) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: invoices }), { status: 200 }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Board 44 screen", () => {
  it("renders the plan, usage and invoice regions", () => {
    renderScreen();

    expect(screen.getByText("Plan and usage")).toBeInTheDocument();
    expect(screen.getByText("Team plan")).toBeInTheDocument();
    expect(screen.getByText("Usage this billing period")).toBeInTheDocument();
    expect(screen.getByText("Invoice history")).toBeInTheDocument();
    expect(screen.getByText("VC-2026-09-001")).toBeInTheDocument();
  });

  it("shows an honest no-subscription state instead of a fake plan", () => {
    renderScreen({
      ...board44Fixture,
      plan: null,
      paymentMethodNote: "No payment method on file.",
    });
    expect(screen.getByText("No active subscription")).toBeInTheDocument();
    expect(screen.getByText("Choose a plan")).toBeInTheDocument();
  });
});

describe("Board 44 live adapter", () => {
  it("maps real usage to real plan names, not the reference render's sample price", async () => {
    stubBillingFetch();
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.plan?.name).toBe("Pro");
    expect(result.current.data?.plan?.monthlyPriceCents).toBe(9900);
    expect(result.current.data?.usage.trackedQuestions).toEqual({ used: 4, limit: 10 });
    expect(result.current.data?.usage.contentGenerated.limit).toBe(0);
  });

  it("renders no plan when there is no active subscription", async () => {
    stubBillingFetch({ noSubscription: true });
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(result.current.data?.plan).toBeNull();
    expect(result.current.data?.paymentMethodNote).toBe("No payment method on file.");
  });

  it("reports loading while billing requests are pending", () => {
    stubBillingFetch({ pending: true });
    const { result } = renderDataHook();

    expect(result.current.state.kind).toBe("loading");
  });

  it("reports an error when a billing request fails", async () => {
    stubBillingFetch({ fail: true });
    const { result } = renderDataHook();

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
  });
});
