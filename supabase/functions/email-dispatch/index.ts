// =============================================================================
// Edge function: email-dispatch
// Drains the email_outbox queue to the Resend API. Cron-driven, guarded by
// CRON_TOKEN (mirrors line-dispatch / assignment-due-reminders).
//
// Scheduled from pg_cron every 2 minutes (migration 0196). Deploy with:
//   supabase functions deploy email-dispatch --no-verify-jwt --use-api
// (--no-verify-jwt is REQUIRED for cron invocation — the function self-guards
//  via CRON_TOKEN; see the LINE functions for the precedent.)
//
// Required secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "PrepMasters
//   <notifications@pication.app>" — domain must be verified in Resend),
//   CRON_TOKEN, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected).
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_SEND = "https://api.resend.com/emails";
const MAX_ATTEMPTS = 5;
// Resend's default rate limit is ~2 req/s; a 2-minute cron tick draining 50
// sequential sends stays comfortably inside it.
const BATCH = 50;
const APP_BASE = "https://pication.app";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const KIND_CTA: Record<string, string> = {
  announcement: "View announcement",
  assignment_grade: "View your grade",
  feedback: "View feedback",
  message: "Open inbox",
};

/** Minimal Ivy-Ledger-voiced template: eggshell ground, navy ink, serif title. */
function renderHtml(title: string, body: string | null, link: string | null, kind: string | null): string {
  const cta = link
    ? `<a href="${APP_BASE}${escapeHtml(link)}" style="display:inline-block;margin-top:20px;background:#24407E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${
        KIND_CTA[kind ?? ""] ?? "Open"
      }</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FBFAF7;">
  <div style="max-width:560px;margin:0 auto;padding:36px 24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1B2A4A;">
    <p style="margin:0 0 18px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6E7A95;">PrepMasters</p>
    <div style="background:#ffffff;border:1px solid #E9E6DE;border-radius:14px;padding:26px 28px;">
      <h1 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:22px;line-height:1.25;color:#1B2A4A;">${escapeHtml(title)}</h1>
      ${body ? `<p style="margin:0;font-size:14.5px;line-height:1.6;color:#44516B;white-space:pre-line;">${escapeHtml(body)}</p>` : ""}
      ${cta}
    </div>
    <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#6E7A95;">You're receiving this because email notifications are on for your PrepMasters account. Turn them off under Account &rarr; Settings.</p>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  const FROM = Deno.env.get("EMAIL_FROM") ?? "PrepMasters <notifications@pication.app>";
  const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const CRON_TOKEN = Deno.env.get("CRON_TOKEN");

  if (CRON_TOKEN) {
    const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (got !== CRON_TOKEN) return new Response("forbidden", { status: 403 });
  }
  if (!RESEND_KEY) return json({ ok: false, err: "RESEND_API_KEY not set" }, 500);

  const supabase = createClient(SUPA_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("email_outbox")
    .select("id, recipient_email, kind, title, body, link, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return json({ ok: false, err: error.message }, 500);

  let sent = 0;
  let failed = 0;
  let rateLimited = false;

  for (const row of rows ?? []) {
    const r = await fetch(RESEND_SEND, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [row.recipient_email],
        subject: row.title,
        html: renderHtml(row.title, row.body, row.link, row.kind),
      }),
    });

    if (r.ok) {
      await supabase
        .from("email_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      sent++;
    } else if (r.status === 429) {
      // Rate limited: back off this tick without burning a retry attempt.
      await supabase.from("email_outbox").update({ last_error: "429 rate_limited" }).eq("id", row.id);
      rateLimited = true;
      break;
    } else {
      const errText = `${r.status} ${(await r.text()).slice(0, 300)}`;
      const attempts = (row.attempts ?? 0) + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await supabase
        .from("email_outbox")
        .update({ status, attempts, last_error: errText })
        .eq("id", row.id);
      failed++;
    }
  }

  return json({ ok: true, processed: (rows ?? []).length, sent, failed, rateLimited });
});
