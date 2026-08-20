import "dotenv/config";
import { writeFileSync } from "node:fs";
import { supabaseAdmin } from "./server/supabase";
const SUPA = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? "";
const { data, error } = await supabaseAdmin.auth.admin.generateLink({
  type: "magiclink", email: "damienwoods7@gmail.com",
});
if (error) throw new Error(error.message);
const r = await fetch(`${SUPA}/auth/v1/verify`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: data.properties?.hashed_token }),
});
const s = await r.json();
if (!s.access_token) throw new Error("verify failed");
writeFileSync("session.local.json", JSON.stringify(s));
console.log("ok, user:", s.user?.email, "| bytes:", JSON.stringify(s).length);
