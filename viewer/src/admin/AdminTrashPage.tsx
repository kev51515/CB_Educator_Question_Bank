/**
 * AdminTrashPage — /educator/account/admin/trash
 * ===============================================
 * The recovery surface for soft-deleted courses and users (migration 0198).
 * Deleting anywhere in the app moves the row here instead of destroying it;
 * a daily purge job hard-deletes anything older than 90 days. This page lists
 * both kinds with time-remaining and a one-click Restore.
 *
 * Reads are direct table queries under the admin RLS policies ("courses:
 * admin reads all" + "profiles: staff reads all" — both unfiltered by
 * deleted_at on purpose). Restores go through the restore_course /
 * restore_user RPCs so they're audited.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";

const PURGE_DAYS = 90;

interface TrashedCourse {
  id: string;
  name: string;
  deleted_at: string;
  teacher: { display_name: string | null } | null;
}

interface TrashedUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  deleted_at: string;
}

/** Days until the purge job removes this row (floor 0). */
function daysLeft(deletedAt: string): number {
  const purgeAt = new Date(deletedAt).getTime() + PURGE_DAYS * 864e5;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / 864e5));
}

function DaysLeftBadge({ deletedAt }: { deletedAt: string }) {
  const d = daysLeft(deletedAt);
  const urgent = d <= 7;
  return (
    <span
      title={`Deleted ${new Date(deletedAt).toLocaleDateString()} — permanently removed after ${PURGE_DAYS} days`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
        urgent
          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {d} day{d === 1 ? "" : "s"} left
    </span>
  );
}

export function AdminTrashPage(): JSX.Element {
  const toast = useToast();
  const [courses, setCourses] = useState<TrashedCourse[] | null>(null);
  const [users, setUsers] = useState<TrashedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setError(null);
    const [c, u] = await Promise.all([
      supabase
        .from("courses")
        .select("id, name, deleted_at, teacher:profiles!courses_teacher_id_fkey(display_name)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, email, display_name, role, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
    ]);
    if (c.error || u.error) {
      setError(c.error?.message ?? u.error?.message ?? "Couldn't load the trash.");
      return;
    }
    setCourses((c.data ?? []) as unknown as TrashedCourse[]);
    setUsers((u.data ?? []) as unknown as TrashedUser[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restore = async (
    kind: "course" | "user",
    id: string,
    label: string,
  ): Promise<void> => {
    setBusyId(id);
    try {
      const { error: rpcError } = await supabase.rpc(
        kind === "course" ? "restore_course" : "restore_user",
        kind === "course" ? { p_course_id: id } : { p_user_id: id },
      );
      if (rpcError) {
        toast.error(`Couldn't restore ${kind}`, rpcError.message);
        return;
      }
      toast.success(`${kind === "course" ? "Course" : "User"} restored`, label);
      void refresh();
    } finally {
      setBusyId(null);
    }
  };

  const restoreBtn = (
    kind: "course" | "user",
    id: string,
    label: string,
  ): JSX.Element => (
    <button
      type="button"
      onClick={() => void restore(kind, id, label)}
      disabled={busyId === id}
      title={`Put this ${kind} back exactly as it was`}
      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {busyId === id ? "Restoring…" : "Restore"}
    </button>
  );

  const loading = courses === null || users === null;
  const empty = !loading && courses.length === 0 && users.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title text-2xl font-bold text-slate-900 dark:text-slate-100">
          Trash
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Deleted courses and users are kept here for {PURGE_DAYS} days, then
          permanently removed. Restoring puts everything back exactly as it was.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="shrink-0 rounded-md bg-white px-3 py-1 text-xs font-medium ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-slate-900 dark:ring-rose-900"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <SkeletonRows count={4} rowClassName="h-16" />
      ) : empty ? (
        <EmptyState
          title="Trash is empty"
          body="Anything you delete — courses, students, educators — lands here first and stays recoverable for 90 days."
        />
      ) : (
        <>
          {courses.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Courses ({courses.length})
              </h2>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
                {courses.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 bg-white px-4 py-3 dark:bg-slate-900"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {c.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.teacher?.display_name ?? "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <DaysLeftBadge deletedAt={c.deleted_at} />
                      {restoreBtn("course", c.id, c.name)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {users.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Users ({users.length})
              </h2>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
                {users.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 bg-white px-4 py-3 dark:bg-slate-900"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {u.display_name ?? u.email}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {u.email} · {u.role} · sign-in blocked while in trash
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <DaysLeftBadge deletedAt={u.deleted_at} />
                      {restoreBtn("user", u.id, u.display_name ?? u.email)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default AdminTrashPage;
