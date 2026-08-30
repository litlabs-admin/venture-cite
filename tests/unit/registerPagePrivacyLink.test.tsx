// @vitest-environment happy-dom
//
// B8 orphaned-pages fix: client/src/pages/privacy.tsx (route /privacy) was a
// real, content-bearing page nothing in the app linked to - see
// .audit/B7/B7-08-orphaned-pages.md. register.tsx's signup disclaimer said
// "Privacy Policy" as plain text; it now links to /privacy. This test
// guards that wiring - remove/rename the disclaimer only after moving this
// assertion to wherever the link goes.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => {},
}));

// BrandLogo pulls in @assets/logo.svg, which vitest.config.ts does not
// alias (only vite.config.ts does) - stub it out, same as other page tests
// stub away deps unrelated to what they're checking.
vi.mock("@/components/BrandLogo", () => ({
  BrandLogo: () => null,
}));

import Register from "@/pages/register";

function renderRegister() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Register />
    </QueryClientProvider>,
  );
}

describe("Register page - privacy policy link", () => {
  it("links the disclaimer's Privacy Policy text to /privacy", () => {
    renderRegister();
    const link = screen.getByText("Privacy Policy") as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/privacy");
  });

  it("leaves Terms of Service as plain text (no ToS page exists yet)", () => {
    renderRegister();
    expect(screen.getByText(/Terms of Service/)).toBeTruthy();
    // Only one real link in the disclaimer paragraph - the Privacy Policy one.
    const disclaimer = screen.getByText(/By signing up, you agree to our/);
    const links = disclaimer.querySelectorAll("a");
    expect(links.length).toBe(1);
  });
});
