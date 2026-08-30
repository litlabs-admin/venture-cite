// @vitest-environment happy-dom
//
// B9 UI/UX audit: client/src/components/Sidebar.tsx's NavItem rendered
// `<Link to={href}><div tabIndex={0}>...</div></Link>`. `Link` already
// renders a real, focusable, Enter-activatable `<a>` - the inner div's
// `tabIndex={0}` duplicated that as a SECOND tab stop with no onClick or
// onKeyDown of its own, so every one of the six spine nav items cost a
// keyboard user two Tab presses to get past instead of one, the second
// landing on a control that does nothing. Fixed by moving the interactive
// role (and its focus ring) onto the `<a>` and dropping the div's tabIndex.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "/",
  useNavigate: () => () => {},
  Link: ({ children, to, ...props }: { children?: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { email: "a@b.com" }, logout: () => {} }),
}));

vi.mock("@/components/SidebarOnboarding", () => ({ default: () => null }));
vi.mock("@/components/SidebarNeedHelp", () => ({ default: () => null }));
vi.mock("@/components/ThemeMenuItems", () => ({
  ThemeMenuItems: () => null,
  QuickThemeToggle: () => null,
}));
vi.mock("@/components/BrandLogo", () => ({ BrandLogo: () => null }));

import { SidebarContent } from "@/components/Sidebar";

describe("Sidebar NavItem - single keyboard tab stop per nav item", () => {
  it("gives the Dashboard nav item exactly one tabbable element, not two", () => {
    render(<SidebarContent />);

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink.tagName).toBe("A");

    // The div that used to carry its own tabIndex={0} is the link's child -
    // it must not also be independently focusable.
    const innerDiv = dashboardLink.querySelector("div");
    expect(innerDiv).toBeTruthy();
    expect(innerDiv?.getAttribute("tabindex")).toBeNull();
  });
});
