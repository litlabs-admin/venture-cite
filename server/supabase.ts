import { createClient } from "@supabase/supabase-js";
import { logger } from "./lib/logger";
import { classifyServiceKey } from "./lib/supabaseKey";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required");
}

// supabaseAdmin must run as `service_role` and bypass RLS — it backs auth-admin
// calls (register's admin.createUser, change-password's admin.updateUserById,
// account deletion) and server-side Storage uploads (logoStorage.ts). If the
// anon/publishable key is pasted into this slot — a common deploy mistake now
// that Supabase surfaces publishable/secret keys side by side — every
// privileged op fails at runtime with an opaque RLS 403 ("new row violates
// row-level security policy") instead of an actionable boot error. Verify up
// front: refuse to boot on a provably-wrong key, warn on an unrecognized one.
const verdict = classifyServiceKey(serviceKey);
if (verdict.kind === "rejected") {
  throw new Error(verdict.reason);
}
if (verdict.kind === "unknown") {
  logger.warn(verdict.reason);
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
