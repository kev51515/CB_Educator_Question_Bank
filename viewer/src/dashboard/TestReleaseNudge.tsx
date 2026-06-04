/**
 * TestReleaseNudge
 * ================
 * Dashboard nudge: tests with submitted-but-unreleased results among the
 * teacher's students. Lets a teacher release straight from the dashboard after
 * a test day instead of hunting through the Full-Test catalog.
 *
 * Renders nothing when there's nothing awaiting (no clutter). Clicking a test
 * opens the same TestCompletionModal used in the catalog; on close we refresh
 * so a fully-released test drops off the nudge.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TestCompletionModal } from "@/fulltest/TestCompletionModal";

interface AwaitingRow {
  slug: string;
  title: string;
  awaiting_count: number;
}

export function TestReleaseNudge() {
  const [rows, setRows] = useState<AwaitingRow[]>([]);
  const [open, setOpen] = useState<AwaitingRow | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const { data, error } = await supabase.rpc("tests_awaiting_release");
      if (!error) setRows((data ?? []) as AwaitingRow[]);
    } catch {
      /* non-fatal — nudge just stays hidden */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (rows.length === 0) return null;

  const total = rows.reduce((sum, r) => sum + r.awaiting_count, 0);

  return (
    <section
      aria-labelledby="release-nudge-title"
      className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 ring-1 ring-amber-200 dark:ring-amber-900 p-5"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4M12 16h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id="release-nudge-title"
            className="text-sm font-semibold text-amber-900 dark:text-amber-200"
          >
            {total} test result{total === 1 ? "" : "s"} awaiting release
          </h2>
          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">
            Students don't see their scores until you release them.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {rows.map((row) => (
              <li key={row.slug}>
                <button
                  type="button"
                  onClick={() => setOpen(row)}
                  className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <span className="truncate max-w-[16rem]">{row.title}</span>
                  <span className="inline-flex items-center justify-center rounded-full bg-amber-600 px-1.5 text-[11px] font-semibold text-white">
                    {row.awaiting_count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {open && (
        <TestCompletionModal
          slug={open.slug}
          title={open.title}
          onClose={() => {
            setOpen(null);
            void refresh();
          }}
        />
      )}
    </section>
  );
}
