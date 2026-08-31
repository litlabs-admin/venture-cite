import { describe, expect, it, afterEach } from "vitest";
import { localE2EConfig } from "../e2e/support/local-fixtures";

const REQUIRED_ENV = {
  E2E_LOCAL_APP_URL: "http://localhost:3000",
  E2E_LOCAL_SUPABASE_URL: "http://127.0.0.1:55321",
  E2E_LOCAL_SUPABASE_ANON_KEY: "anon-key",
  E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
} as const;

const ORIGINAL_ENV = { ...process.env };

function setEnv(databaseUrl: string): void {
  Object.assign(process.env, REQUIRED_ENV);
  process.env.E2E_LOCAL_DATABASE_URL = databaseUrl;
}

afterEach(() => {
  for (const key of Object.keys(REQUIRED_ENV)) delete (process.env as Record<string, unknown>)[key];
  delete process.env.E2E_LOCAL_DATABASE_URL;
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("localE2EConfig database pin", () => {
  it("rejects a loopback database on an arbitrary port and name", () => {
    setEnv("postgres://postgres:postgres@127.0.0.1:5432/production_mirror");
    expect(localE2EConfig()).toBeNull();
  });

  it("rejects a loopback tunnel with the right port but the wrong database name", () => {
    setEnv("postgres://postgres:postgres@127.0.0.1:55322/production_mirror");
    expect(localE2EConfig()).toBeNull();
  });

  it("accepts the fixed local Supabase database", () => {
    setEnv("postgres://postgres:postgres@127.0.0.1:55322/postgres");
    expect(localE2EConfig()).not.toBeNull();
  });
});
