// @vitest-environment happy-dom
//
// Learn is a navigable prototype with no content, and the thing worth failing
// the build over is the difference between those two words. "Prototype" is
// fine. "No content" is only fine while the screen SAYS so. A stand-in lesson
// title, a completion ratio or a progress bar at any percentage would turn
// this from an honest frame into working software that lies, and none of those
// is visible in a screenshot diff once it has shipped.
//
// So the assertions below are mostly NEGATIVE. They check that the screen does
// not contain a progress bar, does not contain a "n of m" count, and does not
// contain a lesson-shaped row - and they check the positive claim, that the
// absence is stated in words a user reads rather than implied by emptiness.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr" as string | null,
    brands: [{ id: "brand-venture-pr" }] as { id: string }[],
    isLoading: false,
  },
}));

const routerStub = vi.hoisted(() => ({
  pathname: "/v2/learn",
  search: {} as Record<string, unknown>,
  matches: [{ staticData: { v2Shell: "guided" } }],
  navigate: vi.fn(),
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
      | Record<string, unknown>
      | ((previous: Record<string, unknown>) => Record<string, unknown>);
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
  useBrandSelection: () => brandStub.value,
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

// The wordmark imports an svg through the `@assets` alias, which the vitest
// resolver does not carry. Stubbed exactly as v2Shell.test.tsx does.
vi.mock("@/components/BrandLogo", () => ({ BrandLogo: () => null }));
vi.mock("@/components/BrandSelector", () => ({
  default: () => <div data-testid="brand-selector" />,
}));

const LearnPage = (await import("@/v2/learn/LearnPage")).default;
const { V2Shell } = await import("@/v2/shell/V2Shell");
const { V2Nav } = await import("@/v2/shell/V2Nav");
const { NOT_WRITTEN_LABEL } = await import("@/v2/learn/LearnNotice");

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

function renderInShell() {
  return render(
    <V2Shell>
      <LearnPage />
    </V2Shell>,
  );
}

beforeEach(() => {
  brandStub.value = {
    selectedBrandId: "brand-venture-pr",
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  };
  routerStub.pathname = "/v2/learn";
});

describe("Learn navigation", () => {
  it("is a real nav destination, not a Soon row", () => {
    render(
      <V2Nav
        variant="guided"
        pathname={routerStub.pathname}
        brandId="brand-venture-pr"
        mode="guided"
        search={routerStub.search}
      />,
    );
    const row = screen.getByText("Learn").closest("[data-v2-nav]");
    expect(row).toBeTruthy();
    expect(row?.getAttribute("aria-disabled")).toBeNull();
    expect(row?.tagName.toLowerCase()).toBe("a");
    expect(row?.getAttribute("href")).toBe("/v2/learn");
    expect(within(row as HTMLElement).queryByText(/soon/i)).toBeNull();
  });

  it("marks itself active when the router is on /v2/learn", () => {
    render(
      <V2Nav
        variant="guided"
        pathname={routerStub.pathname}
        brandId="brand-venture-pr"
        mode="guided"
        search={routerStub.search}
      />,
    );
    const label = screen.getByText("Learn");
    expect(label.parentElement?.className).toContain("text-[color:var(--v2-brand)]");
    expect(label.closest("[data-v2-nav]")).toHaveAttribute("aria-current", "page");
  });

  // The nav href is only a promise. This is the half that proves the promise is
  // kept: a route file exists at the path TanStack derives from the URL, and it
  // mounts the page component rather than a placeholder.
  it("has a route file behind that href", () => {
    const source = readFileSync(
      path.join(REPO_ROOT, "src", "routes", "_app", "v2.learn.tsx"),
      "utf8",
    );
    expect(source).toContain('createFileRoute("/_app/v2/learn")');
    expect(source).toContain("LearnPage");
  });

  it("is registered in the generated route tree under the gated v2 parent", () => {
    const tree = readFileSync(path.join(REPO_ROOT, "src", "routeTree.gen.ts"), "utf8");
    expect(tree).toContain("'/_app/v2/learn'");
    expect(tree).toContain("AppV2LearnRoute: typeof AppV2LearnRoute");
    // Same parent as the areas that already shipped, so it inherits v2.tsx's
    // gate and search schema instead of carrying its own.
    expect(tree).toMatch(/AppV2LearnRoute = AppV2LearnRouteImport\.update\(\{[\s\S]*?AppV2Route/);
  });
});

describe("Learn renders inside the v2 shell", () => {
  it("mounts in the shell's main region with the shell chrome intact", () => {
    const { container } = renderInShell();
    const main = container.querySelector("#v2-main-content");
    expect(main).toBeTruthy();
    expect(within(main as HTMLElement).getByTestId("v2-learn")).toBeTruthy();
    // The rail geometry is the app's 200px, not the artboards' 244.
    expect(container.querySelector("aside")?.className).toContain("w-[200px]");
  });

  it("uses the same two-column frame as the areas either side of it", () => {
    renderInShell();
    const rail = screen.getByTestId("v2-learn-rail").closest("aside");
    expect(rail?.className).toContain("lg:w-[322px]");
  });
});

describe("Learn states that nothing has been written", () => {
  it("says so in the heading, in prose, and on a labelled marker", () => {
    renderInShell();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/not ready yet/i);

    const panel = screen.getByTestId("v2-learn-not-written");
    expect(panel.textContent).toMatch(/no lessons have been written yet/i);
    expect(panel.textContent).toMatch(/nothing here to read|no lesson to open/i);

    // The marker carries the WORD, so it survives a greyscale render. `--warning`
    // is aliased to `--brand-accent` in index.css, so a tint alone would be the
    // same pixel colour as a link and would mean nothing.
    const badges = screen.getAllByTestId("v2-learn-not-written-badge");
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.textContent).toContain(NOT_WRITTEN_LABEL);
      expect(badge.querySelector("[data-glyph]")).toBeTruthy();
    }
  });

  // StateBadge owns four glyphs and its premise is one glyph, one meaning.
  // Learn is about absent CONTENT, not an absent measurement, so it must not
  // reuse one of them for a different claim.
  it("does not borrow a measurement glyph for a content claim", () => {
    renderInShell();
    const glyphs = new Set(
      Array.from(document.querySelectorAll("[data-glyph]")).map((n) =>
        n.getAttribute("data-glyph"),
      ),
    );
    expect(glyphs.has("book-dashed")).toBe(true);
    for (const measurementGlyph of ["em-dash", "slash", "alert", "check"]) {
      expect(glyphs.has(measurementGlyph)).toBe(false);
    }
  });

  it("reports no progress at all, rather than zero progress", () => {
    renderInShell();
    const rail = screen.getByTestId("v2-learn-rail");
    expect(screen.getByTestId("v2-learn-no-progress").textContent).toMatch(/not tracked/i);

    // A bar at 0% would assert that progress IS tracked and currently stands at
    // nothing. There must be no bar at any width.
    expect(rail.querySelector('[role="progressbar"]')).toBeNull();
    expect(rail.querySelector('[style*="width"]')).toBeNull();
  });

  it("invents no lesson, no count and no completion ratio anywhere on the page", () => {
    const { container } = renderInShell();
    const text = (container.querySelector("#v2-main-content") as HTMLElement).textContent ?? "";

    // "3 of 12 complete", "2/5", "60%" - any of these on this screen is fabricated.
    expect(text).not.toMatch(/\d+\s*(of|\/)\s*\d+/i);
    expect(text).not.toMatch(/\d+\s*%/);

    // The word "complete" is allowed, because this screen uses it to DENY
    // completion ("nothing to complete", "no lesson has been completed"). What
    // is not allowed is a status label standing on its own as an element - a
    // bare "Completed" or "In progress" chip is how a fabricated status looks,
    // and it reads as fact at a glance regardless of the prose around it.
    const standaloneStatus = Array.from(container.querySelectorAll("*")).filter((node) =>
      /^(completed?|in progress|not started|\d+\s*(of|\/)\s*\d+.*)$/i.test(
        (node.textContent ?? "").trim(),
      ),
    );
    expect(standaloneStatus).toHaveLength(0);

    // No lesson-shaped affordance: nothing on this page opens a lesson.
    const main = container.querySelector("#v2-main-content") as HTMLElement;
    expect(within(main).queryByRole("button")).toBeNull();
    for (const link of within(main).getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/lesson/i);
    }

    // And no skeleton rows in the resolved state. A greyed row is
    // indistinguishable from a lesson that failed to load.
    expect(container.querySelectorAll("#v2-main-content .animate-pulse").length).toBe(0);
  });
});

describe("Learn's reachable data states", () => {
  it("shows a skeleton with no row shapes while brands load", () => {
    brandStub.value = { selectedBrandId: null, brands: [], isLoading: true };
    renderInShell();
    const loading = screen.getByTestId("v2-learn-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText(/loading learn/i)).toBeTruthy();
    // Skeletons stand in for the heading and the notice only. Row-shaped bars
    // would promise a list that never arrives.
    expect(loading.querySelectorAll(".animate-pulse").length).toBeLessThanOrEqual(8);
    expect(screen.queryByTestId("v2-learn-not-written")).toBeNull();
  });

  // This tree's gate does not redirect a brand-less account away, so the case
  // is reachable and has to be named rather than left blank.
  it("names the no-brand case, and still does not promise lessons", () => {
    brandStub.value = { selectedBrandId: null, brands: [], isLoading: false };
    renderInShell();
    const empty = screen.getByTestId("v2-learn-no-brand");
    expect(empty.textContent).toMatch(/add a brand/i);
    expect(empty.textContent).toMatch(/no lessons written/i);
    expect(screen.getByTestId("v2-learn-rail")).toBeTruthy();
  });
});
