/**
 * MyClassesPanel
 * ==============
 * Compact panel listing the courses a student belongs to. Rendered inside
 * AreaSelector. Stays out of the way when the student has no courses yet
 * (shows a soft empty state instead of nothing). Each row exposes a small
 * "Leave" action so the student can drop a course they accidentally joined
 * or no longer need.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStudentClasses, type StudentClass } from "./useStudentClasses";
import { SkeletonRows } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { coursePath } from "../lib/routes";
import { useFocusTrap } from "../hooks";

interface MyClassesPanelProps {
  /**
   * Bump this number to force a refetch after a successful join. The parent
   * doesn't need to know how the panel fetches — just nudge the counter.
   */
  refreshToken?: number;
}

interface ClassRowProps {
  cls: StudentClass;
  onLeave: () => void;
  onOpen: () => void;
}

function ClassRow({ cls, onLeave, onOpen }: ClassRowProps) {
  return (
    <li className="rounded-xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 flex items-stretch justify-between gap-1 overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 min-h-[40px] text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
        aria-label={`Open course ${cls.name}`}
      >
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {cls.name}
        </p>
        {cls.teacher_display_name && (
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {cls.teacher_display_name}
          </p>
        )}
      </button>
      <div className="flex items-center gap-2 shrink-0 px-3">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Enrolled
        </span>
        <button
          type="button"
          onClick={onLeave}
          className="min-h-[40px] rounded-md px-2 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
        >
          Leave
        </button>
      </div>
    </li>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function MyClassesPanel({ refreshToken }: MyClassesPanelProps) {
  const { classes, loading, error, refresh } = useStudentClasses();
  const [confirmLeave, setConfirmLeave] = useState<StudentClass | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  // Why: react only to the refresh token, not to the `refresh` callback's
  // identity. The hook's own initial fetch handles the first load.
  useEffect(() => {
    if (refreshToken === undefined) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const onLeave = async (target: StudentClass) => {
    setActionBusy(true);
    try {
      const { error: delError } = await supabase
        .from("course_memberships")
        .delete()
        .eq("id", target.membership_id);
      if (delError) {
        toast.error("Couldn't leave course", delError.message);
        return;
      }
      setConfirmLeave(null);
      toast.success(`Left ${target.name}`);
      void refresh();
    } catch (err: unknown) {
      toast.error(
        "Couldn't leave course",
        getErrorMessage(err, "Failed to leave course."),
      );
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <section
        aria-labelledby="my-classes-title"
        className="rounded-2xl bg-white/60 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-800 p-5"
      >
        <header className="mb-3 flex items-baseline justify-between">
          <h3
            id="my-classes-title"
            className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
          >
            My courses
          </h3>
          {classes.length > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {classes.length} enrolled
            </span>
          )}
        </header>

        {loading ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You're not in any courses yet. Use the button below to join one.
          </p>
        ) : (
          <ul className="space-y-2">
            {classes.map((cls) => (
              <ClassRow
                key={cls.id}
                cls={cls}
                onLeave={() => setConfirmLeave(cls)}
                onOpen={() => navigate(coursePath(cls.short_code ?? cls.id))}
              />
            ))}
          </ul>
        )}
      </section>

      {confirmLeave && (
        <ConfirmLeaveDialog
          cls={confirmLeave}
          busy={actionBusy}
          onConfirm={() => {
            const target = confirmLeave;
            if (target) void onLeave(target);
          }}
          onCancel={() => setConfirmLeave(null)}
        />
      )}
    </>
  );
}

interface ConfirmLeaveDialogProps {
  cls: StudentClass;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmLeaveDialog({
  cls,
  busy,
  onConfirm,
  onCancel,
}: ConfirmLeaveDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Leave course"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Leave {cls.name}?
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          You'll lose access to assignments and the roster for this course. You
          can rejoin later with the course code.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5"
          >
            {busy ? "Leaving…" : "Leave course"}
          </button>
        </div>
      </div>
    </div>
  );
}
