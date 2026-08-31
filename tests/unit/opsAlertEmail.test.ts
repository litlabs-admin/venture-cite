// Unit tests for server/lib/opsAlertEmail.ts.
//
// Never sends real email: `send` is a vi.fn() injected through deps, and
// module-level mocks stub logger/sentry so nothing touches the network or
// a real Resend key.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { loggerMock, captureAndFlushMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  captureAndFlushMock: vi.fn(),
}));

vi.mock("../../server/lib/logger", () => ({ logger: loggerMock }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: captureAndFlushMock }));
vi.mock("../../server/storage", () => ({
  storage: { getSystemState: vi.fn(async () => null), setSystemState: vi.fn(async () => {}) },
}));
vi.mock("../../server/emailService", () => ({
  sendOutreachEmailViaResend: vi.fn(async () => ({ messageId: "stub" })),
}));

import { sendOpsAlertEmails } from "../../server/lib/opsAlertEmail";
import type { OpsAlert } from "../../server/lib/opsHealthCheck";

const NOW = new Date("2026-08-31T12:00:00Z").getTime();

function makeAlert(overrides: Partial<OpsAlert> = {}): OpsAlert {
  return {
    kind: "provider_spend_over_threshold",
    message: "Provider spend over the last hour (1500.00¢) exceeds the 1000¢ threshold.",
    measured: { totalCents: 1500, rowCount: 12, windowMs: 3600000 },
    threshold: { thresholdCents: 1000, windowMs: 3600000 },
    lookAt: "api_costs, filtered to created_at within the last hour.",
    ...overrides,
  };
}

function baseDeps(overrides: Record<string, unknown> = {}) {
  const state = new Map<string, unknown>();
  return {
    getSystemState: vi.fn(async (key: string) => (state.has(key) ? state.get(key) : null)),
    setSystemState: vi.fn(async (key: string, value: unknown) => {
      state.set(key, value);
    }),
    now: () => NOW,
    send: vi.fn(async () => ({ messageId: "stub" })),
    ...overrides,
  };
}

beforeEach(() => {
  loggerMock.info.mockClear();
  loggerMock.error.mockClear();
  captureAndFlushMock.mockClear();
  delete process.env.OPS_ALERT_EMAIL;
});

describe("sendOpsAlertEmails", () => {
  it("does nothing when there are no alerts at all", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    const deps = baseDeps();
    await sendOpsAlertEmails([], deps);
    expect(deps.send).not.toHaveBeenCalled();
  });

  // check_failed means the monitor itself broke, and every other condition
  // depends on the check running. It was originally filtered out of email on
  // the grounds that Sentry already carried it - but SENTRY_DSN is unset and
  // server/instrument.ts only calls Sentry.init() with a truthy DSN, so
  // captureAndFlush is a no-op here. Dropping it would make a broken monitor
  // completely silent.
  it("emails check_failed, because Sentry is not configured to carry it", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    const deps = baseDeps();

    await sendOpsAlertEmails([makeAlert({ kind: "check_failed" })], deps);

    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("puts check_failed on a longer cooldown than a firing condition", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    const deps = baseDeps();
    const alert = makeAlert({ kind: "check_failed" });

    await sendOpsAlertEmails([alert], deps);
    expect(deps.send).toHaveBeenCalledTimes(1);

    // Advance the fixture clock, not the wall clock. baseDeps pins now() to the
    // fixed NOW above; reaching for Date.now() here measured the gap between
    // real time and that constant instead of the interval under test, which is
    // an arbitrary number and passed or failed on when the suite happened to
    // run.
    const HOUR = 60 * 60 * 1000;

    // Two hours on: past the 1h condition cooldown, still inside the 6h one.
    deps.now = () => NOW + 2 * HOUR;
    await sendOpsAlertEmails([alert], deps);
    expect(deps.send).toHaveBeenCalledTimes(1);

    // Seven hours on: past it.
    deps.now = () => NOW + 7 * HOUR;
    await sendOpsAlertEmails([alert], deps);
    expect(deps.send).toHaveBeenCalledTimes(2);
  });

  it("logs and does not throw when OPS_ALERT_EMAIL is unset", async () => {
    const deps = baseDeps();
    await expect(sendOpsAlertEmails([makeAlert()], deps)).resolves.toBeUndefined();
    expect(deps.send).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ops_alert_email_skipped" }),
      expect.any(String),
    );
  });

  it("sends once for a firing alert", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    const deps = baseDeps();
    await sendOpsAlertEmails([makeAlert()], deps);
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ops@example.com",
        subject: expect.stringContaining("provider_spend"),
      }),
    );
  });

  it("does not resend the same condition inside the cooldown", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    const deps = baseDeps();
    await sendOpsAlertEmails([makeAlert()], deps);
    expect(deps.send).toHaveBeenCalledTimes(1);

    // 30 minutes later - still inside the 1-hour cooldown.
    const laterDeps = { ...deps, now: () => NOW + 30 * 60 * 1000 };
    await sendOpsAlertEmails([makeAlert()], laterDeps);
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it("sends again once the cooldown has elapsed", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    const deps = baseDeps();
    await sendOpsAlertEmails([makeAlert()], deps);
    expect(deps.send).toHaveBeenCalledTimes(1);

    // 61 minutes later - past the 1-hour cooldown.
    const laterDeps = { ...deps, now: () => NOW + 61 * 60 * 1000 };
    await sendOpsAlertEmails([makeAlert()], laterDeps);
    expect(deps.send).toHaveBeenCalledTimes(2);
  });

  it("keeps cooldowns independent per tracked job for scheduled_job_overdue", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    const deps = baseDeps();
    const autoCitation = makeAlert({
      kind: "scheduled_job_overdue",
      measured: { job: "auto-citation" },
    });
    const weeklyReport = makeAlert({
      kind: "scheduled_job_overdue",
      measured: { job: "weekly-report" },
    });
    await sendOpsAlertEmails([autoCitation], deps);
    await sendOpsAlertEmails([weeklyReport], deps);
    expect(deps.send).toHaveBeenCalledTimes(2);

    // Re-firing auto-citation immediately is suppressed; weekly-report is untouched by that.
    await sendOpsAlertEmails([autoCitation], deps);
    expect(deps.send).toHaveBeenCalledTimes(2);
  });

  it("contains a send failure: logs and reports to Sentry without throwing", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    const deps = baseDeps({
      send: vi.fn(async () => {
        throw new Error("Resend API down");
      }),
    });
    await expect(sendOpsAlertEmails([makeAlert()], deps)).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalled();
    expect(captureAndFlushMock).toHaveBeenCalled();
  });

  it("does not record the cooldown when the send fails, so the next tick retries", async () => {
    process.env.OPS_ALERT_EMAIL = "ops@example.com";
    const deps = baseDeps({
      send: vi.fn(async () => {
        throw new Error("Resend API down");
      }),
    });
    await sendOpsAlertEmails([makeAlert()], deps);
    expect(deps.setSystemState).not.toHaveBeenCalled();
  });
});
