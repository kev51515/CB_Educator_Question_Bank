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
 *
 * Triage layer (Wave 21):
 * - Role filter pills (All / Students / Teachers / Admins) — client-side
 *   over the current page, mirroring the search input's scope. Counts are
 *   for what's loaded right now, not the global total (server-side pills
 *   would require an extra count round-trip per role per page).
 * - Sort `<select>` (joined newest/oldest, name, role) — drives the server
 *   query, so it applies across pagination.
 * - Persistence (`admin.users.view`) so reloads keep the admin's chosen
 *   triage shape.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRovingTabIndex } from "@/hooks";
import { supabase } from "@/lib/supabase";
import { downloadCsv } from "@/lib/csv";
import { useToast } from "@/components/Toast";
import type { ProfileRole } from "@/lib/profile";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import { UserDetailDrawer } from "./UserDetailDrawer";
import {
  DEFAULT_FILTER,
  DEFAULT_SORT,
  PAGE_SIZE,
  ROLE_FILTERS,
  ROLE_SORT_WEIGHT,
  SORT_KEYS,
  filterLabel,
  formatDate,
  getErrorMessage,
  loadPersistedView,
  roleBadgeClass,
  savePersistedView,
  sortLabel,
  toUser,
  type AdminUser,
  type PersistedView,
  type RoleFilter,
  type SortKey,
} from "./allUsersHelpers";

interface AllUsersViewProps {
  /**
   * The signed-in admin's own profile id, so we can disable destructive
   * actions on their own row.
   */
  currentUserId: string;
}

export function AllUsersView({ currentUserId }: AllUsersViewProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [search, setSearch] = useState<string>("");
  // Per-user activity drawer (admin monitoring).
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  // Hydrate from localStorage on first render so the user's chosen triage
  // shape survives reloads. The shape-validate in loadPersistedView guards
  // against stale/garbage data after a future enum addition.
  const [view, setView] = useState<PersistedView>(() => loadPersistedView());
  const filter = view.filter;
  const sort = view.sort;

  const toast = useToast();

  // Persist on every change. JSON.stringify is cheap enough at this size.
  useEffect(() => {
    savePersistedView(view);
  }, [view]);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Sort drives the server query so it composes with pagination.
      // For "name" and "role", we still order by created_at as a stable
      // tiebreaker so pagination doesn't shuffle within equal keys.
      let query = supabase
        .from("profiles")
        .select("id, email, display_name, role, created_at", { count: "exact" });

      switch (sort) {
        case "created_desc":
          query = query.order("created_at", { ascending: false });
          break;
        case "created_asc":
          query = query.order("created_at", { ascending: true });
          break;
        case "name":
          // display_name can be NULL; nullsFirst:false floats unnamed users
          // to the end so the admin sees real names first.
          query = query
            .order("display_name", { ascending: true, nullsFirst: false })
            .order("email", { ascending: true })
            .order("created_at", { ascending: false });
          break;
        case "role":
          // Postgres orders strings alphabetically (admin < student <
          // teacher), which isn't the triage-useful order. We re-sort the
          // returned page client-side via ROLE_SORT_WEIGHT below. The
          // server `order("role")` here just provides a stable base
          // ordering so pagination is deterministic.
          query = query
            .order("role", { ascending: true })
            .order("created_at", { ascending: false });
          break;
      }

      const { data, error: queryError, count } = await query.range(from, to);

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
      if (sort === "role") {
        parsed.sort((a, b) => {
          const wa = ROLE_SORT_WEIGHT[a.role];
          const wb = ROLE_SORT_WEIGHT[b.role];
          if (wa !== wb) return wa - wb;
          // Newest first within each role group.
          return b.created_at.localeCompare(a.created_at);
        });
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
  }, [page, sort]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Per-role counts for the pills. Reflects what's loaded on this page,
  // matching the search input's scope ("Filter this page…"). A global-count
  // version would need three extra HEAD requests per page change, which
  // isn't worth the cost for triage-only context.
  const roleCounts = useMemo(() => {
    const counts: Record<RoleFilter, number> = {
      all: users.length,
      student: 0,
      teacher: 0,
      admin: 0,
    };
    for (const u of users) {
      counts[u.role] += 1;
    }
    return counts;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && u.role !== filter) return false;
      if (!q) return true;
      const haystack = `${u.display_name ?? ""} ${u.email}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [users, search, filter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasActiveTriage =
    filter !== DEFAULT_FILTER || sort !== DEFAULT_SORT || search.trim() !== "";

  const clearAll = (): void => {
    setSearch("");
    setView({ filter: DEFAULT_FILTER, sort: DEFAULT_SORT });
  };

  // Export the FULL roster (every page, not just what's loaded) so an admin can
  // pull the user list into a spreadsheet for records / outreach.
  const exportCsv = async (): Promise<void> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("email, display_name, role, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Export failed", getErrorMessage(error));
      return;
    }
    const header = ["Email", "Name", "Role", "Joined"];
    const rows = (data ?? []).map((u) => [u.email, u.display_name ?? "", u.role, u.created_at]);
    downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
    toast.success("Exported", `${rows.length} user${rows.length === 1 ? "" : "s"}`);
  };

  // Roving-tabindex keyboard nav (Arrow/Home/End) for the role-filter tablist.
  const { getTabProps } = useRovingTabIndex<HTMLButtonElement>({
    count: ROLE_FILTERS.length,
    activeIndex: ROLE_FILTERS.indexOf(filter),
    onSelect: (i) => setView((v) => ({ ...v, filter: ROLE_FILTERS[i] })),
  });

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
            {total} total · {sortLabel(sort).toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter this page…"
            aria-label="Search users by name or email"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
          />
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline min-h-[40px] px-2"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void exportCsv()}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline min-h-[40px] px-2"
          >
            Export CSV
          </button>
          {hasActiveTriage && (
            <button
              type="button"
              onClick={clearAll}
              className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:underline min-h-[40px] px-2"
            >
              Clear all filters
            </button>
          )}
        </div>
      </header>

      {/* Triage row: role pills (left) + sort (right). Pills use the
          tablist pattern so screen readers announce them as a grouped
          selector rather than four unrelated buttons. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          role="tablist"
          aria-label="Filter by role"
          className="flex items-center gap-1.5 flex-wrap"
        >
          {ROLE_FILTERS.map((f, idx) => {
            const active = filter === f;
            const count = roleCounts[f];
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="all-users-table"
                onClick={() => setView((v) => ({ ...v, filter: f }))}
                {...getTabProps(idx)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium min-h-[40px]",
                  "motion-safe:transition-colors",
                  active
                    ? "bg-indigo-600 text-white ring-1 ring-indigo-600 dark:bg-indigo-500 dark:ring-indigo-500"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800",
                ].join(" ")}
              >
                <span>{filterLabel(f)}</span>
                <span
                  className={[
                    "inline-flex items-center justify-center rounded-full text-xs tabular-nums px-1.5 py-0.5 min-w-[1.5rem]",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
                  ].join(" ")}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="all-users-sort"
            className="text-sm text-slate-500 dark:text-slate-400"
          >
            Sort
          </label>
          <div className="relative">
            <select
              id="all-users-sort"
              aria-label="Sort users"
              value={sort}
              onChange={(e) =>
                setView((v) => ({ ...v, sort: e.target.value as SortKey }))
              }
              className="appearance-none rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-8 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px] motion-safe:transition-colors"
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {sortLabel(k)}
                </option>
              ))}
            </select>
            {/* Chevron is the "active sort" indicator the spec calls for. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-slate-400"
            >
              <path
                fill="currentColor"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* sr-only announcer: tells AT users when the visible result set
          changes because of a filter, so they're not stuck wondering
          whether their click did anything. */}
      <div className="sr-only" aria-live="polite" role="status">
        {filter === "all"
          ? `${filtered.length} users shown`
          : `${filtered.length} ${filter}${filtered.length === 1 ? "" : "s"} shown`}
      </div>

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

      <div
        id="all-users-table"
        className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden"
      >
        {loading ? (
          <div className="px-5 py-6">
            <SkeletonRows count={6} />
          </div>
        ) : filtered.length === 0 ? (
          // Two distinct empty states:
          //  1. No users at all on this page (rare in admin context).
          //  2. Filter/search collapsed the visible set to zero — offer a
          //     "Show all" escape hatch so the admin isn't stuck.
          <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400 space-y-3">
            {users.length === 0 ? (
              <p>No users yet.</p>
            ) : (
              <>
                <p>
                  No {filter === "all" ? "users" : `${filter}s`} match this filter.
                </p>
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 min-h-[40px] motion-safe:transition-colors"
                >
                  Show all
                </button>
              </>
            )}
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
                        <button
                          type="button"
                          onClick={() => setDetailUserId(u.id)}
                          className="text-left font-medium text-slate-900 hover:text-indigo-600 hover:underline focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-100 dark:hover:text-indigo-400"
                          title="View activity"
                        >
                          {u.display_name ?? <span className="text-slate-400">—</span>}
                        </button>
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

      <UserDetailDrawer userId={detailUserId} onClose={() => setDetailUserId(null)} />
    </div>
  );
}
