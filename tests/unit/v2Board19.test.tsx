// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { board19Fixture } from "@/v2/screens/b19-content-task/fixture";
import { Board19Screen } from "@/v2/screens/b19-content-task/Screen";
import { mapBoard19Response, resolveBoard19Result } from "@/v2/screens/b19-content-task/data";
import type { Board19Data } from "@/v2/screens/b19-content-task/Screen";

describe("Board 19 content task editor", () => {
  it("renders every services-page editor region from the fixture", () => {
    render(<Board19Screen data={board19Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Clarify your services for startup buyers" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Review brief")).toBeInTheDocument();
    expect(screen.getByText("Edit page")).toBeInTheDocument();
    expect(screen.getByText("Verify publication")).toBeInTheDocument();
    expect(screen.getByText("Draft saved")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Our services for early-stage startups" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Media relations and press coverage")).toBeInTheDocument();
    expect(
      screen.getByText(/Our team has secured coverage for over 250 startups/),
    ).toBeInTheDocument();
    expect(screen.getByText("Media strategy and outreach")).toBeInTheDocument();
    expect(screen.getByText("Content and thought leadership")).toBeInTheDocument();
    expect(screen.getByText("Bylined articles and op-eds")).toBeInTheDocument();
    expect(screen.getByText("Launch and milestone support")).toBeInTheDocument();
    expect(screen.getByText("Real-time support during announcements")).toBeInTheDocument();
    expect(
      screen.getByText(
        "[3] Approved brand fact: Launch support drives significant increases in website traffic and demo requests",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Task brief" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Understand what PR services you offer and how they help early-stage startups.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Approved brand facts about services, results, and outcomes."),
    ).toBeInTheDocument();
    expect(screen.getByText("40 work points after verification")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue to publication check" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Draft saved. Publication is not yet verified.")).toBeInTheDocument();
  });

  it("labels unavailable task evidence without rendering a placeholder number", () => {
    const unavailable: Board19Data = {
      ...board19Fixture,
      task: {
        ...board19Fixture.task,
        buyerNeed: {
          kind: "not-measured",
          reason: "The task has no buyer-need projection.",
        },
        sourceEvidence: {
          kind: "not-measured",
          reason: "The task has no fact reference.",
        },
      },
      publication: {
        ...board19Fixture.publication,
        verified: {
          kind: "not-measured",
          reason: "The publication checker is not available.",
        },
      },
    };

    render(<Board19Screen data={unavailable} />);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Verify the published URL")).toBeInTheDocument();
  });

  it("maps the detail task and article list response projections", () => {
    const mapped = mapBoard19Response(
      {
        success: true,
        data: {
          id: "task-19",
          brandId: "brand-1",
          goalId: null,
          taskKey: "content:bofu:article-19",
          taskVersion: 1,
          type: "improve_page_for_buyer_need",
          state: "in_progress",
          revision: 4,
          title: "Clarify your services for startup buyers",
          desiredResult: "The page explains the services for early-stage startups.",
          buyerNeed: "Understand what PR services you offer.",
          recommendedChange: "Clarify the service sections.",
          reason: "The service page is too broad.",
          confidence: null,
          effort: 45,
          points: 40,
          completionRule: { required: ["content_change", "confirmation"] },
          measurementScope: null,
          nextCheckAt: null,
          ownerId: null,
          ownerName: null,
          createdAt: "2026-09-08T10:24:00.000Z",
          updatedAt: "2026-09-09T10:24:00.000Z",
          evidence: [],
        },
      },
      {
        success: true,
        data: [
          {
            id: "article-19",
            brandId: "brand-1",
            title: "Our services for early-stage startups",
            content:
              "We help early-stage startups get the visibility, credibility, and traction they need by connecting them with the right media, audiences, and partners.\n\n## Media relations and press coverage\n\nWe develop strategic PR campaigns.",
            version: 2,
            status: "draft",
            externalUrl: "/services",
            updatedAt: "2026-09-09T10:24:00.000Z",
          },
        ],
      },
      "brand-1",
    );

    expect(mapped).toBeDefined();
    expect(mapped?.task.id).toBe("task-19");
    expect(mapped?.task.title).toEqual({
      kind: "measured",
      value: "Clarify your services for startup buyers",
    });
    expect(mapped?.draft.title).toEqual({
      kind: "measured",
      value: "Our services for early-stage startups",
    });
    expect(mapped?.publication.url).toEqual({ kind: "measured", value: "/services" });
    expect(mapped?.publication.verified.kind).toBe("not-measured");
  });

  it("returns explicit loading, error, not-measured, and stale states", () => {
    expect(resolveBoard19Result({ status: "loading" })).toEqual({
      state: { kind: "loading" },
    });
    expect(resolveBoard19Result({ status: "error" })).toEqual({
      state: { kind: "error", message: "Unable to load the content task." },
    });
    expect(resolveBoard19Result({ status: "not-measured" })).toEqual({
      state: { kind: "not-measured", reason: "No brand is selected." },
    });
    const data = board19Fixture;
    const stale = resolveBoard19Result({
      status: "ready",
      data,
      dataUpdatedAt: "2026-09-08T10:24:00.000Z",
    });
    expect(stale.state.kind).toBe("stale");
    expect(stale.data).toBe(data);
  });
});
