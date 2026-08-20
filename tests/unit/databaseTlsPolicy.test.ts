import { describe, expect, it } from "vitest";
import { resolveDatabaseTlsPolicy } from "../../server/lib/databaseTlsPolicy";

describe("database TLS policy", () => {
  it("rejects production without certificate verification", () => {
    expect(() =>
      resolveDatabaseTlsPolicy({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:secret@db.example.com/postgres",
      }),
    ).toThrow("Production database TLS requires certificate verification");
  });

  it("rejects an explicit permissive production setting", () => {
    expect(() =>
      resolveDatabaseTlsPolicy({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:secret@db.example.com/postgres",
        DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
      }),
    ).toThrow("Production database TLS requires certificate verification");
  });

  it("uses the Node CA bundle when production enables verification", () => {
    expect(
      resolveDatabaseTlsPolicy({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:secret@db.example.com/postgres",
        DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
      }),
    ).toEqual({ mode: "default-ca", rejectUnauthorized: true });
  });

  it("uses the custom CA when production provides its path", () => {
    expect(
      resolveDatabaseTlsPolicy({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:secret@db.example.com/postgres",
        DATABASE_CA_CERT_PATH: "C:/certs/supabase-ca.crt",
      }),
    ).toEqual({
      mode: "custom-ca",
      caPath: "C:/certs/supabase-ca.crt",
      rejectUnauthorized: true,
    });
  });

  it("allows permissive TLS in development and tests", () => {
    const databaseUrl = "postgresql://user:secret@localhost/postgres";

    expect(
      resolveDatabaseTlsPolicy({ NODE_ENV: "development", DATABASE_URL: databaseUrl }),
    ).toEqual({ mode: "permissive", rejectUnauthorized: false });
    expect(resolveDatabaseTlsPolicy({ NODE_ENV: "test", DATABASE_URL: databaseUrl })).toEqual({
      mode: "permissive",
      rejectUnauthorized: false,
    });
  });

  it("rejects URL settings that replace the verified TLS object", () => {
    expect(() =>
      resolveDatabaseTlsPolicy({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:secret@db.example.com/postgres?sslmode=require",
        DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
      }),
    ).toThrow("DATABASE_URL must not include TLS parameters");
  });

  it.each(["ssl=false", "ssl=0", "ssl=true", "sslnegotiation=direct"])(
    "rejects the %s URL setting",
    (parameter) => {
      expect(() =>
        resolveDatabaseTlsPolicy({
          NODE_ENV: "production",
          DATABASE_URL: `postgresql://user:secret@db.example.com/postgres?${parameter}`,
          DATABASE_SSL_REJECT_UNAUTHORIZED: "true",
        }),
      ).toThrow("DATABASE_URL must not include TLS parameters");
    },
  );
});
