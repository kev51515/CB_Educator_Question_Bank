// generate-quiz-from-recording — draft multiple-choice questions from a
// recording's transcript with Claude. Owner-triggered from the detail page.
//
// The educator picks a STYLE per recording:
//   'sat'     — SAT-bank-shaped (a short stem + 4 choices A–D, reasoning/evidence)
//   'general' — plain comprehension/recall MCQs about the content
//
// Drafts land in `authored_questions` (status 'draft') for the educator to
// review/edit. Publishing into a takeable assignment is a separate, later step.
//
// Setup: ANTHROPIC_API_KEY already exists.
//   supabase functions deploy generate-quiz-from-recording
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stitchTranscript, type Utterance } from "../_shared/summarize.ts";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

const QUIZ_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      stem: { type: "STRING" },
      choices: {
        type: "OBJECT",
        properties: {
          A: { type: "STRING" },
          B: { type: "STRING" },
          C: { type: "STRING" },
          D: { type: "STRING" },
        },
        required: ["A", "B", "C", "D"],
      },
      correct_answer: { type: "STRING" },
      rationale: { type: "STRING" },
    },
    required: ["stem", "choices", "correct_answer"],
  },
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function systemFor(style: string, count: number): string {
  const shape =
    style === "sat"
      ? "Write SAT-style multiple-choice questions: a concise stem (and a brief " +
        "passage/context inside the stem when needed) testing reading, reasoning, " +
        "or command of evidence about the content. Exactly 4 choices A–D, one " +
        "unambiguously correct."
      : "Write clear multiple-choice comprehension/recall questions about the " +
        "content. Exactly 4 choices A–D, one unambiguously correct.";
  return (
    `You generate quiz questions from a transcript. ${shape} Produce ${count} ` +
    "questions. Base every question ONLY on the transcript — never invent facts. " +
    "Return ONLY a JSON array, no prose, no code fences. Each item:\n" +
    '{ "stem": string, "choices": { "A": string, "B": string, "C": string, "D": string }, ' +
    '"correct_answer": "A"|"B"|"C"|"D", "rationale": string }'
  );
}

function parseLoose(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return [];
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
      recording_id?: string;
      style?: string;
      count?: number;
    };
    const recordingId = body.recording_id;
    const style = body.style === "sat" ? "sat" : "general";
    const count = Math.min(Math.max(body.count ?? 6, 1), 15);
    if (!recordingId) return json({ error: "missing_recording_id" }, 400);

    // Authorize via the owner's session (RLS).
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
      .select("id, owner_id, course_id")
      .eq("id", recordingId)
      .single();
    if (rErr || !rec) return json({ error: "not_authorized" }, 403);

    const service = createClient(URL_, SERVICE, {
      auth: { persistSession: false },
    });
    const { data: parts } = await service
      .from("recording_parts")
      .select("part_index, transcript")
      .eq("recording_id", recordingId)
      .order("part_index", { ascending: true });
    const transcript = stitchTranscript(
      (parts ?? []) as { part_index: number; transcript: Utterance[] | null }[],
    );
    if (!transcript) return json({ error: "no_transcript" }, 400);

    const resp = await fetch(
      `${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent?key=${AI_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemFor(style, count) }] },
          contents: [{ parts: [{ text: `Transcript:\n\n${transcript}` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: QUIZ_SCHEMA,
          },
        }),
      },
    );
    if (!resp.ok) {
      return json({ error: "ai_error", detail: (await resp.text()).slice(0, 200) }, 502);
    }
    const data = await resp.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    const arr = parseLoose(raw);
    const questions = (Array.isArray(arr) ? arr : []) as Record<string, unknown>[];
    if (!questions.length) return json({ error: "no_questions" }, 502);

    // Replace existing DRAFTS for this recording (keep anything published).
    await service
      .from("authored_questions")
      .delete()
      .eq("recording_id", recordingId)
      .eq("status", "draft");

    const rows = questions.slice(0, count).map((q, i) => {
      const choices = (q.choices ?? {}) as Record<string, unknown>;
      return {
        recording_id: recordingId,
        owner_id: rec.owner_id,
        course_id: rec.course_id ?? null,
        position: i,
        style,
        stem: String(q.stem ?? ""),
        choices: {
          A: String(choices.A ?? ""),
          B: String(choices.B ?? ""),
          C: String(choices.C ?? ""),
          D: String(choices.D ?? ""),
        },
        correct_answer: ["A", "B", "C", "D"].includes(String(q.correct_answer))
          ? String(q.correct_answer)
          : "A",
        rationale: q.rationale ? String(q.rationale) : null,
        status: "draft",
      };
    });

    const { error: insErr } = await service.from("authored_questions").insert(rows);
    if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 500);

    return json({ ok: true, count: rows.length, style });
  } catch (e) {
    return json({ error: "internal", detail: String(e) }, 500);
  }
});
