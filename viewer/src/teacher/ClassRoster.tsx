/**
 * ClassRoster
 * ===========
 * Roster tab inside ClassLayout. Lists enrolled students with per-row
 * "Remove" action. The top-of-tab "Bulk import" button opens
 * `BulkRosterModal` which supports both pasted emails and CSV upload.
 *
 * Polish (Wave 8C):
 *   • EmptyState + CTA when no students yet.
 *   • Relative "joined N days ago" timestamps.
 *   • Inline rename of display_name (RLS-friendly: silently degrades to a
 *     toast on rejection, doesn't break the row).
 *   • Toast on remove success / failure (no inline banner needed).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useClassRoster, type RosterStudent } from "./useClassRoster";
import { ConfirmDialog } from "./ConfirmDialog";
import { BulkRosterModal } from "./BulkRosterModal";
import { SkeletonRows } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/Toast";
import { courseStudentProfilePath } from "../lib/routes";

// Debounce a value by `delay` ms. Inlined here (vs. shared hook) so the
// roster + gradebook can ship search independently without ripple.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function formatRelative(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
  const diffMs = then.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  if (abs < 60_000) return "just now";
  try {
    const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    if (abs < 3_600_000) return fmt.format(minutes, "minute");
    if (abs < 86_400_000) return fmt.format(hours, "hour");
    if (abs < 30 * 86_400_000) return fmt.format(days, "day");
    return then.toLocaleDateString();
  } catch {
    return then.toLocaleString();
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

interface InlineRenameProps {
  /** Display value — null collapses to an em-dash hint. */
  value: string | null;
  onSave: (next: string) => Promise<void>;
}

/**
 * Click-to-edit display_name cell. Enter saves, Esc cancels, blur saves.
 * Empty input or unchanged value is a no-op. Mirrors ModulesPage InlineRename.
 */
function InlineRenameName({ value, onSave }: InlineRenameProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(async (): Promise<void> => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === (value ?? "")) {
      setEditing(false);
      setDraft(value ?? "");
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
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        onBlur={() => {
          void commit();
        }}
        className="bg-white dark:bg-slate-800 ring-1 ring-indigo-400 rounded-md px-2 py-0.5 text-sm w-full max-w-xs text-slate-900 dark:text-slate-100"
        aria-label="Student display name"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1 min-w-0 text-left cursor-text"
      title="Click to rename"
    >
      <span className="truncate text-slate-900 dark:text-slate-100">
        {value ?? <span className="text-slate-400">—</span>}
      </span>
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

export function ClassRoster() {
  const { cls } = useClassContext();
  const { roster, loading, error, refresh } = useClassRoster(cls.id);
  const toast = useToast();
  const navigate = useNavigate();

  const [actionBusy, setActionBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<RosterStudent | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  // Search query for filtering the roster client-side. Transient — does not
  // persist across reloads (per spec).
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery, 150);

  const filteredRoster = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((s) => {
      const name = (s.display_name ?? "").toLowerCase();
      const email = s.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [roster, debouncedQuery]);

  const onRemoveStudent = async (mem: RosterStudent): Promise<void> => {
    setActionBusy(true);
    try {
      const { error: delError } = await supabase
        .from("course_memberships")
        .delete()
        .eq("id", mem.membership_id);
      if (delError) {
        toast.error("Couldn't remove student", delError.message);
        return;
      }
      toast.success(
        `Removed ${mem.display_name ?? mem.email}`,
      );
      setConfirmRemove(null);
      void refresh();
    } catch (err: unknown) {
      toast.error(
        "Couldn't remove student",
        getErrorMessage(err, "Failed to remove student."),
      );
    } finally {
      setActionBusy(false);
    }
  };

  // RLS on `profiles` may or may not allow staff to edit student rows
  // depending on the deployment. We attempt the update and surface a toast
  // on rejection — the row keeps its old value and nothing is broken.
  const onRenameStudent = async (
    mem: RosterStudent,
    nextDisplayName: string,
  ): Promise<void> => {
    const { error: updError } = await supabase
      .from("profiles")
      .update({ display_name: nextDisplayName })
      .eq("id", mem.student_id);
    if (updError) {
      toast.error("Couldn't rename student", updError.message);
      // Throw so InlineRenameName keeps the draft open for retry instead of
      // resolving as success and discarding the user's typed value.
      throw new Error(updError.message);
    }
    toast.success("Display name updated");
    void refresh();
  };

  return (
    <>
      <section
        aria-labelledby="roster-title"
        className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
      >
        <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <h2
            id="roster-title"
            className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
          >
            Roster
          </h2>
          <button
            type="button"
            onClick={() => setShowBulkImport(true)}
            className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5"
          >
            Bulk import
          </button>
        </header>

        {loading ? (
          <div className="px-6 py-6">
            <SkeletonRows count={5} rowClassName="h-10" />
          </div>
        ) : error ? (
          <p
            role="alert"
            className="px-6 py-8 text-sm text-rose-600 dark:text-rose-400"
          >
            {error}
          </p>
        ) : roster.length === 0 ? (
          <div className="px-6 py-2">
            <EmptyState
              title="No students yet"
              body="Share the join code from the Overview tab or bulk-import a roster from CSV."
              cta={{
                label: "Bulk import",
                onClick: () => setShowBulkImport(true),
              }}
            />
          </div>
        ) : (
          <div>
            <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 flex-wrap">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students…"
                aria-label="Search students by name or email"
                className="w-full sm:w-72 rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 px-3 py-2 min-h-[40px] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {debouncedQuery.trim()
                  ? `${filteredRoster.length} of ${roster.length} ${
                      roster.length === 1 ? "student" : "students"
                    }`
                  : `${roster.length} ${
                      roster.length === 1 ? "student" : "students"
                    }`}
              </span>
            </div>
            {filteredRoster.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">
                No students match "{debouncedQuery.trim()}".
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/40 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium">Joined</th>
                      <th className="px-6 py-3 font-medium text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredRoster.map((s) => (
                  <tr key={s.membership_id}>
                    <td className="px-6 py-3">
                      <InlineRenameName
                        value={s.display_name}
                        onSave={(next) => onRenameStudent(s, next)}
                      />
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">
                      {s.email}
                    </td>
                    <td
                      className="px-6 py-3 text-slate-500 dark:text-slate-400"
                      title={new Date(s.joined_at).toLocaleString()}
                    >
                      <time dateTime={s.joined_at}>
                        {formatRelative(s.joined_at)}
                      </time>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              courseStudentProfilePath(
                                cls.short_code,
                                s.student_id,
                              ),
                            )
                          }
                          className="rounded-md min-h-[40px] md:min-h-0 px-2 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                          aria-label={`View profile for ${s.display_name ?? s.email}`}
                        >
                          View profile
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(s)}
                          className="rounded-md min-h-[40px] md:min-h-0 px-2 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove this student?"
          body={
            <p>
              {confirmRemove.display_name ?? confirmRemove.email} will lose
              access to <span className="font-semibold">{cls.name}</span> and
              its assignments. They can rejoin later with the course code.
            </p>
          }
          confirmLabel="Remove"
          destructive
          busy={actionBusy}
          onConfirm={() => {
            const target = confirmRemove;
            if (target) void onRemoveStudent(target);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {showBulkImport && (
        <BulkRosterModal
          courseId={cls.id}
          onClose={() => setShowBulkImport(false)}
          onDone={() => {
            void refresh();
          }}
        />
      )}
    </>
  );
}
