// study-coach — the AI Study Coach for ONE student.
//
// A student asks a free-text question; the coach answers grounded ONLY in that
// same student's own data (weak skills, recent released test results, shared
// lesson notes). It must NEVER surface or infer another student's data.
//
// ─── SECURITY MODEL (read before editing) ──────────────────────────────────
// • DEPLOY WITH JWT VERIFICATION ON — i.e. NOT `--no-verify-jwt`. Every caller
//   must present a valid Supabase session JWT.
//       supabase functions deploy study-coach        (verify_jwt defaults ON)
// • The caller is identified from their `Authorization` header via
//   auth.getUser(); 401 if absent/invalid. uid = user.id.
// • ALL data reads go through a per-request user client (`userClient`) built
//   with the caller's Authorization header, so Postgres RLS / SECURITY DEFINER
//   `auth.uid()` scoping is what enforces isolation. We deliberately do NOT use
//   the service-role key anywhere — there is no code path that can read another
//   student's rows. Every source RPC/table below is already auth.uid()-scoped:
//     - my_skill_mastery()      → caller's per-skill mastery only
//     - list_my_test_runs()     → caller's runs only
//     - get_test_result(run)    → caller's run only (raises results_locked otherwise)
//     - recording_notes/recordings → RLS "shared read" via is_recording_shared_to_me
// • The assembled context blob is the model's ONLY ground truth. The system
//   prompt forbids inventing scores or referencing anyone but this student.
//
// Setup (one-time): the Gemini key already exists for Recordings.
//   supabase secrets set GEMINI_API_KEY=...        (shared with Recordings)
//   supabase functions deploy study-coach
// Optional: GEMINI_MODEL to override the model.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_QUESTION = 4000;
const MAX_CONTEXT = 6000;

interface HistoryTurn {
  role: "user" | "coach";
  content: string;
}

interface MasteryRow {
  domain: string | null;
  skill: string | null;
  attempts: number | null;
  correct: number | null;
  mastery: number | null;
}

interface TestRunRow {
  run_id: string;
  test_title: string | null;
  submitted_at: string | null;
  released: boolean | null;
}

interface ResultQuestion {
  number?: number | string | null;
  domain?: string | null;
  is_correct?: boolean | null;
}

interface NotesRow {
  tldr: string | null;
  topics: unknown;
  recordings: { title: string | null } | { title: string | null }[] | null;
}

function recTitle(row: NotesRow): string {
  const r = row.recordings;
  const t = Array.isArray(r) ? r[0]?.title : r?.title;
  return (t ?? "Lesson").toString();
}

function topicTitles(topics: unknown): string {
  if (!Array.isArray(topics)) return "";
  const titles = topics
    .map((t) => (t && typeof t === "object" ? (t as { title?: unknown }).title : null))
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, 4);
  return titles.join(", ");
}

/** Cap the context blob and append a truncation note if we cut it. */
function capContext(blob: string): string {
  if (blob.length <= MAX_CONTEXT) return blob;
  return blob.slice(0, MAX_CONTEXT) + "\n…(context truncated)";
}

const SYSTEM =
  "You are a personal SAT study coach for ONE student. Use ONLY the DATA " +
  "below about this student. Never mention or infer other students. Be " +
  "concise, specific, encouraging, and actionable — point to the exact " +
  "skills/domains to practice. If the data doesn't contain the answer, say " +
  "you don't have that info yet and suggest what to do (e.g. take a full " +
  "test). Do not invent scores.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, status = 200): Response =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...CORS, "content-type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const AI_KEY = Deno.env.get("GEMINI_API_KEY");
    const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    if (!AI_KEY) return json({ error: "ai_not_configured" }, 503);

    // ── Identify the caller from their JWT. ──────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPA_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: uErr,
    } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "not_authenticated" }, 401);

    // ── Parse + validate input. ──────────────────────────────────────────────
    const body = (await req.json().catch(() => ({}))) as {
      question?: unknown;
      history?: unknown;
    };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return json({ error: "missing_question" }, 400);
    if (question.length > MAX_QUESTION) {
      return json({ error: "input_too_long" }, 400);
    }
    const history: HistoryTurn[] = Array.isArray(body.history)
      ? (body.history as unknown[])
          .filter(
            (h): h is HistoryTurn =>
              !!h &&
              typeof h === "object" &&
              ((h as HistoryTurn).role === "user" ||
                (h as HistoryTurn).role === "coach") &&
              typeof (h as HistoryTurn).content === "string",
          )
          .slice(-6)
      : [];

    // ── Rate limit (auth.uid()-scoped, SECURITY DEFINER). ────────────────────
    const { error: rlErr } = await userClient.rpc("study_coach_touch", {
      p_max: 20,
      p_window_secs: 300,
    });
    if (rlErr) {
      if (String(rlErr.message ?? "").includes("rate_limited")) {
        return json({ error: "rate_limited" }, 429);
      }
      return json({ error: "rate_limit_check_failed" }, 500);
    }

    // ── Assemble a compact, caller-scoped context blob. ──────────────────────
    const sections: string[] = [];

    // 1) Weakest skills.
    const { data: mastery } = await userClient.rpc("my_skill_mastery");
    const masteryRows = (Array.isArray(mastery) ? mastery : []) as MasteryRow[];
    const weakest = masteryRows
      .filter((m) => m.skill)
      .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))
      .slice(0, 12);
    if (weakest.length) {
      const lines = weakest.map(
        (m) =>
          `${m.skill}${m.domain ? ` (${m.domain})` : ""}: ${
            m.mastery ?? 0
          }% over ${m.attempts ?? 0} attempts`,
      );
      sections.push(`WEAKEST SKILLS:\n${lines.join("\n")}`);
    }

    // 2) Latest 1–2 released, submitted test runs → missed items by domain.
    const { data: runs } = await userClient.rpc("list_my_test_runs");
    const recentRuns = (Array.isArray(runs) ? runs : [])
      .filter(
        (r): r is TestRunRow => !!r && (r as TestRunRow).released === true &&
          !!(r as TestRunRow).submitted_at,
      )
      .sort(
        (a, b) =>
          new Date(b.submitted_at ?? 0).getTime() -
          new Date(a.submitted_at ?? 0).getTime(),
      )
      .slice(0, 2);

    for (const run of recentRuns) {
      const { data: result, error: resErr } = await userClient.rpc(
        "get_test_result",
        { p_run_id: run.run_id },
      );
      // get_test_result raises results_locked for unreleased runs — skip those.
      if (resErr || !result || typeof result !== "object") continue;
      const questions = (result as { questions?: unknown }).questions;
      const qs = (Array.isArray(questions) ? questions : []) as ResultQuestion[];
      const missed = qs.filter((q) => q.is_correct === false);
      if (!missed.length) continue;

      const byDomain = new Map<string, number>();
      for (const q of missed) {
        const d = (q.domain ?? "Unknown").toString();
        byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
      }
      const domainLines = [...byDomain.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([d, n]) => `${d}: ${n} missed`);
      const missedItems = missed
        .slice(0, 15)
        .map((q) => `missed: ${(q.domain ?? "Unknown").toString()} Q${q.number ?? "?"}`);

      sections.push(
        `TEST "${run.test_title ?? "Practice Test"}" (${
          run.submitted_at?.slice(0, 10) ?? ""
        }) — missed by domain:\n${domainLines.join("\n")}\n${missedItems.join("\n")}`,
      );
    }

    // 3) Shared lesson notes the student can see (RLS-filtered).
    const { data: notes } = await userClient
      .from("recording_notes")
      .select("tldr, topics, recordings(title)")
      .order("generated_at", { ascending: false })
      .limit(5);
    const noteRows = (Array.isArray(notes) ? notes : []) as NotesRow[];
    if (noteRows.length) {
      const lines = noteRows.map((n) => {
        const topics = topicTitles(n.topics);
        const tail = n.tldr
          ? n.tldr
          : topics
            ? `topics: ${topics}`
            : "(no summary)";
        return `lesson: ${recTitle(n)} — ${tail}${
          n.tldr && topics ? ` [topics: ${topics}]` : ""
        }`;
      });
      sections.push(`SHARED LESSON NOTES:\n${lines.join("\n")}`);
    }

    const contextBlob = capContext(
      sections.length
        ? sections.join("\n\n")
        : "(No study data recorded for this student yet.)",
    );

    // ── Build the Gemini request. ────────────────────────────────────────────
    const systemText = `${SYSTEM}\n\nDATA ABOUT THIS STUDENT:\n${contextBlob}`;
    const contents = [
      ...history.map((h) => ({
        role: h.role === "coach" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      { role: "user", parts: [{ text: question }] },
    ];

    const resp = await fetch(
      `${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent?key=${AI_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
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
    const answer: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!answer) return json({ error: "no_answer" }, 502);

    return json({ answer, model: MODEL });
  } catch (e) {
    return json({ error: "internal", detail: String(e).slice(0, 300) }, 500);
  }
});
