/**
 * AllUsersView
 * ============
 * Admin "All Users" tab. Paginated table of every profile in the system
 * with inline role editing (promote/demote) and hard delete. Both mutations
 * flow through SECURITY DEFINER RPCs (set_user_role, admin_delete_user)
 * declared in migration 0006 — the browser never holds a service-role key.
 *
 * Self-actions are guarded both at the DB layer (cannot_demote_self,
 * cannot_delete_self) and the UI layer (disabled controls + tooltip) so an
 * admin can't accidentally lock themselves out by clicking around quickly.
 *
 * Pagination is server-side via PostgREST `range()` and an exact count, so
 * we know the total before fetching the page.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import type { ProfileRole } from "../lib/profile";
import { SkeletonRows } from "../components/Skeleton";
import { ConfirmDialog } from "../teacher/ConfirmDialog";

interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  role: ProfileRole;
  created_at: string;
}

interface AllUsersViewProps {
  /**
   * The signed-in admin's own profile id, so we can disable destructive
   * actions on their own row.
   */
  currentUserId: string;
}

const PAGE_SIZE = 50;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to load users.";
}

function formatDate(iso: string): string {
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

function toUser(row: unknown): AdminUser | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.email !== "string" ||
    typeof r.role !== "string" ||
    typeof r.created_at !== "string"
  ) {
    return null;
  }
  const role = r.role;
  if (role !== "student" && role !== "teacher" && role !== "admin") return null;
  return {
    id: r.id,
    email: r.email,
    display_name: typeof r.display_name === "string" ? r.display_name : null,
    role,
    created_at: r.created_at,
  };
}

function roleBadgeClass(role: ProfileRole): string {
  switch (role) {
    case "admin":
      return "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300";
    case "teacher":
      return "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300";
    case "student":
    default:
      return "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
  }
}

export function AllUsersView({ currentUserId }: AllUsersViewProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const toast = useToast();

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error: queryError, count } = await supabase
        .from("profiles")
        .select("id, email, display_name, role, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (queryError) {
        setError(queryError.message);
        setUsers([]);
        setTotal(0);
        return;
      }

      const parsed: AdminUser[] = [];
      for (const row of data ?? []) {
        const u = toUser(row);
        if (u) parsed.push(u);
      }
      setUsers(parsed);
      setTotal(count ?? 0);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const haystack = `${u.display_name ?? ""} ${u.email}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onChangeRole = async (user: AdminUser, nextRole: ProfileRole): Promise<void> => {
    if (nextRole === user.role) return;
    setActionError(null);
    setBusyId(user.id);
    try {
      const { error: rpcError } = await supabase.rpc("set_user_role", {
        p_user_id: user.id,
        p_role: nextRole,
      });
      if (rpcError) {
        setActionError(rpcError.message);
        toast.error("Couldn't update role", rpcError.message);
        return;
      }
      toast.success("Role updated", `${user.display_name ?? user.email} → ${nextRole}`);
      await refresh();
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setActionError(msg);
      toast.error("Couldn't update role", msg);
    } finally {
      setBusyId(null);
    }
  };

  const runDelete = async (user: AdminUser): Promise<void> => {
    const label = user.display_name ?? user.email;
    setActionError(null);
    setBusyId(user.id);
    try {
      const { error: rpcError } = await supabase.rpc("admin_delete_user", {
        p_user_id: user.id,
      });
      if (rpcError) {
        setActionError(rpcError.message);
        toast.error("Couldn't delete user", rpcError.message);
        return;
      }
      toast.success("User deleted", label);
      setConfirmDelete(null);
      // If we deleted the last user on this page, step back one page.
      if (filtered.length === 1 && page > 0) {
        setPage((p) => p - 1);
      } else {
        await refresh();
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setActionError(msg);
      toast.error("Couldn't delete user", msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            All users
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {total} total · sorted by newest first
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter this page…"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {actionError && (
        <div role="alert" className="rounded-lg bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-200 dark:ring-amber-900 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {actionError}
        </div>
      )}

      <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
        {loading ? (
          <div className="px-5 py-6">
            <SkeletonRows count={6} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
            {users.length === 0 ? "No users." : "No users on this page match your filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-5 py-2">Name</th>
                  <th className="px-5 py-2">Email</th>
                  <th className="px-5 py-2">Role</th>
                  <th className="px-5 py-2">Created</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const busy = busyId === u.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-5 py-2 text-slate-900 dark:text-slate-100">
                        {u.display_name ?? <span className="text-slate-400">—</span>}
                        {isSelf && (
                          <span className="ml-2 text-xs text-slate-400">(you)</span>
                        )}
                      </td>
                      <td className="px-5 py-2 text-slate-600 dark:text-slate-300">
                        {u.email}
                      </td>
                      <td className="px-5 py-2">
                        <span
                          className={`inline-flex items-center rounded-full text-xs font-medium px-2 py-0.5 ${roleBadgeClass(u.role)}`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-slate-500 dark:text-slate-400">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-5 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          <select
                            value={u.role}
                            disabled={busy || isSelf}
                            onChange={(e) =>
                              void onChangeRole(u, e.target.value as ProfileRole)
                            }
                            title={
                              isSelf
                                ? "You can't change your own role here."
                                : "Change role"
                            }
                            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-50"
                          >
                            <option value="student">student</option>
                            <option value="teacher">teacher</option>
                            <option value="admin">admin</option>
                          </select>
                          <button
                            type="button"
                            disabled={busy || isSelf}
                            onClick={() => setConfirmDelete(u)}
                            title={
                              isSelf
                                ? "You can't delete your own account here."
                                : "Permanently delete this user"
                            }
                            className="rounded-md text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-40 disabled:no-underline"
                          >
                            Delete
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

        {/* Pagination footer. We render even on single-page results so the
            page counter is visible — it's a useful sanity check. */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-800 text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-md ring-1 ring-slate-300 dark:ring-slate-700 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="rounded-md ring-1 ring-slate-300 dark:ring-slate-700 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete user permanently?"
          body={
            <div className="space-y-2">
              <p>
                You're about to permanently delete{" "}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {confirmDelete.display_name ?? confirmDelete.email}
                </span>
                {confirmDelete.display_name && (
                  <>
                    {" "}
                    <span className="text-slate-500 dark:text-slate-400">
                      ({confirmDelete.email})
                    </span>
                  </>
                )}
                .
              </p>
              <p className="text-rose-700 dark:text-rose-300">
                This will cascade-delete their attempts, submissions, and
                course memberships. This cannot be undone.
              </p>
            </div>
          }
          confirmLabel="Delete user"
          destructive
          busy={busyId === confirmDelete.id}
          onConfirm={() => void runDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
