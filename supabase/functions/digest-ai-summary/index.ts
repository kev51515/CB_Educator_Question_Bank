// digest-ai-summary — compose a warm, parent-facing 2-3 sentence progress
// summary from a digest's `stats` blob with Gemini. The teacher reviews +
// edits the result before it is sent (approve_and_send_digest). This function
// only DRAFTS prose — it never sends anything and never writes the DB.
//
// Auth: caller must be an authenticated teacher of the digest's course (when a
// { digest_id } is passed) OR any authenticated user when raw { stats } is
// passed (the teacher already holds the row in their client). Mirrors the
// auth + Gemini + CORS pattern of generate-study-aids-from-recording.
//
// Graceful fallback: 503 if GEMINI_API_KEY is unset — the client then keeps
// the stats-only digest (no AI blurb), which is a valid send.
//
//   supabase functions deploy digest-ai-summary
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUMMARY_SCHEMA = {
  type: "OBJECT",
  properties: { summary: { type: "STRING" } },
  required: ["summary"],
};

const SYSTEM =
  "You write a short, warm progress update for a STUDENT'S PARENT about their " +
  "SAT-prep work this week. You are given a compact JSON of the student's " +
  "stats. Write 2-3 plain sentences (NO markdown, NO bullet points, NO code " +
  "fences, NO headings). Be encouraging and concrete: reference the actual " +
  "numbers you are given (practice-test scores and any improvement, " +
  "assignments completed, anything due soon) without inventing anything not " +
  "in the data. If there is little activity this week, gently note that and " +
  "encourage staying on track. Address the parent warmly but do not use a " +
  "salutation or sign-off. Return ONLY a JSON object: { \"summary\": string }.";

function parseJsonLoose(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return {};
  }
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
    const AI_KEY = Deno.env.get("GEMINI_API_KEY");
    const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    if (!AI_KEY) return json({ error: "ai_not_configured" }, 503);

    const body = (await req.json().catch(() => ({}))) as {
      digest_id?: string;
      stats?: Record<string, unknown>;
    };

    // Authorize via the caller's session.
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

    // Resolve the stats to summarize. When a digest_id is given, read the row
    // with the service client and verify the caller teaches its course.
    let stats: Record<string, unknown> | null = null;
    if (body.digest_id) {
      const service = createClient(URL_, SERVICE, {
        auth: { persistSession: false },
      });
      const { data: digest, error: dErr } = await service
        .from("student_progress_digests")
        .select("course_id, stats")
        .eq("id", body.digest_id)
        .maybeSingle();
      if (dErr || !digest) return json({ error: "not_found" }, 404);

      const { data: allowed, error: aErr } = await service.rpc(
        "is_teacher_of_course",
        { uid: user.id, p_course_id: digest.course_id },
      );
      if (aErr) return json({ error: "internal", detail: aErr.message }, 500);
      if (!allowed) return json({ error: "not_authorized" }, 403);

      stats = (digest.stats as Record<string, unknown>) ?? {};
    } else if (body.stats && typeof body.stats === "object") {
      stats = body.stats;
    } else {
      return json({ error: "missing_input" }, 400);
    }

    const resp = await fetch(
      `${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent?key=${AI_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [
            { parts: [{ text: `Student stats:\n\n${JSON.stringify(stats)}` }] },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: SUMMARY_SCHEMA,
          },
        }),
      },
    );
    if (!resp.ok) {
      return json(
        { error: "ai_error", detail: (await resp.text()).slice(0, 200) },
        502,
      );
    }
    const data = await resp.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = parseJsonLoose(raw);
    const summary =
      typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    if (!summary) return json({ error: "no_summary" }, 502);

    return json({ summary });
  } catch (e) {
    return json({ error: "internal", detail: String(e) }, 500);
  }
});
