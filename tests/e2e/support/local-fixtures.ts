import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import type { APIRequestContext, Page } from "@playwright/test";
import { localE2EOwnerDatabaseUrl } from "./local-database-access";

const localConfigSchema = z.object({
  appUrl: z.string().url(),
  supabaseUrl: z.string().url(),
  anonKey: z.string().min(1),
  serviceRoleKey: z.string().min(1),
  databaseUrl: z.string().url(),
  storageKey: z.string().min(1),
});

const adminUserSchema = z.object({ id: z.string().min(1), email: z.string().email() });

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number(),
  expires_at: z.number().optional(),
  token_type: z.string().min(1),
  user: z.object({ id: z.string().min(1), email: z.string().email() }),
});

const brandSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });

export type LocalE2EConfig = z.infer<typeof localConfigSchema>;

export type LocalAccount = {
  email: string;
  password: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  storageKey: string;
  appUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  databaseUrl: string;
  brandId: string;
  brandName: string;
};

function isLoopbackUrl(value: string): boolean {
  const hostname = new URL(value).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function localE2EConfig(): LocalE2EConfig | null {
  const supabaseUrl = process.env.E2E_LOCAL_SUPABASE_URL;
  try {
    const values = {
      appUrl: process.env.E2E_LOCAL_APP_URL,
      supabaseUrl,
      anonKey: process.env.E2E_LOCAL_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY,
      databaseUrl: process.env.E2E_LOCAL_DATABASE_URL,
      storageKey:
        process.env.E2E_LOCAL_SUPABASE_STORAGE_KEY ??
        (supabaseUrl ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token` : undefined),
    };
    if (Object.values(values).some((value) => !value)) return null;
    const parsed = localConfigSchema.parse(values);
    if (!isLoopbackUrl(parsed.appUrl) || !isLoopbackUrl(parsed.supabaseUrl)) return null;
    // Pin the database the same way tests/e2e/support/local-database-access.ts
    // does for the rest of the local E2E suite: loopback host, fixed local
    // Supabase port, fixed database name. This fixture deletes public.users
    // rows and issues Supabase Auth admin deletes, whose FK cascades remove
    // child rows too, so accepting any loopback database name (as this check
    // used to) would also accept a loopback tunnel into a production mirror.
    localE2EOwnerDatabaseUrl(parsed.databaseUrl);
    return parsed;
  } catch {
    return null;
  }
}

export function localFakeGenerationEnabled(): boolean {
  return process.env.E2E_LOCAL_FAKE_GENERATION === "1";
}

function adminHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };
}

function bearerHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function assertResponse(response: {
  ok(): boolean;
  status(): number;
  text(): Promise<string>;
}) {
  if (response.ok()) return;
  throw new Error(
    `Local E2E request failed with status ${response.status()}: ${await response.text()}`,
  );
}

type LocalAccountCleanup = Pick<
  LocalAccount,
  "databaseUrl" | "supabaseUrl" | "serviceRoleKey" | "userId"
>;

async function cleanupLocalAccountResources(
  request: APIRequestContext,
  account: LocalAccountCleanup,
): Promise<void> {
  const errors: unknown[] = [];
  const pool = new Pool({ connectionString: account.databaseUrl, ssl: false, max: 1 });
  try {
    await pool.query("delete from public.users where id = $1", [account.userId]);
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      await pool.end();
    } catch (error) {
      errors.push(error);
    }
  }

  try {
    const response = await request.delete(
      `${account.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(account.userId)}`,
      {
        headers: adminHeaders(account.serviceRoleKey),
        failOnStatusCode: false,
      },
    );
    if (!response.ok() && response.status() !== 404) {
      errors.push(new Error(`Local E2E auth cleanup failed with status ${response.status()}`));
    }
  } catch (error) {
    errors.push(error);
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, `Local E2E cleanup failed for user ${account.userId}`);
  }
}

export async function createLocalAccount(
  request: APIRequestContext,
  prefix: string,
): Promise<LocalAccount> {
  const config = localE2EConfig();
  if (!config) {
    throw new Error(
      "Local E2E requires loopback E2E_LOCAL_APP_URL, E2E_LOCAL_SUPABASE_URL, " +
        "E2E_LOCAL_SUPABASE_ANON_KEY, and E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const id = randomUUID();
  const email = `${prefix}-${id}@local.test`;
  const password = `LocalE2E-${id}-Safe!`;
  let userId: string | null = null;
  try {
    const createUser = await request.post(`${config.supabaseUrl}/auth/v1/admin/users`, {
      headers: adminHeaders(config.serviceRoleKey),
      data: {
        email,
        password,
        email_confirm: true,
        user_metadata: { firstName: "Local", lastName: "E2E" },
      },
      failOnStatusCode: false,
    });
    await assertResponse(createUser);
    const created = adminUserSchema.parse(await createUser.json());
    userId = created.id;

    const tokenResponse = await request.post(
      `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: config.anonKey, "Content-Type": "application/json" },
        data: { email, password },
        failOnStatusCode: false,
      },
    );
    await assertResponse(tokenResponse);
    const token = tokenSchema.parse(await tokenResponse.json());
    if (token.user.id !== created.id) throw new Error("Local E2E user id changed during login");

    const brandName = `Local E2E Brand ${id.slice(0, 8)}`;
    const brandId = randomUUID();
    const pool = new Pool({ connectionString: config.databaseUrl, ssl: false, max: 1 });
    try {
      await pool.query(
        "update public.users set access_tier = 'agency', articles_used_this_month = 0 where id = $1",
        [created.id],
      );
      const result = await pool.query(
        `insert into public.brands
           (id, user_id, name, company_name, industry, website, description, tone,
            products, key_values, unique_selling_points, name_variations,
            fact_scrape_enabled, auto_citation_schedule)
         values ($1, $2, $3, $3, 'software', 'https://local.test',
                 'A local-only E2E fixture.', 'professional', $4, $5, $6, $7, false, 'off')
         returning id, name`,
        [
          brandId,
          created.id,
          brandName,
          ["Local test product"],
          ["Local test value"],
          ["Local test point"],
          [brandName],
        ],
      );
      const brand = brandSchema.parse(result.rows[0]);
      if (brand.id !== brandId) throw new Error("Local E2E brand insert returned no matching row");

      return {
        email,
        password,
        userId: created.id,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at ?? Math.floor(Date.now() / 1000) + token.expires_in,
        storageKey: config.storageKey,
        appUrl: config.appUrl,
        supabaseUrl: config.supabaseUrl,
        serviceRoleKey: config.serviceRoleKey,
        databaseUrl: config.databaseUrl,
        brandId,
        brandName,
      };
    } finally {
      await pool.end();
    }
  } catch (error) {
    if (userId) {
      try {
        await cleanupLocalAccountResources(request, {
          databaseUrl: config.databaseUrl,
          supabaseUrl: config.supabaseUrl,
          serviceRoleKey: config.serviceRoleKey,
          userId,
        });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Local E2E account setup failed for ${email}, and cleanup failed`,
        );
      }
    }
    throw error;
  }
}

export function localHeaders(account: LocalAccount): Record<string, string> {
  return bearerHeaders(account.accessToken);
}

export async function primeLocalPage(page: Page, account: LocalAccount): Promise<void> {
  await page.addInitScript(
    ({ storageKey, session }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
    },
    {
      storageKey: account.storageKey,
      session: {
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
        token_type: "bearer",
        expires_at: account.expiresAt,
        expires_in: Math.max(1, account.expiresAt - Math.floor(Date.now() / 1000)),
      },
    },
  );
}

export async function deleteLocalAccount(
  request: APIRequestContext,
  account: LocalAccount,
): Promise<void> {
  await cleanupLocalAccountResources(request, account);
}

export async function getLocalUserRow(
  _request: APIRequestContext,
  account: LocalAccount,
): Promise<Record<string, unknown> | null> {
  const pool = new Pool({ connectionString: account.databaseUrl, ssl: false, max: 1 });
  try {
    const result = await pool.query(
      "select id, deleted_at, deletion_scheduled_for from public.users where id = $1",
      [account.userId],
    );
    return result.rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

export async function getLocalBrandRow(
  _request: APIRequestContext,
  account: LocalAccount,
): Promise<Record<string, unknown> | null> {
  const pool = new Pool({ connectionString: account.databaseUrl, ssl: false, max: 1 });
  try {
    const result = await pool.query(
      "select id, deleted_at, deletion_scheduled_for from public.brands where id = $1",
      [account.brandId],
    );
    return result.rows[0] ?? null;
  } finally {
    await pool.end();
  }
}
