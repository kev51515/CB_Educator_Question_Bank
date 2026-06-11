/** Show auth identities for an email — used to verify Google linking.
 *  Run: node --env-file-if-exists=../.env scripts/_check-identities.mjs <email> */
import { createClient } from "@supabase/supabase-js";
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const email = process.argv[2] ?? "kevyao@gmail.com";
let page = 1, found = null;
while (!found && page <= 20) {
  const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error.message); process.exit(1); }
  found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (data.users.length < 200) break;
  page++;
}
if (!found) { console.log("no user with email", email); process.exit(0); }
console.log("user id:", found.id);
console.log("identities:", (found.identities ?? []).map((i) => `${i.provider} (created ${i.created_at?.slice(0,10)})`).join(", ") || "none");
