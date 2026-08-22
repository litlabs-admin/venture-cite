import { existsSync, readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";

export type PreflightEnvironment = Record<string, string | undefined>;

export type PreflightCheck = {
  name: string;
  presence: "present" | "missing";
  formatClass: string;
  passed: boolean;
};

export type ReleaseEnvironmentPreflight = {
  passed: boolean;
  checks: PreflightCheck[];
};

const stripeCatalog = [
  ["STRIPE_PRO_PRODUCT_ID", "prod_"],
  ["STRIPE_PRO_PRICE_ID", "price_"],
  ["STRIPE_AGENCY_PRODUCT_ID", "prod_"],
  ["STRIPE_AGENCY_PRICE_ID", "price_"],
] as const;

const postgresIdentifier = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

function valueOf(environment: PreflightEnvironment, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value ? value : undefined;
}

function present(value: string | undefined): "present" | "missing" {
  return value ? "present" : "missing";
}

function check(
  name: string,
  value: string | undefined,
  formatClass: string,
  passed: boolean,
): PreflightCheck {
  return { name, presence: present(value), formatClass, passed };
}

function postgresUrlClass(value: string | undefined): { formatClass: string; passed: boolean } {
  if (!value) return { formatClass: "missing", passed: false };
  try {
    const url = new URL(value);
    const hasTlsParameter = [...url.searchParams.keys()].some((key) =>
      ["ssl", "sslcert", "sslkey", "sslmode", "sslnegotiation", "sslrootcert"].includes(
        key.toLowerCase(),
      ),
    );
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
      return { formatClass: "invalid", passed: false };
    }
    const hostName = url.hostname.toLowerCase();
    const isPoolerHost = /(^|[.-])(pooler|pgbouncer|supavisor)([.-]|$)/.test(hostName);
    if (["6432", "6543"].includes(url.port) || (isPoolerHost && url.port !== "5432")) {
      return { formatClass: "transaction-pooler-url", passed: false };
    }
    if (hasTlsParameter) return { formatClass: "tls-query-parameter", passed: false };
    return isPoolerHost
      ? { formatClass: "session-pooler-url", passed: true }
      : { formatClass: "postgres-url", passed: true };
  } catch {
    return { formatClass: "invalid", passed: false };
  }
}

function runtimeDatabaseUrlClass(
  value: string | undefined,
  runtimeRole: string | undefined,
): { formatClass: string; passed: boolean } {
  if (!value) return { formatClass: "missing", passed: false };
  if (!runtimeRole) return { formatClass: "runtime-role-missing", passed: false };
  try {
    const url = new URL(value);
    const hasTlsParameter = [...url.searchParams.keys()].some((key) =>
      ["ssl", "sslcert", "sslkey", "sslmode", "sslnegotiation", "sslrootcert"].includes(
        key.toLowerCase(),
      ),
    );
    return ["postgres:", "postgresql:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !hasTlsParameter &&
      decodeURIComponent(url.username) === runtimeRole
      ? { formatClass: "runtime-postgres-url", passed: true }
      : { formatClass: "invalid-runtime-target", passed: false };
  } catch {
    return { formatClass: "invalid-runtime-target", passed: false };
  }
}

function certificateClass(value: string | undefined): { formatClass: string; passed: boolean } {
  if (!value) return { formatClass: "missing", passed: false };
  if (!existsSync(value)) return { formatClass: "unreadable", passed: false };
  try {
    const certificate = new X509Certificate(readFileSync(value));
    if (!certificate.ca) return { formatClass: "not-ca-certificate", passed: false };
    return { formatClass: "x509-certificate", passed: true };
  } catch {
    return { formatClass: "invalid-certificate", passed: false };
  }
}

function stripeSecretClass(value: string | undefined): { formatClass: string; passed: boolean } {
  if (!value) return { formatClass: "missing", passed: false };
  if (value.startsWith("sk_live_")) return { formatClass: "live-secret", passed: true };
  if (value.startsWith("sk_test_")) return { formatClass: "test-secret", passed: false };
  return { formatClass: "invalid", passed: false };
}

function stripePublishableClass(value: string | undefined): {
  formatClass: string;
  passed: boolean;
} {
  if (!value) return { formatClass: "missing", passed: false };
  if (value.startsWith("pk_live_")) return { formatClass: "live-publishable", passed: true };
  if (value.startsWith("pk_test_")) return { formatClass: "test-publishable", passed: false };
  return { formatClass: "invalid", passed: false };
}

function base64KeyClass(value: string | undefined): { formatClass: string; passed: boolean } {
  if (!value) return { formatClass: "missing", passed: false };
  const decoded = Buffer.from(value, "base64");
  const normalized = decoded.toString("base64").replace(/=+$/, "");
  const supplied = value.replace(/=+$/, "");
  return normalized === supplied && decoded.length === 32
    ? { formatClass: "base64-32-bytes", passed: true }
    : { formatClass: "invalid", passed: false };
}

function appOriginClass(value: string | undefined): { formatClass: string; passed: boolean } {
  if (!value) return { formatClass: "missing", passed: false };
  try {
    const url = new URL(value);
    const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" &&
      !localHost &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? { formatClass: "https-origin", passed: true }
      : { formatClass: "invalid", passed: false };
  } catch {
    return { formatClass: "invalid", passed: false };
  }
}

function senderClass(value: string | undefined): { formatClass: string; passed: boolean } {
  if (!value) return { formatClass: "missing", passed: false };
  const email = value.match(/(?:<)?([^<>\s]+@[^<>\s]+)(?:>)?$/)?.[1];
  return email
    ? { formatClass: "email-sender", passed: true }
    : { formatClass: "invalid", passed: false };
}

function schedulerClass(environment: PreflightEnvironment): {
  formatClass: string;
  passed: boolean;
} {
  const disabled = valueOf(environment, "DISABLE_IN_PROCESS_SCHEDULER");
  const external = valueOf(environment, "EXTERNAL_CRON_ORCHESTRATOR_ENABLED");
  const isTrue = (value: string | undefined) => value === "true";
  const isFalse = (value: string | undefined) => value === undefined || value === "false";
  if ((isTrue(disabled) && isTrue(external)) || (isFalse(disabled) && isFalse(external))) {
    return { formatClass: isTrue(disabled) ? "external-owner" : "in-process-owner", passed: true };
  }
  return { formatClass: "invalid-pair", passed: false };
}

function runtimeRoleClass(value: string | undefined): { formatClass: string; passed: boolean } {
  if (!value) return { formatClass: "missing", passed: false };
  return postgresIdentifier.test(value)
    ? { formatClass: "postgres-identifier", passed: true }
    : { formatClass: "invalid-identifier", passed: false };
}

export function runReleaseEnvironmentPreflight(
  environment: PreflightEnvironment = process.env,
): ReleaseEnvironmentPreflight {
  const checks: PreflightCheck[] = [];
  const add = (
    name: string,
    value: string | undefined,
    result: { formatClass: string; passed: boolean },
  ) => checks.push(check(name, value, result.formatClass, result.passed));

  const databaseCa = valueOf(environment, "DATABASE_CA_CERT_PATH");
  add("DATABASE_CA_CERT_PATH", databaseCa, certificateClass(databaseCa));
  const runtimeRole = valueOf(environment, "DATABASE_RUNTIME_ROLE_NAME");
  add("DATABASE_RUNTIME_ROLE_NAME", runtimeRole, runtimeRoleClass(runtimeRole));
  const databaseUrl = valueOf(environment, "DATABASE_URL");
  add("DATABASE_URL", databaseUrl, runtimeDatabaseUrlClass(databaseUrl, runtimeRole));
  const directUrl = valueOf(environment, "DATABASE_DIRECT_URL");
  add("DATABASE_DIRECT_URL", directUrl, postgresUrlClass(directUrl));

  for (const [name, prefix] of stripeCatalog) {
    const value = valueOf(environment, name);
    add(name, value, {
      formatClass: !value ? "missing" : value.startsWith(prefix) ? "catalog-id" : "invalid",
      passed: Boolean(value?.startsWith(prefix)),
    });
  }

  const stripeSecret = valueOf(environment, "STRIPE_SECRET_KEY");
  add("STRIPE_SECRET_KEY", stripeSecret, stripeSecretClass(stripeSecret));
  const stripePublishable =
    valueOf(environment, "STRIPE_PUBLISHABLE_KEY") ??
    valueOf(environment, "VITE_STRIPE_PUBLISHABLE_KEY");
  add("STRIPE_PUBLISHABLE_KEY", stripePublishable, stripePublishableClass(stripePublishable));

  const resendKey = valueOf(environment, "RESEND_API_KEY");
  add("RESEND_API_KEY", resendKey, {
    formatClass: !resendKey ? "missing" : resendKey.startsWith("re_") ? "resend-key" : "invalid",
    passed: Boolean(resendKey?.startsWith("re_")),
  });
  const resendSender = valueOf(environment, "RESEND_FROM_ADDRESS");
  add("RESEND_FROM_ADDRESS", resendSender, senderClass(resendSender));

  const bufferKey = valueOf(environment, "BUFFER_ENCRYPTION_KEY");
  add("BUFFER_ENCRYPTION_KEY", bufferKey, base64KeyClass(bufferKey));

  const openAiKey = valueOf(environment, "OPENAI_API_KEY");
  add("OPENAI_API_KEY", openAiKey, {
    formatClass: !openAiKey ? "missing" : openAiKey.startsWith("sk-") ? "openai-key" : "invalid",
    passed: Boolean(openAiKey?.startsWith("sk-")),
  });
  const openRouterKey = valueOf(environment, "OPENROUTER_API_KEY");
  add("OPENROUTER_API_KEY", openRouterKey, {
    formatClass: !openRouterKey
      ? "missing"
      : openRouterKey.startsWith("sk-or-")
        ? "openrouter-key"
        : "invalid",
    passed: Boolean(openRouterKey?.startsWith("sk-or-")),
  });

  const schedulerResult = schedulerClass(environment);
  checks.push({
    name: "SCHEDULER_FLAGS",
    presence:
      valueOf(environment, "DISABLE_IN_PROCESS_SCHEDULER") ||
      valueOf(environment, "EXTERNAL_CRON_ORCHESTRATOR_ENABLED")
        ? "present"
        : "missing",
    ...schedulerResult,
  });

  const appUrl = valueOf(environment, "APP_URL");
  add("APP_URL", appUrl, appOriginClass(appUrl));
  return { passed: checks.every((entry) => entry.passed), checks };
}

export function runMigrationBootstrapPreflight(
  environment: PreflightEnvironment = process.env,
): ReleaseEnvironmentPreflight {
  const databaseCa = valueOf(environment, "DATABASE_CA_CERT_PATH");
  const directUrl = valueOf(environment, "DATABASE_DIRECT_URL");
  const databaseCaResult = certificateClass(databaseCa);
  const directUrlResult = postgresUrlClass(directUrl);
  const checks = [
    check(
      "DATABASE_CA_CERT_PATH",
      databaseCa,
      databaseCaResult.formatClass,
      databaseCaResult.passed,
    ),
    check("DATABASE_DIRECT_URL", directUrl, directUrlResult.formatClass, directUrlResult.passed),
  ];
  return { passed: checks.every((item) => item.passed), checks };
}

function main(): void {
  const report = runReleaseEnvironmentPreflight();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (import.meta.main) main();
