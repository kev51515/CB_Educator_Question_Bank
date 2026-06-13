/**
 * AttendanceTab — teacher surface for Attendance + Session Packages.
 * ============================================================================
 * Mounted under /educator/courses/:courseId/attendance (inside ClassLayout's
 * People group). Shows one row per enrolled student with their remaining
 * session balance as a badge (amber when remaining ≤ threshold, red at 0), an
 * inline "Log session" status picker (present/late/absent/excused), and a
 * "New package" button that opens a ResponsiveModal (student Combobox + total
 * sessions + note).
 *
 * Patterns (CLAUDE.md): optimistic UI + toast (with Undo on log via
 * voidAttendance), skeleton loading, empty state with CTA, ResponsiveModal,
 * Combobox. Balances come from useAttendance; every mutation reconciles via
 * refresh() so the badge stays honest.
 */
import { useMemo, useState } from "react";
import { useClassContext } from "./classLayoutContext";
import { useAttendance } from "./useAttendance";
import {
  createSessionPackage,
  logAttendance,
  type AttendanceStatus,
  type SessionBalanceRow,
} from "./attendance";
import { SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ResponsiveModal } from "@/components/ResponsiveModal";
import { Combobox, type ComboboxOption } from "@/components/Combobox";
import { useToast } from "@/components/Toast";

const DEFAULT_LOW_BALANCE = 2;

const STATUSES: ReadonlyArray<{ value: AttendanceStatus; label: string }> = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
];

/** Today as a yyyy-mm-dd string in the local timezone (for the session_date). */
function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

function RemainingBadge({ row }: { row: SessionBalanceRow }): JSX.Element {
  if (row.package_id == null || row.remaining == null) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
        No package
      </span>
    );
  }
  const threshold = row.low_balance_threshold ?? DEFAULT_LOW_BALANCE;
  const remaining = row.remaining;
  const tone =
    remaining <= 0
      ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
      : remaining <= threshold
        ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tone}`}
      title={`${row.used ?? 0} of ${row.total_sessions ?? 0} used`}
    >
      {remaining} left
    </span>
  );
}

export function AttendanceTab(): JSX.Element {
  const { cls } = useClassContext();
  const courseId = cls.id;
  const { rows, loading, error, refresh } = useAttendance(courseId);
  const toast = useToast();

  // Per-row inline log status (transient — drives the Log button only).
  const [logStatus, setLogStatus] = useState<Map<string, AttendanceStatus>>(
    () => new Map(),
  );
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);

  // New-package modal state.
  const [showNew, setShowNew] = useState(false);
  const [presetStudentId, setPresetStudentId] = useState<string | null>(null);

  const hasAnyPackage = useMemo(
    () => rows.some((r) => r.package_id != null),
    [rows],
  );

  const setRowStatus = (studentId: string, status: AttendanceStatus): void => {
    setLogStatus((prev) => {
      const next = new Map(prev);
      next.set(studentId, status);
      return next;
    });
  };

  const onLog = async (row: SessionBalanceRow): Promise<void> => {
    if (!row.package_id) return;
    const status = logStatus.get(row.student_id) ?? "present";
    setBusyStudentId(row.student_id);
    try {
      await logAttendance({
        packageId: row.package_id,
        sessionDate: todayIso(),
        status,
        note: null,
      });
      // Optimistic reconcile: refetch balances so the badge updates.
      await refresh();
      const label = STATUSES.find((s) => s.value === status)?.label ?? status;
      toast.success(
        `Logged ${label.toLowerCase()} for ${row.student_name}`,
        status === "excused" ? undefined : "1 session drawn down",
      );
    } catch (e) {
      toast.error(
        "Couldn't log session",
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setBusyStudentId(null);
    }
  };

  const openNewPackage = (studentId?: string): void => {
    setPresetStudentId(studentId ?? null);
    setShowNew(true);
  };

  return (
    <>
      <section
        aria-labelledby="attendance-title"
        className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
      >
        <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <h2
            id="attendance-title"
            className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
          >
            Attendance
          </h2>
          <button
            type="button"
            onClick={() => openNewPackage()}
            disabled={rows.length === 0}
            className="rounded-md bg-accent-600 hover:bg-accent-700 text-white text-xs font-medium px-3 py-1.5 min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + New package
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
        ) : rows.length === 0 ? (
          <div className="px-6 py-2">
            <EmptyState
              icon="inbox"
              title="No students yet"
              body="Add students to the course roster first — session packages attach to enrolled students."
            />
          </div>
        ) : !hasAnyPackage ? (
          <div className="px-6 py-2">
            <EmptyState
              icon="check"
              title="No packages yet"
              body="Add one to start tracking sessions. A package is a prepaid block of tutoring sessions for a student."
              cta={{
                label: "+ New package",
                onClick: () => openNewPackage(),
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Student
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Remaining
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium text-right">
                    <span className="sr-only">Log session</span>
                    Log session
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => {
                  const isBusy = busyStudentId === row.student_id;
                  const hasPackage = row.package_id != null;
                  const status = logStatus.get(row.student_id) ?? "present";
                  return (
                    <tr key={row.student_id}>
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {row.student_name}
                      </td>
                      <td className="px-6 py-3">
                        <RemainingBadge row={row} />
                      </td>
                      <td className="px-6 py-3 text-right">
                        {hasPackage ? (
                          <div className="inline-flex items-center justify-end gap-2">
                            <Combobox
                              value={status}
                              onChange={(v) =>
                                setRowStatus(
                                  row.student_id,
                                  v as AttendanceStatus,
                                )
                              }
                              options={STATUSES.map(
                                (s): ComboboxOption => ({
                                  value: s.value,
                                  label: s.label,
                                }),
                              )}
                              ariaLabel={`Session status for ${row.student_name}`}
                              className="!w-28"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void onLog(row)}
                              className="rounded-md bg-accent-600 hover:bg-accent-700 text-white text-xs font-medium px-3 py-1.5 min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isBusy ? "Logging…" : "Log"}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openNewPackage(row.student_id)}
                            className="rounded-md text-xs font-medium px-3 py-1.5 min-h-[36px] text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                          >
                            + Add package
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showNew && (
        <NewPackageModal
          courseId={courseId}
          students={rows.map((r) => ({
            id: r.student_id,
            name: r.student_name,
            hasPackage: r.package_id != null,
          }))}
          presetStudentId={presetStudentId}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void refresh();
          }}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// New-package modal
// -----------------------------------------------------------------------------

interface NewPackageStudent {
  id: string;
  name: string;
  hasPackage: boolean;
}

function NewPackageModal({
  courseId,
  students,
  presetStudentId,
  onClose,
  onCreated,
}: {
  courseId: string;
  students: NewPackageStudent[];
  presetStudentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const toast = useToast();
  const [studentId, setStudentId] = useState<string | null>(presetStudentId);
  const [totalSessions, setTotalSessions] = useState<string>("10");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const options = useMemo<ComboboxOption[]>(
    () =>
      students.map((s) => ({
        value: s.id,
        label: s.name,
        description: s.hasPackage ? "Already has a package" : undefined,
      })),
    [students],
  );

  const total = Number.parseInt(totalSessions, 10);
  const totalValid = Number.isFinite(total) && total > 0;
  const canSubmit = !!studentId && totalValid && !busy;

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!studentId || !totalValid) return;
    setBusy(true);
    try {
      await createSessionPackage({
        studentId,
        courseId,
        totalSessions: total,
        note: note.trim() || null,
      });
      const name = students.find((s) => s.id === studentId)?.name ?? "student";
      toast.success(
        "Package created",
        `${total} session${total === 1 ? "" : "s"} for ${name}`,
      );
      onCreated();
    } catch (err) {
      toast.error(
        "Couldn't create package",
        err instanceof Error ? err.message : undefined,
      );
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title="New session package"
      subtitle="A prepaid block of sessions for one student."
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-package-form"
            disabled={!canSubmit}
            className="rounded-lg bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Creating…" : "Create package"}
          </button>
        </>
      }
    >
      <form id="new-package-form" onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="np-student"
            className="block text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            Student
          </label>
          <Combobox
            id="np-student"
            value={studentId}
            onChange={setStudentId}
            options={options}
            placeholder="Choose a student…"
            searchPlaceholder="Type to filter students…"
            ariaLabel="Student"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="np-total"
            className="block text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            Total sessions
          </label>
          <input
            id="np-total"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={totalSessions}
            onChange={(e) => setTotalSessions(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 min-h-[40px] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          />
          {!totalValid && totalSessions.trim() !== "" && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Enter a whole number greater than 0.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="np-note"
            className="block text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            Note <span className="text-slate-400">(optional)</span>
          </label>
          <input
            id="np-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Spring intensive, paid 6/14"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 min-h-[40px] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
}
