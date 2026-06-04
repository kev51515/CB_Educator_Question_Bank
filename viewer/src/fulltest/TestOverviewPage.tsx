/**
 * TestOverviewPage  (/tests/:slug)
 * ================================
 * The teacher's home for a full-length test. When staff open the shared
 * Modules `/test/<slug>` link they land HERE (students go straight to the
 * runner) — a dashboard of:
 *   • test info (questions, timed-module structure),
 *   • cohort stats (assigned / submitted / in-progress, average + spread,
 *     score distribution),
 *   • per-student data (status, score, released state) with Review, per-row
 *     and bulk release, and stuck-attempt reset,
 * plus QA actions: Preview the test (runner), Review the answer key, Assign to
 * another course, and Monitor a live sitting.
 *
 * Design language matches the rest of the LMS (slate/indigo cards, skeletons,
 * empty states, toasts) so it reads as part of the Canvas-aligned surface, not
 * a bolt-on. Data layer reuses test_roster_status (0078) +
 * release_test_results[/_for_teacher] + reset_test_attempt (0083/0090) and the
 * inline ResultView, the same RPCs the completion modal uses.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toast";
import { useEscapeKey, useFocusTrap } from "../hooks";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { ROUTES, testPreviewPath, testReviewPath } from "../lib/routes";
import { getResult } from "./api";
import { ResultView } from "./ResultView";
import { AssignTestModal } from "./AssignTestModal";
import { TestMonitorModal } from "./TestMonitorModal";
import type { TestResult } from "./types";

// --- types -----------------------------------------------------------------

interface TestRow {
  id: string;
  slug: string;
  title: string;
  short_title: string | null;
  total_questions: number | null;
}
interface ModuleRow {
  position: number;
  section: "reading-writing" | "math";
  label: string;
  time_limit_seconds: number;
  question_count: number;
}
interface RosterRow {
  student_id: string;
  student_name: string | null;
  run_id: string | null;
  score: number | null;
  total: number | null;
  submitted_at: string | null;
  results_released_at: string | null;
  has_in_progress: boolean;
}
/** Live snapshot per student (test_live_progress) merged into the roster. */
interface LiveInfo {
  state: "in_progress" | "submitted" | "not_started";
  module_position: number | null;
  module_label: string | null;
  current_question: number | null;
  answered: number | null;
  module_questions: number | null;
  away_count: number | null;
  started_at: string | null;
  submitted_at: string | null;
  run_id: string | null;
}

// --- helpers ---------------------------------------------------------------

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}
function pctOf(score: number | null, total: number | null): number | null {
  if (score == null || total == null || total <= 0) return null;
  return Math.round((score / total) * 100);
}
function fmtMins(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

// --- page ------------------------------------------------------------------

export function TestOverviewPage(): JSX.Element {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [test, setTest] = useState<TestRow | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [live, setLive] = useState<Map<string, LiveInfo>>(() => new Map());
  const [metaLoading, setMetaLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [bulkBusy, setBulkBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  // Locked intervention modal — `reset` requires typing the student's name.
  const [confirmAction, setConfirmAction] = useState<
    { kind: "end" | "reset"; row: RosterRow; runId?: string } | null
  >(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ row: RosterRow; result: TestResult } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);

  // --- fetch test meta + module structure ---
  useEffect(() => {
    let alive = true;
    setMetaLoading(true);
    setNotFound(false);
    void (async () => {
      try {
        const { data: t } = await supabase
          .from("tests")
          .select("id, slug, title, short_title, total_questions")
          .eq("slug", slug)
          .maybeSingle();
        if (!alive) return;
        if (!t) {
          setNotFound(true);
          return;
        }
        setTest(t as TestRow);
        const { data: mods } = await supabase
          .from("test_modules")
          .select("position, section, label, time_limit_seconds, question_count")
          .eq("test_id", (t as TestRow).id)
          .order("position");
        if (!alive) return;
        setModules((mods ?? []) as ModuleRow[]);
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setMetaLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  // --- fetch roster status ---
  const refreshRoster = useCallback(async (): Promise<void> => {
    setRosterLoading(true);
    try {
      const [rosterRes, liveRes] = await Promise.all([
        supabase.rpc("test_roster_status", { p_slug: slug }),
        supabase.rpc("test_live_progress", { p_slug: slug }),
      ]);
      if (rosterRes.error) {
        toast.error("Couldn't load students", rosterRes.error.message);
        setRows([]);
        return;
      }
      setRows((rosterRes.data ?? []) as RosterRow[]);
      // Merge the live snapshot (section/question/started/away/run_id). Degrades
      // silently — the roster still renders if this RPC fails.
      const map = new Map<string, LiveInfo>();
      if (!liveRes.error) {
        for (const r of (liveRes.data ?? []) as Array<LiveInfo & { student_id: string }>) {
          map.set(r.student_id, r);
        }
      }
      setLive(map);
    } catch (e: unknown) {
      toast.error("Couldn't load students", errMsg(e, "Try again."));
    } finally {
      setRosterLoading(false);
    }
  }, [slug, toast]);

  useEffect(() => {
    void refreshRoster();
  }, [refreshRoster]);

  // --- derived cohort stats ---
  const stats = useMemo(() => {
    const assigned = rows.length;
    const taken = rows.filter((r) => r.run_id !== null);
    const inProgress = rows.filter((r) => r.run_id === null && r.has_in_progress).length;
    const notStarted = assigned - taken.length - inProgress;
    const released = taken.filter((r) => r.results_released_at !== null).length;
    const pcts = taken
      .map((r) => pctOf(r.score, r.total))
      .filter((p): p is number => p !== null);
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    const top = pcts.length ? Math.max(...pcts) : null;
    const low = pcts.length ? Math.min(...pcts) : null;
    // 5 distribution bands by raw percent.
    const bands = [
      { label: "0–59%", lo: 0, hi: 60, n: 0 },
      { label: "60–69%", lo: 60, hi: 70, n: 0 },
      { label: "70–79%", lo: 70, hi: 80, n: 0 },
      { label: "80–89%", lo: 80, hi: 90, n: 0 },
      { label: "90–100%", lo: 90, hi: 101, n: 0 },
    ];
    for (const p of pcts) {
      const b = bands.find((x) => p >= x.lo && p < x.hi);
      if (b) b.n += 1;
    }
    return { assigned, taken: taken.length, inProgress, notStarted, released, avg, top, low, bands };
  }, [rows]);

  const allReleased = stats.taken > 0 && stats.released === stats.taken;

  // --- actions ---
  const onBulk = async (released: boolean): Promise<void> => {
    setBulkBusy(true);
    try {
      const { data, error } = await supabase.rpc("release_test_results_for_teacher", {
        p_slug: slug,
        p_released: released,
      });
      if (error) {
        toast.error("Couldn't update", error.message);
        return;
      }
      toast.success(released ? `Released ${data} result${data === 1 ? "" : "s"}` : "Results hidden");
      await refreshRoster();
    } catch (e: unknown) {
      toast.error("Couldn't update", errMsg(e, "Try again."));
    } finally {
      setBulkBusy(false);
    }
  };

  const onToggleRow = async (row: RosterRow): Promise<void> => {
    if (!row.run_id) return;
    const next = row.results_released_at === null;
    setRowBusy(row.run_id);
    try {
      const { error } = await supabase.rpc("release_test_results", {
        p_run_id: row.run_id,
        p_released: next,
      });
      if (error) {
        toast.error("Couldn't update", error.message);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.run_id === row.run_id
            ? { ...r, results_released_at: next ? new Date().toISOString() : null }
            : r,
        ),
      );
    } catch (e: unknown) {
      toast.error("Couldn't update", errMsg(e, "Try again."));
    } finally {
      setRowBusy(null);
    }
  };

  // Run the pending locked action (End now / Reset). Reset is gated behind
  // typing the student's name (set in the modal); End behind a plain confirm.
  const runConfirm = async (): Promise<void> => {
    if (!confirmAction) return;
    const name = confirmAction.row.student_name ?? "Student";
    setConfirmBusy(true);
    try {
      if (confirmAction.kind === "end" && confirmAction.runId) {
        const { error } = await supabase.rpc("proctor_force_submit", {
          p_run_id: confirmAction.runId,
        });
        if (error) {
          toast.error("Couldn't end the test", error.message);
          return;
        }
        toast.success("Test ended", `${name}'s answers were graded as-is.`);
      } else if (confirmAction.kind === "reset") {
        const { error } = await supabase.rpc("reset_test_attempt", {
          p_student_id: confirmAction.row.student_id,
          p_slug: slug,
        });
        if (error) {
          toast.error("Couldn't reset", error.message);
          return;
        }
        toast.success("Attempt reset", `${name} can start fresh.`);
      }
      setConfirmAction(null);
      setConfirmText("");
      await refreshRoster();
    } catch (e: unknown) {
      toast.error("Couldn't complete that", errMsg(e, "Try again."));
    } finally {
      setConfirmBusy(false);
    }
  };

  const onReview = async (row: RosterRow): Promise<void> => {
    if (!row.run_id) return;
    setReviewLoadingId(row.run_id);
    try {
      const result = await getResult(row.run_id);
      setReviewing({ row, result });
    } catch (e: unknown) {
      toast.error("Couldn't load result", errMsg(e, "Try again."));
    } finally {
      setReviewLoadingId(null);
    }
  };

  // --- not-found / loading shells ---
  if (notFound) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900">
          <EmptyState
            title="Test not found"
            body="This full-length test doesn't exist or has been removed."
            cta={{ label: "Back to tests", onClick: () => navigate(ROUTES.TESTS_ADMIN) }}
          />
        </div>
      </div>
    );
  }

  const title = test?.title ?? "Full-length test";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
      {/* breadcrumb */}
      <nav className="text-sm">
        <Link
          to={ROUTES.TESTS_ADMIN}
          className="inline-flex items-center gap-1 rounded-md min-h-[36px] px-2 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span aria-hidden>←</span>
          <span>All tests</span>
        </Link>
      </nav>

      {/* header card */}
      <header className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              Full-length test
            </span>
            {metaLoading ? (
              <Skeleton className="mt-2 h-7 w-72 rounded" />
            ) : (
              <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
                {title}
              </h1>
            )}
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {test?.total_questions ?? "—"} questions ·{" "}
              {modules.length || 4} timed modules
              {modules.length > 0 &&
                ` · ${fmtMins(modules.reduce((a, m) => a + m.time_limit_seconds, 0))} total`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={testPreviewPath(slug)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
            >
              <span aria-hidden>▶</span> Preview test
            </Link>
            <Link
              to={testReviewPath(slug)}
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Answer key
            </Link>
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="rounded-lg border border-indigo-300 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
            >
              Assign to course
            </button>
            {stats.inProgress > 0 && (
              <button
                type="button"
                onClick={() => setMonitorOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              >
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Monitor {stats.inProgress} live
              </button>
            )}
          </div>
        </div>
      </header>

      {/* stat cards */}
      <section aria-label="Cohort summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Assigned" value={stats.assigned} loading={rosterLoading} />
        <StatCard
          label="Submitted"
          value={stats.taken}
          loading={rosterLoading}
          sub={
            !rosterLoading && stats.assigned > 0
              ? `${Math.round((stats.taken / stats.assigned) * 100)}% of class`
              : undefined
          }
          tone="indigo"
        />
        <StatCard
          label="In progress"
          value={stats.inProgress}
          loading={rosterLoading}
          tone={stats.inProgress > 0 ? "blue" : "muted"}
        />
        <StatCard
          label="Average score"
          value={stats.avg}
          loading={rosterLoading}
          suffix={stats.avg != null ? "%" : undefined}
          sub={
            !rosterLoading && stats.low != null && stats.top != null
              ? `${stats.low}–${stats.top}% range`
              : "No submissions yet"
          }
          tone="emerald"
        />
      </section>

      {/* structure + distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* module structure — min-w-0 so the card shrinks below its content's
            intrinsic width on narrow screens instead of overflowing the grid
            track (grid/flex items default to min-width:auto). */}
        <section className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Structure
          </h2>
          {metaLoading ? (
            <div className="mt-3 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : modules.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Module metadata unavailable.
            </p>
          ) : (
            <ol className="mt-3 space-y-1.5">
              {modules.map((m) => (
                <li
                  key={m.position}
                  className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2"
                >
                  <span
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${
                      m.section === "math"
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                        : "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                    }`}
                  >
                    {m.position}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {m.label}
                  </span>
                  <span className="flex-none text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {m.question_count} q · {fmtMins(m.time_limit_seconds)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* score distribution */}
        <section className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Score distribution
          </h2>
          {rosterLoading ? (
            <div className="mt-3 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-6 rounded" />
              ))}
            </div>
          ) : stats.taken === 0 ? (
            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No submissions yet — the distribution appears once students finish.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stats.bands.map((b) => {
                const frac = stats.taken > 0 ? b.n / stats.taken : 0;
                return (
                  <li key={b.label} className="flex items-center gap-3 text-sm">
                    <span className="w-20 flex-none text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {b.label}
                    </span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <span
                        className="block h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${Math.round(frac * 100)}%` }}
                      />
                    </span>
                    <span className="w-6 flex-none text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {b.n}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* student roster */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Students
            </h2>
            {!rosterLoading && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {stats.taken} of {stats.assigned} submitted · {stats.released} released
              </p>
            )}
          </div>
          {stats.taken > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onBulk(true)}
                disabled={bulkBusy || allReleased}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
              >
                {bulkBusy ? "Working…" : "Release all"}
              </button>
              <button
                type="button"
                onClick={() => void onBulk(false)}
                disabled={bulkBusy || stats.released === 0}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Hide all
              </button>
            </div>
          )}
        </div>

        {rosterLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No students assigned yet"
            body="Add this test to a course's Modules to assign it — then completion and scores show up here."
            cta={{ label: "Assign to course", onClick: () => setAssignOpen(true) }}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
            {rows.map((row) => {
              const taken = row.run_id !== null;
              const released = row.results_released_at !== null;
              const pct = pctOf(row.score, row.total);
              const lr = live.get(row.student_id);
              const away = lr?.away_count ?? 0;
              return (
                <li
                  key={row.student_id}
                  className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {row.student_name ?? "Student"}
                    </p>
                    {taken ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        started {fmtTime(lr?.started_at ?? null)} → submitted{" "}
                        {fmtTime(row.submitted_at)}
                        {row.score != null &&
                          row.total != null &&
                          ` · ${row.score}/${row.total}${pct != null ? ` (${pct}%)` : ""}`}
                      </p>
                    ) : row.has_in_progress ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {lr?.module_label ?? "In progress"}
                        {lr?.current_question != null && ` · Q${lr.current_question}`}
                        {lr?.answered != null &&
                          lr?.module_questions != null &&
                          ` · ${lr.answered}/${lr.module_questions} answered`}
                        {lr?.started_at && ` · started ${fmtTime(lr.started_at)}`}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Not started
                      </p>
                    )}
                  </div>

                  {taken ? (
                    <>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                          released
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
                            : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                        }`}
                      >
                        {released ? "Released" : "Hidden"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void onReview(row)}
                        disabled={reviewLoadingId === row.run_id}
                        className="rounded-md min-h-[32px] px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-60"
                      >
                        {reviewLoadingId === row.run_id ? "…" : "Review"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggleRow(row)}
                        disabled={rowBusy === row.run_id}
                        className="rounded-md min-h-[32px] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                      >
                        {rowBusy === row.run_id ? "…" : released ? "Hide" : "Release"}
                      </button>
                    </>
                  ) : row.has_in_progress ? (
                    <>
                      <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-2 py-0.5 text-[11px] font-medium dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900">
                        In progress
                      </span>
                      {away > 0 && (
                        <span
                          title="Times the student left the test tab"
                          className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200 px-2 py-0.5 text-[11px] font-medium dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
                        >
                          ⚠ left tab {away}×
                        </span>
                      )}
                      {lr?.run_id && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ kind: "end", row, runId: lr.run_id ?? undefined })
                          }
                          title="End this student's test now — grades their answers as-is"
                          className="rounded-md min-h-[32px] px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                        >
                          End
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmText("");
                          setConfirmAction({ kind: "reset", row });
                        }}
                        title="Wipe their attempt so they can start fresh (requires confirmation)"
                        className="rounded-md min-h-[32px] px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 ring-1 ring-rose-300 dark:ring-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        Reset
                      </button>
                    </>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-2 py-0.5 text-[11px] font-medium dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900">
                      Not started
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* modals */}
      {assignOpen && (
        <AssignTestModal slug={slug} title={title} onClose={() => setAssignOpen(false)} />
      )}
      {monitorOpen && (
        <TestMonitorModal slug={slug} title={title} onClose={() => setMonitorOpen(false)} />
      )}

      {confirmAction && (
        <InterventionModal
          action={confirmAction}
          text={confirmText}
          onText={setConfirmText}
          busy={confirmBusy}
          onConfirm={() => void runConfirm()}
          onCancel={() => {
            if (confirmBusy) return;
            setConfirmAction(null);
            setConfirmText("");
          }}
        />
      )}

      {/* full-screen review overlay */}
      {reviewing && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-white dark:bg-slate-950">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {reviewing.row.student_name ?? "Student"} — {title}
            </p>
            <button
              type="button"
              onClick={() => setReviewing(null)}
              aria-label="Close review"
              className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ResultView result={reviewing.result} testTitle={title} />
          </div>
        </div>
      )}
    </div>
  );
}

// --- stat card -------------------------------------------------------------

function StatCard({
  label,
  value,
  loading = false,
  sub,
  suffix,
  tone = "slate",
}: {
  label: string;
  value: number | null;
  loading?: boolean;
  sub?: string;
  suffix?: string;
  tone?: "slate" | "indigo" | "emerald" | "blue" | "muted";
}): JSX.Element {
  const toneCls: Record<string, string> = {
    slate: "text-slate-900 dark:text-slate-100",
    indigo: "text-indigo-600 dark:text-indigo-300",
    emerald: "text-emerald-600 dark:text-emerald-300",
    blue: "text-blue-600 dark:text-blue-300",
    muted: "text-slate-400 dark:text-slate-500",
  };
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1.5 h-8 w-16 rounded" />
      ) : value === null ? (
        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-300 dark:text-slate-600">—</p>
      ) : (
        <p className={`mt-1 text-3xl font-bold tabular-nums ${toneCls[tone]}`}>
          {value}
          {suffix && <span className="text-lg font-semibold">{suffix}</span>}
        </p>
      )}
      {sub && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

// --- intervention modal (End now / locked Reset) ---------------------------

interface InterventionModalProps {
  action: { kind: "end" | "reset"; row: RosterRow; runId?: string };
  text: string;
  onText: (v: string) => void;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function InterventionModal({
  action,
  text,
  onText,
  busy,
  onConfirm,
  onCancel,
}: InterventionModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  useEscapeKey(() => {
    if (!busy) onCancel();
  });
  const isReset = action.kind === "reset";
  const name = action.row.student_name ?? "Student";
  const canConfirm = !isReset || text.trim() === name.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intervention-title"
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="intervention-title"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {isReset ? `Reset ${name}'s attempt?` : `End ${name}'s test now?`}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isReset
            ? "This permanently discards their current attempt so they can start over from the beginning — any answers they've entered are lost. This can't be undone."
            : "Their test is submitted immediately and graded on whatever they've answered so far. Questions they didn't reach count as incorrect."}
        </p>
        {isReset && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Type <span className="font-semibold text-slate-900 dark:text-slate-100">{name}</span>{" "}
              to confirm
            </span>
            <input
              data-autofocus
              value={text}
              onChange={(e) => onText(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              placeholder={name}
            />
          </label>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed ${
              isReset ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {busy ? "Working…" : isReset ? "Reset attempt" : "End test"}
          </button>
        </div>
      </div>
    </div>
  );
}
