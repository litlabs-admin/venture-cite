// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { board04Fixture } from "@/v2/screens/b04-factual-correction/fixture";
import { Board04Screen } from "@/v2/screens/b04-factual-correction/Screen";
import {
  board04ResultFromQueries,
  mapBoard04Data,
  type Board04QueryState,
} from "@/v2/screens/b04-factual-correction/data";
import type { WorkSummaryView } from "@/v2/data/workSummary";
import type { WorkTaskDetailView } from "@/v2/data/workTasks";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));

function task(overrides: Partial<WorkTaskDetailView> = {}): WorkTaskDetailView {
  return {
    id: "task-04",
    brandId: "brand-venture-pr",
    goalId: null,
    taskKey: "repair-service-region",
    taskVersion: 1,
    type: "repair_confirmed_access_or_factual_fault",
    state: "submitted",
    revision: 4,
    title: "Correct the service description",
    desiredResult: "Service region: India",
    buyerNeed: "Where does this company operate?",
    recommendedChange: "Update the service region on the services page.",
    reason: "The published page conflicts with the approved region.",
    confidence: 0.9,
    effort: 15,
    points: 40,
    nextCheckAt: null,
    ownerId: null,
    ownerName: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    completionRule: { required: ["fault_repair", "confirmation"] },
    measurementScope: null,
    evidence: [
      {
        id: "evidence-04-before",
        taskId: "task-04",
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
        structuredFinding: { kind: "source", label: "Page claim" },
        createdAt: "2026-09-08T00:00:00.000Z",
      },
      {
        id: "evidence-04-after",
        taskId: "task-04",
        brandId: "brand-venture-pr",
        taskVersion: 1,
        evidenceVersion: 2,
        role: "submission",
        kind: "fault_repair",
        status: "verified",
        sourceUrl: "https://venturepr.example/services",
        finalUrl: null,
        canonicalUrl: null,
        retrievedAt: "2026-09-08T00:00:00.000Z",
        observedAt: null,
        excerpt: "Services available in India",
        structuredFinding: {
          kind: "fault_repair",
          label: "Updated text is present",
          faultId: "fault-04",
          beforeCheckId: "check-before",
          afterCheckId: "check-after",
          checkedAt: "2026-09-08T00:00:00.000Z",
        },
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

describe("Board04Screen", () => {
  it("renders every factual-correction region from the fixture", () => {
    render(<Board04Screen data={board04Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Correct the service description" }),
    ).toBeInTheDocument();
    expect(screen.getByText("40 work points")).toBeInTheDocument();
    expect(screen.getByTestId("v2-task-step-strip")).toHaveTextContent("Review evidence");
    expect(screen.getByTestId("v2-task-step-strip")).toHaveTextContent("Update your page");
    expect(screen.getByTestId("v2-task-step-strip")).toHaveTextContent("3 Verify work");
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
    expect(screen.getByText("Services available worldwide")).toBeInTheDocument();
    expect(screen.getByText("Services available in India")).toBeInTheDocument();
    expect(screen.getAllByText("/services")).toHaveLength(2);
    expect(screen.getAllByText("Service region: India")).toHaveLength(2);
    expect(screen.getByTestId("v2-check-list")).toHaveTextContent("Published URL is reachable");
    expect(screen.getByTestId("v2-check-list")).toHaveTextContent("Updated text is present");
    expect(screen.getByTestId("v2-check-list")).toHaveTextContent("Pending");
    expect(screen.getByRole("button", { name: "Confirm facts and complete task" })).toBeEnabled();
    expect(screen.getByText("Save for later")).toBeInTheDocument();
    expect(screen.getByTestId("v2-what-happens-next")).toHaveTextContent("What happens next");
    expect(screen.getByTestId("v2-brief-rail")).toHaveTextContent("Completion check");
    expect(screen.getByTestId("v2-brief-rail")).toHaveTextContent("Private brand progress");
    expect(screen.getByTestId("v2-brief-rail")).toHaveTextContent("120");
    expect(screen.getByTestId("v2-brief-rail")).toHaveTextContent("160");
  });

  it("renders an unavailable value as its state label instead of a value", () => {
    render(
      <Board04Screen
        data={{
          ...board04Fixture,
          task: {
            ...board04Fixture.task,
            before: {
              ...board04Fixture.task.before,
              claim: { kind: "not-measured", reason: "No page snapshot" },
            },
          },
        }}
      />,
    );

    expect(screen.getByTestId("v2-value-not-measured")).toHaveTextContent("Not measured");
    expect(screen.queryByText("Services available worldwide")).not.toBeInTheDocument();
  });

  it("maps the server projection and honest unavailable checks", () => {
    const data = mapBoard04Data(task(), summary());

    expect(data.task.title).toBe("Correct the service description");
    expect(data.task.points).toBe(40);
    expect(data.task.before.claim).toEqual({
      kind: "measured",
      value: "Services available worldwide",
    });
    expect(data.task.after.claim).toEqual({
      kind: "measured",
      value: "Services available in India",
    });
    expect(data.progress.currentPoints).toBe(120);
    expect(data.progress.nextPoints).toBe(160);
    expect(data.checks.urlReachable.kind).toBe("not-measured");
    expect(data.checks.textPresent.kind).toBe("not-measured");
    expect(data.checks.factConfirmed.kind).toBe("pending");
  });
});

describe("Board04 live adapter states", () => {
  const ready: Board04QueryState = { status: "success", data: task() };
  const summaryReady: Board04QueryState<WorkSummaryView> = { status: "success", data: summary() };

  it("returns loading while the detail reads are pending", () => {
    const result = board04ResultFromQueries({
      brandId: "brand-venture-pr",
      tasks: { status: "pending" },
      detail: { status: "pending" },
      summary: { status: "pending" },
    });

    expect(result).toEqual({ state: { kind: "loading" } });
  });

  it("returns an error when a detail read fails", () => {
    const error = new Error("detail failed");
    const result = board04ResultFromQueries({
      brandId: "brand-venture-pr",
      tasks: ready,
      detail: { status: "error", error },
      summary: summaryReady,
    });

    expect(result).toEqual({ state: { kind: "error", message: "detail failed" } });
  });

  it("returns not measured when the board task type is absent", () => {
    const result = board04ResultFromQueries({
      brandId: "brand-venture-pr",
      tasks: { status: "success", data: { ...task(), type: "improve_page_for_buyer_need" } },
      detail: { status: "pending" },
      summary: { status: "pending" },
    });

    expect(result.state.kind).toBe("not-measured");
  });
});
