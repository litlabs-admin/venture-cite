// HTTP-level contract tests for server/routes/userAccount.ts.
//
// These drive every registration through express + supertest so the wiring
// itself is what's asserted (auth gate, validation, status-code mapping),
// not the service internals (which are mocked).
//
// Priority per endpoint: auth/ownership (401, never 500, service not called)
// > validation > success shape > conflict paths.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@example.com",
};

const { authState, services, logAuditMock } = vi.hoisted(() => {
  return {
    authState: { user: undefined as undefined | { id: string; email: string | null } },
    services: {
      buildUserExport: vi.fn(),
      scheduleAccountDeletion: vi.fn(),
      applyProfileUpdate: vi.fn(),
      changeUserPassword: vi.fn(),
      getPreferences: vi.fn(),
      setPreference: vi.fn(),
    },
    logAuditMock: vi.fn(),
  };
});

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
// The route module wires real per-endpoint rate limiters (1/day export,
// 5/hour delete). Bypass them here - they're plumbing, not this file's
// concern, and would otherwise 429 the 2nd+ test hitting the same route.
vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ipKeyGenerator: (ip: string) => ip,
}));
vi.mock("../../server/auth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../server/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("../../server/lib/authRateKey", () => ({ authRateKey: () => "test-key" }));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: unknown) => handler,
}));
vi.mock("../../server/services/userGdpr", () => ({
  buildUserExport: services.buildUserExport,
  scheduleAccountDeletion: services.scheduleAccountDeletion,
}));
vi.mock("../../server/services/userSettings", () => ({
  applyProfileUpdate: services.applyProfileUpdate,
  changeUserPassword: services.changeUserPassword,
}));
vi.mock("../../server/lib/notificationPrefs", () => ({
  NOTIFICATION_TYPES: [
    { key: "weekly_digest", label: "Weekly digest", description: "d", channel: "email" },
  ],
  getPreferences: services.getPreferences,
  setPreference: services.setPreference,
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupUserAccountRoutes } = await import("../../server/routes/userAccount");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = authState.user;
    next();
  });
  setupUserAccountRoutes(app);
  return app;
}

describe("user account routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = user;
  });

  describe("POST /api/user/delete", () => {
    it("401s when not authenticated, without calling the service", async () => {
      authState.user = undefined;
      const res = await request(makeApp())
        .post("/api/user/delete")
        .send({ password: "pw", confirm: "DELETE" });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: "Not authenticated" });
      expect(services.scheduleAccountDeletion).not.toHaveBeenCalled();
    });

    it("400s when password is missing", async () => {
      const res = await request(makeApp()).post("/api/user/delete").send({ confirm: "DELETE" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: "Password re-entry is required to delete the account.",
      });
      expect(services.scheduleAccountDeletion).not.toHaveBeenCalled();
    });

    it("400s when confirm phrase is wrong", async () => {
      const res = await request(makeApp())
        .post("/api/user/delete")
        .send({ password: "pw", confirm: "nope" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: "Confirmation phrase missing. Type DELETE to confirm.",
      });
    });

    it("400s when the account has no email on file", async () => {
      authState.user = { id: user.id, email: null };
      const res = await request(makeApp())
        .post("/api/user/delete")
        .send({ password: "pw", confirm: "DELETE" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: "Account has no email on file - contact support to delete.",
      });
    });

    it("401s on invalid password", async () => {
      services.scheduleAccountDeletion.mockResolvedValue({ kind: "invalid_password" });
      const res = await request(makeApp())
        .post("/api/user/delete")
        .send({ password: "wrong", confirm: "DELETE" });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: "Incorrect password." });
    });

    it("schedules deletion on success", async () => {
      const scheduledFor = new Date("2026-09-30T00:00:00.000Z");
      services.scheduleAccountDeletion.mockResolvedValue({
        kind: "ok",
        previousRow: { id: user.id },
        deletedAt: new Date("2026-08-31T00:00:00.000Z"),
        scheduledFor,
      });
      const res = await request(makeApp())
        .post("/api/user/delete")
        .send({ password: "correct", confirm: "DELETE" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: `Account deletion scheduled for 2026-09-30. Contact support before then to cancel.`,
        scheduledFor: scheduledFor.toISOString(),
      });
      expect(logAuditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: "user.delete.scheduled", entityId: user.id }),
      );
    });

    it("500s when the service throws", async () => {
      services.scheduleAccountDeletion.mockRejectedValue(new Error("db down"));
      const res = await request(makeApp())
        .post("/api/user/delete")
        .send({ password: "pw", confirm: "DELETE" });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: "Failed to schedule account deletion." });
    });
  });

  describe("GET /api/user/export", () => {
    it("401s when not authenticated, without calling the service", async () => {
      authState.user = undefined;
      const res = await request(makeApp()).get("/api/user/export");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: "Not authenticated" });
      expect(services.buildUserExport).not.toHaveBeenCalled();
    });

    it("returns the export as a downloadable attachment", async () => {
      services.buildUserExport.mockResolvedValue({ brands: [] });
      const res = await request(makeApp()).get("/api/user/export");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.headers["content-disposition"]).toContain("attachment;");
      expect(JSON.parse(res.text)).toEqual({ brands: [] });
      expect(services.buildUserExport).toHaveBeenCalledWith(user.id);
      expect(logAuditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: "user.export", entityId: user.id }),
      );
    });

    it("500s when the service throws", async () => {
      services.buildUserExport.mockRejectedValue(new Error("boom"));
      const res = await request(makeApp()).get("/api/user/export");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: "Failed to build export." });
    });
  });

  describe("GET /api/user/notification-preferences", () => {
    it("401s when not authenticated", async () => {
      authState.user = undefined;
      const res = await request(makeApp()).get("/api/user/notification-preferences");
      expect(res.status).toBe(401);
      expect(services.getPreferences).not.toHaveBeenCalled();
    });

    it("returns mapped preferences", async () => {
      services.getPreferences.mockResolvedValue([
        {
          type: "weekly_digest",
          meta: { label: "Weekly digest", description: "d", channel: "email" },
          emailEnabled: true,
        },
      ]);
      const res = await request(makeApp()).get("/api/user/notification-preferences");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: [
          {
            type: "weekly_digest",
            label: "Weekly digest",
            description: "d",
            channel: "email",
            emailEnabled: true,
          },
        ],
      });
    });

    it("500s when the service throws", async () => {
      services.getPreferences.mockRejectedValue(new Error("boom"));
      const res = await request(makeApp()).get("/api/user/notification-preferences");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: "Failed to load preferences." });
    });
  });

  describe("PATCH /api/user/profile", () => {
    it("401s when not authenticated, without calling the service", async () => {
      authState.user = undefined;
      const res = await request(makeApp()).patch("/api/user/profile").send({ firstName: "Jane" });
      expect(res.status).toBe(401);
      expect(services.applyProfileUpdate).not.toHaveBeenCalled();
    });

    it("400s on invalid input (firstName too long)", async () => {
      const res = await request(makeApp())
        .patch("/api/user/profile")
        .send({ firstName: "a".repeat(101) });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(services.applyProfileUpdate).not.toHaveBeenCalled();
    });

    it("400s for an invalid timezone", async () => {
      services.applyProfileUpdate.mockResolvedValue({ kind: "invalid_timezone" });
      const res = await request(makeApp())
        .patch("/api/user/profile")
        .send({ timezone: "Not/AZone" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "Invalid timezone" });
    });

    it("returns noChange:true when nothing changed", async () => {
      services.applyProfileUpdate.mockResolvedValue({ kind: "no_change" });
      const res = await request(makeApp()).patch("/api/user/profile").send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, noChange: true });
    });

    it("updates the profile on success", async () => {
      services.applyProfileUpdate.mockResolvedValue({ kind: "ok" });
      const res = await request(makeApp())
        .patch("/api/user/profile")
        .send({ firstName: "Jane", lastName: "Doe" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(services.applyProfileUpdate).toHaveBeenCalledWith(user.id, {
        firstName: "Jane",
        lastName: "Doe",
      });
    });

    it("500s when the service throws", async () => {
      services.applyProfileUpdate.mockRejectedValue(new Error("boom"));
      const res = await request(makeApp()).patch("/api/user/profile").send({ firstName: "Jane" });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: "Failed to update profile." });
    });
  });

  describe("POST /api/user/password", () => {
    it("401s when not authenticated, without calling the service", async () => {
      authState.user = undefined;
      const res = await request(makeApp())
        .post("/api/user/password")
        .send({ currentPassword: "old", newPassword: "newpass123" });
      expect(res.status).toBe(401);
      expect(services.changeUserPassword).not.toHaveBeenCalled();
    });

    it("400s when currentPassword is missing", async () => {
      const res = await request(makeApp())
        .post("/api/user/password")
        .send({ newPassword: "newpass123" });
      expect(res.status).toBe(400);
      expect(services.changeUserPassword).not.toHaveBeenCalled();
    });

    it("400s when the account has no email on file", async () => {
      authState.user = { id: user.id, email: null };
      const res = await request(makeApp())
        .post("/api/user/password")
        .send({ currentPassword: "old", newPassword: "newpass123" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: "Account has no email on file - contact support.",
      });
    });

    it("400s for a weak new password", async () => {
      services.changeUserPassword.mockResolvedValue({ kind: "weak_password", error: "too weak" });
      const res = await request(makeApp())
        .post("/api/user/password")
        .send({ currentPassword: "old", newPassword: "123" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "too weak" });
    });

    it("401s when the current password is wrong", async () => {
      services.changeUserPassword.mockResolvedValue({ kind: "wrong_current_password" });
      const res = await request(makeApp())
        .post("/api/user/password")
        .send({ currentPassword: "wrong", newPassword: "newpass123" });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: "Current password incorrect" });
    });

    it("propagates the status from an update_rejected outcome", async () => {
      services.changeUserPassword.mockResolvedValue({
        kind: "update_rejected",
        status: 502,
        error: "upstream rejected",
      });
      const res = await request(makeApp())
        .post("/api/user/password")
        .send({ currentPassword: "old", newPassword: "newpass123" });
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ success: false, error: "upstream rejected" });
    });

    it("changes password on success", async () => {
      services.changeUserPassword.mockResolvedValue({ kind: "ok" });
      const res = await request(makeApp())
        .post("/api/user/password")
        .send({ currentPassword: "old", newPassword: "newpass123" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(logAuditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: "user.password.changed", entityId: user.id }),
      );
    });

    it("500s when the service throws", async () => {
      services.changeUserPassword.mockRejectedValue(new Error("boom"));
      const res = await request(makeApp())
        .post("/api/user/password")
        .send({ currentPassword: "old", newPassword: "newpass123" });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: "Failed to change password." });
    });
  });

  describe("PATCH /api/user/notification-preferences", () => {
    it("401s when not authenticated, without calling the service", async () => {
      authState.user = undefined;
      const res = await request(makeApp())
        .patch("/api/user/notification-preferences")
        .send({ type: "weekly_digest", emailEnabled: true });
      expect(res.status).toBe(401);
      expect(services.setPreference).not.toHaveBeenCalled();
    });

    it("400s for an unknown notification type", async () => {
      const res = await request(makeApp())
        .patch("/api/user/notification-preferences")
        .send({ type: "not_real", emailEnabled: true });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "Unknown notification type." });
      expect(services.setPreference).not.toHaveBeenCalled();
    });

    it("400s when emailEnabled isn't boolean", async () => {
      const res = await request(makeApp())
        .patch("/api/user/notification-preferences")
        .send({ type: "weekly_digest", emailEnabled: "yes" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: "emailEnabled must be a boolean." });
    });

    it("updates the preference on success", async () => {
      const res = await request(makeApp())
        .patch("/api/user/notification-preferences")
        .send({ type: "weekly_digest", emailEnabled: false });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(services.setPreference).toHaveBeenCalledWith(user.id, "weekly_digest", false);
    });

    it("500s when the service throws", async () => {
      services.setPreference.mockRejectedValue(new Error("boom"));
      const res = await request(makeApp())
        .patch("/api/user/notification-preferences")
        .send({ type: "weekly_digest", emailEnabled: true });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: "Failed to update preferences." });
    });
  });
});
