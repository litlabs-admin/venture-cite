// Dedicated Supabase client for USER CREDENTIAL operations: verifying a
// password (signInWithPassword) and minting a user session at login.
//
// It is deliberately SEPARATE from supabaseAdmin. supabase-js stores the
// session returned by signInWithPassword on the calling client and then uses
// that user JWT — not the apikey — as the Authorization header for subsequent
// Storage / PostgREST requests:
//   https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z
// Calling signInWithPassword on supabaseAdmin therefore "poisons" it — the next
// server-side Storage upload (logoStorage.ts) runs as `authenticated` instead
// of `service_role` and fails RLS with "new row violates row-level security
// policy". Keeping all credential checks on this client guarantees
// supabaseAdmin's Authorization header stays the service key.
//
// Invariant: this client is used ONLY to verify credentials / mint a session,
// NEVER for Storage or table I/O. Because we only consume the per-call return
// value (not the client's mutable session), concurrent use is safe.
//
// Key choice: sign-in needs no elevated privilege, so we prefer the anon key
// (least privilege). We fall back to the service-role key only when the anon
// key isn't set in the server env — that still works, and the poisoning is
// harmless here because this client never touches Storage or tables.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const authKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !authKey) {
  throw new Error(
    "supabaseAuth: SUPABASE_URL and (VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY) are required",
  );
}

export const supabaseAuth = createClient(url, authKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
