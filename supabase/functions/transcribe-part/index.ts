// transcribe-part — transcribe one recording Part with Google Gemini.
//
// Called by the client right after a Part's audio is uploaded to the private
// 'recordings' bucket. We authorize the caller as the OWNER of the Part's
// recording (RLS does this — a non-owner's select returns nothing), then run
// transcription in the BACKGROUND (EdgeRuntime.waitUntil) so the client gets a
// fast response and polls for the result. Gemini returns a speaker-labelled
// transcript synchronously, so there's no webhook/second service to manage.
//
// Small Parts (≤18 MB) are sent inline; larger uploads go through the Gemini
// Files API. When every Part of the recording has settled, the recording is
// flipped to 'ready' (only from 'processing' — a Part finishing mid-session
// must not close a still-'recording' session early).
//
// Setup (one-time):
//   supabase secrets set GEMINI_API_KEY=...           # Google AI Studio (paid tier)
//   # optional: supabase secrets set GEMINI_MODEL=gemini-2.5-flash
//   supabase functions deploy transcribe-part
// (Normal JWT verification — requires the caller's session.)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { summarizeRecording } from "../_shared/summarize.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const INLINE_LIMIT = 18 * 1024 * 1024; // 18 MB — below Gemini's ~20 MB request cap

const TRANSCRIBE_PROMPT =
  "You are a precise transcription engine. Transcribe the audio verbatim in " +
  "the spoken language. Identify distinct speakers and label them A, B, C… in " +
  "the order they first speak. Return a JSON array of utterances in " +
  "chronological order; each item is {speaker, text} and, when you can " +
  "estimate it, start_ms (milliseconds from the start of the audio). Do not " +
  "add commentary.";

function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    // Uploaded meeting recordings (e.g. a downloaded Fathom export) are VIDEO
    // containers — send video/* so Gemini reads the audio track. (audio-only
    // mp4 is .m4a below.)
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "m4v":
      return "video/x-m4v";
    case "webm":
      // Our recorder writes audio/webm; an uploaded video.webm is rare. Gemini
      // accepts audio/webm for both.
      return "audio/webm";
    case "m4a":
      return "audio/mp4";
    case "mp3":
    case "mpeg":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    default:
      return "audio/webm";
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
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    if (!GEMINI_KEY) return json({ error: "transcription_not_configured" }, 503);

    const { part_id } = (await req.json().catch(() => ({}))) as {
      part_id?: string;
    };
    if (!part_id) return json({ error: "missing_part_id" }, 400);

    // Authorize: only the recording's owner can see the Part (RLS).
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

    const { data: part, error: pErr } = await userClient
      .from("recording_parts")
      .select("id, recording_id, audio_path, status")
      .eq("id", part_id)
      .single();
    if (pErr || !part) return json({ error: "not_authorized" }, 403);
    if (!part.audio_path) return json({ error: "no_audio" }, 400);

    const service = createClient(URL_, SERVICE, {
      auth: { persistSession: false },
    });

    await service
      .from("recording_parts")
      .update({ status: "transcribing", error: null })
      .eq("id", part_id);

    // Heavy lifting runs in the background; the client polls for the result.
    const work = transcribePart(
      service,
      GEMINI_KEY,
      MODEL,
      part.id,
      part.recording_id,
      part.audio_path,
    );
    // @ts-ignore — EdgeRuntime is a Supabase global
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
    } else {
      await work; // local/dev fallback
    }

    return json({ ok: true, status: "transcribing" });
  } catch (e) {
    return json({ error: "internal", detail: String(e) }, 500);
  }
});

async function transcribePart(
  service: ReturnType<typeof createClient>,
  geminiKey: string,
  model: string,
  partId: string,
  recordingId: string,
  audioPath: string,
): Promise<void> {
  try {
    const mimeType = mimeForPath(audioPath);

    // Stream the object via a signed URL instead of buffering it. A meeting
    // video can be hundreds of MB — `.download()` → arrayBuffer would OOM the
    // edge function. Small files (≤18 MB) are still read inline; larger ones
    // are piped straight to the Gemini Files API without ever holding the whole
    // file in memory.
    const { data: signed, error: sErr } = await service.storage
      .from("recordings")
      .createSignedUrl(audioPath, 600);
    if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "sign failed");
    const res = await fetch(signed.signedUrl);
    if (!res.ok || !res.body) throw new Error(`storage fetch ${res.status}`);
    const size = Number(res.headers.get("content-length") ?? "0");

    let audioPart: Record<string, unknown>;
    if (size > 0 && size <= INLINE_LIMIT) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      audioPart = { inline_data: { mime_type: mimeType, data: encodeBase64(bytes) } };
    } else {
      const fileUri = await uploadStreamToGeminiFiles(geminiKey, res.body, size, mimeType);
      audioPart = { file_data: { mime_type: mimeType, file_uri: fileUri } };
    }

    const resp = await fetch(
      `${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [audioPart, { text: TRANSCRIBE_PROMPT }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  speaker: { type: "STRING" },
                  text: { type: "STRING" },
                  start_ms: { type: "INTEGER" },
                },
                required: ["speaker", "text"],
              },
            },
          },
        }),
      },
    );
    if (!resp.ok) {
      throw new Error(`gemini ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    }
    const data = await resp.json();
    const raw: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    let parsed: { speaker?: string; text?: string; start_ms?: number }[] = [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }
    const utterances = (Array.isArray(parsed) ? parsed : [])
      .filter((u) => (u.text ?? "").trim().length > 0)
      .map((u) => ({
        speaker: u.speaker ?? "A",
        start_ms: typeof u.start_ms === "number" ? u.start_ms : 0,
        end_ms: 0,
        text: u.text ?? "",
      }));

    await service
      .from("recording_parts")
      .update({ status: "transcribed", transcript: utterances, error: null })
      .eq("id", partId);
  } catch (e) {
    await service
      .from("recording_parts")
      .update({ status: "failed", error: String(e).slice(0, 400) })
      .eq("id", partId);
  } finally {
    await maybeFinalize(service, recordingId);
  }
}

/**
 * Resumable upload to the Gemini Files API, STREAMING the bytes from `stream`
 * (the storage object's response body) straight through — never buffering the
 * whole file. `size` is the declared total (from the storage Content-Length),
 * which Gemini needs up-front for the resumable session. Returns the file URI
 * once ACTIVE.
 */
async function uploadStreamToGeminiFiles(
  key: string,
  stream: ReadableStream<Uint8Array>,
  size: number,
  mimeType: string,
): Promise<string> {
  if (!size) throw new Error("gemini files: unknown content length");
  const start = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "recording-part" } }),
  });
  const uploadUrl = start.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("gemini files: no upload url");

  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: stream,
    // Required by Deno/undici to send a streaming request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  let file = (await up.json())?.file as
    | { name?: string; uri?: string; state?: string }
    | undefined;

  // Poll until the file finishes processing. A large meeting video takes
  // longer to become ACTIVE than a short audio clip, so allow ~2 minutes.
  let tries = 0;
  while (file?.state === "PROCESSING" && tries < 60) {
    await new Promise((r) => setTimeout(r, 2000));
    const f = await fetch(`${GEMINI_BASE}/v1beta/${file.name}?key=${key}`);
    file = await f.json();
    tries += 1;
  }
  if (file?.state !== "ACTIVE" || !file.uri) {
    throw new Error(`gemini files: not active (${file?.state})`);
  }
  return file.uri;
}

/**
 * Flip the recording to 'ready' once every Part has settled (ended sessions
 * only), then auto-generate the "Fathom" notes. Returns true if it just
 * transitioned a 'processing' recording to 'ready'.
 */
async function maybeFinalize(
  service: ReturnType<typeof createClient>,
  recordingId: string,
): Promise<void> {
  const { data: parts } = await service
    .from("recording_parts")
    .select("status")
    .eq("recording_id", recordingId);
  const all = (parts ?? []) as { status: string }[];
  const settled = all.every(
    (p) => p.status === "transcribed" || p.status === "failed",
  );
  if (!all.length || !settled) return;
  const anyOk = all.some((p) => p.status === "transcribed");

  // Only finalize an ENDED session ('processing'); a Part finishing while the
  // user is still recording must not close it. `.select()` tells us whether we
  // were the one that flipped it, so notes generate exactly once.
  const { data: flipped } = await service
    .from("recordings")
    .update({ status: anyOk ? "ready" : "failed" })
    .eq("id", recordingId)
    .eq("status", "processing")
    .select("id");

  if (anyOk && flipped && flipped.length > 0) {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    if (geminiKey) {
      try {
        await summarizeRecording(service, geminiKey, model, recordingId);
      } catch {
        /* notes are best-effort; the user can regenerate from the UI */
      }
    }
  }
}
