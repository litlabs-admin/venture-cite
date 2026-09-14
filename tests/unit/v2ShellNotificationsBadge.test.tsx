// @vitest-environment happy-dom
//
// Proves useV2NotificationsBadge (client/src/v2/shell/useV2NotificationsBadge.ts)
// against a captured shape of the real endpoint it reads:
// `GET /api/brands/470b15fe-606b-4d96-ab62-69a01e08b237/alerts?limit=10`
// (server/routes/dashboard.ts), curled against the local database for
// Venture PR - see the "Real data" verification in
// .superpowers/sdd/live/reports/shell.md.
//
// `alert_history` (shared/schema/platform.ts) has no read/acknowledged
// column, so "unread" is defined here as "sent after the last time this
// browser opened /v2/notifications" and tracked client-side.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useV2NotificationsBadge } from "@/v2/shell/useV2NotificationsBadge";

const BRAND_ID = "470b15fe-606b-4d96-ab62-69a01e08b237";
const LAST_SEEN_KEY = "venturecite-v2-notifications-last-seen";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// The first two rows of the real curl response, unmodified.
const ALERTS_RESPONSE = {
  success: true,
  data: [
    {
      id: "7f27be81-72bb-4477-9d10-9a9136fd374a",
      alertSettingId: null,
      brandId: BRAND_ID,
      alertType: "new_hallucinations",
      message: "1 new unresolved hallucination detected this run (17 open total).",
      details: { added: 1, nextHref: "/diagnose?tab=hallucinations", openTotal: 17 },
      sentVia: "in_app",
      sentAt: "2026-08-31T02:39:56.328Z",
    },
    {
      id: "47d240e2-fd3c-4c36-87b6-3953b3d08e51",
      alertSettingId: null,
      brandId: BRAND_ID,
      alertType: "new_hallucinations",
      message: "2 new unresolved hallucinations detected this run (17 open total).",
      details: { added: 2, nextHref: "/diagnose?tab=hallucinations", openTotal: 17 },
      sentVia: "in_app",
      sentAt: "2026-07-27T01:16:11.049Z",
    },
  ],
};

function Probe({
  brandId,
  pathname,
  enabled,
}: {
  brandId: string;
  pathname: string;
  enabled: boolean;
}) {
  const count = useV2NotificationsBadge(brandId, pathname, enabled);
  return <div data-testid="count">{count}</div>;
}

function renderProbe(props: { brandId: string; pathname: string; enabled: boolean }) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe {...props} />
    </QueryClientProvider>,
  );
}

describe("useV2NotificationsBadge", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(ALERTS_RESPONSE)));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("treats every alert as unread the first time this browser has looked", async () => {
    renderProbe({ brandId: BRAND_ID, pathname: "/v2/today", enabled: true });
    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  it("counts only alerts sent after the last visit to Notifications", async () => {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(Date.parse("2026-08-01T00:00:00.000Z")));
    renderProbe({ brandId: BRAND_ID, pathname: "/v2/today", enabled: true });
    // Only the Aug 31 alert is newer than the Aug 1 last-seen timestamp;
    // the Jul 27 one stays read.
    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("shows no badge while actually on the Notifications page", async () => {
    renderProbe({ brandId: BRAND_ID, pathname: "/v2/notifications", enabled: true });
    expect(await screen.findByText("0")).toBeInTheDocument();
  });

  it("shows no badge and makes no request when disabled (agency/expert-nav rails)", () => {
    renderProbe({ brandId: BRAND_ID, pathname: "/v2/agency", enabled: false });
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows no badge when the brand genuinely has no alerts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [] })));
    renderProbe({ brandId: BRAND_ID, pathname: "/v2/today", enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("count").textContent).toBe("0");
  });
});
