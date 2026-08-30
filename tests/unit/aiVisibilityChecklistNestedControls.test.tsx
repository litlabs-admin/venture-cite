// @vitest-environment happy-dom
//
// B9 UI/UX remainder (B7-20): client/src/pages/ai-visibility.tsx nested a
// Radix `Checkbox` (renders `<button role="checkbox">`) INSIDE the
// `AccordionTrigger` (also a `<button>`). A button inside a button is
// invalid HTML (WCAG 4.1.1) with undefined keyboard/AT behaviour - the
// previous audit pass flagged this and deliberately left it unfixed as
// "higher risk", pending live verification.
//
// Fix: moved the Checkbox to be a SIBLING of AccordionTrigger inside a
// shared flex row, rather than a child of the trigger button. This test
// proves the checkbox is no longer a DOM descendant of the trigger button,
// and that both controls still work independently after the restructure
// (accordion still expands on trigger click; checkbox still toggles without
// expanding/collapsing the panel).
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

// A stateful stub, not a blanket 200: the page's own effect re-syncs
// `completedSteps` from the server on every settle (including the refetch
// this page triggers right after a successful toggle), so a mock that
// always answers GET with empty progress would erase the just-made toggle
// a moment later and make this test flaky for reasons that have nothing to
// do with the fix under test.
function makeVisibilityProgressFetch() {
  let progress: Record<string, string[]> = {};
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    if (String(url).startsWith("/api/visibility-progress/")) {
      if (method === "GET") return jsonResponse({ success: true, data: progress });
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const { engineId, stepId } = body as { engineId: string; stepId: string };
      const cur = progress[engineId] || [];
      progress = {
        ...progress,
        [engineId]:
          method === "POST"
            ? cur.includes(stepId)
              ? cur
              : [...cur, stepId]
            : cur.filter((id) => id !== stepId),
      };
      return jsonResponse({ success: true, data: progress });
    }
    return jsonResponse({ success: true, data: {} });
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

const STEP_TITLE = /Submit your site to Bing Webmaster Tools/i;

describe("AIVisibility - checklist checkbox is not nested inside the accordion trigger", () => {
  it("renders the checkbox as a sibling of the trigger button, not a descendant of it", async () => {
    queryClient.clear();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ success: true, data: {} })));
    renderPage();

    const trigger = await screen.findByRole("button", { name: STEP_TITLE });
    const checkbox = screen.getByTestId("checkbox-chatgpt-reg-1");

    // Before the fix, the checkbox was rendered as a child of the trigger
    // button (an actual DOM descendant) - a button nested inside a button.
    expect(trigger.contains(checkbox)).toBe(false);
  });

  it("still expands the accordion via the trigger, and the checkbox still toggles independently", async () => {
    queryClient.clear();
    localStorage.clear();
    vi.stubGlobal("fetch", makeVisibilityProgressFetch());
    const user = userEvent.setup();
    renderPage();

    const trigger = await screen.findByRole("button", { name: STEP_TITLE });
    const checkbox = screen.getByTestId("checkbox-chatgpt-reg-1");

    expect(trigger.getAttribute("data-state")).toBe("closed");
    await user.click(trigger);
    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(screen.getByText(/ChatGPT's search mode uses Bing's index/i)).toBeTruthy();

    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    await user.click(checkbox);
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    // Toggling the checkbox must not collapse the panel the trigger opened.
    expect(trigger.getAttribute("data-state")).toBe("open");
  });
});
