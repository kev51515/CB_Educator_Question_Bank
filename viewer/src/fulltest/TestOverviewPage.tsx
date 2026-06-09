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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useBreadcrumbLabel } from "@/components";
import { ROUTES, testPreviewPath, testReviewPath, testReplayPath } from "@/lib/routes";
import { getResult, getRunTimeline } from "./api";
import type { ProctorEvent } from "./api";
import { ResultView } from "./ResultView";
import { AssignTestModal } from "./AssignTestModal";
import { SectionBadge, deriveSections } from "./testSections";
import { TestMonitorModal } from "./TestMonitorModal";
import { ProctorChatModal } from "./ProctorChatModal";
import ProctorTimeline from "./ProctorTimeline";
import type { TestResult } from "./types";
import {
  errMsg,
  fmtMins,
  pctOf,
  toLiveInfo,
  InterventionModal,
  StatCard,
  RosterRowView,
  type LiveInfo,
  type ModuleRow,
  type RosterRow,
  type TestRow,
} from "@/fulltest/test-overview";

// --- local formatters ------------------------------------------------------

/**
 * UI-facing proctoring levels. Maps onto api.ts's `ProctoringLevel`
 * ("off" | "soft" | "strict") — Standard → soft, Lockdown → strict.
 */
type ProctoringUiLevel = "off" | "standard" | "lockdown";
const PROCTORING_API_LEVEL: Record<ProctoringUiLevel, "off" | "soft" | "strict"> = {
  off: "off",
  standard: "soft",
  lockdown: "strict",
};
const PROCTORING_OPTIONS: Array<{ value: ProctoringUiLevel; label: string; hint: string }> = [
  { value: "off", label: "Off", hint: "No tab/focus tracking" },
  { value: "standard", label: "Standard", hint: "Track tab switches & focus loss" },
  { value: "lockdown", label: "Lockdown", hint: "Require full screen; block copy/paste" },
];

// --- page ------------------------------------------------------------------

export function TestOverviewPage(): JSX.Element {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useProfile();
  // Only the lead teacher (admin) may act on live tests; non-admins are read-only.
  const isAdmin = profile?.role === "admin";

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
  // Proctoring timeline for the open review overlay — lazy-loaded on open.
  const [reviewTimeline, setReviewTimeline] = useState<ProctorEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  // Proctoring level control (Off / Standard / Lockdown). Optimistic; the
  // backing api (`setProctoringLevel`) may not exist yet — see onSetProctoring.
  const [proctoringLevel, setProctoringLevel] = useState<ProctoringUiLevel>("standard");
  const [proctoringBusy, setProctoringBusy] = useState(false);

  // Register the real test name with the global breadcrumb bar (no-ops until
  // both the slug and title are known; cleans up on unmount).
  useBreadcrumbLabel(slug, test?.title);

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
        for (const r of (liveRes.data ?? []) as Array<Record<string, unknown>>) {
          const sid = r.student_id as string | undefined;
          if (sid) map.set(sid, toLiveInfo(r));
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

  // Pause / resume a student's live sitting (freezes their timer). An optional
  // reason (from the chat modal) is delivered to the student as a message (0113).
  const [pauseBusy, setPauseBusy] = useState<string | null>(null);
  const onSetPause = async (
    runId: string,
    paused: boolean,
    name: string,
    reason?: string,
  ): Promise<void> => {
    setPauseBusy(runId);
    try {
      const { error } = await supabase.rpc("proctor_set_pause", {
        p_run_id: runId,
        p_paused: paused,
      });
      if (error) {
        toast.error(paused ? "Couldn't pause" : "Couldn't resume", error.message);
        return;
      }
      if (paused && reason && reason.trim()) {
        await supabase
          .rpc("proctor_send_message", {
            p_run_id: runId,
            p_kind: "pause",
            p_body: reason.trim(),
          })
          .then(({ error: e }) => {
            if (e) toast.error("Paused, but the note didn't send", e.message);
          });
      }
      toast.success(paused ? `Paused ${name}` : `Resumed ${name}`);
      await refreshRoster();
    } finally {
      setPauseBusy(null);
    }
  };

  // Live proctor ⇄ student chat: which student's thread is open, and which runs
  // have an unread student message (a dot on their Message button, fed by a
  // realtime subscription to proctor_messages inserts).
  const [chatTarget, setChatTarget] = useState<{ runId: string; name: string } | null>(null);
  const [newMsgRuns, setNewMsgRuns] = useState<Set<string>>(new Set());
  useEffect(() => {
    const channel = supabase
      .channel("proctor_messages:overview")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "proctor_messages" },
        (payload) => {
          const m = payload.new as { run_id?: string; sender?: string };
          if (m?.sender === "student" && m.run_id) {
            const rid = m.run_id;
            setNewMsgRuns((prev) => {
              const n = new Set(prev);
              n.add(rid);
              return n;
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
  const openChat = (runId: string, name: string): void => {
    setChatTarget({ runId, name });
    setNewMsgRuns((prev) => {
      const n = new Set(prev);
      n.delete(runId);
      return n;
    });
  };

  // Run the pending locked action (End now / Reset). Reset is gated behind
  // typing the student's name (set in the modal); End behind a plain confirm.
  const runConfirm = async (): Promise<void> => {
    if (!confirmAction) return;
    const name = confirmAction.row.student_name ?? "Student";
    setConfirmBusy(true);
    try {
      if (confirmAction.kind === "end") {
        if (!confirmAction.runId) {
          // The live row lost its run_id between render and click (stale poll).
          // Don't silently close — tell the proctor so they can retry.
          toast.error("Couldn't end the test", "No active run for this student right now.");
          return;
        }
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
    const runId = row.run_id;
    setReviewLoadingId(runId);
    try {
      const result = await getResult(runId);
      setReviewing({ row, result });
      // Lazy-load the proctoring timeline alongside the result. getRunTimeline
      // is best-effort (returns [] on any error) so this never blocks review.
      setReviewTimeline([]);
      setTimelineLoading(true);
      void getRunTimeline(runId)
        .then((events) => setReviewTimeline(events))
        .finally(() => setTimelineLoading(false));
    } catch (e: unknown) {
      toast.error("Couldn't load result", errMsg(e, "Try again."));
    } finally {
      setReviewLoadingId(null);
    }
  };

  // Change the test's proctoring level. Optimistic UI with rollback.
  //
  // NOTE: this calls `setProctoringLevel(slug, level)` which is expected to be
  // exported from ./api by migration 0108's parallel agent. To keep the build
  // green if that export doesn't exist yet, we resolve it dynamically and treat
  // a missing function as a no-op (toast + rollback). When api.ts gains the
  // export, swap this for a direct `import { setProctoringLevel } from "./api"`.
  // TODO(0108): replace dynamic guard with a static import once api.setProctoringLevel ships.
  const onSetProctoring = async (next: ProctoringUiLevel): Promise<void> => {
    const prev = proctoringLevel;
    if (next === prev) return;
    setProctoringLevel(next); // optimistic
    setProctoringBusy(true);
    try {
      const api = (await import("./api")) as unknown as {
        setProctoringLevel?: (slug: string, level: "off" | "soft" | "strict") => Promise<unknown>;
      };
      if (typeof api.setProctoringLevel !== "function") {
        // Backend not wired yet — surface honestly and roll back.
        setProctoringLevel(prev);
        toast.info("Proctoring level isn't available yet", "This control will work once the backend ships.");
        return;
      }
      await api.setProctoringLevel(slug, PROCTORING_API_LEVEL[next]);
      const label = PROCTORING_OPTIONS.find((o) => o.value === next)?.label ?? next;
      toast.success(`Proctoring set to ${label}`);
    } catch (e: unknown) {
      setProctoringLevel(prev); // rollback
      toast.error("Couldn't update proctoring", errMsg(e, "Try again."));
    } finally {
      setProctoringBusy(false);
    }
  };

  // --- not-found / loading shells ---
  if (notFound) {
    return (
      <div className="max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
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
    <div className="max-w-5xl px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* header card */}
      <header className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                Full-length test
              </span>
              <SectionBadge sections={deriveSections(modules)} />
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

            {isAdmin && (
              <div className="mt-3">
                <div
                  role="radiogroup"
                  aria-label="Proctoring level"
                  className="inline-flex items-stretch rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 bg-slate-50 dark:bg-slate-800/60 p-0.5"
                >
                  {PROCTORING_OPTIONS.map((opt) => {
                    const active = proctoringLevel === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={opt.hint}
                        disabled={proctoringBusy}
                        onClick={() => void onSetProctoring(opt.value)}
                        className={`min-h-[36px] rounded-md px-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 ${
                          active
                            ? opt.value === "lockdown"
                              ? "bg-rose-600 text-white shadow-sm"
                              : opt.value === "off"
                                ? "bg-white text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200"
                                : "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                      >
                        {opt.value === "lockdown" && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mr-1 inline-block align-text-bottom">
                            <rect x="4" y="11" width="16" height="9" rx="2" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          </svg>
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Proctoring:{" "}
                  {PROCTORING_OPTIONS.find((o) => o.value === proctoringLevel)?.hint}
                </p>
              </div>
            )}
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
              Review Mode
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
            {!rosterLoading && stats.taken > 0 && (
              <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  Releasing
                </span>{" "}
                lets a student open their score and answer review. Until you do, they
                only see that they finished.
              </p>
            )}
            {!isAdmin && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                View only — only the lead teacher (admin) can control live tests.
              </p>
            )}
          </div>
          {isAdmin && stats.taken > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onBulk(true)}
                disabled={bulkBusy || allReleased}
                title="Let every submitted student see their score and answer review"
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
              >
                {bulkBusy ? "Working…" : "Release all results"}
              </button>
              <button
                type="button"
                onClick={() => void onBulk(false)}
                disabled={bulkBusy || stats.released === 0}
                title="Hide results again from every student"
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
              const lr = live.get(row.student_id);
              return (
                <RosterRowView
                  key={row.student_id}
                  row={row}
                  live={lr}
                  isAdmin={isAdmin}
                  reviewLoadingId={reviewLoadingId}
                  rowBusy={rowBusy}
                  pauseBusy={pauseBusy}
                  hasNewMessage={lr?.run_id ? newMsgRuns.has(lr.run_id) : false}
                  onReview={onReview}
                  onReplay={(runId) => navigate(testReplayPath(slug, runId))}
                  onToggleRelease={onToggleRow}
                  onSetPause={onSetPause}
                  onOpenChat={openChat}
                  onEnd={(r, runId) => setConfirmAction({ kind: "end", row: r, runId })}
                  onReset={(r) => {
                    setConfirmText("");
                    setConfirmAction({ kind: "reset", row: r });
                  }}
                />
              );
            })}
          </ul>
        )}
      </section>

      {/* modals */}
      {assignOpen && (
        <AssignTestModal
          slug={slug}
          title={title}
          sections={deriveSections(modules)}
          onClose={() => setAssignOpen(false)}
        />
      )}
      {monitorOpen && (
        <TestMonitorModal
          slug={slug}
          title={title}
          isAdmin={isAdmin}
          newMsgRuns={newMsgRuns}
          onSeenRun={(rid) =>
            setNewMsgRuns((prev) => {
              const n = new Set(prev);
              n.delete(rid);
              return n;
            })
          }
          onClose={() => setMonitorOpen(false)}
        />
      )}

      {chatTarget &&
        (() => {
          // Read the student's current pause state live so the modal's
          // Pause/Resume control reflects roster refreshes, not the open-time snapshot.
          const lrNow = Array.from(live.values()).find((l) => l.run_id === chatTarget.runId);
          return (
            <ProctorChatModal
              runId={chatTarget.runId}
              studentName={chatTarget.name}
              paused={lrNow?.paused ?? false}
              pauseBusy={pauseBusy === chatTarget.runId}
              onPause={(p, reason) => onSetPause(chatTarget.runId, p, chatTarget.name, reason)}
              onClose={() => setChatTarget(null)}
            />
          );
        })()}

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
              onClick={() => {
                setReviewing(null);
                setReviewTimeline([]);
              }}
              aria-label="Close review"
              className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Proctoring timeline for this run — lazy-loaded; collapses to a
                reassuring "stayed focused" card when there are no flags. */}
            <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Proctoring timeline
              </h2>
              <ProctorTimeline
                events={reviewTimeline}
                startedAt={reviewing.row.run_id ? (live.get(reviewing.row.student_id)?.started_at ?? null) : null}
                submittedAt={reviewing.row.submitted_at}
                loading={timelineLoading}
              />
            </section>
            <ResultView result={reviewing.result} testTitle={title} />
          </div>
        </div>
      )}
    </div>
  );
}


