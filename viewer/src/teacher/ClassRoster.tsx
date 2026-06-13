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
import { supabase } from "@/lib/supabase";
import { useClassContext } from "./classLayoutContext";
import { useClassRoster, type RosterStudent } from "./useClassRoster";
import { ConfirmDialog } from "./ConfirmDialog";
import { BulkRosterModal } from "./BulkRosterModal";
import { AddStudentModal } from "./AddStudentModal";
import { ResetStudentPasswordModal } from "./ResetStudentPasswordModal";
import { PrintLoginsModal, type PrintableLogin } from "./PrintLoginsModal";
import { SeatClaimRequestsPanel } from "./SeatClaimRequestsPanel";
import { CodeActivityPanel } from "./CodeActivityPanel";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { KebabMenu, type KebabMenuOption, LoginActivityDrawer } from "@/components";
import { useToast } from "@/components/Toast";
import { useProfile } from "@/lib/profile";
import { courseStudentProfilePath } from "@/lib/routes";
import {
  compareStudents,
  formatRelative,
  getErrorMessage,
  InlineRenameName,
  readSortState,
  SortHeaderButton,
  sortStorageKey,
  useDebouncedValue,
  writeSortState,
  type SortKey,
  type SortState,
} from "@/teacher/class-roster";

// -----------------------------------------------------------------------------
// Sort
// -----------------------------------------------------------------------------

// Tooltip text that pairs a human-friendly relative phrase with the precise
// absolute timestamp — e.g. "2 days ago · 6/9/2026, 3:14:00 PM". Falls back to
// the raw ISO string if it can't be parsed. The exact ISO still lives in the
// `title`/`dateTime` attribute so it's machine-readable.
function formatRelativeWithAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatRelative(iso)} · ${d.toLocaleString()}`;
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
  const [loginTarget, setLoginTarget] = useState<RosterStudent | null>(null);

  // Per-student last-login snapshot (time + place) for the roster column.
  // Read once per course from `course_login_overview` (0222); gated server-side
  // to the course's teacher / admins. Light by design — full IP/device history
  // + map live in the "Login activity" drawer.
  const [lastLogin, setLastLogin] = useState<
    Map<string, { at: string | null; place: string | null }>
  >(new Map());
  useEffect(() => {
    const alive = { current: true };
    void (async () => {
      try {
        const { data, error: err } = await supabase.rpc("course_login_overview", {
          p_course_id: cls.id,
        });
        if (!alive.current || err || !Array.isArray(data)) return;
        const next = new Map<string, { at: string | null; place: string | null }>();
        for (const r of data as Array<{
          student_id: string;
          last_login: string | null;
          city: string | null;
          country: string | null;
          country_code: string | null;
        }>) {
          const place = r.city || r.country || r.country_code || null;
          next.set(r.student_id, { at: r.last_login, place });
        }
        setLastLogin(next);
      } catch {
        /* non-fatal — column just shows "—" */
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [cls.id, roster]);
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

  // Code-usage stats (derived; no extra fetch). A roster_code marks a
  // teacher-created seat (personal login code); its absence marks a student who
  // self-joined with the shared class code. `claimed_at` marks a seat whose
  // owner has actually activated their personal code.
  const codeStats = useMemo(() => {
    let seats = 0;
    let activatedSeats = 0;
    for (const r of roster) {
      if (r.roster_code) {
        seats += 1;
        if (r.claimed_at) activatedSeats += 1;
      }
    }
    return { seats, activatedSeats };
  }, [roster]);

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

        <CodeActivityPanel
          courseId={cls.id}
          classCode={cls.short_code}
          activatedSeats={codeStats.activatedSeats}
          totalSeats={codeStats.seats}
        />

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
                      <th scope="col" className="px-6 py-3 font-medium">
                        Last login
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
                        s.claimed_at ? (
                          <span
                            title="Code retired — this student now signs in with their own email."
                            className="inline-flex items-center rounded-md bg-slate-50 dark:bg-slate-800/50 px-2 py-1 font-mono text-xs font-medium text-slate-400 dark:text-slate-500 ring-1 ring-slate-200/70 dark:ring-slate-700/60 line-through decoration-slate-300 dark:decoration-slate-600"
                          >
                            {s.roster_code}
                          </span>
                        ) : (
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
                        )
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">
                      {s.managed ? (
                        s.claimed_at ? (
                          <span className="flex flex-col gap-0.5">
                            <span className="truncate">{s.email}</span>
                            <span
                              className="inline-flex w-fit items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800"
                              title={`Code activated ${formatRelativeWithAbsolute(s.claimed_at)}`}
                            >
                              Activated
                            </span>
                          </span>
                        ) : (
                          <span className="flex flex-col gap-0.5">
                            <span className="truncate">{s.email}</span>
                            <span className="inline-flex w-fit items-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800">
                              Managed · not activated yet
                            </span>
                          </span>
                        )
                      ) : (
                        s.email
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-500 dark:text-slate-400">
                      <time
                        dateTime={s.joined_at}
                        title={formatRelativeWithAbsolute(s.joined_at)}
                      >
                        {formatRelative(s.joined_at)}
                      </time>
                    </td>
                    <td className="px-6 py-3 text-slate-500 dark:text-slate-400">
                      {(() => {
                        const ll = lastLogin.get(s.student_id);
                        if (!ll?.at) {
                          return <span className="text-slate-300 dark:text-slate-600">Never</span>;
                        }
                        return (
                          <time
                            dateTime={ll.at}
                            title={formatRelativeWithAbsolute(ll.at)}
                            className="flex flex-col gap-0.5"
                          >
                            <span>{formatRelative(ll.at)}</span>
                            {ll.place && (
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                {ll.place}
                              </span>
                            )}
                          </time>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="inline-flex justify-end">
                        <KebabMenu
                          options={(
                            [
                              {
                                label: "View profile",
                                onSelect: () =>
                                  navigate(
                                    courseStudentProfilePath(
                                      cls.short_code,
                                      s.student_id,
                                    ),
                                  ),
                              },
                              {
                                label: "Login activity",
                                onSelect: () => setLoginTarget(s),
                              },
                              ...(s.managed
                                ? [
                                    {
                                      label: "Reset password",
                                      onSelect: () => setResetTarget(s),
                                    },
                                  ]
                                : []),
                              {
                                label: "Remove from course",
                                destructive: true,
                                onSelect: () => setConfirmRemove(s),
                              },
                            ] satisfies KebabMenuOption[]
                          )}
                        />
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
              claimed: s.claimed_at != null,
              email: s.email,
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

      {loginTarget && (
        <LoginActivityDrawer
          userId={loginTarget.student_id}
          studentName={loginTarget.display_name ?? loginTarget.email}
          onClose={() => setLoginTarget(null)}
        />
      )}

      {resetTarget && (
        <ResetStudentPasswordModal
          studentId={resetTarget.student_id}
          studentName={resetTarget.display_name ?? resetTarget.roster_code ?? resetTarget.email}
          loginCode={resetTarget.login_code ?? resetTarget.roster_code}
          claimed={resetTarget.claimed_at != null}
          loginEmail={resetTarget.email}
          onClose={() => setResetTarget(null)}
        />
      )}
    </>
  );
}
