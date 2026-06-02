import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
  const FROM = Deno.env.get("REMINDER_FROM_EMAIL") ?? "noreply@example.com";
  const CRON_TOKEN = Deno.env.get("CRON_TOKEN");

  // Auth: require Bearer match if CRON_TOKEN is set
  if (CRON_TOKEN) {
    const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (got !== CRON_TOKEN) {
      return new Response("forbidden", { status: 403 });
    }
  }

  const supabase = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
  const in24 = new Date(now.getTime() + 24 * 3600 * 1000);

  // Find assignments due in the window
  const { data: assignments, error: asnErr } = await supabase
    .from("assignments")
    .select("id, course_id, title, due_at, courses(name)")
    .eq("archived", false)
    .not("due_at", "is", null)
    .gt("due_at", now.toISOString())
    .lte("due_at", in24.toISOString());
  if (asnErr) return jsonResponse({ ok: false, err: asnErr.message }, 500);

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const asn of assignments ?? []) {
    // Find enrolled students who haven't started this assignment
    const { data: rosterAndAttempts } = await supabase
      .from("course_memberships")
      .select("student_id, profiles!course_memberships_student_id_fkey(email, display_name)")
      .eq("course_id", asn.course_id);

    const memberships = rosterAndAttempts ?? [];
    if (memberships.length === 0) { skipped++; continue; }

    const studentIds = memberships.map((m) => m.student_id);
    const { data: attempts } = await supabase
      .from("assignment_attempts")
      .select("student_id")
      .eq("assignment_id", asn.id)
      .in("student_id", studentIds);
    const started = new Set((attempts ?? []).map((a) => a.student_id));

    for (const m of memberships) {
      if (started.has(m.student_id)) { skipped++; continue; }
      const email = (m as any).profiles?.email;
      const displayName = (m as any).profiles?.display_name ?? "Student";
      const courseName = (asn as any).courses?.name ?? "your course";
      if (!email) { skipped++; continue; }

      // Dedup: claim a reminder_log row before sending. The UNIQUE constraint
      // (assignment_id, student_id, reminder_kind) makes this a single-shot
      // gate — concurrent runs can't both win, and reruns are idempotent.
      const ins = await supabase.from("reminder_log").insert({
        assignment_id: asn.id,
        student_id: m.student_id,
        reminder_kind: "assignment_due_24h",
      });
      if (ins.error?.code === "23505") { skipped++; continue; }
      if (ins.error) {
        errors.push(`${email}: reminder_log ${ins.error.message}`);
        continue;
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM,
            to: email,
            subject: `Reminder: "${asn.title}" is due soon`,
            text: `Hi ${displayName},\n\nThis is a reminder that "${asn.title}" in ${courseName} is due within 24 hours (${asn.due_at}).\n\nOpen the app to get started.\n`,
          }),
        });
        if (res.ok) sent++;
        else { errors.push(`${email}: ${res.status}`); }
      } catch (e) {
        errors.push(`${email}: ${(e as Error).message}`);
      }
    }
  }

  return jsonResponse({
    ok: true,
    window_end: in24.toISOString(),
    assignments_checked: assignments?.length ?? 0,
    sent,
    skipped,
    errors,
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
