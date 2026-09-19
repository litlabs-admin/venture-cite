// @vitest-environment happy-dom
//
// The standalone /register sign-up page was deleted: sign-up now happens
// inside the public, pre-account /start onboarding flow (see
// docs/superpowers/specs/2026-09-18-onboarding-data-contract.md). /register
// itself still exists as a redirect to /start (src/routes/_app/register.tsx)
// so old bookmarks and emails keep working, but every fresh entry point -
// including the login page's "Sign up" link - should point straight at
// /start rather than bounce through the redirect. This guards that wiring.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => {},
}));

vi.mock("@/components/BrandLogo", () => ({
  BrandLogo: () => null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock("@/lib/sentry", () => ({
  Sentry: { captureException: vi.fn() },
}));

import Login from "@/pages/login";

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Login />
    </QueryClientProvider>,
  );
}

describe("Login page - sign up link", () => {
  it("points the sign-up link at /start, not the deleted /register page", () => {
    renderLogin();
    const link = screen.getByTestId("link-register") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/start");
  });
});
