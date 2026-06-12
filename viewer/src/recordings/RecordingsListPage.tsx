/**
 * RecordingsListPage — the educator's list of recordings + a "New recording"
 * modal that creates the session (and, for the upload path, attaches the file
 * as Part 1) before navigating to the detail/capture page.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  EmptyState,
  FileDropzone,
  ResponsiveModal,
  SkeletonRows,
  useToast,
} from "@/components";
import { useDomain } from "@/lib/DomainProvider";
import { educatorLabel } from "@/lib/domain";
import { recordingPath } from "@/lib/routes";
import {
  createRecording,
  endRecording,
  uploadAndTranscribePart,
  useRecordingsList,
} from "./useRecordings";
import type { Recording, RecordingSubject } from "./types";

const MAX_AUDIO = 200 * 1024 * 1024; // 200 MB

function StatusPill({ status }: { status: Recording["status"] }) {
  const map: Record<Recording["status"], string> = {
    recording: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    failed: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  };
  const label = { recording: "Recording", processing: "Processing", ready: "Ready", failed: "Failed" }[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{label}</span>;
}

export function RecordingsListPage() {
  const { recordings, loading, error } = useRecordingsList();
  const { domain } = useDomain();
  const navigate = useNavigate();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<RecordingSubject>("self");
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const who = educatorLabel(domain).toLowerCase();
  const consentOk = subject === "self" || consent;

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
      // Upload path: attach the chosen file as Part 1 and finalize immediately
      // (no live capture follows), so it goes straight to processing/ready.
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
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {recordings.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => navigate(recordingPath(r.id))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900 dark:text-slate-100">{r.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(r.created_at).toLocaleString()} ·{" "}
                    {r.subject_type === "session" ? "Session" : "Voice note"}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </button>
            </li>
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
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Everyone in this recording has consented to being recorded, per our policy.
              </span>
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
