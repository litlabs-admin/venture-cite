import { afterEach, describe, expect, it } from "vitest";
import { assertLocalDatabase } from "../../scripts/assert-local-db";

const originalDirectUrl = process.env.DATABASE_DIRECT_URL;

describe("assertLocalDatabase", () => {
  afterEach(() => {
    if (originalDirectUrl === undefined) {
      delete process.env.DATABASE_DIRECT_URL;
    } else {
      process.env.DATABASE_DIRECT_URL = originalDirectUrl;
    }
  });

  it("accepts a local host", () => {
    expect(() =>
      assertLocalDatabase("postgresql://postgres:postgres@127.0.0.1:55322/postgres"),
    ).not.toThrow();
  });

  it("accepts a loopback IPv6 host", () => {
    expect(() =>
      assertLocalDatabase("postgresql://postgres:postgres@[::1]:55322/postgres"),
    ).not.toThrow();
  });

  it("rejects the production pooler and names the offending host", () => {
    expect(() =>
      assertLocalDatabase(
        "postgresql://u:p@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres",
      ),
    ).toThrow(/host: aws-1-ap-southeast-1\.pooler\.supabase\.com/);
  });

  it("rejects an absent url", () => {
    expect(() => assertLocalDatabase(undefined)).toThrow(/DATABASE_URL is not set/i);
  });

  it("rejects a production DATABASE_DIRECT_URL even when DATABASE_URL is local", () => {
    process.env.DATABASE_DIRECT_URL =
      "postgresql://u:p@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

    expect(() =>
      assertLocalDatabase("postgresql://postgres:postgres@127.0.0.1:55322/postgres"),
    ).toThrow(/DATABASE_DIRECT_URL/);
  });

  it("accepts a local DATABASE_DIRECT_URL alongside a local DATABASE_URL", () => {
    process.env.DATABASE_DIRECT_URL = "postgresql://postgres:postgres@localhost:5432/postgres";

    expect(() =>
      assertLocalDatabase("postgresql://postgres:postgres@127.0.0.1:55322/postgres"),
    ).not.toThrow();
  });
});
