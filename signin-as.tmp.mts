// Prints a console snippet that signs the local app in as a given user.
//
// Uses a single-use magic-link token, never a password change, so the real
// account is untouched and nobody gets locked out.
//
// Usage: npx tsx signin-as.tmp.mts [email]
import "dotenv/config";
import { supabaseAdmin } from "./server/supabase";

const email = process.argv[2] || "damienwoods7@gmail.com";
const SUPA = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const ref = SUPA.replace("https://", "").split(".")[0];

const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
if (error) throw new Error(error.message);

const res = await fetch(`${SUPA}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: data.properties?.hashed_token }),
});
const session = await res.json();
if (!session.access_token) throw new Error("verify failed: " + JSON.stringify(session).slice(0, 200));

console.log(`\nSigned in as: ${session.user?.email}\n`);
console.log("Open http://localhost:5000 , then paste this into the browser console:\n");
console.log(
  `localStorage.setItem(${JSON.stringify(`sb-${ref}-auth-token`)}, ${JSON.stringify(
    JSON.stringify(session),
  )}); location.href = "/dashboard";`,
);
console.log("");
