// @vitest-environment happy-dom
//
// B9 UI/UX audit fix to client/src/pages/ai-visibility.tsx:
//
// KEYBOARD-UNREACHABLE PRIMARY CONTROL: each engine card was a
// `<div onClick aria-pressed>` with no role, tabIndex, or key handler -
// `aria-pressed` claimed toggle-button semantics the element never
// delivered by any means other than a mouse click. It is the only way to
// switch which engine's checklist shows below. Fixed with
// role="button" + tabIndex={0} + Enter/Space handling.
//
// (A second issue was investigated here - the effect that mirrors
// `/api/visibility-progress/:brandId` into local state does not check
// `isError`, so `progressResponse?.data ?? {}` runs on every settle. A
// naive "skip the reset when isError" fix was tried and reverted: TanStack
// Query keeps the previous successful `data` through a failed BACKGROUND
// refetch by default, so that fix never changed behavior for the case that
// matters, and skipping the reset unconditionally on `isError` would
// instead leak a previously-selected brand's progress onto a new brand's
// view when that brand's very first load fails. Left unfixed - see
// .audit/B7/B9-11-ui-ux.md.)
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children?: React.ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({
    selectedBrandId: "brand-1",
    brands: [{ id: "brand-1", name: "Acme" }],
    isLoading: false,
  }),
}));

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

import { queryClient } from "@/lib/queryClient";
import AIVisibility from "@/pages/ai-visibility";

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AIVisibility />
    </QueryClientProvider>,
  );
}

describe("AIVisibility - engine card is keyboard-operable", () => {
  it("switches the selected engine via keyboard (Enter), not just a mouse click", async () => {
    queryClient.clear();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ success: true, data: {} })));
    const user = userEvent.setup();
    renderPage();

    const cards = await screen.findAllByTestId(/^engine-card-/);
    const secondCard = cards[1];
    expect(secondCard.getAttribute("tabindex")).toBe("0");
    expect(secondCard.getAttribute("role")).toBe("button");
    expect(secondCard.getAttribute("aria-pressed")).toBe("false");

    secondCard.focus();
    await user.keyboard("{Enter}");

    expect(secondCard.getAttribute("aria-pressed")).toBe("true");
  });
});
