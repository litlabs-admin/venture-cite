// @vitest-environment happy-dom
//
// The shell's geometry is the thing this guards. The approved artboards draw
// a 244px rail; the shipped app is 200px and the v2 tree matches the app, so
// a well-meaning "fix" back to the artboard number is exactly the regression
// worth failing the build over.
//
// The router and the brand hook are mocked rather than provided: V2Shell is
// rendered here on its own, outside any RouterProvider, so `Link` and
// `useRouterState` have no router to read.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const brandsStub = vi.hoisted(() => ({
  value: { brands: [{ id: "b1" }] as { id: string }[], isLoading: false },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children?: React.ReactNode; to?: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: () => "/v2/today",
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandsStub.value,
}));

// The wordmark imports an svg through the `@assets` alias, which the vitest
// resolver does not carry (only `@` and `@shared`). Stubbed here, exactly as
// the existing sidebar tests do.
vi.mock("@/components/BrandLogo", () => ({ BrandLogo: () => null }));

vi.mock("@/components/BrandSelector", () => ({
  default: () => <div data-testid="brand-selector" />,
}));

const { V2Shell } = await import("@/v2/shell/V2Shell");

describe("V2Shell", () => {
  beforeEach(() => {
    brandsStub.value = { brands: [{ id: "b1" }], isLoading: false };
  });

  it("renders a 200px rail, not the artboard 244", () => {
    const { container } = render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("w-[200px]");
    expect(aside?.className).not.toContain("244");
  });

  it("carries the vc-app type scale on its root", () => {
    const { container } = render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
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

  // BrandSelector renders `null` on zero brands, and this tree's gate does not
  // redirect a brand-less user away. Without an explicit placeholder the
  // context bar would just be empty, which reads as a broken control.
  it("names the zero-brand case instead of leaving a silent gap", () => {
    brandsStub.value = { brands: [], isLoading: false };
    render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    expect(screen.queryByTestId("brand-selector")).toBeNull();
    expect(screen.getByTestId("v2-brand-empty").textContent).toMatch(/no brands yet/i);
  });
});
