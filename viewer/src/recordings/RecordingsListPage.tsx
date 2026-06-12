/**
 * RecordingsListPage — the educator's list of recordings + a "New recording"
 * modal. Search, status filter, relative time + duration, and per-row kebab
 * (rename inline / delete). Auto-refreshes while anything is still processing.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  EmptyState,
  FileDropzone,
  KebabMenu,
  ResponsiveModal,
  SkeletonRows,
  useToast,
} from "@/components";
import { useDomain } from "@/lib/DomainProvider";
import { educatorLabel } from "@/lib/domain";
import { recordingPath } from "@/lib/routes";
import {
  createRecording,
  deleteRecording,
  endRecording,
  renameRecording,
  uploadAndTranscribePart,
  useRecordingsList,
} from "./useRecordings";
import { formatDuration, relativeTime } from "./format";
import type { Recording, RecordingStatus, RecordingSubject } from "./types";

const MAX_AUDIO = 200 * 1024 * 1024; // 200 MB

const STATUS_META: Record<RecordingStatus, { label: string; cls: string }> = {
  recording: { label: "Recording", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  processing: { label: "Processing", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  ready: { label: "Ready", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  failed: { label: "Failed", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

function StatusPill({ status }: { status: RecordingStatus }) {
  const m = STATUS_META[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

type Filter = "all" | "ready" | "processing";

function RecordingRow({
  r,
  onOpen,
  onRenamed,
  onDeleted,
}: {
  r: Recording;
  onOpen: () => void;
  onRenamed: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(r.title);

  async function save() {
    setEditing(false);
    if (!draft.trim() || draft === r.title) return;
    try {
      await renameRecording(r.id, draft);
      onRenamed();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${r.title}" and its audio + transcript? This can't be undone.`)) return;
    try {
      await deleteRecording(r.id);
      toast.success("Recording deleted.");
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-medium dark:border-slate-600 dark:bg-slate-800"
          />
        ) : (
          <button type="button" onClick={onOpen} className="block w-full truncate text-left font-medium text-slate-900 dark:text-slate-100">
            {r.title}
          </button>
        )}
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {relativeTime(r.created_at)} · {r.subject_type === "session" ? "Session" : "Voice note"}
          {r.duration_s > 0 && ` · ${formatDuration(r.duration_s)}`}
        </div>
      </div>
      <StatusPill status={r.status} />
      <KebabMenu
        options={[
          { label: "Rename", onSelect: () => { setDraft(r.title); setEditing(true); } },
          { label: "Delete", destructive: true, onSelect: () => void remove() },
        ]}
      />
    </li>
  );
}

export function RecordingsListPage() {
  const { recordings, loading, error, refresh } = useRecordingsList();
  const { domain } = useDomain();
  const navigate = useNavigate();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<RecordingSubject>("self");
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const who = educatorLabel(domain).toLowerCase();
  const consentOk = subject === "self" || consent;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recordings.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      if (filter === "ready") return r.status === "ready";
      if (filter === "processing") return r.status === "processing" || r.status === "recording";
      return true;
    });
  }, [recordings, search, filter]);

  function resetForm() {
    setTitle("");
    setSubject("self");
    setConsent(false);
    setFiles([]);
  }

  async function handleCreate() {
    if (!consentOk) {
      toast.error("Please confirm consent before recording a session.");
      return;
    }
    setSubmitting(true);
    try {
      const rec = await createRecording({
        title: title || "Untitled recording",
        domain,
        subject_type: subject,
        consent_obtained: consentOk,
      });
      if (files[0]) {
        await uploadAndTranscribePart(rec, 1, files[0]);
        await endRecording(rec.id, 0, true);
      }
      setOpen(false);
      resetForm();
      navigate(recordingPath(rec.id));
    } catch (e) {
      toast.error(`Couldn't create the recording: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recordings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Record or upload audio → transcript, AI notes, and quizzes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New recording
        </button>
      </div>

      {recordings.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recordings…"
            className="min-w-[12rem] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <div className="inline-flex overflow-hidden rounded-md border border-slate-200 text-xs dark:border-slate-700">
            {(["all", "ready", "processing"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 font-medium capitalize ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRows count={4} />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : recordings.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="No recordings yet"
          body={`Record a lesson or ${who} session, or upload an audio file — you'll get a transcript and AI notes you can turn into a quiz.`}
          cta={{ label: "+ New recording", onClick: () => setOpen(true) }}
        />
      ) : visible.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No recordings match.</p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {visible.map((r) => (
            <RecordingRow
              key={r.id}
              r={r}
              onOpen={() => navigate(recordingPath(r.id))}
              onRenamed={() => void refresh()}
              onDeleted={() => void refresh()}
            />
          ))}
        </ul>
      )}

      <ResponsiveModal
        open={open}
        onClose={() => !submitting && setOpen(false)}
        title="New recording"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={submitting || !consentOk}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Creating…" : files[0] ? "Create & upload" : "Start recording"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Title</span>
            <input
              type="text"
              value={title}
              data-autofocus
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Reading lesson — inference strategies"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>

          <fieldset>
            <legend className="mb-1 text-sm font-medium">What's being recorded?</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["self", "session"] as RecordingSubject[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSubject(s)}
                  className={`rounded-md border px-3 py-2 text-left text-sm ${
                    subject === s
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                      : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="font-medium">{s === "self" ? "My voice" : "A session"}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {s === "self" ? "Lesson narration / voice notes" : `With students or ${who} clients present`}
                  </div>
                </button>
              ))}
            </div>
          </fieldset>

          {subject === "session" && (
            <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              <span>Everyone in this recording has consented to being recorded, per our policy.</span>
            </label>
          )}

          <div>
            <span className="mb-1 block text-sm font-medium">Or upload a file (optional)</span>
            <FileDropzone
              files={files}
              onChange={setFiles}
              accept="audio/*,video/mp4,.m4a,.mp3,.wav,.webm"
              maxSize={MAX_AUDIO}
              multiple={false}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Leave empty to record live on the next screen.
            </p>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
