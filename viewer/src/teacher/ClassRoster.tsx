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
 *
 * Multi-select (end-of-term housekeeping):
 *   • Master checkbox in <th> with indeterminate state.
 *   • Per-row checkbox in <td>; selected rows highlight indigo.
 *   • Sticky bottom action bar appears when ≥1 selected with
 *     "Remove from course (N)" destructive button.
 *   • Bulk archive is N/A — the `course_memberships` table has no
 *     `archived` column (see migration 0012). Only bulk Remove ships.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useClassRoster, type RosterStudent } from "./useClassRoster";
import { ConfirmDialog } from "./ConfirmDialog";
import { BulkRosterModal } from "./BulkRosterModal";
import { AddStudentModal } from "./AddStudentModal";
import { ResetStudentPasswordModal } from "./ResetStudentPasswordModal";
import { PrintLoginsModal, type PrintableLogin } from "./PrintLoginsModal";
import { SeatClaimRequestsPanel } from "./SeatClaimRequestsPanel";
import { SkeletonRows } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { useToast } from "../components/Toast";
import { useProfile } from "../lib/profile";
import { courseStudentProfilePath } from "../lib/routes";

// -----------------------------------------------------------------------------
// Sort
// -----------------------------------------------------------------------------

type SortKey = "name" | "joined";
type SortDir = "asc" | "desc";

interface SortState {
  key: SortKey;
  dir: SortDir;
}

const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

const sortStorageKey = (userId: string | null, courseId: string): string =>
  `roster.sort:${userId ?? "anon"}:${courseId}`;

function readSortState(key: string): SortState {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return DEFAULT_SORT;
    const obj = parsed as { key?: unknown; dir?: unknown };
    const k = obj.key === "name" || obj.key === "joined" ? obj.key : null;
    const d = obj.dir === "asc" || obj.dir === "desc" ? obj.dir : null;
    if (!k || !d) return DEFAULT_SORT;
    return { key: k, dir: d };
  } catch {
    return DEFAULT_SORT;
  }
}

function writeSortState(key: string, state: SortState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

function compareStudents(
  a: RosterStudent,
  b: RosterStudent,
  sort: SortState,
): number {
  const dirMul = sort.dir === "asc" ? 1 : -1;
  if (sort.key === "name") {
    const an = (a.display_name ?? a.email ?? "").toLowerCase();
    const bn = (b.display_name ?? b.email ?? "").toLowerCase();
    const cmp = an.localeCompare(bn);
    if (cmp !== 0) return cmp * dirMul;
    // Stable tiebreaker: email asc.
    return a.email.localeCompare(b.email) * dirMul;
  }
  // joined
  const at = new Date(a.joined_at).getTime();
  const bt = new Date(b.joined_at).getTime();
  const aValid = Number.isFinite(at);
  const bValid = Number.isFinite(bt);
  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;
  if (at !== bt) return (at - bt) * dirMul;
  // Stable tiebreaker: name asc.
  return (a.display_name ?? a.email)
    .toLowerCase()
    .localeCompare((b.display_name ?? b.email).toLowerCase()) * dirMul;
}

// -----------------------------------------------------------------------------
// Sortable column header button
// -----------------------------------------------------------------------------

interface SortHeaderButtonProps {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}

function SortHeaderButton({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: SortHeaderButtonProps): JSX.Element {
  const ariaSort: "ascending" | "descending" | "none" = active
    ? dir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const indicator = active ? (
    <span
      aria-hidden
      className="ml-1 inline-block text-indigo-600 dark:text-indigo-400"
    >
      {dir === "asc" ? "▲" : "▼"}
    </span>
  ) : (
    <span
      aria-hidden
      className="ml-1 inline-block text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 motion-safe:transition-opacity"
    >
      ↕
    </span>
  );
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSort(sortKey);
        }
      }}
      aria-sort={ariaSort}
      aria-label={
        active
          ? `Sorted by ${label}, ${
              dir === "asc" ? "ascending" : "descending"
            }. Click to reverse.`
          : `Sort by ${label}`
      }
      className={`group inline-flex items-center min-h-[40px] -my-2 px-1 -mx-1 rounded-md text-xs uppercase tracking-wide font-medium motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        active
          ? "text-indigo-700 dark:text-indigo-300"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {label}
      {indicator}
    </button>
  );
}

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
  const { profile } = useProfile();

  const [actionBusy, setActionBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<RosterStudent | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showPrintLogins, setShowPrintLogins] = useState(false);
  const [resetTarget, setResetTarget] = useState<RosterStudent | null>(null);
  // Search query for filtering the roster client-side. Transient — does not
  // persist across reloads (per spec).
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery, 150);

  // Sort state — persisted per (user, course). Hydrate lazily so the
  // localStorage read runs only once. If the stored value is corrupted or
  // missing, the helper silently falls back to DEFAULT_SORT.
  const sortPersistKey = sortStorageKey(profile?.id ?? null, cls.id);
  const [sort, setSort] = useState<SortState>(() =>
    readSortState(sortPersistKey),
  );
  // Re-hydrate when (user, course) changes — e.g., switching courses
  // without a full unmount. Compare on the key so we don't loop.
  const sortHydratedKeyRef = useRef<string>(sortPersistKey);
  useEffect(() => {
    if (sortHydratedKeyRef.current !== sortPersistKey) {
      sortHydratedKeyRef.current = sortPersistKey;
      setSort(readSortState(sortPersistKey));
    }
  }, [sortPersistKey]);
  // Persist on change.
  useEffect(() => {
    writeSortState(sortPersistKey, sort);
  }, [sortPersistKey, sort]);

  const onSort = useCallback((key: SortKey): void => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      // Switching keys → start ascending.
      return { key, dir: "asc" };
    });
  }, []);

  const onCopyCourseCode = useCallback(async (): Promise<void> => {
    const code = cls.short_code;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(code);
      } else {
        throw new Error("Clipboard unavailable");
      }
      toast.success("Course code copied", code);
    } catch {
      toast.error("Couldn't copy", `Course code: ${code}`);
    }
  }, [cls.short_code, toast]);

  // Multi-select state for bulk operations. Keyed by membership_id so we
  // never confuse one student's row with another. Selection survives
  // typing-into-search but clears on refresh.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Optimistic pending-remove set; rows in this set render grayed out while
  // the DELETE round-trips. On failure we roll back.
  const [pendingRemoveIds, setPendingRemoveIds] = useState<Set<string>>(
    new Set(),
  );
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const masterCheckboxRef = useRef<HTMLInputElement | null>(null);

  const filteredRoster = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const base = !q
      ? roster
      : roster.filter((s) => {
          const name = (s.display_name ?? "").toLowerCase();
          const email = s.email.toLowerCase();
          return name.includes(q) || email.includes(q);
        });
    // Sort a COPY so we don't mutate the hook's array (which would break
    // referential equality checks downstream).
    const copy = base.slice();
    copy.sort((a, b) => compareStudents(a, b, sort));
    return copy;
  }, [roster, debouncedQuery, sort]);

  // Drop selections for rows that have left the visible filtered view —
  // bulk actions should never silently target rows the teacher can't see.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visible = new Set(filteredRoster.map((s) => s.membership_id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visible.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    }
    if (changed) setSelectedIds(next);
  }, [filteredRoster, selectedIds]);

  const allVisibleSelected =
    filteredRoster.length > 0 &&
    filteredRoster.every((s) => selectedIds.has(s.membership_id));
  const someVisibleSelected =
    !allVisibleSelected &&
    filteredRoster.some((s) => selectedIds.has(s.membership_id));

  // Native checkbox `indeterminate` is not a JSX prop — drive it via ref.
  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleOne = useCallback((membershipId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(membershipId)) {
        next.delete(membershipId);
      } else {
        next.add(membershipId);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback((): void => {
    setSelectedIds((prev) => {
      if (
        filteredRoster.length > 0 &&
        filteredRoster.every((s) => prev.has(s.membership_id))
      ) {
        // All visible already selected → clear visible.
        const next = new Set(prev);
        for (const s of filteredRoster) next.delete(s.membership_id);
        return next;
      }
      // Otherwise select all visible (preserving any off-screen selections).
      const next = new Set(prev);
      for (const s of filteredRoster) next.add(s.membership_id);
      return next;
    });
  }, [filteredRoster]);

  const clearSelection = useCallback((): void => {
    setSelectedIds(new Set());
  }, []);

  const onBulkRemove = async (): Promise<void> => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setConfirmBulkRemove(false);
      return;
    }
    setActionBusy(true);
    // Optimistic: gray the rows out immediately.
    setPendingRemoveIds(new Set(ids));
    try {
      const { error: delError } = await supabase
        .from("course_memberships")
        .delete()
        .in("id", ids)
        .eq("course_id", cls.id);
      if (delError) {
        // Roll back the optimistic gray-out.
        setPendingRemoveIds(new Set());
        toast.error("Couldn't remove students", delError.message);
        return;
      }
      const count = ids.length;
      toast.success(
        `Removed ${count} ${count === 1 ? "student" : "students"}`,
      );
      setConfirmBulkRemove(false);
      setSelectedIds(new Set());
      setPendingRemoveIds(new Set());
      void refresh();
    } catch (err: unknown) {
      setPendingRemoveIds(new Set());
      toast.error(
        "Couldn't remove students",
        getErrorMessage(err, "Failed to remove students."),
      );
    } finally {
      setActionBusy(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPrintLogins(true)}
              className="rounded-md text-xs font-medium px-3 py-1.5 min-h-[36px] text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Print logins
            </button>
            <button
              type="button"
              onClick={() => setShowBulkImport(true)}
              className="rounded-md text-xs font-medium px-3 py-1.5 min-h-[36px] text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Bulk import
            </button>
            <button
              type="button"
              onClick={() => setShowAddStudent(true)}
              className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
            >
              + Add student
            </button>
          </div>
        </header>

        <SeatClaimRequestsPanel courseId={cls.id} onChange={() => void refresh()} />

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
              body="Create a student login (you'll get a code + password to hand them), or share the course code so they can join themselves."
              cta={{
                label: "+ Add student",
                onClick: () => setShowAddStudent(true),
              }}
              secondaryCta={{
                label: "Copy course code",
                onClick: () => {
                  void onCopyCourseCode();
                },
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
              <div className="px-6 py-8 flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No students match "{debouncedQuery.trim()}".
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded-md min-h-[40px] md:min-h-0 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 motion-safe:transition-colors"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/40 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="pl-6 pr-2 py-3 font-medium w-10">
                        <label className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2 cursor-pointer">
                          <span className="sr-only">
                            {allVisibleSelected
                              ? "Deselect all visible students"
                              : "Select all visible students"}
                          </span>
                          <input
                            ref={masterCheckboxRef}
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleAll}
                            aria-checked={
                              someVisibleSelected
                                ? "mixed"
                                : allVisibleSelected
                                  ? "true"
                                  : "false"
                            }
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                          />
                        </label>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3"
                        aria-sort={
                          sort.key === "name"
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <SortHeaderButton
                          label="Name"
                          sortKey="name"
                          active={sort.key === "name"}
                          dir={sort.dir}
                          onSort={onSort}
                        />
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Code
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium">
                        Email / login
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3"
                        aria-sort={
                          sort.key === "joined"
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <SortHeaderButton
                          label="Joined"
                          sortKey="joined"
                          active={sort.key === "joined"}
                          dir={sort.dir}
                          onSort={onSort}
                        />
                      </th>
                      <th scope="col" className="px-6 py-3 font-medium text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredRoster.map((s) => {
                      const isSelected = selectedIds.has(s.membership_id);
                      const isPending = pendingRemoveIds.has(s.membership_id);
                      return (
                  <tr
                    key={s.membership_id}
                    className={
                      isPending
                        ? "opacity-50 pointer-events-none"
                        : isSelected
                          ? "bg-indigo-50/70 dark:bg-indigo-950/30"
                          : undefined
                    }
                  >
                    <td className="pl-6 pr-2 py-3 w-10">
                      <label className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2 cursor-pointer">
                        <span className="sr-only">
                          Select {s.display_name ?? s.email}
                        </span>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(s.membership_id)}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                        />
                      </label>
                    </td>
                    <td className="px-6 py-3">
                      <InlineRenameName
                        value={s.display_name}
                        onSave={(next) => onRenameStudent(s, next)}
                      />
                    </td>
                    <td className="px-6 py-3">
                      {s.roster_code ? (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(s.roster_code ?? "")
                              .then(() => toast.success("Code copied", s.roster_code ?? ""))
                              .catch(() => undefined);
                          }}
                          title="Click to copy login code"
                          className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          {s.roster_code}
                        </button>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">
                      {s.managed ? (
                        <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800">
                          Managed login
                        </span>
                      ) : (
                        s.email
                      )}
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
                        {s.managed && (
                          <button
                            type="button"
                            onClick={() => setResetTarget(s)}
                            className="rounded-md min-h-[40px] md:min-h-0 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            aria-label={`Reset password for ${s.display_name ?? s.roster_code ?? s.email}`}
                          >
                            Reset password
                          </button>
                        )}
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
                      );
                    })}
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

      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk roster actions"
          className="fixed bottom-4 left-0 right-0 z-50 px-3 pointer-events-none"
        >
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-indigo-300 dark:ring-indigo-700 shadow-xl px-4 py-2.5 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setConfirmBulkRemove(true)}
                className="rounded-full min-h-[40px] md:min-h-0 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionBusy
                  ? "Working…"
                  : `Remove from course (${selectedIds.size})`}
              </button>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              disabled={actionBusy}
              className="ml-auto min-h-[40px] md:min-h-0 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md px-2 py-1 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmBulkRemove && (
        <ConfirmDialog
          title={`Remove ${selectedIds.size} ${
            selectedIds.size === 1 ? "student" : "students"
          }?`}
          body={
            <p>
              They will lose access to{" "}
              <span className="font-semibold">{cls.name}</span> and its
              assignments. Their past attempts and submissions are kept on
              file. They can rejoin later with the course code.
            </p>
          }
          confirmLabel={`Remove ${selectedIds.size}`}
          destructive
          busy={actionBusy}
          onConfirm={() => {
            void onBulkRemove();
          }}
          onCancel={() => setConfirmBulkRemove(false)}
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

      {showPrintLogins && (
        <PrintLoginsModal
          courseName={cls.name}
          students={roster
            .filter((s): s is RosterStudent & { roster_code: string } =>
              s.managed && typeof s.roster_code === "string" && s.roster_code.length > 0,
            )
            .map<PrintableLogin>((s) => ({
              id: s.student_id,
              name: s.display_name ?? s.roster_code,
              code: s.roster_code,
            }))}
          onChanged={() => {
            void refresh();
          }}
          onClose={() => setShowPrintLogins(false)}
        />
      )}

      {showAddStudent && (
        <AddStudentModal
          courseId={cls.id}
          courseName={cls.name}
          onClose={() => setShowAddStudent(false)}
          onCreated={() => {
            void refresh();
          }}
        />
      )}

      {resetTarget && (
        <ResetStudentPasswordModal
          studentId={resetTarget.student_id}
          studentName={resetTarget.display_name ?? resetTarget.roster_code ?? resetTarget.email}
          loginCode={resetTarget.login_code ?? resetTarget.roster_code}
          onClose={() => setResetTarget(null)}
        />
      )}
    </>
  );
}
