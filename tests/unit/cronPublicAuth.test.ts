import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/supabase", () => ({
  supabaseAdmin: { auth: { getUser: vi.fn() } },
}));
vi.mock("../../server/lib/supabaseAuth", () => ({ supabaseAuth: {} }));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/instrument", () => ({ Sentry: {} }));
vi.mock("../../server/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  requestContext: { getStore: vi.fn() },
}));
vi.mock("../../server/lib/leakedPassword", () => ({ isPasswordLeaked: vi.fn() }));
vi.mock("../../server/lib/workflowEngine", () => ({
  maybeTickActiveRunsForUser: vi.fn(),
}));
vi.mock("../../server/lib/welcomeEmail", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { requireAuthForApi } = await import("../../server/auth");

function makeApp() {
  const app = express();
  app.use(requireAuthForApi);
  app.all("/api/cron/fact-scrape-backstop", (_req, res) => {
    res.status(204).end();
  });
  return app;
}

describe("fact scrape backstop global auth", () => {
  it.each(["get", "post"] as const)(
    "lets a %s request reach the cron secret gate",
    async (method) => {
      const response = await request(makeApp())[method]("/api/cron/fact-scrape-backstop");

      expect(response.status).toBe(204);
    },
  );
});
