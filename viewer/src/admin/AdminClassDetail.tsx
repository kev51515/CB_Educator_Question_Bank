/**
 * AdminClassDetail
 * ================
 * Read-only drilldown for a single class, shown when an admin clicks a row
 * in AllClassesView. We intentionally do NOT reuse the teacher's
 * ClassDetailView — that view ties into useProfile() for the *current*
 * teacher and renders the join code as a copyable / shareable surface
 * (which is correct for the owner, but noisy in an admin context where
 * the admin is inspecting somebody else's class).
 *
 * What we show:
 *   - Class header (name, description, owner, archived flag, join code R/O)
 *   - Roster (display_name + email + joined_at) via direct PostgREST query.
 *     RLS allows admins to read class_memberships, so no special RPC.
 *   - Assignments table (title, source, question count, due_at).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AdminClass } from "./AllClassesView";
import { SkeletonRows } from "../components/Skeleton";

interface AdminClassDetailProps {
  cls: AdminClass;
  onBack: () => void;
}

interface RosterRow {
  membership_id: string;
  display_name: string | null;
  email: string;
  joined_at: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  source_id: string;
  question_count: number;
  due_at: string | null;
  archived: boolean;
  created_at: string;
}

interface RawRosterRow {
  id: string;
  joined_at: string;
  student: { display_name: string | null; email: string } | null;
}

interface RawAssignmentRow {
  id: string;
  title: string;
  source_id: string;
  question_count: number;
  due_at: string | null;
  archived: boolean;
  created_at: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load.";
}

export function AdminClassDetail({ cls, onBack }: AdminClassDetailProps) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [rosterRes, assignmentsRes] = await Promise.all([
        supabase
          .from("course_memberships")
          .select(
            "id, joined_at, student:profiles!course_memberships_student_id_fkey(display_name, email)",
          )
          .eq("course_id", cls.id)
          .order("joined_at", { ascending: true }),
        supabase
          .from("assignments")
          .select("id, short_code, title, source_id, question_count, due_at, archived, created_at")
          .eq("course_id", cls.id)
          .order("created_at", { ascending: false }),
      ]);

      if (rosterRes.error) {
        setError(rosterRes.error.message);
        return;
      }
      if (assignmentsRes.error) {
        setError(assignmentsRes.error.message);
        return;
      }

      const rosterRows = (rosterRes.data ?? []) as unknown as RawRosterRow[];
      setRoster(
        rosterRows.map((row) => ({
          membership_id: row.id,
          display_name: row.student?.display_name ?? null,
          email: row.student?.email ?? "",
          joined_at: row.joined_at,
        })),
      );

      const assignmentRows = (assignmentsRes.data ?? []) as unknown as RawAssignmentRow[];
      setAssignments(
        assignmentRows.map((row) => ({
          id: row.id,
          title: row.title,
          source_id: row.source_id,
          question_count: row.question_count,
          due_at: row.due_at,
          archived: row.archived,
          created_at: row.created_at,
        })),
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [cls.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
      >
        <span aria-hidden>←</span> Back to all classes
      </button>

      <header className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {cls.name}
            </h2>
            {cls.description && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {cls.description}
              </p>
            )}
          </div>
          {cls.archived && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium px-2 py-0.5">
              Archived
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Teacher
            </p>
            <p className="mt-0.5 text-slate-900 dark:text-slate-100">
              {cls.teacher_name ?? "—"}
            </p>
            <p className="text-slate-500 dark:text-slate-400">{cls.teacher_email}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Join code
            </p>
            <p className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">
              {cls.join_code}
            </p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Members
            </p>
            <p className="mt-0.5 text-slate-900 dark:text-slate-100">
              {cls.member_count}
            </p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Created
            </p>
            <p className="mt-0.5 text-slate-900 dark:text-slate-100">
              {formatDate(cls.created_at)}
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
        <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Roster
          </h3>
        </header>
        {loading ? (
          <div className="px-5 py-6">
            <SkeletonRows count={4} />
          </div>
        ) : roster.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
            No students enrolled.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-5 py-2">Name</th>
                  <th className="px-5 py-2">Email</th>
                  <th className="px-5 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr
                    key={r.membership_id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-5 py-2 text-slate-900 dark:text-slate-100">
                      {r.display_name ?? "—"}
                    </td>
                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300">
                      {r.email}
                    </td>
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400">
                      {formatDate(r.joined_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
        <header className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Assignments
          </h3>
        </header>
        {loading ? (
          <div className="px-5 py-6">
            <SkeletonRows count={4} />
          </div>
        ) : assignments.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
            No assignments published.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-5 py-2">Title</th>
                  <th className="px-5 py-2">Source</th>
                  <th className="px-5 py-2">Questions</th>
                  <th className="px-5 py-2">Due</th>
                  <th className="px-5 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-5 py-2 text-slate-900 dark:text-slate-100">
                      {a.title}
                    </td>
                    <td className="px-5 py-2 uppercase text-xs text-slate-600 dark:text-slate-300">
                      {a.source_id}
                    </td>
                    <td className="px-5 py-2 text-slate-700 dark:text-slate-300">
                      {a.question_count}
                    </td>
                    <td className="px-5 py-2 text-slate-700 dark:text-slate-300">
                      {formatDate(a.due_at)}
                    </td>
                    <td className="px-5 py-2">
                      {a.archived ? (
                        <span className="inline-flex items-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium px-2 py-0.5">
                          Archived
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-medium px-2 py-0.5">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
