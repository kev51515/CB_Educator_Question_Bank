// =============================================================================
// Edge function: line-dispatch
// Drains the line_outbox queue to the LINE push API. Cron-driven, guarded by
// CRON_TOKEN (mirrors assignment-due-reminders).
//
// Schedule from pg_cron, e.g. every minute:
//   select cron.schedule('line-dispatch', '* * * * *', $$
//     select net.http_post(
//       url := 'https://<ref>.supabase.co/functions/v1/line-dispatch',
//       headers := jsonb_build_object('Authorization', 'Bearer ' || '<CRON_TOKEN>')
//     ); $$);
//
// Required secrets: LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected), CRON_TOKEN.
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINE_PUSH = "https://api.line.me/v2/bot/message/push";
const MAX_ATTEMPTS = 5;
const BATCH = 200;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
  const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const CRON_TOKEN = Deno.env.get("CRON_TOKEN");

  if (CRON_TOKEN) {
    const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (got !== CRON_TOKEN) return new Response("forbidden", { status: 403 });
  }

  const supabase = createClient(SUPA_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("line_outbox")
    .select("id, line_user_id, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return json({ ok: false, err: error.message }, 500);

  let sent = 0;
  let failed = 0;
  let rateLimited = false;

  for (const row of rows ?? []) {
    const r = await fetch(LINE_PUSH, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: row.line_user_id, messages: [row.payload] }),
    });

    if (r.ok) {
      await supabase
        .from("line_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      sent++;
    } else if (r.status === 429) {
      // Rate limited: back off this tick without burning a retry attempt.
      await supabase.from("line_outbox").update({ last_error: "429 rate_limited" }).eq("id", row.id);
      rateLimited = true;
      break;
    } else {
      const errText = `${r.status} ${(await r.text()).slice(0, 300)}`;
      const attempts = (row.attempts ?? 0) + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await supabase
        .from("line_outbox")
        .update({ status, attempts, last_error: errText })
        .eq("id", row.id);
      failed++;
    }
  }

  return json({ ok: true, processed: (rows ?? []).length, sent, failed, rateLimited });
});
