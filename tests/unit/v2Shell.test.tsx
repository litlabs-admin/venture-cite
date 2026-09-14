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
    logout: vi.fn(),
    isLoggingOut: false,
  }),
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
    expect(JSON.parse(visibilityLink.getAttribute("data-search") ?? "{}")).toMatchObject({
      brandId: "b1",
      mode: "guided",
    });
  });

  it("moves to the Visibility expert equivalent while preserving search state", () => {
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
      search: { brandId: "b1", tab: "evidence", mode: "expert" },
    });
  });
});
