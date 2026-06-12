/**
 * RecordingDetailPage — the per-recording surface.
 *
 *  - While `status === 'recording'` and the viewer owns it, hosts the
 *    RecorderPanel to capture more Parts.
 *  - Always shows the Parts in order, each with its transcription status and,
 *    once transcribed, its speaker-labelled transcript. Parts are visually
 *    divided (Part 1 / Part 2 …) so an intentional break is obvious.
 *  - Renders the AI "Fathom" notes above the transcript once generated, with
 *    jump-to-timestamp chips that scroll to a Part and seek its audio.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Skeleton, useToast } from "@/components";
import { useProfile } from "@/lib/profile";
import { useDomain } from "@/lib/DomainProvider";
import { ROUTES } from "@/lib/routes";
import { RecorderPanel } from "./RecorderPanel";
import { QuizDraftPanel } from "./QuizDraftPanel";
import {
  deleteRecording,
  renameRecording,
  useRecordingDetail,
} from "./useRecordings";
import type { RecordingNotes, RecordingPart } from "./types";

type RegisterAudio = (partIndex: number, el: HTMLAudioElement | null) => void;
type JumpTo = (partIndex: number, startMs: number) => void;

function fmtTs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function PartAudio({
  partIndex,
  path,
  register,
}: {
  partIndex: number;
  path: string;
  register: RegisterAudio;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.storage
      .from("recordings")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (alive && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) return null;
  return (
    <audio
      controls
      preload="none"
      src={url}
      ref={(el) => register(partIndex, el)}
      className="mt-2 w-full"
    />
  );
}

function partStatusLabel(p: RecordingPart): string {
  switch (p.status) {
    case "uploading":
      return "Uploading…";
    case "queued":
      return "Queued for transcription…";
    case "transcribing":
      return "Transcribing…";
    case "failed":
      return p.error ? `Failed: ${p.error}` : "Failed";
    case "transcribed":
      return "";
  }
}

function PartBlock({
  part,
  register,
}: {
  part: RecordingPart;
  register: RegisterAudio;
}) {
  const pending = part.status !== "transcribed" && part.status !== "failed";
  return (
    <section
      id={`part-${part.part_index}`}
      className="scroll-mt-20 border-t border-slate-200 pt-4 dark:border-slate-700"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
          Part {part.part_index}
        </h3>
        {partStatusLabel(part) && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {pending && <span className="mr-1 inline-block animate-pulse">●</span>}
            {partStatusLabel(part)}
          </span>
        )}
      </div>

      {part.transcript && part.transcript.length > 0 ? (
        <div className="space-y-2">
          {part.transcript.map((u, i) => (
            <p key={i} className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
              <span className="mr-2 font-medium text-slate-500 dark:text-slate-400">
                Speaker {u.speaker}:
              </span>
              {u.text}
            </p>
          ))}
        </div>
      ) : pending ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <p className="text-sm italic text-slate-400">No transcript.</p>
      )}

      {part.audio_path && (
        <PartAudio partIndex={part.part_index} path={part.audio_path} register={register} />
      )}
    </section>
  );
}

function TimeChip({
  partIndex,
  startMs,
  onJump,
}: {
  partIndex: number;
  startMs: number;
  onJump: JumpTo;
}) {
  if (!partIndex) return null;
  return (
    <button
      type="button"
      onClick={() => onJump(partIndex, startMs)}
      className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300"
      title="Jump to this moment"
    >
      ▶ Part {partIndex} · {fmtTs(startMs)}
    </button>
  );
}

function NotesView({ notes, onJump }: { notes: RecordingNotes; onJump: JumpTo }) {
  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      {notes.tldr && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Summary</h2>
          <p className="text-sm text-slate-800 dark:text-slate-200">{notes.tldr}</p>
        </div>
      )}
      {notes.topics.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Topics</h2>
          <ul className="space-y-2">
            {notes.topics.map((t, i) => (
              <li key={i}>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t.title}
                  {t.part_index != null && (
                    <TimeChip partIndex={t.part_index} startMs={t.start_ms ?? 0} onJump={onJump} />
                  )}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">{t.summary}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.action_items.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Action items</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-200">
            {notes.action_items.map((a, i) => (
              <li key={i}>{a.text}{a.owner ? ` — ${a.owner}` : ""}</li>
            ))}
          </ul>
        </div>
      )}
      {notes.highlights.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Highlights</h2>
          <ul className="space-y-1">
            {notes.highlights.map((h, i) => (
              <li key={i} className="border-l-2 border-indigo-300 pl-3 text-sm italic text-slate-700 dark:text-slate-300">
                "{h.quote}"
                {h.part_index != null && (
                  <TimeChip partIndex={h.part_index} startMs={h.start_ms ?? 0} onJump={onJump} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RecordingDetailPage() {
  const { recordingId = "" } = useParams();
  const { detail, loading, error, refresh } = useRecordingDetail(recordingId);
  const { profile } = useProfile();
  const { previewDomain } = useDomain();
  const navigate = useNavigate();
  const toast = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [generating, setGenerating] = useState(false);

  // Registry of each Part's <audio> element so notes chips can seek them.
  const audioRegistry = useRef<Map<number, HTMLAudioElement>>(new Map());
  const register = useCallback<RegisterAudio>((partIndex, el) => {
    if (el) audioRegistry.current.set(partIndex, el);
    else audioRegistry.current.delete(partIndex);
  }, []);
  const jumpTo = useCallback<JumpTo>((partIndex, startMs) => {
    document
      .getElementById(`part-${partIndex}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    const el = audioRegistry.current.get(partIndex);
    if (el) {
      el.currentTime = Math.max(0, startMs / 1000);
      void el.play().catch(() => {});
    }
  }, []);

  // Theme by the recording's domain while viewing it.
  useEffect(() => {
    if (detail) previewDomain(detail.recording.domain);
    return () => previewDomain(null);
  }, [detail, previewDomain]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <button onClick={() => navigate(ROUTES.RECORDINGS)} className="mb-4 text-sm text-indigo-600">
          ← Recordings
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ?? "Recording not found."}
        </div>
      </div>
    );
  }

  const { recording, parts, notes } = detail;
  const isOwner = profile?.id === recording.owner_id;
  const transcribedCount = parts.filter((p) => p.status === "transcribed").length;
  const canGenerate = isOwner && recording.status === "ready" && transcribedCount > 0;

  async function saveTitle() {
    setEditingTitle(false);
    if (!titleDraft.trim() || titleDraft === recording.title) return;
    try {
      await renameRecording(recording.id, titleDraft);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this recording, its audio, and transcript? This can't be undone.")) return;
    try {
      await deleteRecording(recording.id);
      toast.success("Recording deleted.");
      navigate(ROUTES.RECORDINGS);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function generateNotes() {
    setGenerating(true);
    try {
      const { error: fnErr } = await supabase.functions.invoke("summarize-recording", {
        body: { recording_id: recording.id },
      });
      if (fnErr) throw fnErr;
      await refresh();
      toast.success(notes ? "Notes regenerated." : "Notes generated.");
    } catch (e) {
      toast.error(`Couldn't generate notes: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <button onClick={() => navigate(ROUTES.RECORDINGS)} className="mb-4 text-sm text-indigo-600 hover:underline">
        ← Recordings
      </button>

      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingTitle && isOwner ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xl font-semibold dark:border-slate-600 dark:bg-slate-800"
            />
          ) : (
            <h1
              className={`truncate text-xl font-semibold text-slate-900 dark:text-slate-100 ${isOwner ? "cursor-text" : ""}`}
              onClick={() => {
                if (!isOwner) return;
                setTitleDraft(recording.title);
                setEditingTitle(true);
              }}
              title={isOwner ? "Click to rename" : undefined}
            >
              {recording.title}
            </h1>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {new Date(recording.created_at).toLocaleString()} ·{" "}
            {recording.subject_type === "session" ? "Session" : "Voice note"} ·{" "}
            {parts.length} part{parts.length === 1 ? "" : "s"}
            {parts.length > 0 && ` · ${transcribedCount}/${parts.length} transcribed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canGenerate && (
            <button
              onClick={() => void generateNotes()}
              disabled={generating}
              className="rounded-md border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
            >
              {generating ? "Generating…" : notes ? "Regenerate notes" : "Generate notes"}
            </button>
          )}
          {isOwner && (
            <button
              onClick={() => void handleDelete()}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {recording.status === "recording" && isOwner && (
        <div className="mb-6">
          <RecorderPanel
            recording={recording}
            existingPartCount={parts.length}
            onPartAdded={() => void refresh()}
            onEnded={() => void refresh()}
          />
        </div>
      )}

      {recording.status === "processing" && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          Transcribing and writing notes… this updates automatically.
        </div>
      )}

      {notes && (
        <div className="mb-6">
          <NotesView notes={notes} onJump={jumpTo} />
        </div>
      )}

      {canGenerate && (
        <div className="mb-6">
          <QuizDraftPanel recordingId={recording.id} />
        </div>
      )}

      <div className="space-y-4">
        {parts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {recording.status === "recording"
              ? "No parts yet — press Record above to capture your first part."
              : "This recording has no parts."}
          </p>
        ) : (
          parts.map((p) => <PartBlock key={p.id} part={p} register={register} />)
        )}
      </div>
    </div>
  );
}
