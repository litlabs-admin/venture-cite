// @vitest-environment happy-dom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    ...props
  }: {
    children?: React.ReactNode;
    to?: string;
    search?: Record<string, unknown>;
  }) => (
    <a href={to} data-search={JSON.stringify(search ?? {})} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: vi.fn(),
}));

vi.mock("@/v2/shell/useV2Mode", () => ({
  useV2Mode: vi.fn(),
}));

import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import { Board45Screen } from "@/v2/screens/b45-empty-brand/Screen";
import { board45Fixture } from "@/v2/screens/b45-empty-brand/fixture";
import { useBoard45Data } from "@/v2/screens/b45-empty-brand/data";

const mockedUseBrandSelection = vi.mocked(useBrandSelection);
const mockedUseV2Mode = vi.mocked(useV2Mode);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseV2Mode.mockReturnValue({ mode: "guided", setMode: vi.fn() });
});

describe("Board 45 empty new brand render", () => {
  it("names the real brand, never a fixture brand, in its own copy", () => {
    const data = {
      ...board45Fixture,
      brand: { name: "Acme Rocketry" },
    };
    render(<Board45Screen data={data} />);

    expect(
      screen.getByRole("heading", { name: "Start with one verified brand" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Add Acme Rocketry.?s website/)).toBeInTheDocument();
    expect(screen.queryByText(/VenturePR/)).toBeNull();
    expect(screen.queryByText(/Acme Health/)).toBeNull();
  });

  it("shows the three setup steps and a working link to add facts", () => {
    render(<Board45Screen data={board45Fixture} />);

    const steps = screen.getByTestId("board45-setup-steps");
    expect(steps).toHaveTextContent("Add website");
    expect(steps).toHaveTextContent("Confirm facts");
    expect(steps).toHaveTextContent("Approve buyer questions");

    const link = screen.getByRole("link", { name: "Add brand facts" });
    expect(link).toHaveAttribute("href", "/v2/brand-facts/workspace");
    expect(JSON.parse(link.getAttribute("data-search") ?? "{}")).toMatchObject({
      brandId: board45Fixture.brandId,
      mode: board45Fixture.mode,
    });
  });

  it("links plan usage to the real billing route", () => {
    render(<Board45Screen data={board45Fixture} />);

    const link = screen.getByRole("link", { name: "View plan and billing" });
    expect(link).toHaveAttribute("href", "/v2/settings/billing");
  });

  it("shows no fake metric, score, or measured value", () => {
    render(<Board45Screen data={board45Fixture} />);

    const main = screen.getByTestId("board45-empty-brand");
    expect(main.textContent).not.toMatch(/%/);
    expect(main.textContent).not.toContain("Prototype");
    expect(main.textContent).not.toContain("Sample data");
  });
});

describe("Board 45 live adapter", () => {
  it("is ready once a brand is selected, carrying its real name", () => {
    mockedUseBrandSelection.mockReturnValue({
      selectedBrandId: "brand-1",
      selectedBrand: { id: "brand-1", name: "Acme Rocketry" },
      brands: [{ id: "brand-1", name: "Acme Rocketry" }],
      isLoading: false,
    } as never);

    const result = useBoard45Data();

    expect(result.state.kind).toBe("ready");
    expect(result.data?.brand.name).toBe("Acme Rocketry");
    expect(result.data?.brandId).toBe("brand-1");
  });

  it("is loading while brands are loading", () => {
    mockedUseBrandSelection.mockReturnValue({
      selectedBrandId: "",
      selectedBrand: undefined,
      brands: [],
      isLoading: true,
    } as never);

    expect(useBoard45Data().state.kind).toBe("loading");
  });

  it("asks for a brand selection honestly rather than rendering blank", () => {
    mockedUseBrandSelection.mockReturnValue({
      selectedBrandId: "",
      selectedBrand: undefined,
      brands: [],
      isLoading: false,
    } as never);

    expect(useBoard45Data().state.kind).toBe("not-measured");
  });
});
