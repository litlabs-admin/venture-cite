// @vitest-environment happy-dom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerStub = vi.hoisted(() => ({
  pathname: "/v2/today",
  search: { brandId: "b1" } as Record<string, unknown>,
  matches: [{ staticData: { v2Shell: "guided" } }],
  navigate: vi.fn(),
}));

const brandsStub = vi.hoisted(() => ({
  value: {
    brands: [{ id: "b1", name: "VenturePR" }],
    selectedBrand: { id: "b1", name: "VenturePR" },
    selectedBrandId: "b1",
    isLoading: false,
  },
}));

const authStub = vi.hoisted(() => ({
  logout: vi.fn(),
}));

const notificationsBadgeStub = vi.hoisted(() => ({ value: 0 }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    ...rest
  }: {
    children?: React.ReactNode;
    to?: string;
    search?:
      Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>);
  }) => {
    const resolvedSearch = typeof search === "function" ? search(routerStub.search) : search;
    return (
      <a href={to} data-search={JSON.stringify(resolvedSearch)} {...rest}>
        {children}
      </a>
    );
  },
  useMatches: () => routerStub.matches,
  useNavigate: () => routerStub.navigate,
  useRouterState: (options?: { select?: (state: unknown) => unknown }) =>
    options?.select
      ? options.select({ location: { pathname: routerStub.pathname } })
      : { location: { pathname: routerStub.pathname } },
  useSearch: () => routerStub.search,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandsStub.value,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      email: "founder@example.com",
      firstName: "Jamie",
      lastName: "Doyle",
      accessTier: "pro",
      profileImageUrl: null,
    },
    isLoading: false,
    isAuthenticated: true,
    logout: authStub.logout,
    isLoggingOut: false,
  }),
}));

vi.mock("@/v2/shell/useV2NotificationsBadge", () => ({
  useV2NotificationsBadge: () => notificationsBadgeStub.value,
}));

vi.mock("@/components/BrandLogo", () => ({ BrandLogo: () => <span>VentureCite</span> }));

vi.mock("@/components/BrandSelector", () => ({
  default: () => (
    <button data-testid="brand-selector" type="button">
      VenturePR
    </button>
  ),
}));

const { V2Shell } = await import("@/v2/shell/V2Shell");

describe("V2Shell", () => {
  beforeEach(() => {
    routerStub.pathname = "/v2/today";
    routerStub.search = { brandId: "b1" };
    routerStub.matches = [{ staticData: { v2Shell: "guided" } }];
    routerStub.navigate.mockReset();
    authStub.logout.mockReset();
    notificationsBadgeStub.value = 0;
    brandsStub.value = {
      brands: [{ id: "b1", name: "VenturePR" }],
      selectedBrand: { id: "b1", name: "VenturePR" },
      selectedBrandId: "b1",
      isLoading: false,
    };
  });

  afterEach(() => cleanup());

  it("renders a 200px rail, not the artboard 244px rail", () => {
    const { container } = render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("w-[200px]");
    expect(aside?.className).not.toContain("244");
  });

  it("carries the scoped shell class and the existing application type scale", () => {
    const { container } = render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    expect(container.firstElementChild?.className).toContain("v2-mono");
    expect(container.firstElementChild?.className).toContain("vc-app");
  });

  it("exposes a skip link to the main region", () => {
    render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    const link = screen.getByText(/skip to main content/i);
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("#v2-main-content");
    expect(document.querySelector("#v2-main-content")).toBeTruthy();
  });

  it("names the zero-brand case instead of leaving a silent gap", () => {
    brandsStub.value = {
      brands: [],
      selectedBrand: undefined,
      selectedBrandId: "",
      isLoading: false,
    };
    render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    expect(screen.queryByTestId("brand-selector")).toBeNull();
    expect(screen.getByTestId("v2-brand-empty").textContent).toMatch(/no brands yet/i);
  });

  it("keeps the current brand and mode on every navigation link", () => {
    render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    const visibilityLink = screen.getByRole("link", { name: "Visibility" });
    expect(JSON.parse(visibilityLink.getAttribute("data-search") ?? "{}")).toEqual({
      brandId: "b1",
      mode: "guided",
    });
  });

  it("drops stray search params (e.g. ?task=) from every nav link, the logo, and the mode toggle", () => {
    // The bug: the current page carries a `task` param (as `/v2/my-work` does
    // for its preview panel) and, before the fix, every Link on the rail
    // re-spread that param onto itself.
    routerStub.pathname = "/v2/my-work";
    routerStub.search = { brandId: "b1", task: "abc-123" };

    render(
      <V2Shell>
        <div />
      </V2Shell>,
    );

    for (const name of ["Today", "Visibility", "Diagnostics", "My work", "Brand facts", "Learn"]) {
      const link = screen.getByRole("link", { name });
      const search = JSON.parse(link.getAttribute("data-search") ?? "{}");
      expect(search).toEqual({ brandId: "b1", mode: "guided" });
      expect(search.task).toBeUndefined();
    }

    const logoLink = screen.getByRole("link", { name: "VentureCite" });
    expect(JSON.parse(logoLink.getAttribute("data-search") ?? "{}")).toEqual({
      brandId: "b1",
      mode: "guided",
    });

    fireEvent.click(screen.getByRole("button", { name: "Expert" }));
    expect(routerStub.navigate).toHaveBeenCalledWith({
      to: ".",
      search: { brandId: "b1", mode: "expert" },
    });
  });

  it("moves to the Visibility expert equivalent, carrying only brandId and mode", () => {
    routerStub.pathname = "/v2/visibility/evidence";
    routerStub.search = { brandId: "b1", tab: "evidence" };
    routerStub.matches = [{ staticData: { v2Shell: "guided" } }];

    render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expert" }));

    expect(routerStub.navigate).toHaveBeenCalledWith({
      to: "/v2/visibility",
      search: { brandId: "b1", mode: "expert" },
    });
  });

  it("updates the URL mode param on a page with no expert-equivalent route", () => {
    routerStub.pathname = "/v2/today";
    routerStub.search = { brandId: "b1" };

    render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expert" }));

    // /v2/today has no EXPERT_EQUIVALENTS entry, so the toggle must still
    // update `mode` in the URL instead of silently doing nothing.
    expect(routerStub.navigate).toHaveBeenCalledWith({
      to: ".",
      search: { brandId: "b1", mode: "expert" },
    });
  });

  it("switching back to Guided also updates the URL mode param", () => {
    routerStub.pathname = "/v2/visibility";
    routerStub.search = { brandId: "b1" };
    routerStub.matches = [{ staticData: { v2Shell: "expert" } }];

    render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guided" }));

    expect(routerStub.navigate).toHaveBeenCalledWith({
      to: ".",
      search: { brandId: "b1", mode: "guided" },
    });
  });

  it("shows the real current date in the top bar, not a fixture date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    try {
      render(
        <V2Shell>
          <div />
        </V2Shell>,
      );
      expect(screen.getByText("Sep 15, 2026")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  describe("account menu", () => {
    it("is closed by default and opens on click", () => {
      render(
        <V2Shell>
          <div />
        </V2Shell>,
      );
      expect(screen.queryByRole("menu")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Jamie Doyle account menu" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("shows the real signed-in user's name and email, not a sample identity", () => {
      render(
        <V2Shell>
          <div />
        </V2Shell>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Jamie Doyle account menu" }));
      expect(screen.getByRole("menu").textContent).toContain("founder@example.com");
      expect(screen.getByRole("menu").textContent).not.toMatch(/venturepr placeholder/i);
    });

    it("Settings opens /v2/settings with brandId and mode", () => {
      render(
        <V2Shell>
          <div />
        </V2Shell>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Jamie Doyle account menu" }));
      const settingsLink = screen.getByRole("menuitem", { name: "Settings" });
      expect(settingsLink.getAttribute("href")).toBe("/v2/settings");
      expect(JSON.parse(settingsLink.getAttribute("data-search") ?? "{}")).toEqual({
        brandId: "b1",
        mode: "guided",
      });
    });

    it("Back to classic dashboard opens /dashboard with only brandId", () => {
      render(
        <V2Shell>
          <div />
        </V2Shell>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Jamie Doyle account menu" }));
      const dashboardLink = screen.getByRole("menuitem", { name: "Back to classic dashboard" });
      expect(dashboardLink.getAttribute("href")).toBe("/dashboard");
      expect(JSON.parse(dashboardLink.getAttribute("data-search") ?? "{}")).toEqual({
        brandId: "b1",
      });
    });

    it("Sign out calls the app's real logout function", () => {
      render(
        <V2Shell>
          <div />
        </V2Shell>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Jamie Doyle account menu" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
      expect(authStub.logout).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("closes on outside click", () => {
      render(
        <div>
          <div data-testid="outside" />
          <V2Shell>
            <div />
          </V2Shell>
        </div>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Jamie Doyle account menu" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.mouseDown(screen.getByTestId("outside"));
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  describe("notifications badge", () => {
    it("shows a real unread count when the alerts endpoint has newer alerts", () => {
      notificationsBadgeStub.value = 3;
      render(
        <V2Shell>
          <div />
        </V2Shell>,
      );
      expect(screen.getByTestId("v2-nav-badge-notifications").textContent).toBe("3");
    });

    it("shows no badge when there is nothing unread", () => {
      notificationsBadgeStub.value = 0;
      render(
        <V2Shell>
          <div />
        </V2Shell>,
      );
      expect(screen.queryByTestId("v2-nav-badge-notifications")).toBeNull();
    });

    it("caps the displayed count at 9+", () => {
      notificationsBadgeStub.value = 14;
      render(
        <V2Shell>
          <div />
        </V2Shell>,
      );
      expect(screen.getByTestId("v2-nav-badge-notifications").textContent).toBe("9+");
    });
  });
});
