import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import {
  runReleaseEnvironmentPreflight,
  type PreflightEnvironment,
} from "../../scripts/releaseEnvironmentPreflight";

const leafCertificate = `-----BEGIN CERTIFICATE-----
MIIDETCCAfmgAwIBAgIULmkx2+Y/jTw/U/3mlAC0vF78uAYwDQYJKoZIhvcNAQEL
BQAwGzEZMBcGA1UEAwwQbGVhZi5leGFtcGxlLmNvbTAeFw0yNjA4MjAxNTM1MjBa
Fw0yNjA4MjExNTM1MjBaMBsxGTAXBgNVBAMMEGxlYWYuZXhhbXBsZS5jb20wggEi
MA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDpp/wZatLhIjVTiFtrZefHDIkC
r7F+YYFpOkG8sVAzVEqpBeJsTN5Knq9h8Xb7sw0svnamQ8MPzf+rYrLBXwAUSkMB
LuNk9dY+ojZkTnd3hcJYHRYkTi2DhmZXChryQa2L061Qe0Aio611HWIOJjD7e/S4
wCMzVpoHNG8sFa9IdgxFqGZPgADbHgsLSobMh07tBm4oYeB5pEVVQhMKSHp6yYb/
hEA8Se85p5D24w7JptHfmABRhXG2h1sPuL7gVhJt1rSG/gz2yt83t1XvsAmvDRZ4
8F6SeXeNUNXEhEU8vjucGuxFpgk7mG+ahsjkvi59T/RoaMIzt+pfI6hNA7TzAgMB
AAGjTTBLMB0GA1UdDgQWBBThDJkUeCNI32fQTLH03brXO9yK4DAfBgNVHSMEGDAW
gBThDJkUeCNI32fQTLH03brXO9yK4DAJBgNVHRMEAjAAMA0GCSqGSIb3DQEBCwUA
A4IBAQBeHGJ9s6ZgOB0rf8GODY7RN8k6Z3dLAqXIwpgkWAuJAIlq76KZ8dLT18Wp
V+alkTY/xA/NS0QV6nZhBzIJWl2IFe7pl7B7cvfJuHQnEwUeTpXK9vBreBsWsN8Y
Mpag5n2BNOWIy28dxVn5LI5YqN0Ao3X/uUMr0wIJePkQ5Exbac4JpJaLQN58hv2u
rWt8cC1YnakP10hWTAnEitIXWgQ0SPIcL9jXAJu+czlAtfJI0HGsYzJaArlhrdPf
+qBOWmqDUZ/+v7a5UfwHRK8KAMcO+atpiijcED7lMT6rYjVqiBXASS/Mc9xSrs9S
M3Jme4qMpqHYEvOT1sw7OUOeka1F
-----END CERTIFICATE-----`;

function certificatePath(contents = rootCertificates[0]): { path: string; remove: () => void } {
  const directory = mkdtempSync(join(tmpdir(), "venturecite-preflight-"));
  const path = join(directory, "certificate.pem");
  writeFileSync(path, contents);
  return { path, remove: () => rmSync(directory, { recursive: true, force: true }) };
}

function validEnvironment(caPath: string): PreflightEnvironment {
  return {
    DATABASE_CA_CERT_PATH: caPath,
    DATABASE_URL: "postgresql://venturecite_runtime:secret@pooler.example.com:6543/postgres",
    DATABASE_DIRECT_URL: "postgresql://user:secret@db.example.com/postgres",
    DATABASE_RUNTIME_ROLE_NAME: "venturecite_runtime",
    STRIPE_PRO_PRODUCT_ID: "prod_pro",
    STRIPE_PRO_PRICE_ID: "price_pro",
    STRIPE_AGENCY_PRODUCT_ID: "prod_agency",
    STRIPE_AGENCY_PRICE_ID: "price_agency",
    STRIPE_SECRET_KEY: "sk_live_secret",
    STRIPE_PUBLISHABLE_KEY: "pk_live_publishable",
    RESEND_API_KEY: "re_secret",
    RESEND_FROM_ADDRESS: "VentureCite <reports@example.com>",
    BUFFER_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    OPENAI_API_KEY: "sk-openai",
    OPENROUTER_API_KEY: "sk-or-router",
    DISABLE_IN_PROCESS_SCHEDULER: "true",
    EXTERNAL_CRON_ORCHESTRATOR_ENABLED: "true",
    APP_URL: "https://app.example.com",
  };
}

describe("release environment preflight", () => {
  it("reports only safe configuration classes", () => {
    const certificate = certificatePath();
    try {
      const report = runReleaseEnvironmentPreflight(validEnvironment(certificate.path));
      expect(report.passed).toBe(true);
      expect(report.checks.find((item) => item.name === "DATABASE_CA_CERT_PATH")).toMatchObject({
        presence: "present",
        formatClass: "x509-certificate",
        passed: true,
      });
      expect(JSON.stringify(report)).not.toContain(certificate.path);
      expect(JSON.stringify(report)).not.toContain("sk_live_secret");
      expect(JSON.stringify(report)).not.toContain("venturecite_runtime");
    } finally {
      certificate.remove();
    }
  });

  it("rejects Stripe test keys and URL TLS overrides", () => {
    const report = runReleaseEnvironmentPreflight({
      ...validEnvironment("missing-certificate"),
      DATABASE_DIRECT_URL: "postgres://user:secret@db.example.com/postgres?sslmode=require",
      STRIPE_SECRET_KEY: "sk_test_secret",
      STRIPE_PUBLISHABLE_KEY: "pk_test_publishable",
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((item) => item.name === "STRIPE_SECRET_KEY")).toMatchObject({
      formatClass: "test-secret",
      passed: false,
    });
    expect(report.checks.find((item) => item.name === "DATABASE_DIRECT_URL")).toMatchObject({
      formatClass: "tls-query-parameter",
      passed: false,
    });
  });

  it("requires a valid runtime database role identifier", () => {
    const report = runReleaseEnvironmentPreflight({
      ...validEnvironment("missing-certificate"),
      DATABASE_RUNTIME_ROLE_NAME: "bad role; select 1",
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((item) => item.name === "DATABASE_RUNTIME_ROLE_NAME")).toMatchObject({
      presence: "present",
      formatClass: "invalid-identifier",
      passed: false,
    });
    expect(JSON.stringify(report)).not.toContain("bad role; select 1");
  });

  it("requires DATABASE_URL to name the configured runtime role", () => {
    const report = runReleaseEnvironmentPreflight({
      ...validEnvironment("missing-certificate"),
      DATABASE_URL: "postgresql://other_runtime:secret@pooler.example.com:6543/postgres",
    });
    expect(report.checks.find((item) => item.name === "DATABASE_URL")).toMatchObject({
      formatClass: "invalid-runtime-target",
      passed: false,
    });
    expect(JSON.stringify(report)).not.toContain("other_runtime");
  });

  it("rejects a mismatched scheduler pair and unsafe origin", () => {
    const report = runReleaseEnvironmentPreflight({
      ...validEnvironment("missing-certificate"),
      DISABLE_IN_PROCESS_SCHEDULER: "true",
      EXTERNAL_CRON_ORCHESTRATOR_ENABLED: "false",
      APP_URL: "http://localhost:5000",
    });
    expect(report.checks.find((item) => item.name === "SCHEDULER_FLAGS")).toMatchObject({
      formatClass: "invalid-pair",
      passed: false,
    });
    expect(report.checks.find((item) => item.name === "APP_URL")).toMatchObject({
      formatClass: "invalid",
      passed: false,
    });
  });

  it("rejects transaction poolers, leaf certificates, and non-origin APP_URL values", () => {
    const certificate = certificatePath(leafCertificate);
    try {
      const report = runReleaseEnvironmentPreflight({
        ...validEnvironment(certificate.path),
        DATABASE_DIRECT_URL: "postgresql://user:secret@db.example.com:6543/postgres",
        APP_URL: "https://app.example.com/path?query=value#fragment",
      });
      expect(report.passed).toBe(false);
      expect(report.checks.find((item) => item.name === "DATABASE_DIRECT_URL")).toMatchObject({
        formatClass: "transaction-pooler-url",
        passed: false,
      });
      expect(report.checks.find((item) => item.name === "DATABASE_CA_CERT_PATH")).toMatchObject({
        formatClass: "not-ca-certificate",
        passed: false,
      });
      expect(report.checks.find((item) => item.name === "APP_URL")).toMatchObject({
        formatClass: "invalid",
        passed: false,
      });
    } finally {
      certificate.remove();
    }
  });

  it("rejects pooler hostnames even when they use the default PostgreSQL port", () => {
    const report = runReleaseEnvironmentPreflight({
      ...validEnvironment("missing-certificate"),
      DATABASE_DIRECT_URL: "postgresql://user:secret@pooler.example.com/postgres",
    });
    expect(report.checks.find((item) => item.name === "DATABASE_DIRECT_URL")).toMatchObject({
      formatClass: "transaction-pooler-url",
      passed: false,
    });
  });

  it("redacts sentinel configuration values from the report", () => {
    const certificate = certificatePath();
    const sentinels = [
      certificate.path,
      "postgresql://release-user:direct-url-secret@db.example.com/postgres",
      "prod_sentinel_product",
      "price_sentinel_price",
      "sk_live_sentinel_secret",
      "pk_live_sentinel_publishable",
      "re_sentinel_resend",
      "VentureCite <sentinel@example.com>",
      Buffer.alloc(32, 9).toString("base64"),
      "sk-sentinel-openai",
      "sk-or-sentinel-openrouter",
      "https://sentinel.example.com",
    ];
    try {
      const report = runReleaseEnvironmentPreflight({
        ...validEnvironment(certificate.path),
        DATABASE_DIRECT_URL: sentinels[1],
        STRIPE_PRO_PRODUCT_ID: sentinels[2],
        STRIPE_PRO_PRICE_ID: sentinels[3],
        STRIPE_AGENCY_PRODUCT_ID: sentinels[2],
        STRIPE_AGENCY_PRICE_ID: sentinels[3],
        STRIPE_SECRET_KEY: sentinels[4],
        STRIPE_PUBLISHABLE_KEY: sentinels[5],
        RESEND_API_KEY: sentinels[6],
        RESEND_FROM_ADDRESS: sentinels[7],
        BUFFER_ENCRYPTION_KEY: sentinels[8],
        OPENAI_API_KEY: sentinels[9],
        OPENROUTER_API_KEY: sentinels[10],
        APP_URL: sentinels[11],
      });
      const output = JSON.stringify(report);
      for (const sentinel of sentinels) expect(output).not.toContain(sentinel);
    } finally {
      certificate.remove();
    }
  });
});
