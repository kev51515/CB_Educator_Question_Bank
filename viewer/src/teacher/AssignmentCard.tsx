/**
 * AssignmentCard
 * ==============
 * Single assignment row's card UI for the teacher Assignments page.
 *
 * Owns the per-row presentation: inline rename, one-click archive/unarchive
 * status badge, kebab menu (Edit / View attempts / Archive / Delete), the
 * metadata grid (Source / Questions / Time limit / Difficulty), the due-date
 * footer with the View-attempts CTA, and the bulk-select checkbox.
 *
 * Extracted from AssignmentsPage.tsx (Wave 8C refactor) — behavior-preserving.
 * All actions are passed in as callbacks; the card has no Supabase or hook
 * dependencies beyond shared UI components.
 *
 * Inline rename / archive-badge state intentionally live inside this file:
 *   - `InlineTitle` owns its own draft/editing state so Esc/Enter handling
 *     stays scoped to the row.
 *   - `ArchiveBadge` wraps `useOptimistic` so the click feedback is instant
 *     and rolls back on commit failure.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Assignment } from "./useAssignments";
import { KebabMenu, useOptimistic, type KebabMenuOption } from "@/components";
import { useToast } from "@/components/Toast";

export interface AssignmentCardProps {
  assignment: Assignment;
  onOpenAttempts: () => void;
  onEdit: () => void;
  onArchiveCommit: (next: boolean) => Promise<void>;
  onRenameCommit: (next: string) => Promise<void>;
  onDelete: () => void;
  // Bulk-select wiring
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}

const SOURCE_LABELS: Record<Assignment["source_id"], string> = {
  cb: "CB Question Bank",
  sat: "SAT Factory",
  mixed: "Mixed",
};

const DIFFICULTY_LABELS: Record<Assignment["difficulty_mix"], string> = {
  any: "Any difficulty",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

function formatTimeLimit(minutes: number): string {
  if (minutes <= 0) return "Untimed";
  return `${minutes} min`;
}

function formatDueDate(iso: string | null): string {
  if (!iso) return "No due date";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "No due date";
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.round(diffMs / dayMs);

  if (diffDays === 0) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) return "Due now";
    if (diffHours > 0) return `Due in ${diffHours}h`;
    return `Due ${Math.abs(diffHours)}h ago`;
  }
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays === -1) return "Due yesterday";
  if (diffDays > 1) return `Due in ${diffDays} days`;
  return `Due ${Math.abs(diffDays)} days ago`;
}

/**
 * Click-to-edit title field — mirrors ModulesPage's `InlineRename`. Enter or
 * blur saves; Esc cancels. Empty / unchanged values collapse back without
 * a network round-trip.
 */
interface InlineTitleProps {
  value: string;
  onSave: (next: string) => Promise<void>;
}

function InlineTitle({ value, onSave }: InlineTitleProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(async (): Promise<void> => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    try {
      await onSave(trimmed);
      // Only close on success; throws keep the input open with the user's
      // typed value so they can retry instead of losing it.
      setEditing(false);
    } catch {
      // Keep editing=true; the parent handler already toasted.
    }
  }, [draft, onSave, value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={() => {
          void commit();
        }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 ring-1 ring-indigo-400 rounded-md px-2 py-0.5 text-base font-semibold text-slate-900 dark:text-slate-100 w-full"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="group inline-flex items-center gap-1 min-w-0 text-left cursor-text"
      title="Click to rename"
    >
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
        {value}
      </h3>
      <svg
        width={12}
        height={12}
        viewBox="0 0 16 16"
        aria-hidden
        className="opacity-60 group-hover:opacity-100 transition text-slate-400 flex-none"
      >
        <path
          fill="currentColor"
          d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-1.66 1.66l-3.56-3.56l1.66-1.66Zm-2.6 2.6L2.158 10.28a1.75 1.75 0 0 0-.479.864l-.7 2.91a.75.75 0 0 0 .907.907l2.91-.7a1.75 1.75 0 0 0 .864-.479l6.254-6.254l-3.56-3.56Z"
        />
      </svg>
    </button>
  );
}

/**
 * One-click status badge. Wrapping in `useOptimistic` keeps the click
 * feedback instant — the badge flips locally, then we commit the UPDATE.
 * On failure the hook rolls back and surfaces an error toast.
 */
interface ArchiveBadgeProps {
  archived: boolean;
  rowKey: string;
  onCommit: (next: boolean) => Promise<void>;
}

function ArchiveBadgeInner({
  archived,
  onCommit,
}: Omit<ArchiveBadgeProps, "rowKey">): JSX.Element {
  const [value, apply] = useOptimistic<boolean>(archived);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const toggle = async (): Promise<void> => {
    setBusy(true);
    const willArchive = !value;
    await apply({
      optimistic: (cur) => !cur,
      commit: async () => {
        await onCommit(willArchive);
      },
      successMessage: willArchive ? "Archived" : "Unarchived",
      // Only the archive direction offers Undo — symmetric with courses.
      successAction: willArchive
        ? {
            label: "Undo",
            onAction: () => {
              void (async () => {
                try {
                  await onCommit(false);
                  void apply({
                    optimistic: () => false,
                    commit: async () => {},
                  });
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : "Something went wrong.";
                  toast.error("Couldn't undo archive", msg);
                }
              })();
            },
          }
        : undefined,
    });
    setBusy(false);
  };

  const isArchived = value;
  return (
    <button
      type="button"
      onClick={() => {
        void toggle();
      }}
      disabled={busy}
      title={isArchived ? "Archived — click to restore" : "Active — click to archive"}
      className={`rounded-full min-h-[40px] md:min-h-0 inline-flex items-center justify-center px-3 md:px-2 py-1.5 md:py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 transition ${
        isArchived
          ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
          : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
      } ${busy ? "opacity-60 cursor-wait" : ""}`}
    >
      {isArchived ? "Archived" : "Active"}
    </button>
  );
}

function ArchiveBadge(props: ArchiveBadgeProps): JSX.Element {
  // Re-key on the authoritative value so a server refresh resets the
  // inner optimistic state. Same trick as ModulesPage's PublishToggle.
  const { rowKey, ...rest } = props;
  return <ArchiveBadgeInner key={`${rowKey}:${rest.archived}`} {...rest} />;
}

export function AssignmentCard({
  assignment,
  onOpenAttempts,
  onEdit,
  onArchiveCommit,
  onRenameCommit,
  onDelete,
  selectMode,
  selected,
  onToggleSelected,
}: AssignmentCardProps) {
  const overdue =
    assignment.due_at !== null &&
    new Date(assignment.due_at).getTime() < Date.now();
  const dueLabel = formatDueDate(assignment.due_at);
  const statusLabel = assignment.archived ? "archived" : "active";
  const ariaLabel = `Assignment: ${assignment.title}, ${statusLabel}${
    assignment.due_at ? `, ${overdue ? "overdue — " : ""}${dueLabel.toLowerCase()}` : ""
  }`;

  return (
    <article
      aria-label={ariaLabel}
      className={`rounded-2xl ring-1 p-5 shadow-sm space-y-3 ${
        assignment.archived
          ? "bg-slate-50/80 dark:bg-slate-900/40 ring-slate-200 dark:ring-slate-800 opacity-80"
          : "bg-white/85 dark:bg-slate-900/70 ring-slate-200 dark:ring-slate-800"
      } ${selectMode && selected ? "ring-2 ring-indigo-400 dark:ring-indigo-600" : ""}`}
    >
      <header className="flex items-start justify-between gap-3">
        {selectMode && (
          <label className="flex-none inline-flex items-center justify-center p-1 cursor-pointer">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              onClick={(e) => e.stopPropagation()}
              aria-label={selected ? "Deselect assignment" : "Select assignment"}
              className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <InlineTitle value={assignment.title} onSave={onRenameCommit} />
          {assignment.description && (
            <p
              className="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-2"
              title={assignment.description}
            >
              {assignment.description}
            </p>
          )}
        </div>
        <div className="flex items-start gap-1 shrink-0">
          <ArchiveBadge
            archived={assignment.archived}
            rowKey={`assignment:${assignment.id}`}
            onCommit={onArchiveCommit}
          />
          <KebabMenu
            options={(
              [
                { label: "Edit", onSelect: onEdit },
                { label: "View attempts", onSelect: onOpenAttempts },
                {
                  label: assignment.archived ? "Unarchive" : "Archive",
                  onSelect: () => {
                    void onArchiveCommit(!assignment.archived);
                  },
                },
                {
                  label: "Delete…",
                  destructive: true,
                  onSelect: onDelete,
                },
              ] satisfies KebabMenuOption[]
            )}
          />
        </div>
      </header>

      <dl className="grid gap-x-4 gap-y-1 grid-cols-2 text-xs text-slate-600 dark:text-slate-300">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Source</dt>
          <dd className="font-medium">{SOURCE_LABELS[assignment.source_id]}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Questions</dt>
          <dd className="font-medium">{assignment.question_count}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Time limit</dt>
          <dd className="font-medium">
            {formatTimeLimit(assignment.time_limit_minutes)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Difficulty</dt>
          <dd className="font-medium">
            {DIFFICULTY_LABELS[assignment.difficulty_mix]}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between pt-1">
        <span
          aria-label={overdue ? `Overdue: ${dueLabel}` : dueLabel}
          className={`text-xs font-medium ${
            overdue
              ? "text-rose-600 dark:text-rose-400"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {dueLabel}
        </span>
        <button
          type="button"
          onClick={onOpenAttempts}
          aria-label={`View attempts for ${assignment.title}`}
          className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-900 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 min-h-[40px] md:min-h-0 inline-flex items-center"
        >
          View attempts
        </button>
      </div>
    </article>
  );
}
