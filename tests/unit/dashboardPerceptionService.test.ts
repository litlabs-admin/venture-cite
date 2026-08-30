// Direct, no-HTTP tests for server/services/dashboardPerception.ts.
//
// HTTP-level behavior for the perception endpoints is already covered by
// tests/unit/dashboardSiteHealthPerception.test.ts; this file proves the
// extracted service functions - including the probes trio, which had no
// prior endpoint-level coverage in this codebase - can be called directly.

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[],
  selectMock: vi.fn(),
  insertQueue: [] as unknown[],
  insertMock: vi.fn(),
}));

function makeSelectChain(result: unknown) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    catch: (fn: any) => Promise.resolve(result).catch(fn),
  };
  return chain;
}
dbState.selectMock.mockImplementation(() => makeSelectChain(dbState.selectQueue.shift() ?? []));
dbState.insertMock.mockImplementation(() => {
  const result = dbState.insertQueue.shift() ?? [];
  const chain: any = {
    values: () => chain,
    returning: () => Promise.resolve(result),
  };
  return chain;
});

vi.mock("../../server/db", () => ({
  db: { select: dbState.selectMock, insert: dbState.insertMock },
  pool: {},
}));

function queueSelect(result: unknown) {
  dbState.selectQueue.push(result);
}

const perceptionRunStubs = vi.hoisted(() => ({ runPerceptionScoring: vi.fn() }));
vi.mock("../../server/lib/perceptionRun", () => ({
  runPerceptionScoring: perceptionRunStubs.runPerceptionScoring,
}));

const probeStubs = vi.hoisted(() => ({
  startPerceptionProbeRun: vi.fn(),
  advancePerceptionProbeRun: vi.fn(),
}));
vi.mock("../../server/lib/perceptionProbes", () => ({
  startPerceptionProbeRun: probeStubs.startPerceptionProbeRun,
  advancePerceptionProbeRun: probeStubs.advancePerceptionProbeRun,
}));

const {
  getBrandPerception,
  runBrandPerceptionScoring,
  getPerceptionProbes,
  startOrGetActivePerceptionProbeRun,
  advanceOwnedPerceptionProbeRun,
  PERCEPTION_COOLDOWN_MS,
} = await import("../../server/services/dashboardPerception");

const BRAND = { id: "brand-1", userId: "user-1", name: "Acme" } as any;

beforeEach(() => {
  dbState.selectMock.mockClear();
  dbState.insertMock.mockClear();
  dbState.selectQueue.length = 0;
  dbState.insertQueue.length = 0;
  perceptionRunStubs.runPerceptionScoring.mockReset();
  probeStubs.startPerceptionProbeRun.mockReset();
  probeStubs.advancePerceptionProbeRun.mockReset();
});

describe("getBrandPerception", () => {
  it("returns null when the brand has never been scored", async () => {
    queueSelect([]); // recentRuns
    queueSelect([]); // latest
    const data = await getBrandPerception(BRAND.id);
    expect(data).toBeNull();
  });

  it("converts numeric-string axes to numbers and returns history oldest-first", async () => {
    queueSelect([
      { overall: "50", createdAt: new Date("2026-07-03T00:00:00Z") },
      { overall: "30", createdAt: new Date("2026-07-01T00:00:00Z") },
    ]); // recentRuns, newest-first as the real query returns
    queueSelect([
      {
        trust: "66.6",
        quality: "70",
        value: "50",
        market: null,
        innovation: "80",
        overall: "50",
        praised: [],
        questioned: [],
        evidenceCount: 1,
        model: "gpt-4o",
        evidence: null,
        evidencePlatforms: null,
        axisNotes: null,
        createdAt: new Date("2026-07-03T00:00:00Z"),
      },
    ]); // latest

    const data = await getBrandPerception(BRAND.id);

    expect(data?.trust).toBe(66.6);
    expect(data?.market).toBeNull();
    expect(data?.history).toEqual([30, 50]);
  });
});

describe("runBrandPerceptionScoring", () => {
  it("returns a cooldown outcome when the newest run is inside the cooldown window", async () => {
    queueSelect([{ createdAt: new Date(Date.now() - 1_000) }]);

    const outcome = await runBrandPerceptionScoring(BRAND);

    expect(outcome.kind).toBe("cooldown");
    if (outcome.kind === "cooldown") {
      expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(perceptionRunStubs.runPerceptionScoring).not.toHaveBeenCalled();
  });

  it("scores and returns the serialized run when past the cooldown", async () => {
    queueSelect([{ createdAt: new Date(Date.now() - (PERCEPTION_COOLDOWN_MS + 60_000)) }]);
    perceptionRunStubs.runPerceptionScoring.mockResolvedValue({
      trust: null,
      quality: null,
      value: null,
      market: null,
      innovation: null,
      overall: null,
      praised: [],
      questioned: [],
      evidenceCount: 0,
      model: null,
      evidence: null,
      evidencePlatforms: null,
      axisNotes: null,
      createdAt: new Date("2026-07-29T12:00:00Z"),
    });

    const outcome = await runBrandPerceptionScoring(BRAND);

    expect(outcome.kind).toBe("scored");
    if (outcome.kind === "scored") {
      expect(outcome.data.evidenceCount).toBe(0);
      expect(outcome.data.overall).toBeNull();
    }
    expect(perceptionRunStubs.runPerceptionScoring).toHaveBeenCalledWith(BRAND);
  });
});

describe("getPerceptionProbes", () => {
  it("returns null when there is no probe run yet", async () => {
    queueSelect([]);
    const data = await getPerceptionProbes(BRAND.id);
    expect(data).toBeNull();
  });

  it("returns the run plus its probes, converting numeric scores", async () => {
    queueSelect([
      {
        id: "run-1",
        status: "completed",
        probesDone: 6,
        probesTotal: 6,
        startedAt: new Date("2026-07-01T00:00:00Z"),
        completedAt: new Date("2026-07-01T01:00:00Z"),
        errorMessage: null,
      },
    ]);
    queueSelect([
      {
        platform: "ChatGPT",
        axis: "trust",
        question: "Is Acme trustworthy?",
        status: "completed",
        answer: "Yes",
        sources: [{ url: "https://acme.example.com" }],
        score: "80",
        noInformation: false,
        note: null,
        errorMessage: null,
      },
    ]);

    const data = await getPerceptionProbes(BRAND.id);

    expect(data?.runId).toBe("run-1");
    expect(data?.probes[0].score).toBe(80);
  });
});

describe("startOrGetActivePerceptionProbeRun", () => {
  it("returns the active run instead of starting a new one when a run is already in flight", async () => {
    queueSelect([{ id: "run-active", status: "running" }]);

    const result = await startOrGetActivePerceptionProbeRun(BRAND);

    expect(result).toEqual({ runId: "run-active", alreadyRunning: true });
    expect(probeStubs.startPerceptionProbeRun).not.toHaveBeenCalled();
  });

  it("starts a new run when none is active", async () => {
    queueSelect([]);
    probeStubs.startPerceptionProbeRun.mockResolvedValue({ runId: "run-new", probesTotal: 30 });

    const result = await startOrGetActivePerceptionProbeRun(BRAND);

    expect(result).toEqual({ runId: "run-new", probesTotal: 30, alreadyRunning: false });
  });
});

describe("advanceOwnedPerceptionProbeRun", () => {
  it("returns null when the run does not belong to the brand", async () => {
    queueSelect([]);
    const result = await advanceOwnedPerceptionProbeRun(BRAND, "someone-elses-run");
    expect(result).toBeNull();
    expect(probeStubs.advancePerceptionProbeRun).not.toHaveBeenCalled();
  });

  it("advances the run when it belongs to the brand", async () => {
    queueSelect([{ id: "run-1", brandId: BRAND.id }]);
    probeStubs.advancePerceptionProbeRun.mockResolvedValue({ probesDone: 3, probesTotal: 6 });

    const result = await advanceOwnedPerceptionProbeRun(BRAND, "run-1");

    expect(result).toEqual({ probesDone: 3, probesTotal: 6 });
    expect(probeStubs.advancePerceptionProbeRun).toHaveBeenCalledWith(
      BRAND,
      "run-1",
      expect.any(Number),
      BRAND.userId,
    );
  });
});
