// @vitest-environment happy-dom
//
// B9 UI/UX remainder (B7-20): client/src/components/fact-sheet/ScrapeFailureState.tsx
// links back to `/brands` with `search={{ edit: brandId }}` on every one of
// its seven failure branches. Verified against current code before fixing:
// `client/src/pages/brands.tsx` never read an `edit` search param at all
// (it opens the Edit dialog only via `handleEdit(brand)`, called from the
// row's own Edit button's onClick), and `/_app/brands` declares no
// `validateSearch` schema - so the link was dead: it navigated to a plain
// brand list with no dialog and no indication anything was supposed to
// happen.
//
// Fix (client/-only, since src/routes/** is out of scope for this task):
// brands.tsx now reads `edit` off the raw `window.location.search` - the
// same pattern brand-fact-sheet.tsx already uses for its own `autoScrape`
// param - and opens the Edit dialog (via the real `handleEdit`, so the form
// is actually seeded, not just switched open) for the matching brand, then
// strips the param so a refresh doesn't re-trigger it.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Brand } from "@shared/schema";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: { children?: React.ReactNode }) => <a {...props}>{children}</a>,
}));

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "brand-1",
    name: "Acme Rockets",
    companyName: "Acme Rockets Inc",
    industry: "Aerospace",
    description: "",
    website: "https://acme.example",
    tone: "professional",
    targetAudience: "",
    products: [],
    keyValues: [],
    uniqueSellingPoints: [],
    brandVoice: "",
    sampleContent: "",
    nameVariations: [],
    logoUrl: null,
    ...overrides,
  } as Brand;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

import { queryClient } from "@/lib/queryClient";
import Brands from "@/pages/brands";

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Brands />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient.clear();
  window.history.replaceState(null, "", "/brands");
});

describe("brands.tsx - ?edit=<id> deep link opens (and seeds) the Edit dialog", () => {
  it("opens the Edit dialog for the matching brand, with its data pre-filled", async () => {
    const brand = makeBrand({ id: "brand-42", name: "Acme Rockets", industry: "Aerospace" });
    window.history.replaceState(null, "", "/brands?edit=brand-42");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [brand] })),
    );

    renderPage();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Edit Brand")).toBeTruthy();
    // Proves the real `handleEdit` ran (which calls `form.reset(...)`), not
    // just that some dialog opened - a bare `setEditingBrand` would open an
    // empty/default-valued form instead of this brand's actual data.
    expect(within(dialog).getByDisplayValue("Acme Rockets")).toBeTruthy();
    expect(within(dialog).getByDisplayValue("Aerospace")).toBeTruthy();
  });

  it("strips the ?edit= param from the URL once handled", async () => {
    const brand = makeBrand({ id: "brand-42" });
    window.history.replaceState(null, "", "/brands?edit=brand-42");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [brand] })),
    );

    renderPage();
    await screen.findByRole("dialog");

    expect(window.location.search).toBe("");
  });

  it("does nothing (no dialog, param still cleared) when the id in the link doesn't match any brand", async () => {
    const brand = makeBrand({ id: "brand-1" });
    window.history.replaceState(null, "", "/brands?edit=does-not-exist");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [brand] })),
    );

    renderPage();
    await screen.findByText("Acme Rockets");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not open any dialog when the URL has no ?edit= param at all", async () => {
    const brand = makeBrand({ id: "brand-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [brand] })),
    );

    renderPage();
    await screen.findByText("Acme Rockets");

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
