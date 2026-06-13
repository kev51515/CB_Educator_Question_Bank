// generate-study-aids-from-recording — draft "AI study aids" (flashcards, a
// markdown study guide, and a key-terms glossary) from a recording's transcript
// with Gemini. Owner-triggered from the detail page (like the quiz draft).
//
// Students the recording is SHARED to (0225) read these read-only via RLS; this
// generator is OWNER-ONLY (403 otherwise) and writes the 1:1 row in
// recording_study_aids (0235).
//
// Everything in Recordings runs on the one Google/Gemini key — no Anthropic.
//   supabase functions deploy generate-study-aids-from-recording
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stitchTranscript, type Utterance } from "../_shared/summarize.ts";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

const STUDY_AIDS_SCHEMA = {
  type: "OBJECT",
  properties: {
    flashcards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          front: { type: "STRING" },
          back: { type: "STRING" },
        },
        required: ["front", "back"],
      },
    },
    study_guide: { type: "STRING" },
    glossary: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          definition: { type: "STRING" },
        },
        required: ["term", "definition"],
      },
    },
  },
  required: ["flashcards", "study_guide", "glossary"],
};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM =
  "You build study aids from a transcript so a student can LEARN the material " +
  "without replaying the recording. The transcript is divided into [Part N] " +
  "sections with (m:ss) timestamps. Base everything ONLY on the transcript — " +
  "never invent facts. Return ONLY a single JSON object, no prose, no code " +
  "fences. Shape:\n" +
  "{\n" +
  '  "flashcards": [{ "front": string, "back": string }],   // 10-20 cards\n' +
  '  "study_guide": string,                                  // markdown, ## sections\n' +
  '  "glossary": [{ "term": string, "definition": string }] // the key terms\n' +
  "}\n" +
  "RULES:\n" +
  "- flashcards: 10-20 question/answer pairs covering the most important facts, " +
  "concepts, definitions, and examples. `front` is a concise prompt/question; " +
  "`back` is the answer (1-3 sentences). Make them genuinely useful for recall.\n" +
  "- study_guide: a well-structured markdown guide a student can revise from. " +
  "Use `## ` section headings, short paragraphs, and `- ` bullet lists. Cover " +
  "every distinct subject discussed, in order, with the key points and " +
  "explanations. Do NOT wrap it in code fences.\n" +
  "- glossary: every important term/name/concept introduced, each with a clear " +
  "1-2 sentence definition grounded in how it was used in the session. Order by " +
  "first appearance. [] only if there are genuinely no notable terms.";

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

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
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
    };
    const recordingId = body.recording_id;
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

    // Owner-only: the caller must own this recording. RLS on `recordings`
    // grants SELECT to shared students too, so don't rely on the read alone —
    // check owner_id explicitly.
    const { data: rec, error: rErr } = await userClient
      .from("recordings")
      .select("id, owner_id, status")
      .eq("id", recordingId)
      .single();
    if (rErr || !rec) return json({ error: "not_authorized" }, 403);
    if (rec.owner_id !== user.id) return json({ error: "not_authorized" }, 403);
    if (rec.status !== "ready") return json({ error: "not_ready" }, 400);

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

    // Ground the model on the existing notes too, when present (tldr + topics).
    const { data: notes } = await service
      .from("recording_notes")
      .select("tldr, topics")
      .eq("recording_id", recordingId)
      .maybeSingle();
    let grounding = "";
    if (notes?.tldr) grounding += `\n\nSession overview:\n${notes.tldr}`;
    const topics = asArray(notes?.topics);
    if (topics.length) {
      grounding +=
        "\n\nTopics covered:\n" +
        topics
          .map((t) => `- ${String(t.title ?? "")}: ${String(t.summary ?? "")}`)
          .join("\n");
    }

    const resp = await fetch(
      `${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent?key=${AI_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [
            { parts: [{ text: `Transcript:\n\n${transcript}${grounding}` }] },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: STUDY_AIDS_SCHEMA,
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
    const flashcards = asArray(parsed.flashcards)
      .map((f) => ({
        front: String(f.front ?? "").trim(),
        back: String(f.back ?? "").trim(),
      }))
      .filter((f) => f.front && f.back);
    const glossary = asArray(parsed.glossary)
      .map((g) => ({
        term: String(g.term ?? "").trim(),
        definition: String(g.definition ?? "").trim(),
      }))
      .filter((g) => g.term && g.definition);
    const studyGuide =
      typeof parsed.study_guide === "string" && parsed.study_guide.trim()
        ? parsed.study_guide.trim()
        : null;

    if (!flashcards.length && !glossary.length && !studyGuide) {
      return json({ error: "no_study_aids" }, 502);
    }

    const row = {
      recording_id: recordingId,
      flashcards,
      study_guide: studyGuide,
      glossary,
      model: MODEL,
      generated_at: new Date().toISOString(),
    };

    const { data: saved, error: upErr } = await service
      .from("recording_study_aids")
      .upsert(row, { onConflict: "recording_id" })
      .select(
        "recording_id, flashcards, study_guide, glossary, model, generated_at",
      )
      .single();
    if (upErr) return json({ error: "upsert_failed", detail: upErr.message }, 500);

    return json({ ok: true, study_aids: saved });
  } catch (e) {
    return json({ error: "internal", detail: String(e) }, 500);
  }
});
