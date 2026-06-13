// _shared/summarize.ts — produce "Fathom-style" notes from a recording's
// stitched transcript with Gemini, and upsert them into recording_notes.
//
// Everything in Recordings runs on the one Google/Gemini key (transcription +
// notes + quiz) — no Anthropic dependency, no extra account.
//
// Imported by:
//   - transcribe-part  (auto-runs once a recording finalizes to 'ready')
//   - summarize-recording  (owner-triggered "Regenerate notes")
//
// Keeping it in one module means there's a single prompt + schema, and the two
// entry points can't drift.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

export interface Utterance {
  speaker: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

function fmtTs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Build the transcript we feed Claude: Part dividers + per-utterance
 * (timestamp) markers so the model can cite part_index + start_ms back to us.
 * Shared by the summarizer and the quiz generator.
 */
export function stitchTranscript(
  parts: { part_index: number; transcript: Utterance[] | null }[],
): string {
  const out: string[] = [];
  for (const p of parts) {
    if (!p.transcript?.length) continue;
    out.push(`[Part ${p.part_index}]`);
    for (const u of p.transcript) {
      out.push(`(${fmtTs(u.start_ms)}) Speaker ${u.speaker}: ${u.text}`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}

const SYSTEM =
  "You produce thorough, well-structured notes from a transcript — the style of " +
  "a great AI meeting-notes tool (Fathom/Otter), but more COMPLETE. The reader " +
  "should be able to understand the whole session from your notes without " +
  "replaying it. The transcript is divided into [Part N] sections with (m:ss) " +
  "timestamps. Return ONLY a single JSON object, no prose, no markdown code " +
  "fences. Shape:\n" +
  "{\n" +
  '  "tldr": string,                       // a complete 3-6 sentence overview: what this was, the main thrust, and the outcome\n' +
  '  "topics": [{ "title": string, "summary": string, "part_index": number, "start_ms": number }],\n' +
  '  "action_items": [{ "text": string, "owner": string|null }],\n' +
  '  "highlights": [{ "quote": string, "part_index": number, "start_ms": number }]\n' +
  "}\n" +
  "For part_index/start_ms, use the nearest preceding [Part N] and (m:ss) marker " +
  "(convert m:ss to milliseconds). COMPLETENESS RULES:\n" +
  "- topics: cover EVERY distinct subject discussed, in order — typically 5-12 " +
  "for a substantive session, not just the headline 3. Each `summary` is 2-4 " +
  "full sentences capturing the key points, examples, definitions, and any " +
  "conclusion for that topic (not a one-liner). For a lesson, include the " +
  "concepts taught and how they were explained.\n" +
  "- action_items: every concrete next step, assignment, deadline, or follow-up " +
  "mentioned; [] only if truly none.\n" +
  "- highlights: 4-8 of the most memorable/important verbatim lines.\n" +
  "Be faithful — never invent content not in the transcript, but be exhaustive " +
  "about what IS there.";

function parseJsonLoose(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    // Strip code fences / surrounding prose; grab the first {...} block.
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

const NOTES_SCHEMA = {
  type: "OBJECT",
  properties: {
    tldr: { type: "STRING" },
    topics: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          summary: { type: "STRING" },
          part_index: { type: "INTEGER" },
          start_ms: { type: "INTEGER" },
        },
        required: ["title", "summary"],
      },
    },
    action_items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { text: { type: "STRING" }, owner: { type: "STRING" } },
        required: ["text"],
      },
    },
    highlights: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          quote: { type: "STRING" },
          part_index: { type: "INTEGER" },
          start_ms: { type: "INTEGER" },
        },
        required: ["quote"],
      },
    },
  },
  required: ["tldr", "topics", "action_items", "highlights"],
};

export async function summarizeRecording(
  service: SupabaseClient,
  geminiKey: string,
  model: string,
  recordingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: parts, error } = await service
    .from("recording_parts")
    .select("part_index, transcript")
    .eq("recording_id", recordingId)
    .order("part_index", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const transcript = stitchTranscript(
    (parts ?? []) as { part_index: number; transcript: Utterance[] | null }[],
  );
  if (!transcript) return { ok: false, error: "no_transcript" };

  const resp = await fetch(
    `${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: `Transcript:\n\n${transcript}` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: NOTES_SCHEMA,
        },
      }),
    },
  );
  if (!resp.ok) {
    return { ok: false, error: `gemini ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
  }
  const data = await resp.json();
  const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  const parsed = parseJsonLoose(raw);
  const notes = {
    recording_id: recordingId,
    tldr: typeof parsed.tldr === "string" ? parsed.tldr : null,
    topics: asArray(parsed.topics).map((t) => ({
      title: String(t.title ?? ""),
      summary: String(t.summary ?? ""),
      part_index: Number(t.part_index ?? 1),
      start_ms: Number(t.start_ms ?? 0),
    })),
    action_items: asArray(parsed.action_items).map((a) => ({
      text: String(a.text ?? ""),
      owner: a.owner ? String(a.owner) : null,
    })),
    highlights: asArray(parsed.highlights).map((h) => ({
      quote: String(h.quote ?? ""),
      part_index: Number(h.part_index ?? 1),
      start_ms: Number(h.start_ms ?? 0),
    })),
    model,
    generated_at: new Date().toISOString(),
  };

  const { error: upErr } = await service
    .from("recording_notes")
    .upsert(notes, { onConflict: "recording_id" });
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}
