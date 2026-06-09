// counselor-ai — COUNSELOR-ONLY AI assistant for college counseling.
//
// Two modes:
//   essay_feedback — coaching feedback on a student's draft essay (for the
//                    counselor to relay/act on; does NOT rewrite for the student)
//   rec_letter     — a first-draft recommendation letter from the counselor's
//                    notes (the counselor edits + approves; retains authorship)
//
// AI is intentionally NOT exposed to students — this endpoint authorizes the
// caller as a teacher of the course (owner or shared co-teacher) or an admin.
//
// Setup (one-time): set the secret + deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy counselor-ai
// Optional: COUNSELOR_AI_MODEL to override the model.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function buildPrompt(mode: string, text: string): { system: string; prompt: string } {
  if (mode === "essay_feedback") {
    return {
      system:
        "You are an expert college-admissions essay coach advising a school COUNSELOR (not the student directly). Give concise, structured, actionable feedback the counselor can relay or act on. Cover: opening/hook, structure & flow, clarity, authentic voice, theme/insight, and concrete revision suggestions. Do NOT rewrite the essay for the student — suggest directions. Be encouraging but honest. Use short headed sections.",
      prompt: `Here is a student's draft college essay. Provide coaching feedback for the counselor.\n\n---\n${text}\n---`,
    };
  }
  // rec_letter
  return {
    system:
      "You are helping a school COUNSELOR draft a college recommendation letter. Produce a strong, specific first draft based ONLY on the counselor's notes/brag-sheet provided. The counselor will edit and approve — they retain authorship. Use a professional, warm tone; concrete examples over generic praise; about 350-500 words. Where a specific is missing, leave a clearly-marked [bracketed placeholder] rather than inventing facts.",
    prompt: `Counselor's notes / brag sheet about the student:\n\n---\n${text}\n---\n\nDraft the recommendation letter.`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...CORS, "content-type": "application/json" },
    });

  try {
    const URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const MODEL = Deno.env.get("COUNSELOR_AI_MODEL") ?? "claude-sonnet-4-6";

    if (!AI_KEY) return json({ error: "ai_not_configured" }, 503);

    // Identify the caller from their JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: uErr,
    } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "not_authenticated" }, 401);
    const uid = user.id;

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    const courseId = body?.course_id;
    const text = body?.text;
    if (mode !== "essay_feedback" && mode !== "rec_letter") {
      return json({ error: "invalid_mode" }, 400);
    }
    if (!courseId || typeof text !== "string" || text.trim().length < 10) {
      return json({ error: "invalid_input" }, 400);
    }
    if (text.length > 20000) return json({ error: "input_too_long" }, 400);

    // Authorize: teacher of the course (owner or shared) or admin. Students,
    // even if enrolled, are NOT authorized — AI is counselor-only.
    const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
    const [{ data: course }, { data: share }, { data: prof }] = await Promise.all([
      svc.from("courses").select("teacher_id").eq("id", courseId).maybeSingle(),
      svc
        .from("course_shares")
        .select("id")
        .eq("course_id", courseId)
        .eq("recipient_id", uid)
        .maybeSingle(),
      svc.from("profiles").select("role").eq("id", uid).maybeSingle(),
    ]);
    if (!course) return json({ error: "course_not_found" }, 404);
    const authorized =
      course.teacher_id === uid || !!share || prof?.role === "admin";
    if (!authorized) return json({ error: "not_authorized" }, 403);

    const { system, prompt } = buildPrompt(mode, text);
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": AI_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1600,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: "ai_error", detail: t.slice(0, 300) }, 502);
    }
    const data = await resp.json();
    const out = (data?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
    return json({ result: out, model: MODEL });
  } catch (e) {
    return json({ error: "server_error", detail: String(e).slice(0, 300) }, 500);
  }
});
