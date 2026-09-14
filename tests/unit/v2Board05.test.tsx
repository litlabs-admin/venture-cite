// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { board05Fixture } from "@/v2/screens/b05-confirmation-gate/fixture";
import { Board05Screen } from "@/v2/screens/b05-confirmation-gate/Screen";
import {
  board05ResultFromQueries,
  mapBoard05Data,
  type Board05QueryState,
} from "@/v2/screens/b05-confirmation-gate/data";
import type { WorkSummaryView } from "@/v2/data/workSummary";
import type { WorkTaskDetailView } from "@/v2/data/workTasks";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));

function task(overrides: Partial<WorkTaskDetailView> = {}): WorkTaskDetailView {
  return {
    id: "task-05",
    brandId: "brand-venture-pr",
    goalId: null,
    taskKey: "improve-service-region",
    taskVersion: 1,
    type: "improve_page_for_buyer_need",
    state: "submitted",
    revision: 4,
    title: "Correct the service description",
    desiredResult: "India is the correct service region.",
    buyerNeed: "Where does this company operate?",
    recommendedChange: "Update the service region on the services page.",
    reason: "The published page needs the approved region.",
    confidence: 0.9,
    effort: 15,
    points: 40,
    nextCheckAt: null,
    ownerId: null,
    ownerName: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    completionRule: { required: ["content_change", "confirmation"] },
    measurementScope: null,
    evidence: [
      {
        id: "evidence-05-before",
        taskId: "task-05",
        brandId: "brand-venture-pr",
        taskVersion: 1,
        evidenceVersion: 1,
        role: "trigger",
        kind: "source",
        status: "verified",
        sourceUrl: "https://venturepr.example/services",
        finalUrl: null,
        canonicalUrl: null,
        retrievedAt: "2026-09-08T00:00:00.000Z",
        observedAt: null,
        excerpt: "Services available worldwide",
        structuredFinding: { kind: "source", label: "Published page" },
        createdAt: "2026-09-08T00:00:00.000Z",
      },
      {
        id: "evidence-05-after",
        taskId: "task-05",
        brandId: "brand-venture-pr",
        taskVersion: 1,
        evidenceVersion: 2,
        role: "submission",
        kind: "content_change",
        status: "verified",
        sourceUrl: "https://venturepr.example/services",
        finalUrl: null,
        canonicalUrl: null,
        retrievedAt: "2026-09-08T00:00:00.000Z",
        observedAt: null,
        excerpt: "Services available in India",
        structuredFinding: { kind: "content_change", label: "Published page change" },
        createdAt: "2026-09-08T00:00:00.000Z",
      },
    ],
    history: [],
    ...overrides,
  };
}

function summary(overrides: Partial<WorkSummaryView> = {}): WorkSummaryView {
  return {
    brandId: "brand-venture-pr",
    points: 120,
    pendingCount: 1,
    milestones: ["baseline_ready"],
    currentLevel: { level: 2, name: "Ready", points: 60 },
    nextThreshold: { level: 3, name: "Improve", points: 160 },
    goal: null,
    nextTask: null,
    waitingTasks: [],
    mode: "guided",
    ...overrides,
  };
}

describe("Board05Screen", () => {
  it("renders the confirmation-gate regions from the fixture", () => {
    render(<Board05Screen data={board05Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Correct the service description" }),
    ).toBeInTheDocument();
    expect(screen.getByText("40 work points")).toBeInTheDocument();
    expect(screen.getByTestId("v2-task-step-strip")).toHaveTextContent("Review evidence");
    expect(screen.getByTestId("v2-task-step-strip")).toHaveTextContent("Update page");
    expect(screen.getByTestId("v2-task-step-strip")).toHaveTextContent("3 Verify work");
    expect(
      screen.getByRole("heading", { name: "The page now matches your approved fact" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.getByText("worldwide")).toBeInTheDocument();
    expect(screen.getByText("India")).toBeInTheDocument();
    expect(screen.getByText(/Approved fact:/)).toHaveTextContent(
      "Approved fact: Service region — India",
    );
    expect(screen.getByText("Source:")).toBeInTheDocument();
    expect(screen.getByText("Checked 8 Sep 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Application checks" })).toBeInTheDocument();
    expect(screen.getByText("Published page is reachable")).toBeInTheDocument();
    expect(screen.getByText("Updated text is present")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your confirmation" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /I confirm that India is the correct service region\./,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Page checks cannot verify your business facts.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and complete" })).toBeDisabled();
    expect(screen.getByText("Save for later")).toBeInTheDocument();
    expect(screen.getByTestId("v2-bottom-step-strip")).toHaveTextContent("Observe results");
    expect(screen.getByTestId("v2-brief-rail")).toHaveTextContent("Completion summary");
    expect(screen.getByTestId("v2-brief-rail")).toHaveTextContent("Current: 120 work points");
    expect(screen.getByTestId("v2-brief-rail")).toHaveTextContent("+40 work points");
    expect(screen.getByTestId("v2-brief-rail")).toHaveTextContent("Next: measure the result");
  });

  it("enables the primary action only after the human checks the box", async () => {
    const user = userEvent.setup();
    render(<Board05Screen data={board05Fixture} />);

    const checkbox = screen.getByRole("checkbox", {
      name: /I confirm that India is the correct service region\./,
    });
    const confirm = screen.getByRole("button", { name: "Confirm and complete" });
    expect(confirm).toBeDisabled();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(confirm).toBeEnabled();
  });

  it("renders an unavailable value as its state label instead of a value", () => {
    render(
      <Board05Screen
        data={{
          ...board05Fixture,
          task: {
            ...board05Fixture.task,
            updatedText: { kind: "not-measured", reason: "No updated page snapshot" },
          },
        }}
      />,
    );

    expect(screen.getByTestId("v2-value-not-measured")).toHaveTextContent("Not measured");
    expect(screen.queryByText("Services available in")).not.toBeInTheDocument();
  });

  it("maps the server projection without hardcoding the confirmation value", () => {
    const data = mapBoard05Data(task(), summary());

    expect(data.task.beforeText).toEqual({
      kind: "measured",
      value: "Services available worldwide",
    });
    expect(data.task.updatedText).toEqual({
      kind: "measured",
      value: "Services available in India",
    });
    expect(data.task.approvedFact).toEqual({ kind: "measured", value: "India" });
    expect(data.task.sourcePath).toEqual({ kind: "measured", value: "/services" });
    expect(data.checks.urlReachable.kind).toBe("not-measured");
    expect(data.checks.textPresent.kind).toBe("not-measured");
    expect(data.progress.currentPoints).toBe(120);
    expect(data.progress.taskPoints).toBe(40);
    expect(data.progress.nextLevel).toEqual({ kind: "measured", value: "Level 3 · Improve" });
  });
});

describe("Board05 live adapter states", () => {
  const ready: Board05QueryState = { status: "success", data: task() };
  const summaryReady: Board05QueryState<WorkSummaryView> = { status: "success", data: summary() };

  it("returns loading while the detail reads are pending", () => {
    const result = board05ResultFromQueries({
      brandId: "brand-venture-pr",
      tasks: { status: "pending" },
      detail: { status: "pending" },
      summary: { status: "pending" },
    });

    expect(result).toEqual({ state: { kind: "loading" } });
  });

  it("returns an error when a detail read fails", () => {
    const result = board05ResultFromQueries({
      brandId: "brand-venture-pr",
      tasks: ready,
      detail: { status: "error", error: new Error("verification failed") },
      summary: summaryReady,
    });

    expect(result).toEqual({ state: { kind: "error", message: "verification failed" } });
  });

  it("returns not measured when the task type is absent", () => {
    const result = board05ResultFromQueries({
      brandId: "brand-venture-pr",
      tasks: {
        status: "success",
        data: { ...task(), type: "repair_confirmed_access_or_factual_fault" },
      },
      detail: { status: "pending" },
      summary: { status: "pending" },
    });

    expect(result.state.kind).toBe("not-measured");
  });
});
