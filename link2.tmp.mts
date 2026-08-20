import "dotenv/config";
import { supabaseAdmin } from "./server/supabase";
const { data, error } = await supabaseAdmin.auth.admin.generateLink({
  type: "magiclink",
  email: "damienwoods7@gmail.com",
});
if (error) throw new Error(error.message);
console.log("TOKEN_HASH=" + data.properties?.hashed_token);
console.log("SUPA_URL=" + (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""));
console.log("ANON=" + (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "").slice(0, 12) + "...");
