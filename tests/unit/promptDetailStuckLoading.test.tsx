// @vitest-environment happy-dom
//
// B9 UI/UX audit: client/src/pages/prompt-detail.tsx gated its whole body on
// `detailLoading || !prompt`, with only one branch: an animated two-bar
// skeleton. `usePrompt`'s query can fail (bad/stale promptId -> 404, 500,
// network error) - once it does, `detailLoading` becomes false but `prompt`
// stays undefined forever, so the condition stayed true forever and the
// skeleton just kept shimmering with no error message and no way to retry.
// The fix reads the query's own `isError` (already returned by `usePrompt`,
// just never destructured) and renders a real ErrorState with a Retry button
// instead.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ promptId: "prompt-1" }),
  useNavigate: () => () => {},
  Link: ({ children, ...props }: { children?: ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({ selectedBrandId: "brand-1" }),
}));

const promptQueryState = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  isRefetching: false,
}));

vi.mock("@/hooks/usePrompts", () => ({
  useAllPrompts: () => ({ data: { data: [] } }),
  usePrompt: () => ({
    data: undefined,
    isLoading: promptQueryState.isLoading,
    isError: promptQueryState.isError,
    refetch: promptQueryState.refetch,
    isRefetching: promptQueryState.isRefetching,
  }),
  usePromptScoreHistory: () => ({ data: undefined }),
  usePromptResults: () => ({ data: undefined }),
  usePromptTags: () => ({ data: undefined }),
}));

import PromptDetailPage from "@/pages/prompt-detail";

describe("PromptDetailPage - failed fetch shows an error, not a permanent skeleton", () => {
  it("shows a retryable error state when the prompt fetch fails", () => {
    promptQueryState.isLoading = false;
    promptQueryState.isError = true;
    promptQueryState.refetch.mockClear();

    render(<PromptDetailPage />);

    expect(screen.getByText("Couldn't load this prompt")).toBeTruthy();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(promptQueryState.refetch).toHaveBeenCalled();
  });

  it("still shows the loading skeleton (not the error) while genuinely loading", () => {
    promptQueryState.isLoading = true;
    promptQueryState.isError = false;

    render(<PromptDetailPage />);

    expect(screen.queryByText("Couldn't load this prompt")).toBeNull();
  });
});
