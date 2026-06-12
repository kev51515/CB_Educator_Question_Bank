/**
 * calendar-ics — private read-only ICS feed for a student's due dates.
 *
 * GET /functions/v1/calendar-ics?token=<uuid>
 *
 * The token (calendar_feed_tokens, migration 0201) is the only credential —
 * calendar apps can't send Authorization headers, so deploy with
 * `--no-verify-jwt --use-api` (same pattern as line-webhook). An invalid or
 * missing token returns 404 without distinguishing "no such token" from
 * "bad request" (don't help enumeration).
 *
 * Feed contents: assignments with a due_at (past 30 days → next 180 days)
 * for every course the student is enrolled in, plus portfolio item due
 * dates for counseling courses. Service-role reads; scoping is explicit
 * via course_memberships.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 5545: escape backslash, semicolon, comma, newline in text values. */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC "basic" timestamp: 20260612T143000Z */
function icsTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

interface FeedEvent {
  uid: string;
  start: string; // ISO
  summary: string;
  description: string;
}

function buildCalendar(events: FeedEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pication//Student Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Class due dates",
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${icsTime(new Date().toISOString())}`,
      `DTSTART:${icsTime(ev.start)}`,
      `SUMMARY:${icsEscape(ev.summary)}`,
      `DESCRIPTION:${icsEscape(ev.description)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  // RFC 5545 wants CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}

Deno.serve(async (req) => {
  const URL_ENV = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!UUID_RE.test(token)) {
    return new Response("not found", { status: 404 });
  }

  const supabase = createClient(URL_ENV, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tokenRow } = await supabase
    .from("calendar_feed_tokens")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) {
    return new Response("not found", { status: 404 });
  }
  const userId = tokenRow.user_id as string;

  const { data: memberships } = await supabase
    .from("course_memberships")
    .select("course_id")
    .eq("student_id", userId);
  const courseIds = (memberships ?? []).map((m) => m.course_id as string);

  const events: FeedEvent[] = [];
  if (courseIds.length > 0) {
    const windowStart = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const windowEnd = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();

    const [asnRes, portRes] = await Promise.all([
      supabase
        .from("assignments")
        .select("id, title, due_at, courses(name)")
        .in("course_id", courseIds)
        .eq("archived", false)
        .not("due_at", "is", null)
        .gte("due_at", windowStart)
        .lte("due_at", windowEnd),
      supabase
        .from("portfolio_items")
        .select("id, title, due_at, portfolio_templates!inner(course_id, courses(name))")
        .in("portfolio_templates.course_id", courseIds)
        .not("due_at", "is", null)
        .gte("due_at", windowStart)
        .lte("due_at", windowEnd),
    ]);

    for (const row of asnRes.data ?? []) {
      const courseName =
        (row as { courses?: { name?: string } | null }).courses?.name ?? "Course";
      events.push({
        uid: `asn-${row.id}@pication.app`,
        start: row.due_at as string,
        summary: `${row.title} (due)`,
        description: `${courseName} assignment due.`,
      });
    }
    for (const row of portRes.data ?? []) {
      const tpl = (row as {
        portfolio_templates?: { courses?: { name?: string } | null } | null;
      }).portfolio_templates;
      const courseName = tpl?.courses?.name ?? "Course";
      events.push({
        uid: `port-${row.id}@pication.app`,
        start: row.due_at as string,
        summary: `${row.title} (due)`,
        description: `${courseName} portfolio item due.`,
      });
    }
  }

  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  return new Response(buildCalendar(events), {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      // Calendar apps poll on their own schedule; an hour of edge caching
      // keeps repeated polls cheap without making the feed feel stale.
      "cache-control": "private, max-age=3600",
    },
  });
});
