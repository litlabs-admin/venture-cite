// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { board15Fixture } from "@/v2/screens/b15-revision-review/fixture";
import { Board15Screen } from "@/v2/screens/b15-revision-review/Screen";

const brandState = vi.hoisted(() => ({
  selectedBrandId: "brand-1" as string,
  isLoading: false,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandState,
}));

function QueryWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function unavailableFixture() {
  return {
    ...board15Fixture,
    revision: {
      ...board15Fixture.revision,
      changeCount: { kind: "not-measured", reason: "Claim-level review is unavailable." },
      rewardPoints: { kind: "not-measured", reason: "The task reward is unavailable." },
    },
    claims: { kind: "not-measured", reason: "Claim-level review is unavailable." },
  } satisfies typeof board15Fixture;
}

describe("Board 15 revision review", () => {
  it("renders every reference region and its key content", () => {
    render(<Board15Screen data={board15Fixture} />);

    expect(screen.getByText("My work")).toBeInTheDocument();
    expect(screen.getByText("Revision review")).toBeInTheDocument();
    expect(screen.getByText("Prototype · Sample data")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review changes before publication" })).toBeInTheDocument();
    expect(screen.getByText(/Compare the current page with your proposed revision\./)).toBeInTheDocument();
    expect(screen.getByText("Current page")).toBeInTheDocument();
    expect(screen.getByText("Published on Jul 10, 2024")).toBeInTheDocument();
    expect(screen.getByText("Proposed revision")).toBeInTheDocument();
    expect(screen.getByText("3 changes")).toBeInTheDocument();
    expect(screen.getAllByText("and industry specialization.")).toHaveLength(2);
    expect(screen.getByText("Changed claims (3)")).toBeInTheDocument();
    expect(screen.getByText("https://venturecite.com/startup-stages")).toBeInTheDocument();
    expect(screen.getByText("https://venturecite.com/pr-services")).toBeInTheDocument();
    expect(screen.getByText("Not found in approved facts")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Change #3 includes a claim about industries that is not confirmed in your approved facts.",
    );
    expect(screen.getByRole("heading", { name: "Task brief" })).toBeInTheDocument();
    expect(screen.getByText("Review every change and compare the content.")).toBeInTheDocument();
    const rewardHeading = screen.getByRole("heading", { name: "Completion reward" });
    expect(rewardHeading.nextElementSibling).toHaveTextContent("20 work points after verified approval");
    expect(screen.getByRole("button", { name: "Approve revision" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request edits" })).toBeEnabled();
  });

  it("renders unavailable values as state labels instead of fixture numbers", () => {
    render(<Board15Screen data={unavailableFixture()} />);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Changed claims (3)")).not.toBeInTheDocument();
    expect(screen.queryByText("20 work points after verified approval")).not.toBeInTheDocument();
    expect(screen.queryByText("3 changes")).not.toBeInTheDocument();
  });
});

describe("useBoard15Data", () => {
  beforeEach(() => {
    brandState.selectedBrandId = "brand-1";
    brandState.isLoading = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps article, revision, and work responses into the live contract", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/articles/") && url.includes("/revisions")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                id: "revision-1",
                articleId: "article-1",
                content: "Proposed copy",
                source: "manual_edit",
                createdBy: "user-1",
                createdAt: "2026-09-09T10:24:00.000Z",
              },
            ],
          }),
        );
      }
      if (url.includes("/api/articles")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                id: "article-1",
                brandId: "brand-1",
                title: "Current title",
                content: "Current copy",
                status: "ready",
                version: 3,
                updatedAt: "2026-09-08T10:00:00.000Z",
              },
            ],
          }),
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: { items: [{ type: "improve_page_for_buyer_need", points: 20 }], nextCursor: null },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = await import("@/v2/screens/b15-revision-review/data");
    const hook = renderHook(() => adapter.useBoard15Data(), { wrapper: QueryWrapper });
    await waitFor(() => {
      expect(hook.result.current.state.kind).not.toBe("loading");
    });

    if (hook.result.current.data === undefined) throw new Error("Expected live board data.");
    expect(hook.result.current.data.revision.currentContent.title).toEqual({
      kind: "measured",
      value: [{ text: "Current title", changed: false }],
    });
    expect(hook.result.current.data.revision.proposedContent.paragraph).toEqual({
      kind: "measured",
      value: [{ text: "Proposed copy", changed: false }],
    });
    expect(hook.result.current.data.revision.proposedEditedAt).toEqual({
      kind: "measured",
      value: "2026-09-09T10:24:00.000Z",
    });
    expect(hook.result.current.data.claims.kind).toBe("not-measured");
    expect(hook.result.current.data.revision.rewardPoints).toEqual({ kind: "measured", value: 20 });
  });

  it("returns loading while its live reads are pending", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const adapter = await import("@/v2/screens/b15-revision-review/data");
    const hook = renderHook(() => adapter.useBoard15Data(), { wrapper: QueryWrapper });

    expect(hook.result.current.state.kind).toBe("loading");
  });

  it("returns error when an existing live endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "failed" }), { status: 500 })),
    );
    const adapter = await import("@/v2/screens/b15-revision-review/data");
    const hook = renderHook(() => adapter.useBoard15Data(), { wrapper: QueryWrapper });

    await waitFor(() => expect(hook.result.current.state.kind).toBe("error"));
  });
});
