/**
 * FullTestApp
 * ===========
 * Proctored, full-length test runner: a fixed sequence of timed modules
 * delivered and graded server-side (migration 0048 RPCs). Bluebook-like flow:
 *
 *   intro → module 1 (timed) → break → module 2 → … → submitting → result
 *
 * Content is fetched one module at a time (`get_test_module`, answer key
 * stripped). Answers for the active module are cached in localStorage as a
 * crash/reload failsafe, then graded by `submit_test_module`. When the timer
 * hits zero the module auto-submits. Resuming re-enters at the server's
 * `current_module` with the server-authoritative remaining time.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useToast } from "@/components";
import { ROUTES } from "@/lib/routes";
import { useProfile } from "@/lib/profile";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import { DesmosCalculator } from "./DesmosCalculator";
import { QuestionPane } from "./QuestionPane";
import { captureSelectionHighlight, useRunnerAnnotations, type Highlight } from "./annotations";
import { ResultView } from "./ResultView";
import {
  clearCachedAnswers,
  getModule,
  getResult,
  getRunState,
  heartbeat,
  reportAway,
  reportIntegrity,
  loadCachedAnswers,
  saveCachedAnswers,
  saveProgress,
  startTest,
  submitModule,
  TestApiError,
} from "./api";
import type {
  Letter,
  ModuleMeta,
  StartTestResult,
  TestQuestion,
  TestResult,
} from "./types";

type Phase = "loading" | "intro" | "module" | "break" | "submitting" | "result" | "error";

/**
 * Build a descriptive URL for the runner's current state so the address bar is
 * meaningful and deep-linkable instead of a static /test/:slug on every screen:
 *   intro/loading → /test/:slug
 *   a question     → /test/:slug/section/:position/q/:number
 *   break          → /test/:slug/break
 *   finished       → /test/:slug/done
 */
function runnerPath(
  slug: string,
  phase: Phase,
  position: number | undefined,
  qNumber: number | undefined,
): string {
  const base = `/test/${encodeURIComponent(slug)}`;
  if (phase === "module" && position != null && qNumber != null) {
    return `${base}/section/${position}/q/${qNumber}`;
  }
  if (phase === "break") return `${base}/break`;
  if (phase === "result") return `${base}/done`;
  return base;
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Serialize the per-question eliminated-choice sets into the RPC payload
 *  shape ({ "<question_id>": ["A","C"] }), dropping empty entries. */
function elimToPayload(
  elim: Record<string, Set<Letter>>,
): Record<string, Letter[]> {
  const out: Record<string, Letter[]> = {};
  for (const [qid, set] of Object.entries(elim)) {
    if (set && set.size > 0) out[qid] = Array.from(set);
  }
  return out;
}

export function FullTestApp() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  // The path the runner was opened with — captured once before the URL-sync
  // effect rewrites it, so an incoming deep link (…/section/n/q/m) survives long
  // enough for loadModule to restore that question.
  const openedPathRef = useRef<string>(
    typeof window !== "undefined" ? window.location.pathname : "",
  );
  // Role gates the end-of-test screen: staff (teacher previewing / reviewing)
  // see the full result; students see only a neutral "submitted" confirmation —
  // no score, no questions — until the teacher releases results.
  const { profile, loading: profileLoading } = useProfile();
  const isStaff = profile?.role === "teacher" || profile?.role === "admin";

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [start, setStart] = useState<StartTestResult | null>(null);
  // Set when a proctor force-submits this run out from under the student.
  const [endedByProctor, setEndedByProctor] = useState(false);
  // Set while a proctor has paused this sitting.
  const [paused, setPaused] = useState(false);
  const wasPausedRef = useRef(false);

  // Active module state
  const [moduleMeta, setModuleMeta] = useState<ModuleMeta | null>(null);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [index, setIndex] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const [result, setResult] = useState<TestResult | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Bluebook-style study tools: per-question highlights + a note (localStorage).
  const annot = useRunnerAnnotations(slug);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [navOpen, setNavOpen] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  // Bluebook strikethrough tool: a toggle that reveals per-choice cross-out
  // controls, plus the set of eliminated choices per question (a study aid —
  // it never affects the selected answer or grading).
  const [strikeMode, setStrikeMode] = useState(false);
  const [eliminated, setEliminated] = useState<Record<string, Set<Letter>>>({});
  // Section-submit confirmation. Set when the student clicks "Submit section";
  // ConfirmDialog renders against this state. Replaces the older
  // `window.confirm(...)` per the project's forbidden-pattern rule (CLAUDE.md
  // "Custom alert/confirm dialogs for transient feedback → useToast").
  const [pendingSectionSubmit, setPendingSectionSubmit] = useState<{
    blanks: number;
  } | null>(null);

  const runId = start?.run_id ?? null;

  // --- bootstrap ------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await startTest(slug);
        if (!alive) return;
        setStart(s);
        // Don't fetch the result here — the "result" phase render decides what
        // to show by role (staff: full ResultView; student: neutral screen).
        setPhase(s.status === "submitted" ? "result" : "intro");
      } catch (e) {
        if (!alive) return;
        setErrorMsg(e instanceof TestApiError ? e.message : "Could not load the test.");
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  // --- load a module --------------------------------------------------------
  const loadModule = useCallback(
    async (position: number) => {
      if (!runId) return;
      setPhase("loading");
      setCalcOpen(false);
      setNavOpen(false);
      setMarked(new Set());
      setEliminated({});
      // Reset per-section tools so a hidden timer / active strike tool never
      // silently carries into the next module (a hidden Module-2 clock is unsafe).
      setTimerHidden(false);
      setStrikeMode(false);
      try {
        const m = await getModule(runId, position);
        setModuleMeta(m.module);
        setQuestions(m.questions);
        // Hydrate answers: server drafts (cross-device) overlaid with the local
        // cache (freshest, saved on every keystroke). Local wins when present.
        const cached = loadCachedAnswers(runId, position);
        const server = m.saved_answers ?? {};
        // Cross-device guard: if the server has MORE answers than our local
        // cache, the user worked on another device and the local cache is
        // stale — drop it entirely so we don't clobber fresher remote work.
        const serverCount = Object.values(server).filter((v) => v !== null && v !== "").length;
        const cachedCount = Object.values(cached).filter((v) => v !== null && v !== "").length;
        let merged: Record<string, string | null>;
        if (serverCount > cachedCount) {
          clearCachedAnswers(runId, position);
          merged = { ...server };
        } else {
          merged = { ...server, ...cached };
        }
        const seed: Record<string, string | null> = {};
        for (const q of m.questions) seed[q.id] = merged[q.id] ?? null;
        setAnswers(seed);
        // Restore the question from a deep link (…/section/<pos>/q/<n>) when it
        // targets the section we're loading; otherwise start at question 1.
        let startIndex = 0;
        const deep = openedPathRef.current.match(/\/section\/(\d+)\/q\/(\d+)/);
        if (deep && Number(deep[1]) === position) {
          const idx = m.questions.findIndex((q) => q.number === Number(deep[2]));
          if (idx >= 0) startIndex = idx;
        }
        setIndex(startIndex);
        // Rehydrate eliminated (struck) choices saved on the server so a
        // resume restores them — and so they're re-submitted at section end.
        const savedElim = m.saved_eliminations ?? {};
        const elimSeed: Record<string, Set<Letter>> = {};
        for (const q of m.questions) {
          const letters = savedElim[q.id];
          if (letters && letters.length > 0) elimSeed[q.id] = new Set(letters);
        }
        setEliminated(elimSeed);
        // Rehydrate Mark-for-Review (server-authoritative) and seed highlights /
        // notes from the server where the local cache doesn't already have them
        // (local wins on this device; server restores on a fresh/other device).
        setMarked(new Set(m.saved_marks ?? []));
        const savedHl = m.saved_highlights ?? {};
        const savedNotes = m.saved_notes ?? {};
        const annotQids = new Set<string>([
          ...Object.keys(savedHl),
          ...Object.keys(savedNotes),
        ]);
        for (const qid of annotQids) {
          annot.seed(qid, {
            highlights: (savedHl[qid] ?? []) as Highlight[],
            note: savedNotes[qid] ?? "",
          });
        }
        const dl = Date.now() + m.seconds_remaining * 1000;
        setDeadline(dl);
        setRemaining(m.seconds_remaining);
        setPhase("module");
      } catch (e) {
        setErrorMsg(e instanceof TestApiError ? e.message : "Could not load this section.");
        setPhase("error");
      }
    },
    [runId],
  );

  // --- submit the active module --------------------------------------------
  const submittingRef = useRef(false);
  const doSubmitModule = useCallback(async () => {
    if (!runId || !moduleMeta || submittingRef.current) return;
    submittingRef.current = true;
    setPhase("submitting");
    try {
      const res = await submitModule(
        runId,
        moduleMeta.position,
        answers,
        elimToPayload(eliminated),
      );
      clearCachedAnswers(runId, moduleMeta.position);
      if (res.finished) {
        // Finished: the "result" phase render branches by role. Staff get the
        // ResultView (result fetched lazily below); students get the neutral
        // submitted screen and never fetch scores/answers.
        setPhase("result");
      } else {
        setStart((prev) => (prev ? { ...prev, current_module: res.next_module ?? prev.current_module } : prev));
        setPhase("break");
      }
    } catch (e) {
      const msg = e instanceof TestApiError ? e.message : "Could not submit this section.";
      toast.error(msg);
      // Keep the student in the module so answers (cached) aren't lost; let
      // them retry via the Submit button.
      setPhase("module");
    } finally {
      submittingRef.current = false;
    }
  }, [runId, moduleMeta, answers, eliminated, toast]);

  // --- staff-only result fetch ---------------------------------------------
  // Students never fetch results (the server also locks get_test_result for
  // them). Staff get the full ResultView; we fetch lazily once we know the role
  // (profile loads async) so a teacher previewing/reviewing sees the breakdown.
  useEffect(() => {
    // Staff always; students once the teacher has released this run's results.
    const canSee = isStaff || (start?.results_released ?? false);
    if (phase !== "result" || !canSee || result || !runId) return;
    let alive = true;
    void (async () => {
      try {
        const r = await getResult(runId);
        if (alive) setResult(r);
      } catch (e) {
        if (alive) {
          setErrorMsg(
            e instanceof TestApiError ? e.message : "Could not load the result.",
          );
          setPhase("error");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [phase, isStaff, start, result, runId]);

  // --- reflect state in the URL (deep-linkable, clearer address bar) --------
  // We mirror the runner's phase/section/question into the path with replace()
  // so each screen has a distinct, shareable URL — without making the URL the
  // source of truth (the server still authorises which module you may enter).
  useEffect(() => {
    const qNumber = questions[index]?.number;
    const target = runnerPath(slug, phase, moduleMeta?.position, qNumber);
    if (location.pathname !== target) {
      navigate(target, { replace: true });
    }
  }, [slug, phase, moduleMeta, index, questions, location.pathname, navigate]);

  // Integrity telemetry while taking a module: paste / copy / leaving fullscreen.
  // Best-effort counters the proctor sees live — detection, not blocking.
  useEffect(() => {
    if (phase !== "module" || !runId) return;
    const onPaste = () => void reportIntegrity(runId, "paste");
    const onCopy = () => void reportIntegrity(runId, "copy");
    const onFsChange = () => {
      if (!document.fullscreenElement) void reportIntegrity(runId, "fullscreen_exit");
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("copy", onCopy);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [phase, runId]);

  // --- timer ----------------------------------------------------------------
  useEffect(() => {
    if (phase !== "module" || deadline === null || paused) return;
    const tick = () => {
      const left = Math.round((deadline - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        toast.info("Time's up for this section — submitting your answers.");
        // Flush any pending annotation/highlight/note draft before the submit
        // RPC fires (submit doesn't carry annot payload — only saveProgress does).
        saveDraftRef.current();
        void doSubmitModule();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [phase, deadline, doSubmitModule, toast, paused]);

  // Light proctor-state poll (every 8s): drives PAUSE/resume, picks up added
  // time, and detects a force-end — all in one cheap call (no question payload).
  useEffect(() => {
    if (phase !== "module" || !runId) return;
    const id = window.setInterval(() => {
      void (async () => {
        const st = await getRunState(runId);
        if (!st) return;
        if (st.status === "submitted") {
          setEndedByProctor(true);
          return;
        }
        const resuming = wasPausedRef.current && !st.paused;
        wasPausedRef.current = st.paused;
        setPaused(st.paused);
        if (st.paused) return; // timer is frozen server-side; nothing to sync
        if (st.seconds_remaining != null) {
          const localLeft = deadline ? Math.round((deadline - Date.now()) / 1000) : 0;
          // On resume, re-anchor the deadline; otherwise only ever EXTEND (added
          // time) — never shorten on a stale read.
          if (resuming || st.seconds_remaining > localLeft + 5) {
            setDeadline(Date.now() + st.seconds_remaining * 1000);
            setRemaining(st.seconds_remaining);
            if (!resuming) toast.info("Your teacher added time to this section.");
          }
        }
      })();
    }, 8000);
    return () => window.clearInterval(id);
  }, [phase, runId, deadline, toast]);

  // --- sleep/wake resync ----------------------------------------------------
  // After a laptop sleep or long tab-hide, Date.now() jumps forward and the
  // local deadline could already be in the past — silently auto-submitting.
  // On return-to-visible (after >5s hidden), re-fetch the server-authoritative
  // remaining time and recompute the deadline; if the server says 0, warn the
  // student before the auto-submit fires.
  const lastVisibleAt = useRef(Date.now());
  useEffect(() => {
    if (phase !== "module" || !runId || !moduleMeta) return;
    const onVisibility = () => {
      if (document.hidden) {
        lastVisibleAt.current = Date.now();
        return;
      }
      const hiddenMs = Date.now() - lastVisibleAt.current;
      // Integrity: count a real "left the tab" (>2s) for the proctor view.
      if (hiddenMs > 2000) void reportAway(runId);
      if (hiddenMs <= 5000) return;
      void (async () => {
        try {
          const data = await getModule(runId, moduleMeta.position);
          if (data.seconds_remaining <= 0) {
            toast.warning(
              "Your section ran out of time while the tab was hidden — submitting your answers now.",
            );
          }
          setDeadline(Date.now() + data.seconds_remaining * 1000);
          setRemaining(data.seconds_remaining);
        } catch (e) {
          // A proctor force-submitted this run — surface a clean "ended" screen.
          if (String((e as Error)?.message ?? "").includes("run_already_submitted")) {
            setEndedByProctor(true);
          }
          /* else non-fatal: keep the existing deadline */
        }
      })();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [phase, runId, moduleMeta, toast]);

  // P2: debounced server-side draft autosave. Each answer change resets a
  // 2.5s timer; on idle we persist the active module's drafts so a device
  // loss mid-module doesn't lose work (localStorage is the immediate backup;
  // this is the cross-device one). Best-effort — failures are swallowed.
  useEffect(() => {
    if (phase !== "module" || !runId || !moduleMeta) return;
    const t = window.setTimeout(() => saveDraftRef.current(), 2500);
    return () => window.clearTimeout(t);
  }, [answers, eliminated, marked, phase, runId, moduleMeta]);

  // Flush the active module's draft to the server immediately (Save & exit, and
  // every few question navigations) so a crash never loses more than a couple
  // of questions even between the 2.5s autosave ticks. Kept in a ref so the
  // nav-counter effect always sees the latest answers/eliminations.
  const saveDraftNow = useCallback(() => {
    if (!runId || !moduleMeta) return;
    // Build the per-question annotation payload (marks + highlights + notes)
    // for the active module's questions, omitting empty ones.
    const annotPayload: Record<
      string,
      { marked: boolean; highlights: Highlight[]; note: string }
    > = {};
    for (const qq of questions) {
      const a = annot.get(qq.id);
      const isMarked = marked.has(qq.id);
      if (isMarked || a.highlights.length > 0 || a.note.trim().length > 0) {
        annotPayload[qq.id] = { marked: isMarked, highlights: a.highlights, note: a.note };
      }
    }
    void saveProgress(
      runId,
      moduleMeta.position,
      answers,
      elimToPayload(eliminated),
      annotPayload,
    );
  }, [runId, moduleMeta, answers, eliminated, marked, questions, annot]);
  const saveDraftRef = useRef(saveDraftNow);
  saveDraftRef.current = saveDraftNow;

  // Proctoring heartbeat: tell the server which question we're on, on every
  // navigation and every 15s (so a teacher's live monitor stays current and
  // can spot an idle student). Best-effort.
  useEffect(() => {
    if (phase !== "module" || !runId) return;
    const send = () => {
      const n = questions[index]?.number;
      if (n != null) void heartbeat(runId, n);
    };
    send();
    const id = window.setInterval(send, 15000);
    return () => window.clearInterval(id);
  }, [index, phase, runId, questions]);

  // Belt-and-braces: flush a draft every 3 question navigations.
  const navCountRef = useRef(0);
  useEffect(() => {
    if (phase !== "module") return;
    navCountRef.current += 1;
    if (navCountRef.current >= 3) {
      navCountRef.current = 0;
      saveDraftRef.current();
    }
  }, [index, phase]);

  const setAnswer = useCallback(
    (qid: string, value: string | null) => {
      setAnswers((prev) => {
        const next = { ...prev, [qid]: value };
        if (runId && moduleMeta) saveCachedAnswers(runId, moduleMeta.position, next);
        return next;
      });
    },
    [runId, moduleMeta],
  );

  // --- render ---------------------------------------------------------------
  if (endedByProctor) {
    return (
      <CenterCard wide>
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Your teacher ended this test
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Your answers were saved and submitted. Results appear once your teacher releases them.
        </p>
        <button
          type="button"
          onClick={() => navigate(ROUTES.HOME)}
          className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to home
        </button>
      </CenterCard>
    );
  }

  if (paused && phase === "module") {
    return (
      <CenterCard wide>
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Paused by your teacher
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Your timer is frozen and your answers are saved. The test will continue
          right where you left off when your teacher resumes it.
        </p>
        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500" aria-live="polite">
          Waiting to resume…
        </p>
      </CenterCard>
    );
  }

  if (phase === "loading") {
    return <CenterCard><Spinner label="Loading…" /></CenterCard>;
  }

  if (phase === "error") {
    return (
      <CenterCard>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Test unavailable</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">{errorMsg}</p>
        <button
          type="button"
          onClick={() => navigate(ROUTES.HOME)}
          className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to home
        </button>
      </CenterCard>
    );
  }

  if (phase === "result") {
    // Staff always see results; a student sees them once the teacher releases.
    const canSeeResult = isStaff || (start?.results_released ?? false);
    // Wait until we know the role (and the fetched result) before deciding —
    // avoids flashing the student screen to someone who can see results.
    if (profileLoading || (canSeeResult && !result)) {
      return <CenterCard><Spinner label="Processing your test…" /></CenterCard>;
    }
    if (canSeeResult && result) {
      return <ResultView result={result} testTitle={start?.test.title ?? "Test"} />;
    }
    // Student, not yet released: neutral confirmation only — no score, no
    // questions (the server also locks get_test_result until release).
    return (
      <CenterCard wide>
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Test submitted
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
          Your answers were recorded. Your teacher will review your test and
          share your results with you — scores and answers aren't shown here.
        </p>
        <button
          type="button"
          onClick={() => navigate(ROUTES.HOME)}
          className="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
        >
          Done
        </button>
      </CenterCard>
    );
  }

  if (phase === "intro" && start) {
    const resuming = start.current_module > 1 || (start.answered ?? 0) > 0;
    return (
      <CenterCard wide>
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
          Full-length practice test
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{start.test.title}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          {start.test.total_questions} questions · {start.modules.length} timed modules.
          Each module is timed and submitted on its own; you can't return to a
          previous module once you move on — just like the real Digital SAT.
        </p>
        <ol className="mt-5 space-y-2">
          {start.modules.map((m) => (
            <li
              key={m.position}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {m.position}. {m.label}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {m.question_count} q · {Math.round(m.time_limit_seconds / 60)} min
              </span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => void loadModule(start.current_module)}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          {resuming ? `Resume — Module ${start.current_module}` : "Begin test"}
        </button>
      </CenterCard>
    );
  }

  if (phase === "break" && start) {
    const next = start.modules.find((m) => m.position === start.current_module);
    return (
      <CenterCard>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Section complete</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Your answers were submitted. Up next:
        </p>
        {next && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="font-medium text-slate-800 dark:text-slate-200">{next.label}</div>
            <div className="text-slate-500 dark:text-slate-400">
              {next.question_count} questions · {Math.round(next.time_limit_seconds / 60)} minutes
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => void loadModule(start.current_module)}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 text-base font-semibold text-white hover:bg-indigo-700"
        >
          Start next section
        </button>
      </CenterCard>
    );
  }

  if (phase === "submitting") {
    return <CenterCard><Spinner label="Submitting your answers…" /></CenterCard>;
  }

  // phase === "module"
  const q = questions[index];
  const answeredCount = questions.filter((qq) => answers[qq.id]).length;
  const lowTime = remaining <= 60;
  const toggleMark = (qid: string) =>
    setMarked((prev) => {
      const n = new Set(prev);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      return n;
    });
  const toggleEliminate = (qid: string, letter: Letter) => {
    const wasStruck = eliminated[qid]?.has(letter) ?? false;
    setEliminated((prev) => {
      const cur = new Set(prev[qid] ?? []);
      if (cur.has(letter)) cur.delete(letter);
      else cur.add(letter);
      return { ...prev, [qid]: cur };
    });
    // Crossing out the choice the student had selected clears that selection,
    // so an eliminated answer is never silently submitted as their response.
    if (!wasStruck && answers[qid] === letter) setAnswer(qid, null);
  };

  // Defensive: a module should always have questions. If the server returns an
  // empty set, don't render a "Question 1 of 0" runner that can submit nothing.
  if (questions.length === 0) {
    return (
      <CenterCard>
        <p className="text-slate-600 dark:text-slate-300">
          This section didn't load any questions. Please refresh to try again.
        </p>
      </CenterCard>
    );
  }

  return (
    // Fullscreen takeover (above the StudentShell chrome / floating badge, z-50)
    // so the timed test owns the whole viewport, like Bluebook.
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-white dark:bg-slate-950">
      {/* ── Top bar (fixed): module · timer + hide · calculator ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-2 dark:border-slate-800">
        <div className="flex min-w-0 basis-1/3 flex-col">
          <span className="truncate text-[15px] font-bold text-slate-900 dark:text-slate-100">
            {moduleMeta?.label}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">Directions</span>
        </div>
        <div className="flex basis-1/3 flex-col items-center">
          {timerHidden ? (
            <button
              type="button"
              onClick={() => setTimerHidden(false)}
              className="rounded-full border border-slate-300 px-4 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
            >
              Show timer
            </button>
          ) : (
            <>
              <div
                className={[
                  "font-mono text-2xl font-bold leading-none tabular-nums",
                  lowTime ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-100",
                ].join(" ")}
                aria-live="off"
                title="Time remaining in this section"
              >
                {fmt(remaining)}
              </div>
              <button
                type="button"
                onClick={() => setTimerHidden(true)}
                className="mt-1 rounded-full border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
              >
                Hide
              </button>
            </>
          )}
        </div>
        <div className="flex basis-1/3 items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Save your progress and leave — the section timer keeps running"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5M21 12H9" />
            </svg>
            Save &amp; exit
          </button>
          {moduleMeta?.section === "math" && (
            <button
              type="button"
              onClick={() => setCalcOpen((v) => !v)}
              className={[
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                calcOpen
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-300"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800",
              ].join(" ")}
              title="Toggle graphing calculator"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <path d="M8 6h8M8 10h2M12 10h2M16 10h0M8 14h2M12 14h2M16 14h0M8 18h2M12 18h2M16 18h0" />
              </svg>
              Calculator
            </button>
          )}
        </div>
      </header>
      <DesmosCalculator open={calcOpen} onClose={() => setCalcOpen(false)} />

      {/* ── Study tools: highlight + notes ── */}
      {q && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-1.5 dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            // Keep the text selection alive — a plain button click would
            // collapse it before onClick runs.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const hl = captureSelectionHighlight();
              if (hl) {
                annot.addHighlight(q.id, hl);
                window.getSelection()?.removeAllRanges();
              } else {
                toast.info("Select text first", "Drag across the passage or question, then tap Highlight.");
              }
            }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-amber-50 hover:text-amber-700 dark:text-slate-300 dark:hover:bg-amber-950/30 dark:hover:text-amber-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 11-6 6v3h3l6-6M22 6 18 2l-7 7 4 4 7-7Z" />
            </svg>
            Highlight
          </button>
          {annot.get(q.id).highlights.length > 0 && (
            <button
              type="button"
              onClick={() => annot.clearHighlights(q.id)}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Clear ({annot.get(q.id).highlights.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setNotesOpen((v) => !v)}
            aria-pressed={notesOpen}
            className={[
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
              notesOpen
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            ].join(" ")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            Notes{annot.get(q.id).note.trim() ? " •" : ""}
          </button>
        </div>
      )}
      {q && notesOpen && (
        <div className="shrink-0 border-b border-slate-200 px-5 py-2 dark:border-slate-800">
          <textarea
            value={annot.get(q.id).note}
            onChange={(e) => annot.setNote(q.id, e.target.value)}
            rows={2}
            placeholder="Jot a note for this question…"
            className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      )}

      {/* ── Body: fills the viewport; only the panes scroll → no layout shift ── */}
      <main className="min-h-0 flex-1">
        {q && (
          <QuestionPane
            key={q.id}
            fullHeight
            question={q}
            value={answers[q.id] ?? null}
            onChange={(v) => setAnswer(q.id, v)}
            marked={marked.has(q.id)}
            onToggleMark={() => toggleMark(q.id)}
            strikeMode={strikeMode}
            onToggleStrikeMode={() => setStrikeMode((v) => !v)}
            eliminated={eliminated[q.id]}
            onToggleEliminate={(letter) => toggleEliminate(q.id, letter)}
            highlights={annot.get(q.id).highlights}
            onRemoveHighlight={(field, offset) => annot.removeHighlightAt(q.id, field, offset)}
          />
        )}
      </main>

      {/* ── Bottom bar (fixed): name · question navigator · Back/Next ── */}
      <footer className="relative flex shrink-0 items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-slate-800">
        <div className="hidden basis-1/3 truncate text-sm font-semibold text-slate-700 dark:text-slate-200 sm:block">
          {start?.test.short_title || start?.test.title}
        </div>
        <div className="flex basis-1/3 justify-center">
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            aria-expanded={navOpen}
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-200 dark:text-slate-900"
          >
            Question {index + 1} of {questions.length}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={navOpen ? "" : "rotate-180"}
              aria-hidden
            >
              <path d="m6 15 6-6 6 6" />
            </svg>
          </button>
        </div>
        <div className="flex basis-1/3 items-center justify-end gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
          >
            Back
          </button>
          {index < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="rounded-full bg-blue-700 px-7 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPendingSectionSubmit({ blanks: questions.length - answeredCount })}
              className="rounded-full bg-blue-700 px-7 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Submit
            </button>
          )}
        </div>

        {navOpen && (
          <>
            <button
              type="button"
              aria-label="Close question navigator"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setNavOpen(false)}
            />
            <div className="absolute bottom-full left-1/2 z-30 mb-3 w-[min(92vw,600px)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-1 text-center text-sm font-bold text-slate-900 dark:text-slate-100">
                {moduleMeta?.label}
              </div>
              <div className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm border-2 border-blue-600" /> Current
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-blue-600" /> Answered
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm border border-dashed border-slate-400" /> Unanswered
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> Marked
                </span>
              </div>
              <div className="flex max-h-[42vh] flex-wrap justify-center gap-2 overflow-y-auto">
                {questions.map((qq, i) => {
                  const ans = Boolean(answers[qq.id]);
                  const cur = i === index;
                  const mk = marked.has(qq.id);
                  return (
                    <button
                      key={qq.id}
                      type="button"
                      onClick={() => {
                        setIndex(i);
                        setNavOpen(false);
                      }}
                      title={`Question ${i + 1}${ans ? " · answered" : ""}${mk ? " · marked" : ""}`}
                      className={[
                        "relative grid h-9 w-9 place-items-center rounded-md text-xs font-semibold transition",
                        cur
                          ? "border-2 border-blue-600 text-blue-700 dark:text-blue-300"
                          : ans
                            ? "bg-blue-600 text-white"
                            : "border border-dashed border-slate-400 text-slate-500 hover:border-slate-500 dark:border-slate-600 dark:text-slate-400",
                      ].join(" ")}
                    >
                      {i + 1}
                      {mk && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </footer>
      {pendingSectionSubmit && (
        <ConfirmDialog
          title="Submit this section?"
          body={
            <p>
              {pendingSectionSubmit.blanks > 0 ? (
                <>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {pendingSectionSubmit.blanks}
                  </span>{" "}
                  question
                  {pendingSectionSubmit.blanks === 1 ? "" : "s"} still blank.{" "}
                </>
              ) : null}
              <span className="font-semibold text-rose-700 dark:text-rose-300">
                You can't return to this section once submitted.
              </span>
            </p>
          }
          confirmLabel="Submit section"
          destructive
          onConfirm={async () => {
            setPendingSectionSubmit(null);
            await doSubmitModule();
          }}
          onCancel={() => setPendingSectionSubmit(null)}
        />
      )}

      {confirmExit && (
        <ConfirmDialog
          title="Leave the test?"
          body={
            <p>
              Your answers are saved — you can come back and pick up where you
              left off.{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                The section timer keeps running while you're away.
              </span>
            </p>
          }
          confirmLabel="Save &amp; exit"
          onConfirm={() => {
            setConfirmExit(false);
            saveDraftNow(); // flush the current module's draft before leaving
            navigate(ROUTES.HOME);
          }}
          onCancel={() => setConfirmExit(false)}
        />
      )}
    </div>
  );
}

// --- small presentational helpers -------------------------------------------
function CenterCard({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <div
        className={[
          "w-full rounded-2xl bg-white p-7 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800",
          wide ? "max-w-lg" : "max-w-md text-center",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  );
}
