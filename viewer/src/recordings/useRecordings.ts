/**
 * Recordings data layer — list + detail hooks and the mutation helpers used by
 * the recorder. Plain supabase + useState/useEffect (no react-query), matching
 * the rest of the app. Async setState is guarded with an `aliveRef` flag per
 * CLAUDE.md (see Wave 21J).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Domain } from "@/lib/domain";
import type {
  Recording,
  RecordingDetail,
  RecordingNotes,
  RecordingPart,
  RecordingSubject,
  Utterance,
} from "./types";
import { type PartResult, uploadExtFor } from "./recorder";

const RECORDING_COLS =
  "id, owner_id, course_id, domain, title, subject_type, consent_obtained, consent_note, status, duration_s, created_at, updated_at";
const PART_COLS =
  "id, recording_id, part_index, audio_path, status, provider_id, transcript, duration_s, error, created_at, updated_at";

// ── Mutations ────────────────────────────────────────────────────────────────

export interface CreateRecordingInput {
  title: string;
  domain: Domain;
  subject_type: RecordingSubject;
  consent_obtained: boolean;
  consent_note?: string | null;
  course_id?: string | null;
}

export async function createRecording(
  input: CreateRecordingInput,
): Promise<Recording> {
  const { data: auth } = await supabase.auth.getUser();
  const owner_id = auth.user?.id;
  if (!owner_id) throw new Error("not_authenticated");
  const { data, error } = await supabase
    .from("recordings")
    .insert({
      owner_id,
      title: input.title.trim() || "Untitled recording",
      domain: input.domain,
      subject_type: input.subject_type,
      consent_obtained: input.consent_obtained,
      consent_note: input.consent_note ?? null,
      course_id: input.course_id ?? null,
      status: "recording",
    })
    .select(RECORDING_COLS)
    .single();
  if (error) throw error;
  return data as Recording;
}

/**
 * Upload one finished Part's audio to the private bucket, create its
 * `recording_parts` row, then kick off transcription. The bucket path begins
 * with the owner id so object RLS passes (see migration 0208).
 */
export async function uploadAndTranscribePart(
  recording: Recording,
  partIndex: number,
  source: PartResult | File,
): Promise<RecordingPart> {
  const ext = "ext" in source ? source.ext : uploadExtFor(source);
  const blob = "blob" in source ? source.blob : source;
  const durationS =
    "durationMs" in source ? Math.round(source.durationMs / 1000) : 0;
  const path = `${recording.owner_id}/${recording.id}/part-${partIndex}.${ext}`;

  // 1) insert the row first (status 'uploading') so the UI can show the Part
  const { data: partRow, error: insErr } = await supabase
    .from("recording_parts")
    .insert({
      recording_id: recording.id,
      part_index: partIndex,
      audio_path: path,
      status: "uploading",
      duration_s: durationS,
    })
    .select(PART_COLS)
    .single();
  if (insErr) throw insErr;

  // 2) upload the audio object
  const { error: upErr } = await supabase.storage
    .from("recordings")
    .upload(path, blob, {
      contentType: blob.type || "audio/webm",
      upsert: true,
    });
  if (upErr) {
    await supabase
      .from("recording_parts")
      .update({ status: "failed", error: upErr.message })
      .eq("id", (partRow as RecordingPart).id);
    throw upErr;
  }

  // 3) mark queued, then ask the edge function to submit it to AssemblyAI.
  await supabase
    .from("recording_parts")
    .update({ status: "queued" })
    .eq("id", (partRow as RecordingPart).id);

  // transcribe-part sets the Part to 'transcribing' and runs Gemini in the
  // background, so this invoke returns quickly; the detail page polls for the
  // finished transcript. A transient invoke failure isn't fatal — the row stays
  // 'queued' and can be retried. Surface it to the caller for a toast.
  const { error: fnErr } = await supabase.functions.invoke("transcribe-part", {
    body: { part_id: (partRow as RecordingPart).id },
  });
  if (fnErr) throw fnErr;

  return { ...(partRow as RecordingPart), status: "queued" };
}

/**
 * Mark a session finished. If every Part has already settled by the time the
 * user ends, jump straight to 'ready'/'failed'; otherwise go 'processing' and
 * let assemblyai-webhook flip it to 'ready' as the last Part lands. (The webhook
 * only finalizes a 'processing' recording, never one still 'recording', so a
 * Part finishing mid-session can't prematurely close it.)
 */
export async function endRecording(
  recordingId: string,
  totalDurationS: number,
  anyParts: boolean,
): Promise<void> {
  let status: Recording["status"] = "failed";
  if (anyParts) {
    const { data: parts } = await supabase
      .from("recording_parts")
      .select("status")
      .eq("recording_id", recordingId);
    const all = (parts ?? []) as { status: string }[];
    const settled = all.every(
      (p) => p.status === "transcribed" || p.status === "failed",
    );
    const anyOk = all.some((p) => p.status === "transcribed");
    status = !all.length ? "failed" : settled ? (anyOk ? "ready" : "failed") : "processing";
  }
  const { error } = await supabase
    .from("recordings")
    .update({ status, duration_s: totalDurationS })
    .eq("id", recordingId);
  if (error) throw error;
}

/**
 * Re-open a finished recording so the owner can capture more Parts. Flips
 * status back to 'recording'; the RecorderPanel reappears and continues the
 * Part numbering. Ending again re-finalizes (and regenerates notes if a new
 * Part was transcribed).
 */
export async function reopenRecording(id: string): Promise<void> {
  const { error } = await supabase
    .from("recordings")
    .update({ status: "recording" })
    .eq("id", id);
  if (error) throw error;
}

/** Re-queue a Part for transcription (e.g. after a failed/stuck attempt). */
export async function retryPart(partId: string): Promise<void> {
  const { error } = await supabase
    .from("recording_parts")
    .update({ status: "queued", error: null })
    .eq("id", partId);
  if (error) throw error;
  const { error: fnErr } = await supabase.functions.invoke("transcribe-part", {
    body: { part_id: partId },
  });
  if (fnErr) throw fnErr;
}

/**
 * Delete a Part: remove its audio object + row, then renumber the remaining
 * Parts so `part_index` stays contiguous (no "Part 1, Part 3" gaps).
 */
export async function deletePart(
  part: RecordingPart,
  allParts: RecordingPart[],
): Promise<void> {
  if (part.audio_path) {
    await supabase.storage.from("recordings").remove([part.audio_path]).catch(() => {});
  }
  const { error } = await supabase.from("recording_parts").delete().eq("id", part.id);
  if (error) throw error;
  // Shift every later Part down by one.
  const later = allParts
    .filter((p) => p.part_index > part.part_index)
    .sort((a, b) => a.part_index - b.part_index);
  for (const p of later) {
    await supabase
      .from("recording_parts")
      .update({ part_index: p.part_index - 1 })
      .eq("id", p.id);
  }
}

/** Patch the AI notes (educator tweaks). Columns are jsonb / text on recording_notes. */
export async function updateNotes(
  recordingId: string,
  patch: Partial<
    Pick<RecordingNotes, "tldr" | "topics" | "action_items" | "highlights">
  >,
): Promise<void> {
  const { error } = await supabase
    .from("recording_notes")
    .update(patch)
    .eq("recording_id", recordingId);
  if (error) throw error;
}

/** Overwrite a Part's transcript utterances (inline correction / speaker rename). */
export async function updatePartTranscript(
  partId: string,
  utterances: Utterance[],
): Promise<void> {
  const { error } = await supabase
    .from("recording_parts")
    .update({ transcript: utterances })
    .eq("id", partId);
  if (error) throw error;
}

/**
 * Rename a speaker across every Part (e.g. "A" → "Teacher"). Rewrites the
 * `speaker` field on matching utterances and persists each changed Part.
 */
export async function renameSpeaker(
  parts: RecordingPart[],
  from: string,
  to: string,
): Promise<void> {
  const trimmed = to.trim();
  if (!trimmed || trimmed === from) return;
  for (const p of parts) {
    if (!p.transcript?.some((u) => u.speaker === from)) continue;
    const next = p.transcript.map((u) =>
      u.speaker === from ? { ...u, speaker: trimmed } : u,
    );
    await updatePartTranscript(p.id, next);
  }
}

/**
 * Add a recording to a course module: optionally SHARE it with the course's
 * enrolled students (a `recording_shares` row → they can read it via the
 * 0225 RLS), and drop a module_item link to the role-agnostic /recordings/:id
 * view. Either or both, per the teacher's choice.
 */
export async function addRecordingToModule(input: {
  recordingId: string;
  courseId: string;
  moduleId: string;
  title: string;
  shareWithStudents: boolean;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (input.shareWithStudents) {
    const { error: shErr } = await supabase
      .from("recording_shares")
      .upsert(
        { recording_id: input.recordingId, course_id: input.courseId, shared_by: auth.user?.id },
        { onConflict: "recording_id,course_id", ignoreDuplicates: true },
      );
    if (shErr) throw shErr;
  }
  // Append the link item at the end of the module (max live position + 1).
  const { data: rows } = await supabase
    .from("module_items")
    .select("position")
    .eq("module_id", input.moduleId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = ((rows?.[0]?.position as number | undefined) ?? -1) + 1;
  const { error: miErr } = await supabase.from("module_items").insert({
    module_id: input.moduleId,
    position: nextPos,
    item_type: "link",
    item_ref_id: null,
    title: input.title.trim() || "Recording",
    url: `/recordings/${input.recordingId}`,
  });
  if (miErr) throw miErr;
}

export async function renameRecording(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("recordings")
    .update({ title: title.trim() || "Untitled recording" })
    .eq("id", id);
  if (error) throw error;
}

/** Link a recording to a course (so it shows on that course's Recordings tab), or unlink with null. */
export async function setRecordingCourse(
  recordingId: string,
  courseId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("recordings")
    .update({ course_id: courseId })
    .eq("id", recordingId);
  if (error) throw error;
}

export async function deleteRecording(id: string): Promise<void> {
  // DB cascade removes parts + notes; storage objects are cleaned up best-effort.
  const { data: parts } = await supabase
    .from("recording_parts")
    .select("audio_path")
    .eq("recording_id", id);
  const paths = (parts ?? [])
    .map((p) => (p as { audio_path: string | null }).audio_path)
    .filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from("recordings").remove(paths);
  const { error } = await supabase.from("recordings").delete().eq("id", id);
  if (error) throw error;
}

// ── List hook ────────────────────────────────────────────────────────────────

export interface UseRecordingsList {
  recordings: Recording[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useRecordingsList(): UseRecordingsList {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("recordings")
      .select(RECORDING_COLS)
      .order("created_at", { ascending: false });
    if (!aliveRef.current) return;
    if (error) setError(error.message);
    else {
      setRecordings((data ?? []) as Recording[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  // Poll while anything is still capturing/transcribing so the list's status
  // pills + counts update without a manual refresh.
  useEffect(() => {
    const busy = recordings.some(
      (r) => r.status === "recording" || r.status === "processing",
    );
    if (!busy) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [recordings, load]);

  return { recordings, loading, error, refresh: load };
}

// ── Detail hook (light poll while anything is still processing) ───────────────

export interface UseRecordingDetail {
  detail: RecordingDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function isSettled(d: RecordingDetail | null): boolean {
  if (!d) return false;
  if (d.recording.status === "recording" || d.recording.status === "processing")
    return false;
  return d.parts.every(
    (p) => p.status === "transcribed" || p.status === "failed",
  );
}

export function useRecordingDetail(recordingId: string): UseRecordingDetail {
  const [detail, setDetail] = useState<RecordingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    const [recRes, partsRes, notesRes] = await Promise.all([
      supabase.from("recordings").select(RECORDING_COLS).eq("id", recordingId).single(),
      supabase
        .from("recording_parts")
        .select(PART_COLS)
        .eq("recording_id", recordingId)
        .order("part_index", { ascending: true }),
      supabase.from("recording_notes").select("*").eq("recording_id", recordingId).maybeSingle(),
    ]);
    if (!aliveRef.current) return;
    if (recRes.error) {
      setError(recRes.error.message);
      setLoading(false);
      return;
    }
    setDetail({
      recording: recRes.data as Recording,
      parts: (partsRes.data ?? []) as RecordingPart[],
      notes: (notesRes.data as RecordingNotes | null) ?? null,
    });
    setError(null);
    setLoading(false);
  }, [recordingId]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  // Poll every 4s until everything has settled (transcription is async).
  useEffect(() => {
    if (isSettled(detail)) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [detail, load]);

  return { detail, loading, error, refresh: load };
}
