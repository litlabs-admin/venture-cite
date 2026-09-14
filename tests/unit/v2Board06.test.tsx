// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { board06Fixture } from "@/v2/screens/b06-buyer-guide-editor/fixture";
import { Board06Screen } from "@/v2/screens/b06-buyer-guide-editor/Screen";
import { mapBoard06Response, resolveBoard06Result } from "@/v2/screens/b06-buyer-guide-editor/data";
import type { Board06Data } from "@/v2/screens/b06-buyer-guide-editor/Screen";

describe("Board 06 buyer guide editor", () => {
  it("renders every buyer-guide editor region from the fixture", () => {
    render(<Board06Screen data={board06Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Improve your startup PR guide" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Review brief")).toBeInTheDocument();
    expect(screen.getByText("Edit page")).toBeInTheDocument();
    expect(screen.getByText("Verify publication")).toBeInTheDocument();
    expect(screen.getByText("Draft saved")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How to choose PR support for an early-stage startup" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Start with your launch goal, target audience, and available budget."),
    ).toBeInTheDocument();
    expect(screen.getByText("Questions to ask a PR partner")).toBeInTheDocument();
    expect(screen.getByText("Which startup stages do you support?")).toBeInTheDocument();
    expect(screen.getByText("What work does the engagement include?")).toBeInTheDocument();
    expect(screen.getByText("How will we review results?")).toBeInTheDocument();
    expect(screen.getByText("What a good answer looks like")).toBeInTheDocument();
    expect(screen.getByText("Where this page is cited")).toBeInTheDocument();
    expect(screen.getByText("[1] Approved brand facts")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Task brief" })).toBeInTheDocument();
    expect(
      screen.getByText("Compare PR services before contacting a provider."),
    ).toBeInTheDocument();
    expect(screen.getByText("Approved buyer question set")).toBeInTheDocument();
    expect(screen.getByText("40 work points after verification")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to publication check" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Draft saved. Publication is not yet verified.")).toBeInTheDocument();
  });

  it("labels unavailable editor values without rendering a placeholder number", () => {
    const unavailable: Board06Data = {
      ...board06Fixture,
      task: {
        ...board06Fixture.task,
        pointsAfterVerification: {
          kind: "not-measured",
          reason: "The live policy has not supplied the reward.",
        },
        sourceEvidence: {
          kind: "not-measured",
          reason: "The task has no buyer-question evidence.",
        },
      },
      draft: {
        ...board06Fixture.draft,
        title: {
          kind: "not-measured",
          reason: "The draft is not available.",
        },
      },
    };

    render(<Board06Screen data={unavailable} />);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("40 work points after verification")).toBeNull();
  });

  it("maps the work task and article list response projections", () => {
    const mapped = mapBoard06Response(
      {
        success: true,
        data: {
          items: [
            {
              id: "task-06",
              brandId: "brand-1",
              goalId: null,
              taskKey: "content:bofu:article-06",
              taskVersion: 1,
              type: "improve_page_for_buyer_need",
              state: "in_progress",
              revision: 2,
              title: "Improve your startup PR guide",
              desiredResult: "The guide answers the buyer's questions.",
              buyerNeed: "Compare PR services before contacting a provider.",
              recommendedChange: "Add answers to the approved questions.",
              reason: "The guide does not answer the buyer need.",
              confidence: 0.8,
              effort: 45,
              points: 40,
              completionRule: { required: ["content_change", "confirmation"] },
              measurementScope: null,
              nextCheckAt: null,
              ownerId: null,
              ownerName: null,
              createdAt: "2026-09-08T10:24:00.000Z",
              updatedAt: "2026-09-09T10:24:00.000Z",
            },
          ],
          nextCursor: null,
        },
      },
      {
        success: true,
        data: [
          {
            id: "article-06",
            brandId: "brand-1",
            title: "How to choose PR support for an early-stage startup",
            content:
              "Start with your launch goal, target audience, and available budget.\n\n## Questions to ask a PR partner\n\n- Which startup stages do you support?\n- What work does the engagement include?\n- How will we review results?",
            version: 3,
            status: "draft",
            externalUrl: "/buyer-guide",
            updatedAt: "2026-09-09T10:24:00.000Z",
          },
        ],
      },
      "brand-1",
    );

    expect(mapped).toBeDefined();
    expect(mapped?.task.id).toBe("task-06");
    expect(mapped?.task.title).toEqual({
      kind: "measured",
      value: "Improve your startup PR guide",
    });
    expect(mapped?.draft.title).toEqual({
      kind: "measured",
      value: "How to choose PR support for an early-stage startup",
    });
    expect(mapped?.draft.sections.some((section) => section.kind === "heading")).toBe(true);
    expect(mapped?.publication.url).toEqual({ kind: "measured", value: "/buyer-guide" });
  });

  it("returns explicit loading, error, not-measured, and stale states", () => {
    expect(resolveBoard06Result({ status: "loading" })).toEqual({
      state: { kind: "loading" },
    });
    expect(resolveBoard06Result({ status: "error" })).toEqual({
      state: { kind: "error", message: "Unable to load the buyer guide task." },
    });
    expect(resolveBoard06Result({ status: "not-measured" })).toEqual({
      state: { kind: "not-measured", reason: "No brand is selected." },
    });
    const data = board06Fixture;
    const stale = resolveBoard06Result({
      status: "ready",
      data,
      dataUpdatedAt: "2026-09-08T10:24:00.000Z",
    });
    expect(stale.state.kind).toBe("stale");
    expect(stale.data).toBe(data);
  });
});
