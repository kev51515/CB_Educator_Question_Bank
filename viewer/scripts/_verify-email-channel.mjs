/** End-to-end: notification → trigger → email_outbox → cron+edge fn → Resend. */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
let uid = null;
try {
  const { data: cu, error } = await service.auth.admin.createUser({
    email: `delivered+pm-${randomBytes(3).toString("hex")}@resend.dev`,
    password: "Email-Test-1!" + randomBytes(3).toString("hex"),
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  uid = cu.user.id;
  const { error: nErr } = await service.from("notifications").insert([{
    recipient_id: uid,
    kind: "announcement",
    title: "Email channel test — PrepMasters",
    body: "If you can read this in the Resend dashboard, the notification → outbox → Resend pipeline works end to end.",
    link: "/student",
  }]);
  if (nErr) throw new Error("notification: " + nErr.message);
  console.log("notification inserted; polling outbox (cron drains every 2 min)...");
  const t0 = Date.now();
  while (Date.now() - t0 < 200_000) {
    const { data: rows } = await service.from("email_outbox").select("id,status,attempts,last_error,recipient_email").eq("profile_id", uid);
    const r = rows?.[0];
    if (!r) { console.log("  outbox row not created yet?!"); }
    else {
      console.log(`  outbox #${r.id}: ${r.status}${r.last_error ? " — " + r.last_error : ""}`);
      if (r.status === "sent") { console.log("PASS: email sent via Resend"); break; }
      if (r.status === "failed") { console.log("FAIL:", r.last_error); break; }
    }
    await new Promise((res) => setTimeout(res, 15_000));
  }
} finally {
  if (uid) {
    await service.from("email_outbox").delete().eq("profile_id", uid);
    await service.auth.admin.deleteUser(uid);
    console.log("cleanup done");
  }
}
