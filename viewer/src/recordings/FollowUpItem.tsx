/**
 * FollowUpItem — one tracked follow-up row, shared by the recording-detail
 * panel and the standalone Follow-ups page. Checkbox to complete, inline body,
 * a due-date control (SmartDatePicker, revealed on click), and delete. The
 * page variant also links back to the source recording.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { SmartDatePicker } from "@/components";
import { recordingPath } from "@/lib/routes";
import type { RecordingFollowUp } from "./types";

/** Bucket + relative label for a due date, from its distance to now. */
export function dueMeta(dueAt: string | null, done: boolean): {
  bucket: "overdue" | "today" | "soon" | "later" | "none";
  label: string;
  cls: string;
} {
  if (!dueAt) return { bucket: "none", label: "No due date", cls: "text-slate-400" };
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const dayMs = 86_400_000;
  const days = Math.round((due - now) / dayMs);
  if (done) return { bucket: "none", label: fmtDue(dueAt), cls: "text-slate-400" };
  if (days < 0)
    return {
      bucket: "overdue",
      label: days === -1 ? "Overdue · yesterday" : `Overdue · ${-days}d`,
      cls: "text-red-600 dark:text-red-400",
    };
  if (days === 0) return { bucket: "today", label: "Due today", cls: "text-amber-600 dark:text-amber-400" };
  if (days <= 7)
    return {
      bucket: "soon",
      label: days === 1 ? "Due tomorrow" : `Due in ${days}d`,
      cls: "text-amber-600 dark:text-amber-400",
    };
  return { bucket: "later", label: `Due ${fmtDue(dueAt)}`, cls: "text-slate-500 dark:text-slate-400" };
}

function fmtDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function FollowUpItem({
  fu,
  onToggle,
  onSetDue,
  onDelete,
  sourceTitle,
}: {
  fu: RecordingFollowUp;
  onToggle: (done: boolean) => void;
  onSetDue: (iso: string | null) => void;
  onDelete: () => void;
  /** When provided, render a link back to the source recording. */
  sourceTitle?: string | null;
}) {
  const [editingDue, setEditingDue] = useState(false);
  const meta = dueMeta(fu.due_at, fu.done);

  return (
    <li className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={fu.done}
          onClick={() => onToggle(!fu.done)}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
            fu.done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 hover:border-indigo-400 dark:border-slate-600"
          }`}
          aria-label={fu.done ? "Mark not done" : "Mark done"}
          title={fu.done ? "Mark not done" : "Mark done"}
        >
          {fu.done && (
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className={`text-sm ${fu.done ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-200"}`}>
            {fu.body}
            {fu.assignee && !fu.done && (
              <span className="ml-1 text-xs text-slate-400">— {fu.assignee}</span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => setEditingDue((v) => !v)}
              className={`text-xs font-medium ${meta.cls} hover:underline`}
            >
              {meta.label}
            </button>
            {sourceTitle && fu.recording_id && (
              <Link
                to={recordingPath(fu.recording_id)}
                className="truncate text-xs text-slate-400 hover:text-indigo-600 hover:underline"
              >
                {sourceTitle}
              </Link>
            )}
          </div>
          {editingDue && (
            <div className="mt-2">
              <SmartDatePicker
                value={fu.due_at}
                onChange={(iso) => {
                  onSetDue(iso);
                  setEditingDue(false);
                }}
                label="Due"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="mt-0.5 shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
          aria-label="Delete follow-up"
          title="Delete"
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>
    </li>
  );
}
