/**
 * RecordingDetailPage — Fathom-style: notes-first, with a collapsible,
 * searchable, editable Full Transcript underneath.
 *
 *  - While `status === 'recording'` and the viewer owns it, hosts RecorderPanel.
 *  - AI "Fathom" notes render prominently with jump-to-timestamp chips.
 *  - Full Transcript collapses by default once notes exist; supports search,
 *    speaker renaming (across Parts), and inline correction of any utterance.
 *  - Copy notes / copy transcript / download .md from the header.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { KebabMenu, Skeleton, useToast } from "@/components";
import { useProfile } from "@/lib/profile";
import { useDomain } from "@/lib/DomainProvider";
import { ROUTES } from "@/lib/routes";
import { RecorderPanel } from "./RecorderPanel";
import { QuizDraftPanel } from "./QuizDraftPanel";
import {
  deletePart,
  deleteRecording,
  renameRecording,
  renameSpeaker,
  retryPart,
  updateNotes,
  updatePartTranscript,
  useRecordingDetail,
} from "./useRecordings";
import {
  downloadText,
  fmtTs,
  recordingToMarkdown,
  relativeTime,
  slugifyTitle,
  speakerDisplay,
  transcriptToText,
} from "./format";
import type { RecordingNotes, RecordingPart, Utterance } from "./types";

type RegisterAudio = (partIndex: number, el: HTMLAudioElement | null) => void;
type JumpTo = (partIndex: number, startMs: number) => void;

/** Wrap case-insensitive matches of `q` in <mark>. */
function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-200 px-0.5 dark:bg-amber-500/40">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
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
    <audio controls preload="none" src={url} ref={(el) => register(partIndex, el)} className="mt-2 w-full" />
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

/** One editable utterance line. */
function UtteranceRow({
  u,
  editable,
  query,
  onSave,
}: {
  u: Utterance;
  editable: boolean;
  query: string;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(u.text);
  if (editing) {
    return (
      <div className="flex gap-2">
        <span className="mt-1 shrink-0 text-xs font-medium text-slate-500">{speakerDisplay(u.speaker)}</span>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft !== u.text) onSave(draft);
          }}
          rows={2}
          className="w-full resize-y rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
      </div>
    );
  }
  return (
    <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
      <span className="mr-2 font-medium text-slate-500 dark:text-slate-400">{speakerDisplay(u.speaker)}:</span>
      <span
        className={editable ? "cursor-text rounded hover:bg-slate-100 dark:hover:bg-slate-800" : ""}
        onClick={() => editable && setEditing(true)}
        title={editable ? "Click to correct" : undefined}
      >
        {highlight(u.text, query)}
      </span>
    </p>
  );
}

function PartBlock({
  part,
  register,
  editable,
  query,
  onSaved,
  onRetry,
  onDelete,
}: {
  part: RecordingPart;
  register: RegisterAudio;
  editable: boolean;
  query: string;
  onSaved: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const pending = part.status !== "transcribed" && part.status !== "failed";
  const toast = useToast();
  const utterances = part.transcript ?? [];
  const visible = query
    ? utterances.filter((u) => u.text.toLowerCase().includes(query.toLowerCase()))
    : utterances;

  async function saveUtterance(idx: number, text: string) {
    const next = utterances.map((u, i) => (i === idx ? { ...u, text } : u));
    try {
      await updatePartTranscript(part.id, next);
      onSaved();
    } catch (e) {
      toast.error(`Couldn't save: ${(e as Error).message}`);
    }
  }

  if (query && visible.length === 0) return null;

  return (
    <section id={`part-${part.part_index}`} className="scroll-mt-20 border-t border-slate-200 pt-4 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
          Part {part.part_index}
        </h3>
        <div className="flex items-center gap-2">
          {partStatusLabel(part) && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {pending && <span className="mr-1 inline-block animate-pulse">●</span>}
              {partStatusLabel(part)}
            </span>
          )}
          {part.status === "failed" && editable && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded border border-indigo-200 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900/50 dark:text-indigo-300"
            >
              Retry
            </button>
          )}
          {editable && (
            <KebabMenu
              options={[
                ...(part.status === "failed" || part.status === "transcribed"
                  ? [{ label: "Retry transcription", onSelect: onRetry }]
                  : []),
                { label: "Delete part", destructive: true, onSelect: onDelete },
              ]}
            />
          )}
        </div>
      </div>
      {utterances.length > 0 ? (
        <div className="space-y-2">
          {visible.map((u) => {
            const idx = utterances.indexOf(u);
            return (
              <UtteranceRow
                key={idx}
                u={u}
                editable={editable}
                query={query}
                onSave={(text) => void saveUtterance(idx, text)}
              />
            );
          })}
        </div>
      ) : pending ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <p className="text-sm italic text-slate-400">No transcript.</p>
      )}
      {part.audio_path && <PartAudio partIndex={part.part_index} path={part.audio_path} register={register} />}
    </section>
  );
}

/** Speaker rename chip. */
function SpeakerChip({ name, onRename }: { name: string; onRename: (to: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onRename(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-28 rounded-full border border-indigo-300 px-2 py-0.5 text-xs dark:border-indigo-700 dark:bg-slate-800"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300"
      title="Rename this speaker everywhere"
    >
      {speakerDisplay(name)}
    </button>
  );
}

function TranscriptSection({
  parts,
  register,
  isOwner,
  open,
  setOpen,
  refresh,
}: {
  parts: RecordingPart[];
  register: RegisterAudio;
  isOwner: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  refresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const toast = useToast();
  const speakers = Array.from(
    new Set(parts.flatMap((p) => (p.transcript ?? []).map((u) => u.speaker))),
  ).sort();

  async function handleRename(from: string, to: string) {
    try {
      await renameSpeaker(parts, from, to);
      refresh();
    } catch (e) {
      toast.error(`Couldn't rename: ${(e as Error).message}`);
    }
  }

  async function handleRetry(part: RecordingPart) {
    try {
      await retryPart(part.id);
      toast.success(`Retrying Part ${part.part_index}…`);
      refresh();
    } catch (e) {
      toast.error(`Couldn't retry: ${(e as Error).message}`);
    }
  }

  async function handleDeletePart(part: RecordingPart) {
    if (!confirm(`Delete Part ${part.part_index}? This can't be undone.`)) return;
    try {
      await deletePart(part, parts);
      toast.success(`Part ${part.part_index} deleted.`);
      refresh();
    } catch (e) {
      toast.error(`Couldn't delete: ${(e as Error).message}`);
    }
  }

  const showBody = open || !!query;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-5 py-3"
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Full transcript
        </span>
        <span className={`text-slate-400 transition-transform ${showBody ? "rotate-90" : ""}`}>▸</span>
      </button>
      {showBody && (
        <div className="px-5 pb-5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the transcript…"
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          {isOwner && speakers.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Speakers:</span>
              {speakers.map((s) => (
                <SpeakerChip key={s} name={s} onRename={(to) => void handleRename(s, to)} />
              ))}
            </div>
          )}
          <div className="space-y-4">
            {parts.map((p) => (
              <PartBlock
                key={p.id}
                part={p}
                register={register}
                editable={isOwner}
                query={query}
                onSaved={refresh}
                onRetry={() => void handleRetry(p)}
                onDelete={() => void handleDeletePart(p)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeChip({ partIndex, startMs, onJump }: { partIndex: number; startMs: number; onJump: JumpTo }) {
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

/** Click-to-edit text (single line or multiline), saves on blur. */
function EditableText({
  value,
  onSave,
  editable,
  multiline,
  placeholder,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  editable: boolean;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing && editable) {
    const common = {
      autoFocus: true,
      value: draft,
      onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      onBlur: () => {
        setEditing(false);
        if (draft !== value) onSave(draft);
      },
      className: `w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 ${className ?? ""}`,
    };
    return multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />;
  }
  return (
    <span
      className={`${editable ? "cursor-text rounded hover:bg-slate-100 dark:hover:bg-slate-800" : ""} ${className ?? ""}`}
      onClick={() => editable && (setDraft(value), setEditing(true))}
      title={editable ? "Click to edit" : undefined}
    >
      {value || <span className="text-slate-400">{placeholder}</span>}
    </span>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-1 shrink-0 rounded px-1 text-xs text-slate-400 hover:text-red-600"
      title="Remove"
      aria-label="Remove"
    >
      ✕
    </button>
  );
}

function NotesView({
  notes,
  onJump,
  editable,
  onUpdate,
}: {
  notes: RecordingNotes;
  onJump: JumpTo;
  editable: boolean;
  onUpdate: (patch: Partial<RecordingNotes>) => void;
}) {
  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      {(notes.tldr || editable) && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Summary</h2>
          <p className="text-sm text-slate-800 dark:text-slate-200">
            <EditableText
              value={notes.tldr ?? ""}
              editable={editable}
              multiline
              placeholder="Add a summary…"
              onSave={(v) => onUpdate({ tldr: v })}
            />
          </p>
        </div>
      )}

      {notes.topics.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Topics</h2>
          <ul className="space-y-2">
            {notes.topics.map((t, i) => (
              <li key={i} className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    <EditableText
                      value={t.title}
                      editable={editable}
                      onSave={(v) => onUpdate({ topics: notes.topics.map((x, j) => (j === i ? { ...x, title: v } : x)) })}
                    />
                    {t.part_index != null && <TimeChip partIndex={t.part_index} startMs={t.start_ms ?? 0} onJump={onJump} />}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    <EditableText
                      value={t.summary}
                      editable={editable}
                      multiline
                      onSave={(v) => onUpdate({ topics: notes.topics.map((x, j) => (j === i ? { ...x, summary: v } : x)) })}
                    />
                  </div>
                </div>
                {editable && <RemoveBtn onClick={() => onUpdate({ topics: notes.topics.filter((_, j) => j !== i) })} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(notes.action_items.length > 0 || editable) && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Action items</h2>
          <ul className="space-y-1 text-sm text-slate-800 dark:text-slate-200">
            {notes.action_items.map((a, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="mt-1 text-slate-400">•</span>
                <span className="min-w-0 flex-1">
                  <EditableText
                    value={a.text}
                    editable={editable}
                    placeholder="Action item…"
                    onSave={(v) => onUpdate({ action_items: notes.action_items.map((x, j) => (j === i ? { ...x, text: v } : x)) })}
                  />
                  {a.owner ? ` — ${a.owner}` : ""}
                </span>
                {editable && <RemoveBtn onClick={() => onUpdate({ action_items: notes.action_items.filter((_, j) => j !== i) })} />}
              </li>
            ))}
          </ul>
          {editable && (
            <button
              type="button"
              onClick={() => onUpdate({ action_items: [...notes.action_items, { text: "" }] })}
              className="mt-1 text-xs font-medium text-indigo-600 hover:underline"
            >
              + Add item
            </button>
          )}
        </div>
      )}

      {notes.highlights.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Highlights</h2>
          <ul className="space-y-1">
            {notes.highlights.map((h, i) => (
              <li key={i} className="flex items-start border-l-2 border-indigo-300 pl-3 text-sm italic text-slate-700 dark:text-slate-300">
                <span className="min-w-0 flex-1">
                  "{h.quote}"
                  {h.part_index != null && <TimeChip partIndex={h.part_index} startMs={h.start_ms ?? 0} onJump={onJump} />}
                </span>
                {editable && <RemoveBtn onClick={() => onUpdate({ highlights: notes.highlights.filter((_, j) => j !== i) })} />}
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
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const audioRegistry = useRef<Map<number, HTMLAudioElement>>(new Map());
  const register = useCallback<RegisterAudio>((partIndex, el) => {
    if (el) audioRegistry.current.set(partIndex, el);
    else audioRegistry.current.delete(partIndex);
  }, []);
  const jumpTo = useCallback<JumpTo>((partIndex, startMs) => {
    setTranscriptOpen(true);
    // Let the transcript expand before scrolling/seeking.
    setTimeout(() => {
      document.getElementById(`part-${partIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      const el = audioRegistry.current.get(partIndex);
      if (el) {
        el.currentTime = Math.max(0, startMs / 1000);
        void el.play().catch(() => {});
      }
    }, 60);
  }, []);

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
        <button onClick={() => navigate(ROUTES.RECORDINGS)} className="mb-4 text-sm text-indigo-600">← Recordings</button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ?? "Recording not found."}
        </div>
      </div>
    );
  }

  const { recording, parts, notes } = detail;
  const isOwner = profile?.id === recording.owner_id;
  const transcribedCount = parts.filter((p) => p.status === "transcribed").length;
  const hasTranscript = transcribedCount > 0;
  const canGenerate = isOwner && recording.status === "ready" && hasTranscript;

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

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied.`);
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <button onClick={() => navigate(ROUTES.RECORDINGS)} className="mb-4 text-sm text-indigo-600 hover:underline">
        ← Recordings
      </button>

      <div className="mb-2 flex items-start justify-between gap-3">
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
            {relativeTime(recording.created_at)} · {recording.subject_type === "session" ? "Session" : "Voice note"} ·{" "}
            {parts.length} part{parts.length === 1 ? "" : "s"}
            {parts.length > 0 && ` · ${transcribedCount}/${parts.length} transcribed`}
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => void handleDelete()}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20"
          >
            Delete
          </button>
        )}
      </div>

      {/* Action bar */}
      {hasTranscript && (
        <div className="mb-5 flex flex-wrap gap-2">
          {canGenerate && (
            <button
              onClick={() => void generateNotes()}
              disabled={generating}
              className="rounded-md border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
            >
              {generating ? "Generating…" : notes ? "Regenerate notes" : "Generate notes"}
            </button>
          )}
          {notes && (
            <button
              onClick={() => void copy(recordingToMarkdown(recording, notes, parts), "Notes")}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Copy notes
            </button>
          )}
          <button
            onClick={() => void copy(transcriptToText(parts), "Transcript")}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Copy transcript
          </button>
          <button
            onClick={() => downloadText(`${slugifyTitle(recording.title)}.md`, recordingToMarkdown(recording, notes, parts))}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Download .md
          </button>
        </div>
      )}

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
          <NotesView
            notes={notes}
            onJump={jumpTo}
            editable={isOwner}
            onUpdate={(patch) => {
              void (async () => {
                try {
                  await updateNotes(recording.id, patch);
                  await refresh();
                } catch (e) {
                  toast.error(`Couldn't save notes: ${(e as Error).message}`);
                }
              })();
            }}
          />
        </div>
      )}

      {canGenerate && (
        <div className="mb-6">
          <QuizDraftPanel recordingId={recording.id} />
        </div>
      )}

      {parts.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {recording.status === "recording"
            ? "No parts yet — press Record above to capture your first part."
            : "This recording has no parts."}
        </p>
      ) : (
        <TranscriptSection
          parts={parts}
          register={register}
          isOwner={isOwner}
          open={transcriptOpen || !notes}
          setOpen={setTranscriptOpen}
          refresh={() => void refresh()}
        />
      )}
    </div>
  );
}
