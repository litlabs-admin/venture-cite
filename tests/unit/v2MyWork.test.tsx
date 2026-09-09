// @vitest-environment happy-dom
//
// My work, in every state it can actually reach, and the confirmation gate in
// both of its positions.
//
// The gate is the reason this file exists. A machine check is not a human
// confirmation, so the primary control has to be genuinely disabled - the
// `disabled` property, not a grey skin - until the person ticks the box, and
// what it then sends has to be a `human_confirmation`. Both are asserted.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { WorkSummaryView, WorkTaskSummaryView } from "@/v2/data/workSummary";
import type { WorkEvidenceView, WorkTaskDetailView } from "@/v2/data/workTasks";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "Venture PR" },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  } as {
    selectedBrandId: string;
    selectedBrand: { id: string; name: string } | undefined;
    brands: { id: string }[];
    isLoading: boolean;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isLoading: false, isAuthenticated: true }),
}));

const MyWorkPage = (await import("@/v2/mywork/MyWorkPage")).default;

function task(overrides: Partial<WorkTaskSummaryView> = {}): WorkTaskSummaryView {
  return {
    id: "task-1",
    brandId: "brand-venture-pr",
    goalId: null,
    taskKey: "key-1",
    taskVersion: 1,
    type: "repair_confirmed_access_or_factual_fault",
    state: "suggested",
    revision: 3,
    title: "Correct the service description",
    desiredResult: "India is the correct service region.",
    buyerNeed: "Where does this company operate?",
    recommendedChange: "Change the services page to say India.",
    reason: "The published page conflicts with your approved region.",
    confidence: 0.9,
    effort: 15,
    points: 40,
    nextCheckAt: null,
    ownerId: null,
    ownerName: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function evidence(overrides: Partial<WorkEvidenceView> = {}): WorkEvidenceView {
  return {
    id: "evidence-1",
    taskId: "task-1",
    brandId: "brand-venture-pr",
    taskVersion: 1,
    evidenceVersion: 1,
    role: "trigger",
    kind: "source",
    status: "verified",
    sourceUrl: "https://example.com/services",
    finalUrl: null,
    canonicalUrl: null,
    retrievedAt: "2026-09-08T00:00:00.000Z",
    observedAt: null,
    excerpt: "Services available worldwide",
    structuredFinding: { kind: "source", label: "Published page" },
    createdAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Partial<WorkTaskDetailView> = {}): WorkTaskDetailView {
  return {
    ...task({ state: "submitted" }),
    completionRule: { required: ["fault_repair"] },
    evidence: [
      evidence(),
      evidence({
        id: "evidence-2",
        role: "submission",
        kind: "fault_repair",
        status: "verified",
        excerpt: "Services available in India",
        structuredFinding: {
          kind: "fault_repair",
          label: "Published page is reachable",
          faultId: "fault-1",
          beforeCheckId: "check-1",
          afterCheckId: "check-2",
          checkedAt: "2026-09-08T00:00:00.000Z",
        },
      }),
    ],
    history: [],
    ...overrides,
  };
}

function summary(overrides: Partial<WorkSummaryView> = {}): WorkSummaryView {
  return {
    brandId: "brand-venture-pr",
    points: 120,
    pendingCount: 3,
    milestones: ["goal_selected_and_queue_reviewed", "baseline_ready"],
    currentLevel: { level: 2, name: "Ready", points: 60 },
    nextThreshold: { level: 3, name: "Improve", points: 160 },
    goal: null,
    nextTask: null,
    waitingTasks: [],
    mode: "guided",
    ...overrides,
  };
}

type Responses = {
  tasks?: unknown;
  detail?: unknown;
  summary?: unknown;
  fail?: "tasks" | "detail";
  pending?: boolean;
};

const posted: { url: string; body: unknown }[] = [];

function stubFetch(responses: Responses) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      posted.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    }
    if (responses.pending) return new Promise<Response>(() => {});
    const isDetail = /\/work\/tasks\/[^/?]+$/.test(url);
    if ((responses.fail === "tasks" && !isDetail) || (responses.fail === "detail" && isDetail)) {
      return new Response(JSON.stringify({ success: false, error: "boom" }), { status: 500 });
    }
    const body = isDetail
      ? responses.detail
      : url.includes("/work/summary")
        ? responses.summary
        : responses.tasks;
    return new Response(JSON.stringify({ success: true, data: body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderWork(taskId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MyWorkPage taskId={taskId} />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  posted.length = 0;
  brandStub.value = {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "Venture PR" },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const POPULATED = {
  items: [
    task(),
    task({ id: "task-2", title: "Improve your buyer guide", type: "improve_page_for_buyer_need" }),
    task({ id: "task-3", title: "Review recent results", state: "accepted", points: 10 }),
    task({ id: "task-4", title: "Update pricing page", state: "submitted" }),
    task({ id: "task-5", title: "Crawler access repaired", state: "waiting_for_observation" }),
    task({ id: "task-6", title: "Baseline reviewed", state: "verified", points: 20 }),
    task({ id: "task-7", title: "Duplicate finding", state: "dismissed" }),
  ],
  nextCursor: null,
};

describe("MyWorkPage - the list", () => {
  it("shows the four tabs with the counts the mapping produces", async () => {
    stubFetch({ tasks: POPULATED, detail: detail(), summary: summary() });
    renderWork();

    expect(await screen.findByTestId("v2-work-tab-todo")).toHaveTextContent("To do3");
    expect(screen.getByTestId("v2-work-tab-in_progress")).toHaveTextContent("In progress1");
    expect(screen.getByTestId("v2-work-tab-waiting")).toHaveTextContent("Waiting1");
    // The dismissed task is NOT counted as completed.
    expect(screen.getByTestId("v2-work-tab-completed")).toHaveTextContent("Completed1");
  });

  it("puts the task, its evidence phrase, its effort and its points on one row", async () => {
    stubFetch({ tasks: POPULATED, detail: detail(), summary: summary() });
    renderWork();

    const rows = await screen.findAllByTestId("v2-work-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Correct the service description");
    expect(rows[0]).toHaveTextContent("Confirmed fact conflict");
    expect(rows[0]).toHaveTextContent("15 min");
    expect(rows[0]).toHaveTextContent("40");
  });

  it("keeps the closed tasks visible under Completed without counting them", async () => {
    stubFetch({ tasks: POPULATED, detail: detail(), summary: summary() });
    const user = userEvent.setup();
    renderWork();

    await user.click(await screen.findByTestId("v2-work-tab-completed"));
    expect(await screen.findByText("Closed without completion")).toBeInTheDocument();
    expect(screen.getByText("Duplicate finding")).toBeInTheDocument();
  });

  it("reports the brand's progress from the summary, not from the rows", async () => {
    stubFetch({ tasks: POPULATED, detail: detail(), summary: summary() });
    renderWork();

    const line = await screen.findByTestId("v2-work-progress-line");
    expect(line).toHaveTextContent("Level 2 Ready");
    expect(line).toHaveTextContent("120 work points");
  });

  it("previews the selected task with its evidence and its completion rule", async () => {
    stubFetch({ tasks: POPULATED, detail: detail({ state: "suggested" }), summary: summary() });
    renderWork();

    const preview = await screen.findByTestId("v2-task-preview");
    expect(preview).toHaveTextContent("Why this task?");
    expect(preview).toHaveTextContent("The published page conflicts with your approved region.");
    expect(preview).toHaveTextContent("Services available worldwide");
    expect(preview).toHaveTextContent("Software checks: repair check.");
    expect(preview).toHaveTextContent("40 points after verification");
  });

  it("namespaces every work query under v2 so the live dashboard cannot be reached", async () => {
    stubFetch({ tasks: POPULATED, detail: detail(), summary: summary() });
    const { client } = renderWork();
    await screen.findAllByTestId("v2-work-row");

    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => Array.isArray(key) && key[0] === "v2")).toBe(true);
  });
});

describe("MyWorkPage - the states that are not the happy path", () => {
  it("renders a loading frame while the reads are in flight", () => {
    stubFetch({ pending: true });
    renderWork();
    expect(screen.getByTestId("v2-my-work-loading")).toBeInTheDocument();
  });

  it("renders an inline error with a retry when the task list fails", async () => {
    stubFetch({ fail: "tasks" });
    renderWork();
    expect(await screen.findByTestId("v2-my-work-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("says a brand has no work yet, and names it - never an empty frame", async () => {
    stubFetch({ tasks: { items: [], nextCursor: null }, summary: summary() });
    brandStub.value = {
      selectedBrandId: "brand-narwal",
      selectedBrand: { id: "brand-narwal", name: "Narwal" },
      brands: [{ id: "brand-narwal" }],
      isLoading: false,
    };
    renderWork();

    const empty = await screen.findByTestId("v2-my-work-empty");
    expect(empty).toHaveTextContent("No work yet");
    expect(empty).toHaveTextContent("Narwal");
    expect(empty.textContent).not.toMatch(/\b0\b/);
  });

  it("names the zero-brand case instead of leaving a blank screen", () => {
    stubFetch({});
    brandStub.value = {
      selectedBrandId: "",
      selectedBrand: undefined,
      brands: [],
      isLoading: false,
    };
    renderWork();
    expect(screen.getByTestId("v2-my-work-no-brand")).toHaveTextContent("Add a brand to start");
  });

  it("keeps the list usable when only the deep-linked task fails to load", async () => {
    stubFetch({ tasks: POPULATED, summary: summary(), fail: "detail" });
    renderWork("task-1");
    expect(await screen.findByTestId("v2-my-work-detail-error")).toBeInTheDocument();
  });
});

describe("MyWorkPage - the confirmation gate", () => {
  it("holds the primary action disabled while only the software checks have passed", async () => {
    stubFetch({ tasks: POPULATED, detail: detail(), summary: summary() });
    renderWork("task-1");

    const gate = await screen.findByTestId("v2-confirmation-gate");
    const checks = within(gate).getAllByTestId("v2-application-check");
    expect(checks).toHaveLength(1);
    expect(checks[0]).toHaveTextContent("Passed");

    // The human row is a state of its own: not a pass, not a failure.
    expect(within(gate).getByTestId("v2-human-check")).toHaveTextContent("Pending");

    const confirm = screen.getByTestId("v2-confirm-complete");
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId("v2-confirm-checkbox")).not.toBeChecked();
  });

  it("opens the gate only when the person confirms, and sends a human confirmation", async () => {
    stubFetch({ tasks: POPULATED, detail: detail(), summary: summary() });
    const user = userEvent.setup();
    renderWork("task-1");

    await screen.findByTestId("v2-confirmation-gate");
    await user.click(screen.getByTestId("v2-confirm-checkbox"));

    const confirm = screen.getByTestId("v2-confirm-complete");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].url).toContain("/work/tasks/task-1/verify");
    const body = posted[0].body as {
      expectedRevision: number;
      cycleKey: string;
      verification: { kind: string; confirmedByUserId: string; note: string };
      evidence: { kind: string }[];
    };
    expect(body.verification.kind).toBe("human_confirmation");
    expect(body.verification.confirmedByUserId).toBe("user-1");
    expect(body.expectedRevision).toBe(3);
    // Idempotent: the key is derived from the task version, not from the clock.
    expect(body.cycleKey).toBe("confirmation-v1");
    expect(body.evidence.map((item) => item.kind)).toContain("fault_repair");
  });

  it("stays shut, and says why, when the required software evidence is missing", async () => {
    stubFetch({
      tasks: POPULATED,
      summary: summary(),
      detail: detail({
        completionRule: { required: ["content_change", "confirmation"] },
        evidence: [evidence()],
      }),
    });
    renderWork("task-1");

    expect(await screen.findByTestId("v2-gate-blocked")).toHaveTextContent("content change");
    expect(screen.getByTestId("v2-confirm-complete")).toBeDisabled();
    expect(screen.getByTestId("v2-confirm-checkbox")).toBeDisabled();
  });

  it("does not draw the gate for a task the server would refuse to verify", async () => {
    stubFetch({
      tasks: POPULATED,
      summary: summary(),
      detail: detail({ state: "waiting_for_observation" }),
    });
    renderWork("task-1");

    expect(await screen.findByTestId("v2-task-complete")).toHaveTextContent("Work verified");
    expect(screen.queryByTestId("v2-confirmation-gate")).not.toBeInTheDocument();
  });
});
