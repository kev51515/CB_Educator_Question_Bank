/**
 * SharedRecordingsPage — the student's "Shared with me" hub. Lists recordings
 * a teacher / counselor shared into one of the student's enrolled courses
 * (RLS-scoped via migration 0225). Read-only: students can't create, rename,
 * move, or delete — each row just links to the role-agnostic
 * `/recordings/:recordingId` view (SharedRecordingView).
 *
 * Mirrors the educator RecordingsListPage row / skeleton / empty look, minus
 * the kebab, create modal, search, and status pills.
 */
import { Link } from "react-router-dom";
import { EmptyState, SkeletonRows } from "@/components";
import { recordingViewPath } from "@/lib/routes";
import { useSharedRecordings } from "@/recordings/useSharedRecordings";
import { formatDuration, relativeTime } from "@/recordings/format";
import type { Recording } from "@/recordings/types";

function SharedRecordingRow({ r }: { r: Recording }) {
  return (
    <li className="hover:bg-slate-50 dark:hover:bg-slate-800">
      <Link
        to={recordingViewPath(r.id)}
        className="flex items-center gap-3 px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-900 dark:text-slate-100">
            {r.title}
          </span>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {relativeTime(r.created_at)} ·{" "}
            {r.subject_type === "session" ? "Session" : "Voice note"}
            {r.duration_s > 0 && ` · ${formatDuration(r.duration_s)}`}
          </div>
        </div>
        <svg
          aria-hidden
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-slate-400"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Link>
    </li>
  );
}

export function SharedRecordingsPage() {
  const { recordings, loading, error } = useSharedRecordings();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Shared with me
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Recordings your teachers shared with you.
        </p>
      </div>

      {loading ? (
        <SkeletonRows count={4} />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : recordings.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Nothing shared yet"
          body="When a teacher shares a lesson or session recording with one of your courses, it'll show up here for you to review."
        />
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {recordings.map((r) => (
            <SharedRecordingRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
