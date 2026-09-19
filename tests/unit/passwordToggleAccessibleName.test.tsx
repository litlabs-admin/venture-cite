// @vitest-environment happy-dom
//
// B9 UI/UX audit: login.tsx and reset-password.tsx each render their own
// inline "show/hide password" icon button (Eye/EyeOff from lucide-react)
// instead of a shared component. Both had no accessible name - a screen
// reader announced only "button", giving no indication of what it does or
// its current state. This is a WCAG 4.1.2 (Name, Role, Value) failure and it
// blocks anyone using assistive tech from confidently operating the
// login/reset-password forms.
//
// Fix: each toggle now carries aria-label ("Show password" / "Hide
// password") and aria-pressed reflecting the current state. This test
// renders both real page components and asserts the toggle is reachable by
// its accessible name and reports the right pressed state.
//
// register.tsx used to be covered here too. It was deleted when sign-up
// moved into the public /start onboarding flow (client/src/pages/register.tsx
// is gone; /register is now a redirect to /start - see
// src/routes/_app/register.tsx). client/src/components/onboarding/ owns any
// password-toggle accessibility coverage for the new flow.
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
import ResetPassword from "@/pages/reset-password";

function withProviders(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("password visibility toggle - accessible name", () => {
  it("login.tsx: toggle has a name and starts unpressed (password hidden)", () => {
    render(withProviders(<Login />));
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("reset-password.tsx: toggle has a name and starts unpressed (password hidden)", () => {
    render(withProviders(<ResetPassword />));
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });
});
