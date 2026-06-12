// summarize-recording — (re)generate the "Fathom" notes for a recording.
//
// Owner-triggered from the detail page ("Generate / Regenerate notes"). The
// auto-path (right after transcription finishes) is handled inside
// transcribe-part, which calls the same shared summarizer — this endpoint is
// the manual entry point.
//
// Setup: ANTHROPIC_API_KEY already exists (shared with counselor-ai).
//   supabase functions deploy summarize-recording
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { summarizeRecording } from "../_shared/summarize.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const AI_KEY = Deno.env.get("GEMINI_API_KEY");
    const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    if (!AI_KEY) return json({ error: "ai_not_configured" }, 503);

    const { recording_id } = (await req.json().catch(() => ({}))) as {
      recording_id?: string;
    };
    if (!recording_id) return json({ error: "missing_recording_id" }, 400);

    // Authorize: the recording's owner (RLS) — a non-owner sees nothing.
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

    const { data: rec, error: rErr } = await userClient
      .from("recordings")
      .select("id")
      .eq("id", recording_id)
      .single();
    if (rErr || !rec) return json({ error: "not_authorized" }, 403);

    const service = createClient(URL_, SERVICE, {
      auth: { persistSession: false },
    });
    const result = await summarizeRecording(service, AI_KEY, MODEL, recording_id);
    if (!result.ok) return json({ error: "summarize_failed", detail: result.error }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: "internal", detail: String(e) }, 500);
  }
});
