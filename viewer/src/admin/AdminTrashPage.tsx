/**
 * AdminTrashPage — /educator/account/admin/trash
 * ===============================================
 * The recovery surface for everything soft-deleted (migrations 0198 + 0202):
 * courses, users, assignments, modules, module items, materials,
 * announcements, and discussion topics. Deleting anywhere in the app moves
 * the row here instead of destroying it; a daily purge job hard-deletes
 * anything older than 90 days.
 *
 * Data: the admin-only `list_trash()` RPC (one fetch, all kinds — required
 * because 0202 filters trashed content out of EVERY direct query, staff
 * included). Restores go through restore_course / restore_user /
 * restore_content so they're audited and re-wire side effects (e.g. a
 * restored assignment brings its Modules links back).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";

const PURGE_DAYS = 90;

/** Kinds in display order, with their section headers + restore wiring. */
const KIND_META: ReadonlyArray<{
  kind: string;
  header: string;
  restore: (id: string) => Promise<{ error: { message: string } | null }>;
}> = [
  {
    kind: "course",
    header: "Courses",
    restore: async (id) => supabase.rpc("restore_course", { p_course_id: id }),
  },
  {
    kind: "user",
    header: "Users",
    restore: async (id) => supabase.rpc("restore_user", { p_user_id: id }),
  },
  {
    kind: "assignment",
    header: "Assignments",
    restore: async (id) =>
      supabase.rpc("restore_content", { p_kind: "assignment", p_id: id }),
  },
  {
    kind: "module",
    header: "Modules",
    restore: async (id) =>
      supabase.rpc("restore_content", { p_kind: "module", p_id: id }),
  },
  {
    kind: "module_item",
    header: "Module items",
    restore: async (id) =>
      supabase.rpc("restore_content", { p_kind: "module_item", p_id: id }),
  },
  {
    kind: "material",
    header: "Materials",
    restore: async (id) =>
      supabase.rpc("restore_content", { p_kind: "material", p_id: id }),
  },
  {
    kind: "announcement",
    header: "Announcements",
    restore: async (id) =>
      supabase.rpc("restore_content", { p_kind: "announcement", p_id: id }),
  },
  {
    kind: "topic",
    header: "Discussions",
    restore: async (id) =>
      supabase.rpc("restore_content", { p_kind: "topic", p_id: id }),
  },
];

interface TrashRow {
  kind: string;
  id: string;
  label: string;
  context: string | null;
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
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("list_trash");
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setRows((data ?? []) as TrashRow[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restore = async (row: TrashRow): Promise<void> => {
    const meta = KIND_META.find((k) => k.kind === row.kind);
    if (!meta) return;
    setBusyId(row.id);
    try {
      const { error: rpcError } = await meta.restore(row.id);
      if (rpcError) {
        toast.error("Couldn't restore", rpcError.message);
        return;
      }
      toast.success("Restored", row.label);
      void refresh();
    } finally {
      setBusyId(null);
    }
  };

  const loading = rows === null;
  const empty = !loading && rows.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title text-2xl font-bold text-slate-900 dark:text-slate-100">
          Trash
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Everything deleted in the app — courses, users, assignments, modules,
          materials, announcements, discussions — is kept here for {PURGE_DAYS}{" "}
          days, then permanently removed. Restoring puts it back exactly as it
          was.
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
          body="Anything you delete lands here first and stays recoverable for 90 days."
        />
      ) : (
        KIND_META.map(({ kind, header }) => {
          const group = rows.filter((r) => r.kind === kind);
          if (group.length === 0) return null;
          return (
            <section key={kind} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {header} ({group.length})
              </h2>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
                {group.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 bg-white px-4 py-3 dark:bg-slate-900"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {r.label}
                      </p>
                      {r.context && (
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {r.context}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <DaysLeftBadge deletedAt={r.deleted_at} />
                      <button
                        type="button"
                        onClick={() => void restore(r)}
                        disabled={busyId === r.id}
                        title="Put this back exactly as it was"
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {busyId === r.id ? "Restoring…" : "Restore"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

export default AdminTrashPage;
