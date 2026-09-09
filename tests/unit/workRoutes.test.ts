import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const user = { id: "11111111-1111-4111-8111-111111111111" };
const brand = { id: "brand-a", userId: user.id };
const task = {
  id: "task-a",
  brandId: brand.id,
  goalId: null,
  taskKey: "baseline",
  taskVersion: 1,
  taskType: "establish_measurement_baseline",
  state: "suggested",
  revision: 1,
  title: "Establish a baseline",
  desiredResult: "A stored baseline exists",
  buyerNeed: "Know current visibility",
  recommendedChange: "Run the baseline checks",
  reason: "The brand has no baseline",
  confidence: 0.9,
  effort: 2,
  points: 10,
  completionRule: { kind: "measurement" },
  measurementScope: { kind: "period", period: "30d" },
  nextCheckAt: null,
  blockedReason: null,
  dismissalReason: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-02T00:00:00.000Z"),
  owner: { id: user.id, firstName: "Admin", lastName: "User", profileImageUrl: null },
};
const summary = {
  taskCounts: {
    total: 1,
    pending: 1,
    suggested: 1,
    accepted: 0,
    inProgress: 0,
    submitted: 0,
    verified: 0,
    waitingForObservation: 0,
    dismissed: 0,
    notApplicable: 0,
    reopened: 0,
  },
  awards: {
    eventCount: 1,
    points: 10,
    awardedPoints: 10,
    reversedPoints: 0,
    adjustmentPoints: 0,
    latestOccurredAt: new Date("2026-09-02T00:00:00.000Z"),
  },
  capabilityState: [
    {
      milestone: "baseline_ready",
      eventKind: "achieved",
      occurredAt: new Date("2026-09-02T00:00:00.000Z"),
    },
  ],
};

const mocks = vi.hoisted(() => ({
  service: {
    getToday: vi.fn(),
    getTaskPage: vi.fn(),
    getTask: vi.fn(),
    getHistory: vi.fn(),
    exportWork: vi.fn(),
    transitionTask: vi.fn(),
    verifyTask: vi.fn(),
    reviewTask: vi.fn(),
  },
  reconcileBrandWorkOpportunities: vi.fn(),
  repository: { getTaskDetails: vi.fn() },
  requireBrand: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/storage", () => ({
  storage: { getBrandByIdForUser: vi.fn(async () => brand) },
}));
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers.authorization !== "Bearer test-token" && !req.headers.cookie)
      return res.status(401).json({ success: false, error: "Not authenticated" });
    (req as express.Request & { user?: typeof user }).user = user;
    return next();
  },
}));
vi.mock("../../server/lib/ownership", () => ({
  requireUser: () => user,
  requireBrand: mocks.requireBrand,
}));
vi.mock("../../server/domains/work/repository", () => ({
  createWorkRepository: () => mocks.repository,
}));
vi.mock("../../server/services/work/WorkService", () => ({
  createWorkService: () => mocks.service,
  isWorkCursor: (value: string) =>
    value ===
    Buffer.from(
      JSON.stringify({ timestamp: "2026-09-02T00:00:00.000Z", id: "task-a" }),
      "utf8",
    ).toString("base64url"),
}));
vi.mock("../../server/services/work/productionOpportunities", () => ({
  reconcileBrandWorkOpportunities: mocks.reconcileBrandWorkOpportunities,
}));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, error: unknown, fallback: string) => {
    if (error instanceof Error && error.message === "Brand not found")
      return res.status(404).json({ success: false, error: "not_found" });
    return res.status(500).json({ success: false, error: fallback });
  },
}));

const { setupWorkRoutes } = await import("../../server/routes/work");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupWorkRoutes(app);
  return app;
}

describe("work routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireBrand.mockResolvedValue(brand);
    mocks.service.getToday.mockResolvedValue({ mode: "guided", summary, tasks: [task] });
    mocks.service.getTaskPage.mockResolvedValue({ items: [task], nextCursor: null });
    mocks.service.getTask.mockResolvedValue({ task, details: { evidence: [], history: [] } });
    mocks.service.getHistory.mockResolvedValue({ items: [], nextCursor: null });
    mocks.service.exportWork.mockResolvedValue({
      manifestVersion: 1,
      brandId: brand.id,
      exportedAt: new Date("2026-09-02T00:00:00.000Z"),
      tasks: [
        {
          task,
          details: {
            evidence: [],
            history: [],
            awards: [
              {
                id: "award-a",
                taskId: task.id,
                brandId: brand.id,
                taskVersion: 1,
                cycleKey: "cycle-a",
                awardKey: "award-key",
                points: 10,
                ruleVersion: 1,
                evidenceVersion: 1,
                verificationMethod: { kind: "system_check", checkId: "check-a" },
                reason: "verified",
                awardStatus: "awarded",
                reversalReference: null,
                occurredAt: new Date("2026-09-02T00:00:00.000Z"),
              },
              {
                id: "reversal-a",
                taskId: task.id,
                brandId: brand.id,
                taskVersion: 1,
                cycleKey: "cycle-a",
                awardKey: "reversal-key",
                points: -10,
                ruleVersion: 1,
                evidenceVersion: 1,
                verificationMethod: { kind: "system_check", checkId: "check-a" },
                reason: "reversed",
                awardStatus: "reversed",
                reversalReference: "award-a",
                occurredAt: new Date("2026-09-03T00:00:00.000Z"),
              },
            ],
          },
        },
      ],
    });
    mocks.service.transitionTask.mockResolvedValue(task);
    mocks.service.verifyTask.mockResolvedValue({ task, award: { id: "award-a" }, created: true });
    mocks.service.reviewTask.mockResolvedValue({
      task,
      review: { id: "review-a" },
      pointsChanged: 0,
    });
  });

  it("allows a cookie-session request with no bearer header", async () => {
    const res = await request(makeApp())
      .get(`/api/brands/${brand.id}/work/summary`)
      .set("Cookie", "connect.sid=s%3Avalid");
    expect(res.status).not.toBe(401);
  });

  it("reconciles opportunities on demand", async () => {
    const links = [
      {
        id: "task-a",
        taskKey: "baseline",
        taskVersion: 1,
        taskType: task.taskType,
        state: task.state,
      },
    ];
    mocks.reconcileBrandWorkOpportunities.mockResolvedValueOnce(links);
    const res = await request(makeApp())
      .post(`/api/brands/${brand.id}/work/reconcile`)
      .set("Authorization", "Bearer test-token");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { links: expect.any(Array), count: expect.any(Number) },
    });
  });

  it("surfaces reconcile failures", async () => {
    mocks.reconcileBrandWorkOpportunities.mockRejectedValueOnce(new Error("reconcile failed"));
    const res = await request(makeApp())
      .post(`/api/brands/${brand.id}/work/reconcile`)
      .set("Authorization", "Bearer test-token");
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: "Unable to reconcile work opportunities",
    });
  });

  it("returns the level and next threshold the today page reads", async () => {
    mocks.service.getToday.mockResolvedValueOnce({
      mode: "guided",
      summary: {
        ...summary,
        awards: { ...summary.awards, points: 60 },
      },
      tasks: [],
      goal: { title: "Improve visibility", statement: "Reach more buyers" },
    });
    const res = await request(makeApp())
      .get(`/api/brands/${brand.id}/work/summary`)
      .set("Authorization", "Bearer test-token");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      currentLevel: { level: 2, name: "Ready", points: 60 },
      nextThreshold: { level: 3, name: "Improve", points: 160 },
      goal: { title: "Improve visibility", statement: "Reach more buyers" },
    });
  });

  it("reports Start for a brand with no awards", async () => {
    mocks.service.getToday.mockResolvedValueOnce({
      mode: "guided",
      summary: {
        ...summary,
        awards: { ...summary.awards, points: 0 },
        capabilityState: [],
      },
      tasks: [],
      goal: null,
    });
    const res = await request(makeApp())
      .get("/api/brands/brand-empty/work/summary")
      .set("Authorization", "Bearer test-token");
    expect(res.body.data.currentLevel).toMatchObject({ level: 1, name: "Start", points: 0 });
    expect(res.body.data.nextThreshold).toMatchObject({ level: 2, name: "Ready", points: 60 });
  });

  it("returns 404 for a foreign brand", async () => {
    mocks.requireBrand.mockRejectedValue(new Error("Brand not found"));
    await request(makeApp())
      .get("/api/brands/brand-b/work/summary")
      .set("Authorization", "Bearer test-token")
      .expect(404);
    expect(mocks.service.getToday).not.toHaveBeenCalled();
  });

  it("returns the client summary shape", async () => {
    const response = await request(makeApp())
      .get(`/api/brands/${brand.id}/work/summary`)
      .set("Authorization", "Bearer test-token")
      .expect(200);
    expect(response.body.data).toMatchObject({
      brandId: brand.id,
      points: 10,
      pendingCount: 1,
      milestones: ["baseline_ready"],
      mode: "guided",
    });
    expect(response.body.data.nextTask.type).toBe("establish_measurement_baseline");
  });

  it("passes client filters and returns a cursor page", async () => {
    await request(makeApp())
      .get(
        `/api/brands/${brand.id}/work/tasks?status=assigned&task=task-a&taskType=establish_measurement_baseline&date=2026-09-02&limit=1`,
      )
      .set("Authorization", "Bearer test-token")
      .expect(200);
    expect(mocks.service.getTaskPage).toHaveBeenCalledWith({
      brandId: brand.id,
      filters: {
        status: "assigned",
        taskType: "establish_measurement_baseline",
        date: "2026-09-02",
        taskId: "task-a",
        cursor: undefined,
        limit: 1,
      },
    });
  });

  it("rejects unknown and invalid list query fields", async () => {
    await request(makeApp())
      .get(`/api/brands/${brand.id}/work/tasks?unknown=x`)
      .set("Authorization", "Bearer test-token")
      .expect(400);
    await request(makeApp())
      .get(`/api/brands/${brand.id}/work/tasks?date=tomorrow`)
      .set("Authorization", "Bearer test-token")
      .expect(400);
    await request(makeApp())
      .get(`/api/brands/${brand.id}/work/tasks?cursor=bad`)
      .set("Authorization", "Bearer test-token")
      .expect(400);
    expect(mocks.service.getTaskPage).not.toHaveBeenCalled();
  });

  it("returns task details through the service projection", async () => {
    mocks.service.getTask.mockResolvedValue({
      task: { ...task, state: "verified" },
      details: {
        evidence: [],
        history: [
          {
            id: "event-earlier",
            taskId: task.id,
            brandId: brand.id,
            taskVersion: 1,
            revision: 1,
            priorState: "suggested",
            nextState: "suggested",
            actorId: user.id,
            actorKind: "user",
            reason: "Task created",
            verificationMethod: null,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
      },
    });
    const response = await request(makeApp())
      .get(`/api/brands/${brand.id}/work/tasks/task-a`)
      .set("Authorization", "Bearer test-token")
      .expect(200);
    expect(response.body.data).toMatchObject({
      id: "task-a",
      type: "establish_measurement_baseline",
      state: "verified",
      ownerId: user.id,
      ownerName: "Admin User",
      history: [{ id: "event-earlier", state: "suggested" }],
    });
    expect(mocks.service.getTask).toHaveBeenCalledWith({ brandId: brand.id, taskId: "task-a" });
    expect(mocks.repository.getTaskDetails).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing task", async () => {
    mocks.service.getTask.mockResolvedValue({ kind: "not_found" });
    await request(makeApp())
      .get(`/api/brands/${brand.id}/work/tasks/missing`)
      .set("Authorization", "Bearer test-token")
      .expect(404);
  });

  it("rejects unknown command and evidence fields", async () => {
    await request(makeApp())
      .post(`/api/brands/${brand.id}/work/tasks/task-a/commands`)
      .set("Authorization", "Bearer test-token")
      .send({ expectedRevision: 1, extra: true, command: { kind: "start" } })
      .expect(400);
    await request(makeApp())
      .post(`/api/brands/${brand.id}/work/tasks/task-a/verify`)
      .set("Authorization", "Bearer test-token")
      .send({
        expectedRevision: 1,
        cycleKey: "cycle-a",
        verification: { kind: "human_confirmation", confirmedByUserId: user.id, note: "done" },
        evidence: [
          {
            kind: "source",
            label: "fact",
            sourceUrl: "https://example.com",
            retrievedAt: "2026-09-02T00:00:00.000Z",
            excerpt: "fact",
            extra: true,
          },
        ],
      })
      .expect(400);
    expect(mocks.service.transitionTask).not.toHaveBeenCalled();
    expect(mocks.service.verifyTask).not.toHaveBeenCalled();
  });

  it("projects mutation responses with the client task shape", async () => {
    const command = await request(makeApp())
      .post(`/api/brands/${brand.id}/work/tasks/task-a/commands`)
      .set("Authorization", "Bearer test-token")
      .send({ expectedRevision: 1, command: { kind: "start" } })
      .expect(200);
    expect(command.body.data).toMatchObject({
      id: "task-a",
      type: "establish_measurement_baseline",
    });
    const verification = await request(makeApp())
      .post(`/api/brands/${brand.id}/work/tasks/task-a/verify`)
      .set("Authorization", "Bearer test-token")
      .send({
        expectedRevision: 1,
        cycleKey: "cycle-a",
        verification: { kind: "human_confirmation", confirmedByUserId: user.id, note: "done" },
        evidence: [
          {
            kind: "confirmation",
            label: "done",
            confirmedByUserId: user.id,
            note: "done",
            confirmedAt: "2026-09-02T00:00:00.000Z",
          },
        ],
      })
      .expect(200);
    expect(verification.body.data).toMatchObject({
      task: { id: "task-a", type: "establish_measurement_baseline" },
      created: true,
    });
    const review = await request(makeApp())
      .post(`/api/brands/${brand.id}/work/tasks/task-a/review`)
      .set("Authorization", "Bearer test-token")
      .send({
        expectedRevision: 1,
        cycleKey: "cycle-a",
        measurementScope: { kind: "period", period: "30d" },
        decision: "no_material_change",
      })
      .expect(200);
    expect(review.body.data).toMatchObject({
      task: { id: "task-a", type: "establish_measurement_baseline" },
      pointsChanged: 0,
    });
  });

  it("maps service conflicts, policy errors, and configuration errors", async () => {
    const { WorkServiceError } = await import("../../server/services/work/workServiceErrors");
    mocks.service.transitionTask.mockRejectedValue(
      new WorkServiceError("revision_conflict", "stale", { currentRevision: 4 }),
    );
    const conflict = await request(makeApp())
      .post(`/api/brands/${brand.id}/work/tasks/task-a/commands`)
      .set("Authorization", "Bearer test-token")
      .send({ expectedRevision: 3, command: { kind: "start" } })
      .expect(409);
    expect(conflict.body.currentRevision).toBe(4);
    mocks.service.verifyTask.mockRejectedValue(new WorkServiceError("invalid_evidence", "invalid"));
    await request(makeApp())
      .post(`/api/brands/${brand.id}/work/tasks/task-a/verify`)
      .set("Authorization", "Bearer test-token")
      .send({
        expectedRevision: 1,
        cycleKey: "cycle-a",
        verification: { kind: "human_confirmation", confirmedByUserId: user.id, note: "done" },
        evidence: [
          {
            kind: "confirmation",
            label: "done",
            confirmedByUserId: user.id,
            note: "done",
            confirmedAt: "2026-09-02T00:00:00.000Z",
          },
        ],
      })
      .expect(422);
    mocks.service.verifyTask.mockRejectedValue(
      new WorkServiceError("configuration_error", "missing"),
    );
    await request(makeApp())
      .post(`/api/brands/${brand.id}/work/tasks/task-a/verify`)
      .set("Authorization", "Bearer test-token")
      .send({
        expectedRevision: 1,
        cycleKey: "cycle-a",
        verification: { kind: "human_confirmation", confirmedByUserId: user.id, note: "done" },
        evidence: [
          {
            kind: "confirmation",
            label: "done",
            confirmedByUserId: user.id,
            note: "done",
            confirmedAt: "2026-09-02T00:00:00.000Z",
          },
        ],
      })
      .expect(503);
  });

  it("uses flat history, export, and strict review contracts", async () => {
    mocks.service.getHistory.mockResolvedValue({
      items: [
        {
          id: "event-a",
          taskId: "task-a",
          brandId: brand.id,
          taskVersion: 1,
          taskTitle: task.title,
          taskType: task.taskType,
          revision: 2,
          state: "suggested",
          priorState: null,
          actorId: null,
          actorKind: "system",
          reason: "reversal",
          verificationMethod: null,
          occurredAt: new Date("2026-09-02T00:00:00.000Z"),
          award: {
            awardKey: "award-key",
            points: -10,
            taskType: task.taskType,
            taskVersion: 1,
            ruleVersion: 1,
            cycleKey: "cycle-a",
            verification: { kind: "system_check", checkId: "check-a" },
            evidenceCount: 1,
            awarded: false,
            awardedAt: new Date("2026-09-02T00:00:00.000Z"),
            awardStatus: "reversed",
          },
        },
      ],
      nextCursor: "next",
    });
    const history = await request(makeApp())
      .get(`/api/brands/${brand.id}/work/history?status=reversed&limit=1`)
      .set("Authorization", "Bearer test-token")
      .expect(200);
    expect(history.body.data.items[0]).toMatchObject({
      id: "event-a",
      state: "suggested",
      occurredAt: "2026-09-02T00:00:00.000Z",
      award: { awardKey: "award-key", points: -10, awardStatus: "reversed", awarded: false },
    });
    expect(history.body.data.nextCursor).toBe("next");
    const exported = await request(makeApp())
      .get(`/api/brands/${brand.id}/work/export`)
      .set("Authorization", "Bearer test-token")
      .expect(200);
    expect(exported.body.data.tasks[0].task.type).toBe("establish_measurement_baseline");
    expect(exported.body.data.tasks[0].details.awards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "award-a",
          occurredAt: "2026-09-02T00:00:00.000Z",
          verificationMethod: { kind: "system_check", checkId: "check-a" },
          reversalReference: null,
        }),
        expect.objectContaining({
          id: "reversal-a",
          occurredAt: "2026-09-03T00:00:00.000Z",
          reversalReference: "award-a",
        }),
      ]),
    );
    expect(exported.body.data.tasks[0].details.reversals).toEqual([
      expect.objectContaining({ id: "reversal-a", awardStatus: "reversed" }),
    ]);
    await request(makeApp())
      .post(`/api/brands/${brand.id}/work/tasks/task-a/review`)
      .set("Authorization", "Bearer test-token")
      .send({
        expectedRevision: 1,
        cycleKey: "cycle-a",
        measurementScope: { kind: "period", period: "30d" },
        decision: "no_material_change",
        unknown: true,
      })
      .expect(400);
  });
});
