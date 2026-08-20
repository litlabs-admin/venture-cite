import "dotenv/config";
import { supabaseAdmin } from "./server/supabase";
// A magic link, NOT a password change: single-use, and it does not lock the
// customer out of his own account.
const { data, error } = await supabaseAdmin.auth.admin.generateLink({
  type: "magiclink",
  email: "damienwoods7@gmail.com",
  options: { redirectTo: "http://localhost:5000/dashboard" },
});
if (error) throw new Error(error.message);
console.log("ACTION_LINK:", data.properties?.action_link);
console.log("TOKEN_HASH :", data.properties?.hashed_token);
