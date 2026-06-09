/**
 * CounselingCaseloadView — the course-level "Caseload" dashboard for a
 * counseling course. One roll-up across every enrolled student: application
 * progress, upcoming deadlines, open/overdue tasks, last meeting. Each row
 * deep-links into that student's counseling workspace.
 *
 * Counseling-only tab (gated in ClassLayout). Reads the counseling_caseload
 * RPC (0135) via useCounselingCaseload.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useClassContext } from "../classLayoutContext";
import { courseStudentProfilePath } from "@/lib/routes";
import { SkeletonRows } from "@/components/Skeleton";
import {
  useCounselingCaseload,
  type CaseloadStudent,
} from "./useCounselingCaseload";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  // Parse a plain YYYY-MM-DD at local noon to avoid a TZ off-by-one.
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return "—";
  return new Date(y, m - 1, day, 12).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_ORDER = [
  "considering",
  "in_progress",
  "submitted",
  "accepted",
  "enrolled",
  "waitlisted",
  "deferred",
  "rejected",
] as const;

const STATUS_LABEL: Record<string, string> = {
  considering: "Considering",
  in_progress: "In progress",
  submitted: "Submitted",
  accepted: "Accepted",
  enrolled: "Enrolled",
  waitlisted: "Waitlisted",
  deferred: "Deferred",
  rejected: "Rejected",
};

function StatCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "slate" | "rose" | "indigo";
}) {
  const toneClass =
    tone === "rose"
      ? "text-rose-700 dark:text-rose-300"
      : tone === "indigo"
        ? "text-indigo-700 dark:text-indigo-300"
        : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      {hint && <div className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}

export function CounselingCaseloadView() {
  const { cls } = useClassContext();
  const { data, loading, error } = useCounselingCaseload(cls.id);

  const totals = data?.totals;
  const students = data?.students ?? [];

  const statusChips = useMemo(() => {
    const by = totals?.by_status ?? {};
    return STATUS_ORDER.filter((s) => (by[s] ?? 0) > 0).map((s) => ({
      key: s,
      label: STATUS_LABEL[s] ?? s,
      count: by[s] ?? 0,
    }));
  }, [totals?.by_status]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Caseload
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          College-application progress, deadlines, and tasks across every student
          in this counseling course.
        </p>
      </header>

      {error && (
        <p className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          Couldn't load the caseload: {error}
        </p>
      )}

      {loading ? (
        <SkeletonRows count={5} />
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Students" value={totals?.students ?? 0} />
            <StatCard label="Applications" value={totals?.applications ?? 0} />
            <StatCard
              label="Due in 14 days"
              value={totals?.upcoming_deadlines_14d ?? 0}
              tone={(totals?.upcoming_deadlines_14d ?? 0) > 0 ? "indigo" : "slate"}
            />
            <StatCard
              label="Docs missing"
              value={totals?.docs_missing ?? 0}
              tone={(totals?.docs_missing ?? 0) > 0 ? "rose" : "slate"}
            />
            <StatCard label="Open tasks" value={totals?.tasks_open ?? 0} />
            <StatCard
              label="Overdue tasks"
              value={totals?.tasks_overdue ?? 0}
              tone={(totals?.tasks_overdue ?? 0) > 0 ? "rose" : "slate"}
            />
          </div>

          {/* Status breakdown */}
          {statusChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {statusChips.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  {c.label}
                  <span className="rounded-full bg-white dark:bg-slate-900 px-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {c.count}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Per-student table */}
          {students.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No students enrolled yet. Add students from the Roster tab.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Student</th>
                    <th className="px-4 py-2.5 font-medium">Applications</th>
                    <th className="px-4 py-2.5 font-medium">Accepted</th>
                    <th className="px-4 py-2.5 font-medium">Next deadline</th>
                    <th className="px-4 py-2.5 font-medium">Docs</th>
                    <th className="px-4 py-2.5 font-medium">Tasks</th>
                    <th className="px-4 py-2.5 font-medium">Last meeting</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {students.map((s: CaseloadStudent) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          to={courseStudentProfilePath(cls.short_code, s.id)}
                          className="font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
                        >
                          {s.display_name?.trim() || s.email}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                        {s.applications_submitted}/{s.applications_total} submitted
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                        {s.applications_accepted > 0 ? s.applications_accepted : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                        {fmtDate(s.next_deadline)}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.docs_missing > 0 ? (
                          <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            {s.docs_missing} missing
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-slate-700 dark:text-slate-200">
                          {s.tasks_open} open
                        </span>
                        {s.tasks_overdue > 0 && (
                          <span className="ml-1.5 rounded-full bg-rose-100 dark:bg-rose-950/50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                            {s.tasks_overdue} overdue
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                        {fmtDate(s.last_meeting)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
