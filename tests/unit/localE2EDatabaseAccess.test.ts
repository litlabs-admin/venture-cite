import { describe, expect, it } from "vitest";
import {
  localE2EOwnerDatabaseUrl,
  localE2EAdminDatabaseUrl,
  localE2ESupabaseEnvironment,
} from "../e2e/support/local-database-access";

describe("local E2E owner database URL", () => {
  it("accepts only the fixed local Supabase target", () => {
    const url = new URL(
      localE2EOwnerDatabaseUrl("postgresql://owner:secret@127.0.0.1:55322/postgres"),
    );
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toBe("55322");
    expect(url.pathname).toBe("/postgres");
  });

  it("rejects a remote database target", () => {
    expect(() =>
      localE2EOwnerDatabaseUrl("postgresql://owner:secret@db.example.com:5432/postgres"),
    ).toThrow("fixed loopback Supabase database");
  });

  it("accepts only the local Supabase administrator role", () => {
    expect(
      localE2EAdminDatabaseUrl("postgresql://supabase_admin:secret@127.0.0.1:55322/postgres"),
    ).toContain("supabase_admin");
    expect(() =>
      localE2EAdminDatabaseUrl("postgresql://postgres:secret@127.0.0.1:55322/postgres"),
    ).toThrow("administrator role");
  });

  it("maps only the fixed local Supabase API", () => {
    const mapped = localE2ESupabaseEnvironment({
      E2E_LOCAL_SUPABASE_URL: "http://127.0.0.1:55321",
      E2E_LOCAL_SUPABASE_ANON_KEY: "local-anon",
      E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: "local-service",
    });
    expect(mapped.SUPABASE_URL).toBe("http://127.0.0.1:55321/");
    expect(mapped.VITE_SUPABASE_URL).toBe("http://127.0.0.1:55321/");
    expect(mapped.VITE_SUPABASE_ANON_KEY).toBe("local-anon");
    expect(mapped.SUPABASE_SERVICE_ROLE_KEY).toBe("local-service");
  });

  it("rejects a remote Supabase API", () => {
    expect(() =>
      localE2ESupabaseEnvironment({
        E2E_LOCAL_SUPABASE_URL: "https://example.supabase.co",
        E2E_LOCAL_SUPABASE_ANON_KEY: "anon",
        E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: "service",
      }),
    ).toThrow("fixed loopback Supabase API");
  });
});
