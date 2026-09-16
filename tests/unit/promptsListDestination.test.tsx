// @vitest-environment happy-dom
//
// The standalone /prompts list has no entry in the workflow-spine nav
// (Dashboard / Setup / Monitor / Diagnose / Act / Report), so anything landing
// a reader there drops them outside the workflow. Monitor's citations ->
// Prompts tab is the same list inside the spine.
//
// Two halves of one invariant: no DEST entry may point at /prompts, and
// SpineRedirect must be able to name an inner tab so the /prompts route itself
// can send bookmarks and typed URLs to the same place.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

// routeGates pulls in AppShell -> BrandLogo -> "@assets/logo.svg", an alias the
// vitest config does not define. SpineRedirect touches none of it.
vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@tanstack/react-router", () => ({
  // Enough of the file-route factory to hand the test the route's own options.
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  useSearch: () => ({ brandId: "brand-1" }),
  Navigate: ({ to, search, replace }: { to: string; search: unknown; replace?: boolean }) => (
    <div
      data-to={to}
      data-search={JSON.stringify(search)}
      data-replace={replace ? "true" : "false"}
    />
  ),
}));

import { DEST } from "@/components/dashboard-panels/primitives";
import { SpineRedirect } from "../../src/routes/-shared/routeGates";
import { Route as PromptsIndexRoute } from "../../src/routes/_app/prompts.index";

function renderRedirect(element: ReactNode) {
  const { container } = render(<>{element}</>);
  const nav = container.querySelector("[data-to]");
  return {
    to: nav?.getAttribute("data-to"),
    search: JSON.parse(nav?.getAttribute("data-search") ?? "{}"),
    replace: nav?.getAttribute("data-replace"),
  };
}

describe("the prompts list destination", () => {
  it("sends the dashboard's prompt links to Monitor's prompts tab", () => {
    expect(DEST.prompts).toEqual({
      to: "/monitor",
      search: { tab: "citations", ptab: "prompts" },
    });
  });

  it("leaves no DEST entry pointing at the nav-less /prompts page", () => {
    const strays = Object.entries(DEST).filter(([, dest]) => dest.to === "/prompts");
    expect(strays).toEqual([]);
  });
});

describe("the /prompts route itself", () => {
  // Redirecting at the route, not only at the link, is what covers the paths no
  // DEST entry controls: bookmarks, typed URLs, and browser history.
  it("redirects to Monitor's prompts tab, keeping existing query params", () => {
    const Component = PromptsIndexRoute.options.component as () => ReactNode;
    const redirect = renderRedirect(<Component />);

    expect(redirect.to).toBe("/monitor");
    expect(redirect.search).toEqual({
      brandId: "brand-1",
      tab: "citations",
      ptab: "prompts",
    });
    // Without replace, Back from the spine target returns to /prompts, which
    // redirects forward again - a loop the reader cannot escape.
    expect(redirect.replace).toBe("true");
  });
});

describe("SpineRedirect", () => {
  it("omits ptab entirely when no inner tab is named", () => {
    const redirect = renderRedirect(<SpineRedirect to="/act" tab="geo-assets" />);

    expect(redirect.search).toEqual({ brandId: "brand-1", tab: "geo-assets" });
    expect("ptab" in redirect.search).toBe(false);
  });
});
