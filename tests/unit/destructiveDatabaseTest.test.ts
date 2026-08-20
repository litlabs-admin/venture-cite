import { describe, expect, it } from "vitest";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

describe("configureDestructiveDatabaseTest", () => {
  it("uses TEST_DATABASE_URL instead of DATABASE_URL", () => {
    const env = {
      DATABASE_URL: "postgres://app:secret@db.example.com:5432/app",
      TEST_DATABASE_URL: "postgres://test:secret@localhost:5432/venturecite_test",
    };

    expect(configureDestructiveDatabaseTest(env)).toEqual({ kind: "ready" });
    expect(env.DATABASE_URL).toBe(env.TEST_DATABASE_URL);
  });

  it("skips when TEST_DATABASE_URL is absent", () => {
    const env = { DATABASE_URL: "postgres://app:secret@db.example.com:5432/app" };

    expect(configureDestructiveDatabaseTest(env)).toEqual({ kind: "skip" });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("rejects the normal database URL", () => {
    const url = "postgres://app:secret@db.example.com:5432/venturecite_test";

    expect(() =>
      configureDestructiveDatabaseTest({ DATABASE_URL: url, TEST_DATABASE_URL: url }),
    ).toThrow("TEST_DATABASE_URL must differ from DATABASE_URL");
  });

  it("rejects the normal database through the default PostgreSQL port", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        DATABASE_URL: "postgres://app:secret@localhost/venturecite_test",
        TEST_DATABASE_URL: "postgresql://test:secret@127.0.0.1:5432/venturecite_test",
      }),
    ).toThrow("TEST_DATABASE_URL must differ from DATABASE_URL");
  });

  it("rejects a test URL whose database name lacks test", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        TEST_DATABASE_URL: "postgres://test:secret@localhost:5432/venturecite",
      }),
    ).toThrow("TEST_DATABASE_URL must name a test database");
  });

  it("rejects an incidental test substring in a database name", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        TEST_DATABASE_URL: "postgres://test:secret@localhost:5432/latest",
      }),
    ).toThrow("TEST_DATABASE_URL must name a test database");
  });

  it("permits a database name with a test boundary", () => {
    const env = {
      TEST_DATABASE_URL: "postgres://test:secret@localhost:5432/test_venturecite",
    };

    expect(configureDestructiveDatabaseTest(env)).toEqual({ kind: "ready" });
    expect(env.DATABASE_URL).toBe(env.TEST_DATABASE_URL);
  });

  it("rejects a production-like host", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        TEST_DATABASE_URL: "postgres://test:secret@production-db.example.com:5432/venturecite_test",
      }),
    ).toThrow("TEST_DATABASE_URL must name a test database");
  });

  it("rejects a remote test database without explicit approval", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        TEST_DATABASE_URL: "postgres://test:secret@test-db.example.com:5432/venturecite_test",
      }),
    ).toThrow("TEST_DATABASE_URL must use a loopback host");
  });

  it("permits an approved remote test database", () => {
    const env = {
      ALLOW_REMOTE_TEST_DATABASE: "1",
      TEST_DATABASE_URL: "postgres://test:secret@test-db.example.com:5432/venturecite_test",
    };

    expect(configureDestructiveDatabaseTest(env)).toEqual({ kind: "ready" });
    expect(env.DATABASE_URL).toBe(env.TEST_DATABASE_URL);
  });

  it("permits the local Supabase database with explicit approval", () => {
    const env = {
      LOCAL_SUPABASE_TEST: "1",
      TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
    };

    expect(configureDestructiveDatabaseTest(env)).toEqual({ kind: "ready" });
    expect(env.DATABASE_URL).toBe(env.TEST_DATABASE_URL);
  });

  it("rejects the local Supabase database without explicit approval", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
      }),
    ).toThrow("TEST_DATABASE_URL must name a test database");
  });

  it("rejects the local Supabase database on the default local port", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        LOCAL_SUPABASE_TEST: "1",
        TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      }),
    ).toThrow("TEST_DATABASE_URL must name a test database");
  });

  it("rejects the local Supabase database on a remote host", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        LOCAL_SUPABASE_TEST: "1",
        TEST_DATABASE_URL: "postgresql://postgres:postgres@test-db.example.com:55322/postgres",
      }),
    ).toThrow("TEST_DATABASE_URL must name a test database");
  });

  it("rejects another database on the local Supabase port", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        LOCAL_SUPABASE_TEST: "1",
        TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55322/venturecite",
      }),
    ).toThrow("TEST_DATABASE_URL must name a test database");
  });

  it("rejects another loopback host for the local Supabase database", () => {
    expect(() =>
      configureDestructiveDatabaseTest({
        LOCAL_SUPABASE_TEST: "1",
        TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.2:55322/postgres",
      }),
    ).toThrow("TEST_DATABASE_URL must name a test database");
  });
});
