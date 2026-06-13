/**
 * CourseRecordingsTab — the per-course "Recordings" tab (educator side).
 *
 * Lists the recordings linked to this course (owner-only RLS applies — only the
 * signed-in owner's recordings show, the intended MVP scope). Rows mirror the
 * styling in RecordingsListPage: StatusPill, relative time + duration, click a
 * row → the recording detail page. New recordings are created from the global
 * Recordings surface, so the empty state's CTA points there.
 */
import { useNavigate } from "react-router-dom";
import { EmptyState, SkeletonRows } from "@/components";
import { ROUTES, recordingPath } from "@/lib/routes";
import { useClassContext } from "@/teacher/classLayoutContext";
import { useCourseRecordings } from "./useCourseRecordings";
import { formatDuration, relativeTime } from "./format";
import type { Recording, RecordingStatus } from "./types";

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

function RecordingRow({ r, onOpen }: { r: Recording; onOpen: () => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800">
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full truncate text-left font-medium text-slate-900 dark:text-slate-100"
        >
          {r.title}
        </button>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {relativeTime(r.created_at)} · {r.subject_type === "session" ? "Session" : "Voice note"}
          {r.duration_s > 0 && ` · ${formatDuration(r.duration_s)}`}
        </div>
      </div>
      <StatusPill status={r.status} />
    </li>
  );
}

export function CourseRecordingsTab() {
  // The URL :courseId may be a short_code; the resolved course (with its real
  // UUID) comes from the ClassLayout context, not the raw param — recordings
  // .course_id is a uuid column.
  const { cls } = useClassContext();
  const navigate = useNavigate();
  const { recordings, loading, error } = useCourseRecordings(cls.id);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recordings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Recordings linked to this course — transcripts, AI notes, and quizzes.
        </p>
      </div>

      {loading ? (
        <SkeletonRows count={4} />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : recordings.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="No recordings for this course yet"
          body="Record or upload audio from the Recordings surface and link it to this course — it'll show up here."
          cta={{ label: "Go to Recordings", onClick: () => navigate(ROUTES.RECORDINGS) }}
        />
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {recordings.map((r) => (
            <RecordingRow key={r.id} r={r} onOpen={() => navigate(recordingPath(r.id))} />
          ))}
        </ul>
      )}
    </div>
  );
}
