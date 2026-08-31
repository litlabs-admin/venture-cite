import { describe, expect, it } from "vitest";
import { assertLocalDrizzlePushTarget } from "../../scripts/guardDrizzlePush";

describe("assertLocalDrizzlePushTarget", () => {
  it("refuses a remote DATABASE_URL", () => {
    expect(() =>
      assertLocalDrizzlePushTarget("postgres://app:secret@db.example.com:5432/venturecite"),
    ).toThrow("drizzle-kit push refused");
  });

  it("refuses a missing DATABASE_URL", () => {
    expect(() => assertLocalDrizzlePushTarget(undefined)).toThrow(
      "DATABASE_URL, ensure the database is provisioned",
    );
  });

  it("allows a loopback DATABASE_URL", () => {
    expect(() =>
      assertLocalDrizzlePushTarget("postgres://postgres:postgres@127.0.0.1:5432/venturecite"),
    ).not.toThrow();
  });

  it("allows localhost by name", () => {
    expect(() =>
      assertLocalDrizzlePushTarget("postgres://postgres:postgres@localhost:5432/venturecite"),
    ).not.toThrow();
  });
});
