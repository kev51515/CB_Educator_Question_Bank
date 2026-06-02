/**
 * AssignmentDetailPage
 * ====================
 * Routed surface for a single assignment, mounted at
 * /classes/:classId/assignments/:assignmentId. Shows the assignment
 * metadata header (title, description, source, count, time limit,
 * difficulty, due date, created_by, archived state), exposes an actions
 * menu (Edit / Archive / Delete), and renders the existing
 * AssignmentAttemptsView below.
 *
 * Clicks on an attempt row navigate to the nested attempt detail route
 * via a relative `navigate("attempts/:attemptId")`.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "../lib/profile";
import { AssignmentAttemptsView } from "./AssignmentAttemptsView";
import { AssignmentFormModal } from "./AssignmentFormModal";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  type Assignment,
  type AssignmentSourceId,
  type AssignmentDifficultyMix,
} from "./useAssignments";
import { classAssignmentsPath } from "../lib/routes";
import { SkeletonRows } from "../components/Skeleton";

const SOURCE_LABELS: Record<AssignmentSourceId, string> = {
  cb: "CB Question Bank",
  sat: "SAT Factory",
  mixed: "Mixed",
};

const DIFFICULTY_LABELS: Record<AssignmentDifficultyMix, string> = {
  any: "Any difficulty",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/**
 * Migration 0045 added a `kind` discriminator to `assignments`. A row is
 * either a SAT mock test (kind='mocktest', source_id set) or a static
 * Question-Bank set (kind='qbank_set', qbank_set_uid set, source_id NULL).
 * Legacy rows default to 'mocktest'. The detail view branches on this to
 * surface the right "test data" for a Practice Test module item.
 */
type AssignmentKind = "mocktest" | "qbank_set";

function isAssignmentKind(value: string | null | undefined): value is AssignmentKind {
  return value === "mocktest" || value === "qbank_set";
}

interface AssignmentRow {
  id: string;
  short_code: string;
  course_id: string;
  created_by: string;
  title: string;
  description: string | null;
  source_id: string | null;
  question_count: number;
  time_limit_minutes: number;
  difficulty_mix: string;
  due_at: string | null;
  opens_at: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  kind: string | null;
  qbank_set_uid: string | null;
  qbank_set_label: string | null;
  creator: { display_name: string | null; email: string } | null;
}

function isSourceId(value: string): value is AssignmentSourceId {
  return value === "cb" || value === "sat" || value === "mixed";
}

function isDifficultyMix(value: string): value is AssignmentDifficultyMix {
  return (
    value === "easy" ||
    value === "medium" ||
    value === "hard" ||
    value === "any"
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatTimeLimit(minutes: number): string {
  if (minutes <= 0) return "Untimed";
  return `${minutes} min`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

interface FetchedAssignment extends Assignment {
  creator_display_name: string | null;
  creator_email: string | null;
  /** 'mocktest' (default) or 'qbank_set'. See migration 0045. */
  kind: AssignmentKind;
  /** Question-Bank set identifier when kind='qbank_set'; null otherwise. */
  qbank_set_uid: string | null;
  /** Cached human label of the qbank set when kind='qbank_set'. */
  qbank_set_label: string | null;
}

export function AssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { cls } = useClassContext();
  const { profile } = useProfile();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<FetchedAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the kebab menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const refresh = async (): Promise<void> => {
    if (!assignmentId) {
      setLoading(false);
      setError("Missing assignment id.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // URL param may be a UUID (legacy bookmarks) or a 6-char short_code
      // (new). Detect by format and look up against the right column.
      const isShortCode = /^[A-Z0-9]{6}$/.test(assignmentId);
      const lookupColumn = isShortCode ? "short_code" : "id";
      const { data, error: queryError } = await supabase
        .from("assignments")
        .select(
          // Join the creator profile so we can show "created by" in the
          // header. Disambiguate the FK explicitly to match the pattern
          // already used in useClassRoster.
          "id, short_code, course_id, created_by, title, description, source_id, question_count, time_limit_minutes, difficulty_mix, due_at, opens_at, archived, created_at, updated_at, kind, qbank_set_uid, qbank_set_label, creator:profiles!assignments_created_by_fkey(display_name, email)",
        )
        .eq(lookupColumn, assignmentId)
        .maybeSingle();

      if (queryError) {
        setError(queryError.message);
        return;
      }
      if (!data) {
        setError("Assignment not found.");
        return;
      }

      const row = data as unknown as AssignmentRow;
      // qbank_set rows allow NULL source_id (per migration 0045 check
      // constraint). Fall back to 'cb' for the Assignment type contract; the
      // render path uses `kind` to decide whether to show the source row.
      const safeSourceId: AssignmentSourceId =
        row.source_id && isSourceId(row.source_id) ? row.source_id : "cb";
      setAssignment({
        id: row.id,
        short_code: row.short_code,
        course_id: row.course_id,
        created_by: row.created_by,
        title: row.title,
        description: row.description,
        source_id: safeSourceId,
        question_count: row.question_count,
        time_limit_minutes: row.time_limit_minutes,
        difficulty_mix: isDifficultyMix(row.difficulty_mix)
          ? row.difficulty_mix
          : "any",
        due_at: row.due_at,
        opens_at: row.opens_at,
        archived: row.archived,
        created_at: row.created_at,
        updated_at: row.updated_at,
        creator_display_name: row.creator?.display_name ?? null,
        creator_email: row.creator?.email ?? null,
        kind: isAssignmentKind(row.kind) ? row.kind : "mocktest",
        qbank_set_uid: row.qbank_set_uid,
        qbank_set_label: row.qbank_set_label,
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load assignment."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const onToggleArchive = async (): Promise<void> => {
    if (!assignment) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const next = !assignment.archived;
      const { error: updError } = await supabase
        .from("assignments")
        .update({ archived: next })
        .eq("id", assignment.id);
      if (updError) {
        setActionError(updError.message);
        return;
      }
      setAssignment((prev) => (prev ? { ...prev, archived: next } : prev));
      setMenuOpen(false);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to update assignment."));
    } finally {
      setActionBusy(false);
    }
  };

  const onDelete = async (): Promise<void> => {
    if (!assignment) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const { error: delError } = await supabase
        .from("assignments")
        .delete()
        .eq("id", assignment.id);
      if (delError) {
        setActionError(delError.message);
        return;
      }
      // Cascade removes attempts. Navigate back up to the assignments list.
      navigate(classAssignmentsPath(cls.short_code));
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to delete assignment."));
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="py-6">
        <SkeletonRows count={3} />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div
        role="alert"
        className="rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
      >
        {error ?? "Assignment not found."}
      </div>
    );
  }

  const creatorLabel =
    assignment.creator_display_name ??
    assignment.creator_email ??
    assignment.created_by;

  return (
    <>
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => navigate(classAssignmentsPath(cls.short_code))}
          className="inline-flex items-center gap-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <span aria-hidden>←</span> Back to assignments
        </button>

        <header className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {assignment.title}
                </h1>
                {assignment.kind === "qbank_set" ? (
                  <span
                    className="rounded-full bg-indigo-100 dark:bg-indigo-950/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-900"
                    title="Question set from the Question Bank"
                  >
                    Question Set
                  </span>
                ) : assignment.kind === "mocktest" ? (
                  <span
                    className="rounded-full bg-violet-100 dark:bg-violet-950/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-900"
                    title="Full-length SAT practice test"
                  >
                    Practice Test
                  </span>
                ) : null}
                {assignment.archived && (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Archived
                  </span>
                )}
              </div>
              {assignment.description && (
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  {assignment.description}
                </p>
              )}
            </div>
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Assignment actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <span aria-hidden>⋯</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1 w-48 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 shadow-lg z-10 py-1 text-sm"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowEdit(true);
                    }}
                    className="block w-full text-left px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={actionBusy}
                    onClick={() => {
                      void onToggleArchive();
                    }}
                    className="block w-full text-left px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {assignment.archived ? "Unarchive" : "Archive"}
                  </button>
                  <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                    className="block w-full text-left px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    Delete…
                  </button>
                </div>
              )}
            </div>
          </div>

          {actionError && (
            <div
              role="alert"
              className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900"
            >
              {actionError}
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-3 grid-cols-2 sm:grid-cols-3 text-sm text-slate-700 dark:text-slate-300">
            {assignment.kind === "qbank_set" ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Question-Bank set
                </dt>
                <dd
                  className="mt-0.5 font-medium truncate"
                  title={assignment.qbank_set_uid ?? undefined}
                >
                  {assignment.qbank_set_label ??
                    assignment.qbank_set_uid ??
                    "—"}
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Source
                </dt>
                <dd className="mt-0.5 font-medium">
                  {SOURCE_LABELS[assignment.source_id]}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Questions
              </dt>
              <dd className="mt-0.5 font-medium">{assignment.question_count}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Time limit
              </dt>
              <dd className="mt-0.5 font-medium">
                {formatTimeLimit(assignment.time_limit_minutes)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Difficulty
              </dt>
              <dd className="mt-0.5 font-medium">
                {DIFFICULTY_LABELS[assignment.difficulty_mix]}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Due
              </dt>
              <dd className="mt-0.5 font-medium">
                {formatDate(assignment.due_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Created by
              </dt>
              <dd className="mt-0.5 font-medium">{creatorLabel}</dd>
            </div>
          </dl>
        </header>

        <AssignmentAttemptsView
          assignmentId={assignment.id}
          assignmentTitle={assignment.title}
          onBack={() => navigate(classAssignmentsPath(cls.short_code))}
          onOpenDetail={(attemptId) => navigate(`attempts/${attemptId}`)}
        />
      </div>

      {showEdit && (
        <AssignmentFormModal
          open={true}
          mode="edit"
          classId={cls.id}
          teacherId={profile?.id ?? ""}
          initialAssignment={assignment}
          onClose={() => setShowEdit(false)}
          onUpdated={() => {
            void refresh();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this assignment?"
          body={
            <div className="space-y-2">
              <p>
                <span className="font-semibold">{assignment.title}</span> will
                be permanently removed.
              </p>
              <p className="text-rose-700 dark:text-rose-300">
                Any student attempts on this assignment will be deleted too —
                their scores will be lost. This cannot be undone.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tip: if you want to hide it without losing data, choose
                "Archive" instead.
              </p>
            </div>
          }
          confirmLabel="Delete assignment"
          destructive
          busy={actionBusy}
          onConfirm={() => {
            void onDelete();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
