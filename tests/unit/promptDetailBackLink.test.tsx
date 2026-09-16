// @vitest-environment happy-dom
//
// The prompt detail page's close affordance ("x Prompts") pointed at the
// standalone /prompts page. That page has no entry in the workflow-spine nav
// (Dashboard / Setup / Monitor / Diagnose / Act / Report), so closing a prompt
// stranded the reader outside the spine. Every row that opens this page lives
// in the Monitor page's citations -> Prompts tab, so that is where closing it
// belongs.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ promptId: "prompt-1" }),
  useNavigate: () => () => {},
  // Surface the router destination as plain DOM attributes so the assertion
  // reads the real `to`/`search` the page handed the router.
  Link: ({
    children,
    to,
    search,
    ...props
  }: {
    children?: ReactNode;
    to?: string;
    search?: Record<string, unknown>;
  }) => (
    <a data-to={to} data-search={JSON.stringify(search ?? {})} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({ selectedBrandId: "brand-1" }),
}));

vi.mock("@/hooks/usePrompts", () => ({
  useAllPrompts: () => ({ data: { data: [] } }),
  usePrompt: () => ({
    data: undefined,
    isLoading: true,
    isError: false,
    refetch: vi.fn(),
    isRefetching: false,
  }),
  usePromptScoreHistory: () => ({ data: undefined }),
  usePromptResults: () => ({ data: undefined }),
  usePromptTags: () => ({ data: undefined }),
}));

import PromptDetailPage from "@/pages/prompt-detail";

describe("PromptDetailPage - closing a prompt returns to Monitor", () => {
  it("points the close link at the Monitor page's prompts tab", () => {
    render(<PromptDetailPage />);

    const close = screen.getByText("Prompts").closest("a");
    expect(close?.getAttribute("data-to")).toBe("/monitor");
    expect(JSON.parse(close?.getAttribute("data-search") ?? "{}")).toEqual({
      tab: "citations",
      ptab: "prompts",
    });
  });
});
