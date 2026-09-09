import { describe, expect, it } from "vitest";
import { assertLocalDatabase } from "../../scripts/assert-local-db";

describe("assertLocalDatabase", () => {
  it("accepts a local host", () => {
    expect(() =>
      assertLocalDatabase("postgresql://postgres:postgres@127.0.0.1:55322/postgres"),
    ).not.toThrow();
  });

  it("rejects the production pooler", () => {
    expect(() =>
      assertLocalDatabase(
        "postgresql://u:p@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres",
      ),
    ).toThrow(/refusing to run against a non-local database/i);
  });

  it("rejects an absent url", () => {
    expect(() => assertLocalDatabase(undefined)).toThrow(/DATABASE_URL is not set/i);
  });
});
