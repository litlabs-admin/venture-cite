// @vitest-environment happy-dom
//
// B9 UI/UX audit, two fixes to client/src/pages/community-engagement.tsx:
//
// 1. DATA LOSS: `handleSaveGenerated` used to close the "Generate Post"
//    dialog and clear `generatedContent` immediately after calling
//    `createPostMutation.mutate(...)`, not inside its `onSuccess`. A failed
//    save (network blip, 500) discarded the just-generated AI content from
//    view before the user ever learned the save had failed - the only copy
//    was gone, and getting it back costs another AI generation call. The fix
//    moves the dialog-close/state-clear into the mutation's own onSuccess.
//
// 2. NO CONFIRMATION ON DESTRUCTIVE DELETE: the per-draft Delete button
//    called `deletePostMutation.mutate(post.id)` directly on click, with no
//    confirmation, on a board with no undo. It now opens an AlertDialog
//    (the same pattern already used for deletes in articles.tsx/content.tsx)
//    and only fires the DELETE once "Delete permanently" is clicked.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

// Radix's Select opens its content via pointer-capture APIs happy-dom does
// not implement, so it never actually opens in this test environment. Swap
// it for a minimal stand-in that keeps the real onValueChange wiring (so the
// page's own state/handlers are exercised unmodified) without the popover
// mechanics - this test cares whether picking "Reddit" enables the real
// Generate button and flows into the real mutate() call, not Radix's
// positioning logic.
const SelectCtx = createContext<{ onValueChange: (v: string) => void }>({
  onValueChange: () => {},
});
vi.mock("@/components/ui/select", () => ({
  Select: ({
    onValueChange,
    children,
  }: {
    onValueChange: (v: string) => void;
    children: ReactNode;
  }) => <SelectCtx.Provider value={{ onValueChange }}>{children}</SelectCtx.Provider>,
  SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
    <div id={id}>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
    const { onValueChange } = useContext(SelectCtx);
    return (
      <button type="button" onClick={() => onValueChange(value)}>
        {children}
      </button>
    );
  },
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({
    selectedBrandId: "brand-1",
    selectedBrand: { id: "brand-1", name: "Acme", industry: "technology", description: "" },
    brands: [{ id: "brand-1", name: "Acme" }],
    isLoading: false,
    setSelectedBrandId: () => {},
  }),
}));

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queryClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queryClient")>();
  return { ...actual, apiRequest: apiRequestMock };
});

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

import { queryClient } from "@/lib/queryClient";
import CommunityEngagement from "@/pages/community-engagement";

const DRAFT_POST = {
  id: "post-1",
  brandId: "brand-1",
  platform: "reddit",
  groupName: "r/marketing",
  title: "My draft",
  content: "Draft body",
  status: "draft",
  postType: "post",
};

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <CommunityEngagement />
    </QueryClientProvider>,
  );
}

describe("CommunityEngagement - save-on-error and delete confirmation", () => {
  beforeEach(() => {
    queryClient.clear();
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === "GET" && url.startsWith("/api/community-posts")) {
        return Promise.resolve(jsonResponse({ success: true, data: [DRAFT_POST] }));
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });
  });

  it("keeps the generated draft on screen when saving it fails", async () => {
    const user = userEvent.setup();
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === "GET" && url.startsWith("/api/community-posts")) {
        return Promise.resolve(jsonResponse({ success: true, data: [] }));
      }
      if (method === "POST" && url === "/api/community-generate") {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              title: "Generated title",
              content: "Generated body",
              hashtags: [],
              tips: [],
              bestTimeToPost: "",
            },
          }),
        );
      }
      if (method === "POST" && url === "/api/community-posts") {
        return Promise.reject(new Error("save failed"));
      }
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    });

    renderPage();

    await user.click(await screen.findByTestId("button-generate-post"));
    await user.click(await screen.findByRole("button", { name: "Reddit" }));
    await user.type(screen.getByTestId("input-gen-group"), "r/marketing");
    await user.type(screen.getByTestId("input-gen-topic"), "Best practices");
    await user.click(screen.getByTestId("button-run-generate"));

    await screen.findByTestId("generated-content");
    await user.click(screen.getByTestId("button-save-draft"));

    // The save is rejected; the generated content and the open dialog must
    // still be there so the user can retry without regenerating.
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "POST",
        "/api/community-posts",
        expect.any(Object),
      );
    });
    expect(screen.getByTestId("generated-content")).toBeTruthy();
    expect(screen.getByText("Generated title")).toBeTruthy();
  });

  it("does not delete a draft until the confirmation dialog is accepted", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("tab-drafts"));
    const deleteButton = await screen.findByTestId(`button-delete-draft-${DRAFT_POST.id}`);
    await user.click(deleteButton);

    // Clicking the icon only opens the confirmation - no DELETE yet.
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      "DELETE",
      `/api/community-posts/${DRAFT_POST.id}`,
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/permanently deleted/)).toBeTruthy();

    await user.click(within(dialog).getByText("Delete permanently"));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "DELETE",
        `/api/community-posts/${DRAFT_POST.id}`,
      );
    });
  });
});
