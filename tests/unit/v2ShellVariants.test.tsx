// @vitest-environment happy-dom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useV2Mode } from "@/v2/shell/useV2Mode";

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

function ModeProbe() {
  const { mode, setMode } = useV2Mode();
  return (
    <button type="button" onClick={() => setMode(mode === "guided" ? "expert" : "guided")}>
      {mode}
    </button>
  );
}

describe("V2Shell variants", () => {
  beforeEach(() => {
    localStorage.removeItem("vc.v2.mode");
    routerStub.pathname = "/v2/today";
    routerStub.search = { brandId: "b1" };
    routerStub.matches = [{ staticData: { v2Shell: "guided" } }];
    routerStub.navigate.mockReset();
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem("vc.v2.mode");
  });

  function renderShell(variant: string, pathname = "/v2/today") {
    routerStub.pathname = pathname;
    routerStub.matches = [{ staticData: { v2Shell: variant } }];
    return render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
  }

  it("shows the Guided toggle for the guided variant", () => {
    renderShell("guided");
    expect(screen.getByRole("button", { name: "Guided" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Expert" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the Expert toggle for the expert variant", () => {
    renderShell("expert", "/v2/visibility");
    expect(screen.getByRole("button", { name: "Expert" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Guided" })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the nine expert destinations and its global search", () => {
    renderShell("expert-nav", "/v2/diagnostics/geo-signals");
    for (const label of [
      "Overview",
      "Site health",
      "GEO signals",
      "Competitors",
      "Content",
      "Mentions",
      "Opportunities",
      "Tasks",
      "Reports",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByText("Expert mode")).toBeInTheDocument();
  });

  it("marks only the longest expert destination as active", () => {
    renderShell("expert-nav", "/v2/diagnostics/geo-signals");
    expect(screen.getByRole("link", { name: "GEO signals" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Diagnostics" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("maps the baseline review route to the Today destination", () => {
    renderShell("guided", "/v2/onboarding/baseline-review");
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the agency Portfolio destination", () => {
    renderShell("agency", "/v2/agency");
    expect(screen.getByRole("link", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByTestId("v2-workspace-switcher")).toBeInTheDocument();
  });

  it("renders the bare variant without a navigation landmark", () => {
    renderShell("bare");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("persists the mode across hook remounts", () => {
    const first = render(<ModeProbe />);
    fireEvent.click(screen.getByRole("button", { name: "guided" }));
    expect(screen.getByRole("button", { name: "expert" })).toBeInTheDocument();
    first.unmount();

    render(<ModeProbe />);
    expect(screen.getByRole("button", { name: "expert" })).toBeInTheDocument();
  });

  it("keeps working when localStorage throws", () => {
    const nativeStorage = window.localStorage;
    const throwingStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: throwingStorage,
    });

    try {
      render(<ModeProbe />);
      expect(screen.getByRole("button", { name: "guided" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "guided" }));
      expect(screen.getByRole("button", { name: "expert" })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: nativeStorage,
      });
    }
  });
});
