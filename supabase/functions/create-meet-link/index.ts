// create-meet-link — create a Google Meet link for the calling educator.
//
// Flow: authenticate the user → read their stored Google refresh token (service
// role; the token table is RLS-locked, RPC/definer-only) → exchange it for a
// fresh access token → create a Calendar event with conferenceData, which Google
// auto-attaches a Meet link to → return the Meet URL + event id.
//
// Setup (owner, one-time) — see docs/GOOGLE_CALENDAR_SETUP.md:
//   - In Google Cloud Console: enable the Calendar API + add the
//     `.../auth/calendar.events` scope to the OAuth consent screen.
//   - supabase secrets set GOOGLE_OAUTH_CLIENT_ID=...   (the same client used
//       for Supabase Google auth, or a dedicated one)
//   - supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=...
//   - supabase functions deploy create-meet-link
// Until the secrets are set this returns { error: "not_configured" } (503).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isoOrDefault(v: string | undefined, fallbackMsFromNow: number): string {
  if (v) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date(Date.now() + fallbackMsFromNow).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...CORS, "content-type": "application/json" },
    });

  try {
    const URL_ = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "not_configured" }, 503);

    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      start_at?: string;
      end_at?: string;
    };

    // Identify the caller.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(URL_, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: uErr,
    } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "not_authenticated" }, 401);

    // Read the refresh token via service role (table is definer-only).
    const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const { data: tok } = await service
      .from("google_calendar_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!tok?.refresh_token) return json({ error: "not_connected" }, 400);

    // Exchange the refresh token for a short-lived access token.
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tok.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    if (!tokenResp.ok) {
      // A revoked / expired refresh token surfaces here — tell the client to reconnect.
      return json({ error: "reauth_required", detail: (await tokenResp.text()).slice(0, 200) }, 401);
    }
    const access = (await tokenResp.json()) as { access_token?: string };
    if (!access.access_token) return json({ error: "reauth_required" }, 401);

    const start = isoOrDefault(body.start_at, 0);
    const end = isoOrDefault(body.end_at, 60 * 60 * 1000); // default 1h

    // Create the event; conferenceData makes Google attach a Meet link.
    const evResp = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${access.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          summary: body.title?.slice(0, 200) || "Meeting",
          start: { dateTime: start },
          end: { dateTime: end },
          conferenceData: {
            createRequest: {
              requestId: `${user.id}-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    );
    if (!evResp.ok) {
      return json({ error: "calendar_error", detail: (await evResp.text()).slice(0, 200) }, 502);
    }
    const ev = (await evResp.json()) as {
      id?: string;
      hangoutLink?: string;
      htmlLink?: string;
    };

    return json({
      ok: true,
      meet_url: ev.hangoutLink ?? null,
      event_id: ev.id ?? null,
      html_link: ev.htmlLink ?? null,
    });
  } catch (e) {
    return json({ error: "internal", detail: String(e) }, 500);
  }
});
