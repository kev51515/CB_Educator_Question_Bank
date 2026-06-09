/**
 * SystemStats
 * ===========
 * Admin Overview tab. Calls `admin_dashboard_stats` once and renders:
 *   - KPI cards (3-column grid): users by role, classes active/archived,
 *     memberships, assignments by source, attempts in_progress/completed,
 *     average score, recent signups, recent attempts.
 *   - Two small tables: "Most active teachers" and "Most active students".
 *
 * No chart library — just big numbers and tabular Top 5s. One RPC call so
 * a refresh doesn't fan out to 8 separate round-trips.
 */
import { useCallback, useEffect, useState } from "react";
import { SystemSkillsCard } from "./SystemSkillsCard";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

interface UsersByRole {
  student: number;
  teacher: number;
  admin: number;
}

interface ClassesAgg {
  active: number;
  archived: number;
}

interface AssignmentsBySource {
  cb: number;
  sat: number;
  mixed: number;
}

interface AttemptsAgg {
  in_progress: number;
  completed: number;
}

interface TeacherRow {
  id: string;
  display_name: string | null;
  email: string;
  classes_count: number;
  assignments_count: number;
}

interface StudentRow {
  id: string;
  display_name: string | null;
  email: string;
  completed_attempts: number;
}

interface DashboardStats {
  users_by_role: UsersByRole;
  courses: ClassesAgg;
  memberships: number;
  assignments_by_source: AssignmentsBySource;
  attempts: AttemptsAgg;
  avg_score: number | null;
  recent_signups_count: number;
  recent_attempts_count: number;
  most_active_teachers: TeacherRow[];
  most_active_students: StudentRow[];
}

/**
 * Defensive: the RPC returns JSONB; we walk it once and coerce. We don't
 * throw on missing fields — we fill zeros / empty arrays so the UI still
 * renders if the migration shape ever drifts.
 */
function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = toNumber(value);
  return Number.isFinite(n) ? n : null;
}

function toTeacherRow(row: unknown): TeacherRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.email !== "string") return null;
  return {
    id: r.id,
    display_name: typeof r.display_name === "string" ? r.display_name : null,
    email: r.email,
    classes_count: toNumber(r.classes_count),
    assignments_count: toNumber(r.assignments_count),
  };
}

function toStudentRow(row: unknown): StudentRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.email !== "string") return null;
  return {
    id: r.id,
    display_name: typeof r.display_name === "string" ? r.display_name : null,
    email: r.email,
    completed_attempts: toNumber(r.completed_attempts),
  };
}

function toStats(raw: unknown): DashboardStats {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const usersByRole = (r.users_by_role && typeof r.users_by_role === "object"
    ? r.users_by_role
    : {}) as Record<string, unknown>;
  const classes = (r.courses && typeof r.courses === "object"
    ? r.courses
    : {}) as Record<string, unknown>;
  const assignmentsBySource = (r.assignments_by_source && typeof r.assignments_by_source === "object"
    ? r.assignments_by_source
    : {}) as Record<string, unknown>;
  const attempts = (r.attempts && typeof r.attempts === "object"
    ? r.attempts
    : {}) as Record<string, unknown>;

  const teachersRaw = Array.isArray(r.most_active_teachers) ? r.most_active_teachers : [];
  const studentsRaw = Array.isArray(r.most_active_students) ? r.most_active_students : [];

  const teachers: TeacherRow[] = [];
  for (const row of teachersRaw) {
    const t = toTeacherRow(row);
    if (t) teachers.push(t);
  }
  const students: StudentRow[] = [];
  for (const row of studentsRaw) {
    const s = toStudentRow(row);
    if (s) students.push(s);
  }

  return {
    users_by_role: {
      student: toNumber(usersByRole.student),
      teacher: toNumber(usersByRole.teacher),
      admin: toNumber(usersByRole.admin),
    },
    courses: {
      active: toNumber(classes.active),
      archived: toNumber(classes.archived),
    },
    memberships: toNumber(r.memberships),
    assignments_by_source: {
      cb: toNumber(assignmentsBySource.cb),
      sat: toNumber(assignmentsBySource.sat),
      mixed: toNumber(assignmentsBySource.mixed),
    },
    attempts: {
      in_progress: toNumber(attempts.in_progress),
      completed: toNumber(attempts.completed),
    },
    avg_score: toNullableNumber(r.avg_score),
    recent_signups_count: toNumber(r.recent_signups_count),
    recent_attempts_count: toNumber(r.recent_attempts_count),
    most_active_teachers: teachers,
    most_active_students: students,
  };
}

interface KpiCardProps {
  title: string;
  value: string;
  subtext?: string;
}

function KpiCard({ title, value, subtext }: KpiCardProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </p>
      {subtext && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
      )}
    </div>
  );
}

function formatScore(score: number | null): string {
  if (score === null) return "—";
  return `${score.toFixed(1)}%`;
}

export function SystemStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("admin_dashboard_stats");
      if (rpcError) {
        setError(rpcError.message);
        setStats(null);
        toast.error("Couldn't load dashboard stats", rpcError.message);
        return;
      }
      setStats(toStats(data));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load dashboard stats.";
      setError(msg);
      setStats(null);
      toast.error("Couldn't load dashboard stats", msg);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Overview
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            System-wide KPIs across users, classes, assignments, and attempts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !stats ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">No data.</div>
      ) : (
        <>
          <section
            aria-label="System KPIs"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <KpiCard
              title="Users"
              value={String(
                stats.users_by_role.student +
                  stats.users_by_role.teacher +
                  stats.users_by_role.admin,
              )}
              subtext={`${stats.users_by_role.student} students · ${stats.users_by_role.teacher} teachers · ${stats.users_by_role.admin} admins`}
            />
            <KpiCard
              title="Courses"
              value={String(stats.courses.active + stats.courses.archived)}
              subtext={`${stats.courses.active} active · ${stats.courses.archived} archived`}
            />
            <KpiCard
              title="Memberships"
              value={String(stats.memberships)}
              subtext="Total student enrollments"
            />
            <KpiCard
              title="Assignments"
              value={String(
                stats.assignments_by_source.cb +
                  stats.assignments_by_source.sat +
                  stats.assignments_by_source.mixed,
              )}
              subtext={`CB ${stats.assignments_by_source.cb} · SAT ${stats.assignments_by_source.sat} · Mixed ${stats.assignments_by_source.mixed}`}
            />
            <KpiCard
              title="Attempts"
              value={String(stats.attempts.in_progress + stats.attempts.completed)}
              subtext={`${stats.attempts.in_progress} in progress · ${stats.attempts.completed} completed`}
            />
            <KpiCard
              title="Average score"
              value={formatScore(stats.avg_score)}
              subtext="Across all completed attempts"
            />
            <KpiCard
              title="Signups (last 7 days)"
              value={String(stats.recent_signups_count)}
              subtext="New profiles created"
            />
            <KpiCard
              title="Completed attempts (last 7 days)"
              value={String(stats.recent_attempts_count)}
              subtext="Submissions in the last week"
            />
          </section>

          <SystemSkillsCard />

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
              <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Most active teachers
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Top 5 by classes + assignments created
                </p>
              </header>
              {stats.most_active_teachers.length === 0 ? (
                <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No teacher activity yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60">
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="px-5 py-2">Teacher</th>
                        <th className="px-5 py-2">Classes</th>
                        <th className="px-5 py-2">Assignments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.most_active_teachers.map((t) => (
                        <tr
                          key={t.id}
                          className="border-t border-slate-100 dark:border-slate-800"
                        >
                          <td className="px-5 py-2">
                            <div className="text-slate-900 dark:text-slate-100">
                              {t.display_name ?? "—"}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {t.email}
                            </div>
                          </td>
                          <td className="px-5 py-2 text-slate-700 dark:text-slate-300">
                            {t.classes_count}
                          </td>
                          <td className="px-5 py-2 text-slate-700 dark:text-slate-300">
                            {t.assignments_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
              <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Most active students
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Top 5 by completed attempts
                </p>
              </header>
              {stats.most_active_students.length === 0 ? (
                <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No student activity yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60">
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="px-5 py-2">Student</th>
                        <th className="px-5 py-2">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.most_active_students.map((s) => (
                        <tr
                          key={s.id}
                          className="border-t border-slate-100 dark:border-slate-800"
                        >
                          <td className="px-5 py-2">
                            <div className="text-slate-900 dark:text-slate-100">
                              {s.display_name ?? "—"}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {s.email}
                            </div>
                          </td>
                          <td className="px-5 py-2 text-slate-700 dark:text-slate-300">
                            {s.completed_attempts}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
