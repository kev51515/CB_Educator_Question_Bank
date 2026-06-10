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
import { captureError, trackEvent } from "@/lib/telemetry";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { ConfirmDialog } from "@/teacher/ConfirmDialog";
import { DesmosCalculator } from "./DesmosCalculator";
import { QuestionPane } from "./QuestionPane";
import { TestPreviewRunner } from "./TestPreviewRunner";
import { ProctorChat } from "./ProctorChat";
import {
  captureSelectionHighlight,
  currentSelectionText,
  useRunnerAnnotations,
  type Highlight,
  type HighlightColor,
} from "./annotations";
import { HighlighterBar, highlighterCursor } from "./HighlighterBar";
import { ResultView } from "./ResultView";
import {
  clearCachedAnswers,
  getModule,
  getResult,
  getRunState,
  heartbeat,
  logProctorEvent,
  logAction,
  loadCachedAnswers,
  saveCachedAnswers,
  saveProgress,
  startTest,
  submitModule,
  TestApiError,
  type ProctoringLevel,
} from "./api";
import type {
  Letter,
  ModuleMeta,
  StartTestResult,
  TestQuestion,
  TestResult,
} from "./types";

type Phase = "loading" | "intro" | "module" | "break" | "locked" | "submitting" | "result" | "error";

/**
 * Format an ISO timestamp into a friendly "opens in 18 hours" / "opens Tuesday"
 * relative phrase. No reusable formatter exists in the repo (grepped lib +
 * fulltest), so this small helper lives here. Past/now times read "opens now".
 */
function formatOpensRelative(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "opens now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `opens ${rtf.format(mins, "minute")}`;
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `opens ${rtf.format(hours, "hour")}`;
  const days = Math.round(diffMs / 86_400_000);
  if (days <= 6) {
    // Within a week: name the weekday ("opens Tuesday") — friendlier than "in 3 days".
    const weekday = new Date(target).toLocaleDateString(undefined, { weekday: "long" });
    return `opens ${weekday}`;
  }
  return `opens ${rtf.format(days, "day")}`;
}

/** Absolute local form for the open time, e.g. "Tue, Jun 11, 9:00 AM". */
function formatOpensAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Recover the runner's mount base from the path it was opened with, so the
 * deep-link URLs below stay under whatever role-prefixed route mounted the
 * runner — `/student/test/:slug` (student) or `/educator/tests/:slug/run`
 * (staff preview), and the legacy bare `/test/:slug` — instead of a hardcoded
 * prefix. We strip the descriptive phase suffix runnerPath() appends so the
 * base survives even when the opening URL is a deep link.
 */
function runnerBaseFromPath(pathname: string): string {
  const stripped = pathname.replace(
    /\/(?:section\/\d+\/q\/\d+|break|done)\/?$/,
    "",
  );
  return stripped.replace(/\/$/, "");
}

/**
 * Build a descriptive URL for the runner's current state so the address bar is
 * meaningful and deep-linkable instead of a static base on every screen:
 *   intro/loading → <base>
 *   a question     → <base>/section/:position/q/:number
 *   break          → <base>/break
 *   finished       → <base>/done
 * `base` is the role-prefixed mount path (see runnerBaseFromPath).
 */
function runnerPath(
  base: string,
  phase: Phase,
  position: number | undefined,
  qNumber: number | undefined,
): string {
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

/**
 * Entry point for the full-test route. Staff who open a test's "Preview"
 * (mounted at /educator/tests/:slug/run) get a free-roam previewer — jump
 * across modules/questions with no server run, timer, or grading — instead of
 * the proctored student runner below. Detected from the opening path (the
 * educator route is staff-only, so no role wait is needed); computed once so a
 * later URL rewrite can't flip the dispatch mid-life.
 */
export function FullTestApp() {
  const isPreview = useRef(
    typeof window !== "undefined" &&
      /\/educator\/tests\/[^/]+\/run(?:\/|$)/.test(window.location.pathname),
  ).current;
  if (isPreview) return <TestPreviewRunner />;
  return <FullTestRunner />;
}

function FullTestRunner() {
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
  // The role-prefixed mount base (e.g. /student/test/<slug>), captured once
  // from the opening path so URL-sync keeps the runner under its own route.
  const runnerBaseRef = useRef<string>(
    runnerBaseFromPath(openedPathRef.current),
  );
  // Role gates the end-of-test screen: staff (teacher previewing / reviewing)
  // see the full result; students see only a neutral "submitted" confirmation —
  // no score, no questions — until the teacher releases results.
  const { profile, loading: profileLoading } = useProfile();
  const isStaff = profile?.role === "teacher" || profile?.role === "admin";

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Set when a module is gated by scheduled release (0143): not yet open, or
  // not part of this course's metered assignment. Drives the "locked" screen.
  const [lockedInfo, setLockedInfo] = useState<{
    position: number;
    opensAt: string | null;
    reason: "not_yet_open" | "not_deployed";
  } | null>(null);
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
  // Active highlighter color (null = highlighter off). Picked from HighlighterBar.
  const [hlColor, setHlColor] = useState<HighlightColor | null>(null);
  // Bluebook-style study tools: per-question highlights + a note (localStorage).
  const annot = useRunnerAnnotations(slug);
  // Stable refs so the document-level highlight handler reads fresh values
  // without re-binding every render.
  const qIdRef = useRef<string | null>(null);
  const addHighlightRef = useRef(annot.addHighlight);
  addHighlightRef.current = annot.addHighlight;
  // Per-question dwell stopwatch (active seconds, paused while the tab is
  // hidden) — emits a `dwell` event on question-leave / submit / unmount so
  // per-question time is accurate + aggregate-ready (individual vs cohort).
  const dwellQRef = useRef<number | null>(null);
  const dwellActiveMsRef = useRef(0);
  const dwellTickRef = useRef<number | null>(null);
  const dwellFlushRef = useRef<() => void>(() => {});
  const dwellStartRef = useRef<(q: number | null) => void>(() => {});
  // Debounce for note_edit replay events.
  const noteTimerRef = useRef<number | undefined>(undefined);
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

  // --- proctoring ------------------------------------------------------------
  // `start_test` (migration 0108) returns proctoring_level on the run/start
  // payload. It isn't on the shared StartTestResult type (owned elsewhere), so
  // read it through a narrow cast and default to 'off' (no telemetry / no
  // enforcement) when absent — fail-open so a payload change can't lock anyone
  // out of a test.
  const proctoringLevel: ProctoringLevel =
    ((start as { proctoring_level?: ProctoringLevel } | null)?.proctoring_level) ?? "off";
  const proctorOn = proctoringLevel !== "off";
  const strict = proctoringLevel === "strict";

  // Dwell stopwatch helpers (stable via refs; read fresh runId/proctorOn/module).
  // dwellTick folds elapsed-since-resume into the active accumulator.
  dwellFlushRef.current = () => {
    if (dwellTickRef.current != null) {
      dwellActiveMsRef.current += Date.now() - dwellTickRef.current;
      dwellTickRef.current = Date.now();
    }
    const q = dwellQRef.current;
    const secs = Math.round(dwellActiveMsRef.current / 1000);
    if (runId && proctorOn && q != null && secs > 0) {
      void logAction(runId, "dwell", {
        question: q,
        module: currentModuleRef.current ?? undefined,
        durationSeconds: secs,
      });
    }
    dwellActiveMsRef.current = 0;
  };
  dwellStartRef.current = (q: number | null) => {
    dwellQRef.current = q;
    dwellActiveMsRef.current = 0;
    dwellTickRef.current = q != null ? Date.now() : null;
  };

  // Element fullscreen support — iOS Safari on iPhone has no element-level
  // requestFullscreen, so strict lockdown can't be enforced there. We detect
  // once and fall back to telemetry-only with a small non-blocking notice.
  const supportsFullscreen =
    typeof document !== "undefined" &&
    !!document.documentElement.requestFullscreen &&
    !(typeof navigator !== "undefined" && /iPhone|iPod/.test(navigator.userAgent));
  // Strict mode but the device can't lock down → render the inline notice.
  const lockdownUnsupported = strict && !supportsFullscreen;

  // Blocking overlay shown when a strict-mode student exits fullscreen mid-test.
  const [fsLockout, setFsLockout] = useState(false);
  // Stamp when fullscreen was exited so we can log the duration outside on return.
  const fsExitedAtRef = useRef<number | null>(null);

  // Helpers to read the current module/question for proctor-event context.
  const currentModuleRef = useRef<number | null>(null);
  const currentQuestionRef = useRef<number | null>(null);

  // --- bootstrap ------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // A subset link is `/test/<slug>?m=<first>-<last>` — scope the run to
        // that module range so it's an independent attempt (0156). No ?m = the
        // full test / metered run.
        const mParam = new URLSearchParams(location.search).get("m");
        let mFirst: number | null = null;
        let mLast: number | null = null;
        if (mParam && /^\d+-\d+$/.test(mParam)) {
          const [f, l] = mParam.split("-").map((n) => Number.parseInt(n, 10));
          if (Number.isFinite(f) && Number.isFinite(l)) {
            mFirst = f;
            mLast = l;
          }
        }
        const s = await startTest(slug, mFirst, mLast);
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
  }, [slug, location.search]);

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
        if (
          e instanceof TestApiError &&
          (e.code === "module_not_yet_open" || e.code === "module_not_deployed")
        ) {
          setLockedInfo({
            position,
            opensAt: e.detail ?? null,
            reason: e.code === "module_not_yet_open" ? "not_yet_open" : "not_deployed",
          });
          setPhase("locked");
          return;
        }
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
    // Flush the current question's dwell BEFORE submit — after the last module
    // the run flips to 'submitted' and the dwell logger would no-op.
    dwellFlushRef.current();
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
      } else if (
        res.next_module_opens_at &&
        new Date(res.next_module_opens_at).getTime() > Date.now()
      ) {
        // Next module is scheduled for the future (0143) — show the locked
        // screen instead of the break/"start next section" CTA.
        setStart((prev) => (prev ? { ...prev, current_module: res.next_module ?? prev.current_module } : prev));
        setLockedInfo({
          position: res.next_module ?? 0,
          opensAt: res.next_module_opens_at ?? null,
          reason: "not_yet_open",
        });
        setPhase("locked");
      } else {
        setStart((prev) => (prev ? { ...prev, current_module: res.next_module ?? prev.current_module } : prev));
        setPhase("break");
      }
    } catch (e) {
      const msg = e instanceof TestApiError ? e.message : "Could not submit this section.";
      toast.error(msg);
      // A submit failure here means a student's section work is at risk (all
      // in-API retries are already exhausted by submitModule). This is the one
      // failure that silently loses graded work, so it MUST reach monitoring —
      // page on `test_submit_failed` in PostHog. Answers stay cached locally so
      // the student can retry via the Submit button.
      const code = e instanceof TestApiError ? e.code : undefined;
      trackEvent("test_submit_failed", {
        run_id: runId,
        module_position: moduleMeta.position,
        error_code: code,
        message: msg,
      });
      captureError(e, {
        feature: "fulltest_submit",
        run_id: runId,
        module_position: moduleMeta.position,
        error_code: code,
      });
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
    const target = runnerPath(
      runnerBaseRef.current,
      phase,
      moduleMeta?.position,
      qNumber,
    );
    if (location.pathname !== target) {
      navigate(target, { replace: true });
    }
  }, [slug, phase, moduleMeta, index, questions, location.pathname, navigate]);

  // Keep the current module/question in refs so window-level proctor handlers
  // (blur/focus/visibility, which depend only on stable values) always read the
  // freshest position without re-binding their listeners on every navigation.
  useEffect(() => {
    currentModuleRef.current = moduleMeta?.position ?? null;
    currentQuestionRef.current = questions[index]?.number ?? null;
    qIdRef.current = questions[index]?.id ?? null;
  }, [moduleMeta, questions, index]);

  // Highlighter: while a color is active, a mouseup that leaves a text
  // selection inside a passage/stem field paints it in that color. Click-to-
  // remove on an existing mark is handled in passageRender. Best-effort.
  useEffect(() => {
    if (phase !== "module" || hlColor == null) return;
    const onUp = () => {
      const qid = qIdRef.current;
      if (!qid) return;
      const hl = captureSelectionHighlight(hlColor);
      if (hl) {
        const text = currentSelectionText();
        addHighlightRef.current(qid, hl);
        window.getSelection()?.removeAllRanges();
        if (runId && proctorOn) {
          void logAction(runId, "highlight_add", {
            question: currentQuestionRef.current ?? undefined,
            module: currentModuleRef.current ?? undefined,
            meta: { field: hl.field, start: hl.start, end: hl.end, color: hl.color, text },
          });
        }
      }
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [phase, hlColor, runId, proctorOn]);

  // Dwell stopwatch — flush the previous question's active time and start the
  // new one on every navigation; flush when leaving the module phase entirely.
  useEffect(() => {
    if (phase !== "module") {
      dwellFlushRef.current();
      dwellQRef.current = null;
      dwellTickRef.current = null;
      return;
    }
    dwellFlushRef.current();
    dwellStartRef.current(questions[index]?.number ?? null);
  }, [index, phase, questions]);

  // Pause the dwell stopwatch while the tab is hidden so away-time isn't counted
  // as time-on-question (keeps per-question time comparable across students).
  useEffect(() => {
    if (phase !== "module") return;
    const onVis = () => {
      if (document.hidden) {
        if (dwellTickRef.current != null) {
          dwellActiveMsRef.current += Date.now() - dwellTickRef.current;
          dwellTickRef.current = null;
        }
      } else if (dwellQRef.current != null) {
        dwellTickRef.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  // Final flush on unmount (e.g. navigating away mid-test).
  useEffect(() => () => dwellFlushRef.current(), []);

  // Integrity telemetry while taking a module: paste / copy / leaving fullscreen.
  // In 'soft' mode this is detection-only (the proctor sees live counts, nothing
  // is blocked). In 'strict' mode the same events are blocked (preventDefault)
  // and logged as `*_blocked`, and a fullscreen exit raises the lockout overlay.
  // 'off' mode wires nothing.
  useEffect(() => {
    if (phase !== "module" || !runId || !proctorOn) return;
    const ctx = () => ({
      module: currentModuleRef.current ?? undefined,
      question: currentQuestionRef.current ?? undefined,
    });
    const onCopy = (e: Event) => {
      if (strict) {
        e.preventDefault();
        void logProctorEvent(runId, "copy_blocked", ctx());
      } else {
        void logProctorEvent(runId, "copy", ctx());
      }
    };
    const onCut = (e: Event) => {
      // cut is a copy + delete; in strict mode block it as a copy attempt.
      if (strict) {
        e.preventDefault();
        void logProctorEvent(runId, "copy_blocked", ctx());
      } else {
        void logProctorEvent(runId, "copy", ctx());
      }
    };
    const onPaste = (e: Event) => {
      if (strict) {
        e.preventDefault();
        void logProctorEvent(runId, "paste_blocked", ctx());
      } else {
        void logProctorEvent(runId, "paste", ctx());
      }
    };
    const onContextMenu = (e: Event) => {
      if (strict) {
        e.preventDefault();
        void logProctorEvent(runId, "contextmenu_blocked", ctx());
      }
    };
    // selectstart is blocked silently in strict mode (no log — too noisy).
    const onSelectStart = (e: Event) => {
      if (strict) e.preventDefault();
    };
    const onFsChange = () => {
      // Only meaningful when we're enforcing lockdown on a capable device.
      if (!strict || !supportsFullscreen) return;
      if (!document.fullscreenElement) {
        // Exited fullscreen mid-test → raise the blocking overlay and stamp the
        // time so we can log how long they were outside on return.
        fsExitedAtRef.current = Date.now();
        setFsLockout(true);
        void logProctorEvent(runId, "fullscreen_exit", ctx());
      } else {
        // Returned to fullscreen → drop the overlay and log the re-entry with
        // the duration spent outside.
        const exitedAt = fsExitedAtRef.current;
        const durationSeconds = exitedAt
          ? Math.round((Date.now() - exitedAt) / 1000)
          : undefined;
        fsExitedAtRef.current = null;
        setFsLockout(false);
        void logProctorEvent(runId, "fullscreen_enter", { ...ctx(), durationSeconds });
      }
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [phase, runId, proctorOn, strict, supportsFullscreen]);

  // FOCUS-LOSS telemetry (the second-monitor signal). A window 'blur' without a
  // matching visibilitychange→hidden means the student clicked another window
  // while the test tab stayed visible — distinct from a tab-switch (which logs
  // 'away' via the visibility effect). Dedupe so a real tab-switch logs ONLY
  // 'away': if a hidden event fires during the blur, suppress the focus_loss.
  const blurAtRef = useRef<number | null>(null);
  const blurCtxRef = useRef<{ module?: number; question?: number }>({});
  const wasHiddenDuringBlurRef = useRef(false);
  useEffect(() => {
    if (phase !== "module" || !runId || !proctorOn) return;
    const onBlur = () => {
      blurAtRef.current = Date.now();
      wasHiddenDuringBlurRef.current = false;
      blurCtxRef.current = {
        module: currentModuleRef.current ?? undefined,
        question: currentQuestionRef.current ?? undefined,
      };
    };
    const onHidden = () => {
      // A tab-switch/minimize while blurred → let the 'away' path own it.
      if (document.hidden && blurAtRef.current != null) {
        wasHiddenDuringBlurRef.current = true;
      }
    };
    const onFocus = () => {
      const at = blurAtRef.current;
      blurAtRef.current = null;
      if (at == null) return;
      const elapsed = Date.now() - at;
      // Only a *visible* focus loss (no hidden event) of ≥2s is a focus_loss.
      if (!wasHiddenDuringBlurRef.current && elapsed >= 2000) {
        void logProctorEvent(runId, "focus_loss", {
          durationSeconds: Math.round(elapsed / 1000),
          module: blurCtxRef.current.module,
          question: blurCtxRef.current.question,
        });
      }
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("focus", onFocus);
    };
  }, [phase, runId, proctorOn]);

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
  // Proctor context captured at the moment the tab was hidden, so the 'away'
  // event reports the module/question the student left from (not where they
  // happen to land after returning).
  const awayCtxRef = useRef<{ module?: number; question?: number }>({});
  useEffect(() => {
    if (phase !== "module" || !runId || !moduleMeta) return;
    const onVisibility = () => {
      if (document.hidden) {
        lastVisibleAt.current = Date.now();
        awayCtxRef.current = {
          module: currentModuleRef.current ?? undefined,
          question: currentQuestionRef.current ?? undefined,
        };
        return;
      }
      const hiddenMs = Date.now() - lastVisibleAt.current;
      // Integrity: a real "left the tab" (≥2s) → log an 'away' event with the
      // duration away + the position the student left from (proctorOn gates it).
      if (proctorOn && hiddenMs >= 2000) {
        void logProctorEvent(runId, "away", {
          durationSeconds: Math.round(hiddenMs / 1000),
          module: awayCtxRef.current.module,
          question: awayCtxRef.current.question,
        });
      }
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
  }, [phase, runId, moduleMeta, toast, proctorOn]);

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

  // Mirror the latest answers so the action journal can read the PRIOR value of
  // a question without logging inside the setState updater (which would
  // double-fire under StrictMode). Synced every render, like saveDraftRef.
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Proctoring heartbeat: tell the server which question we're on, on every
  // navigation and every 15s (so a teacher's live monitor stays current and
  // can spot an idle student). Best-effort.
  useEffect(() => {
    if (phase !== "module" || !runId) return;
    const n = questions[index]?.number;
    const send = () => {
      if (n != null) void heartbeat(runId, n);
    };
    send();
    // Action journal: record the navigation/revisit so the timeline can show
    // dwell-per-question and how often a student returned to a question.
    if (proctorOn && n != null) {
      void logAction(runId, "nav", { question: n, module: moduleMeta?.position });
    }
    const id = window.setInterval(send, 15000);
    return () => window.clearInterval(id);
  }, [index, phase, runId, questions, proctorOn, moduleMeta]);

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

  // Strict-mode lockdown: request element fullscreen. MUST run inside the user
  // gesture that starts/resumes a module (Begin / Resume / Start next section)
  // or the overlay's "Return to full screen" button — browsers reject
  // requestFullscreen() outside a transient activation. Best-effort: a rejected
  // promise (already fullscreen, denied) is swallowed; the fullscreenchange
  // listener is the source of truth for the lockout overlay.
  const enterFullscreen = useCallback(() => {
    if (!strict || !supportsFullscreen) return;
    try {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      /* non-fatal — telemetry still records the exit */
    }
  }, [strict, supportsFullscreen]);

  // Wrap a module-entry handler so strict mode enters fullscreen on the same
  // click that loads the module (keeps the call inside the user gesture).
  const beginModule = useCallback(
    (position: number) => {
      enterFullscreen();
      void loadModule(position);
    },
    [enterFullscreen, loadModule],
  );

  const setAnswer = useCallback(
    (qid: string, value: string | null) => {
      const before = answersRef.current[qid] ?? null;
      setAnswers((prev) => {
        const next = { ...prev, [qid]: value };
        if (runId && moduleMeta) saveCachedAnswers(runId, moduleMeta.position, next);
        return next;
      });
      // Action journal (best-effort, gated on proctoring). Records answer churn
      // — coaching insight + last-second-change cheating signal — as from→to.
      if (runId && proctorOn && before !== value) {
        const question = questions.find((qq) => qq.id === qid)?.number;
        const module = moduleMeta?.position;
        if (value == null) {
          void logAction(runId, "answer_clear", { question, module, meta: { from: before } });
        } else if (before == null) {
          void logAction(runId, "answer_set", { question, module, meta: { to: value } });
        } else {
          void logAction(runId, "answer_change", { question, module, meta: { from: before, to: value } });
        }
      }
    },
    [runId, moduleMeta, proctorOn, questions],
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

        {/* Two-way channel with the proctor (0113) — only available while paused. */}
        <div className="mx-auto mt-5 w-full max-w-md text-left">
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Message your teacher
          </h2>
          <div className="flex h-72 flex-col rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
            <ProctorChat
              runId={runId}
              role="student"
              emptyHint="Your teacher paused the test. Send them a message if you need anything — tap a quick reply or type below."
            />
          </div>
        </div>

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
    // A module is in scope for THIS run when it's inside the run's range
    // (first..last — a `?m=` subset link) AND deployed (a metered/windows
    // subset). Header counts + the "Begin" target reflect only those.
    const rangeFirst = start.first_position ?? 1;
    const rangeLast = start.last_position ?? Number.MAX_SAFE_INTEGER;
    const inScope = (m: { position: number; deployed?: boolean }): boolean =>
      m.position >= rangeFirst && m.position <= rangeLast && m.deployed !== false;
    const scopedModules = start.modules.filter(inScope);
    const scopedQuestions = scopedModules.reduce((a, m) => a + m.question_count, 0);
    const isSubset = scopedModules.length < start.modules.length;
    return (
      <CenterCard wide>
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
          {isSubset ? "Practice test — selected modules" : "Full-length practice test"}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{start.test.title}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          {scopedQuestions || start.test.total_questions} questions ·{" "}
          {scopedModules.length} timed module{scopedModules.length === 1 ? "" : "s"}.
          Each module is timed and submitted on its own; you can't return to a
          previous module once you move on — just like the real Digital SAT.
        </p>
        <ol className="mt-5 space-y-2">
          {start.modules.map((m) => {
            const included = inScope(m);
            const opensFuture =
              !!m.opens_at && new Date(m.opens_at).getTime() > Date.now();
            return (
              <li
                key={m.position}
                className={`flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 ${included ? "" : "opacity-50"}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {m.position}. {m.label}
                  </span>
                  {!included && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Not included
                    </span>
                  )}
                  {included && opensFuture && m.opens_at && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      {formatOpensRelative(m.opens_at)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                  {m.question_count} q · {Math.round(m.time_limit_seconds / 60)} min
                </span>
              </li>
            );
          })}
        </ol>
        {lockdownUnsupported && <LockdownNotice className="mt-5" />}
        <button
          type="button"
          onClick={() => beginModule(start.current_module)}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          {resuming ? `Resume — Module ${start.current_module}` : "Begin test"}
        </button>
      </CenterCard>
    );
  }

  if (phase === "locked" && lockedInfo) {
    const lockedModule = start?.modules.find((m) => m.position === lockedInfo.position);
    const showSaved = lockedInfo.position > (start?.first_position ?? 1);
    return (
      <CenterCard>
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {lockedInfo.reason === "not_yet_open"
            ? "This section isn't open yet"
            : "This section isn't part of your assignment"}
        </h1>
        {lockedModule && (
          <p className="mt-2 font-medium text-slate-700 dark:text-slate-300">
            {lockedModule.label}
          </p>
        )}
        {lockedInfo.reason === "not_yet_open" && lockedInfo.opensAt && (
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {formatOpensRelative(lockedInfo.opensAt)}
            </span>
            {" — "}
            {formatOpensAbsolute(lockedInfo.opensAt)}
          </p>
        )}
        {showSaved && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Your previous answers are saved.
          </p>
        )}
        <button
          type="button"
          onClick={() => navigate(ROUTES.HOME)}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
        >
          Back to my course
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
        {lockdownUnsupported && <LockdownNotice className="mt-5" />}
        <button
          type="button"
          onClick={() => beginModule(start.current_module)}
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
  const toggleMark = (qid: string) => {
    const wasMarked = marked.has(qid);
    setMarked((prev) => {
      const n = new Set(prev);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      return n;
    });
    if (runId && proctorOn) {
      const question = questions.find((qq) => qq.id === qid)?.number;
      void logAction(runId, wasMarked ? "unflag" : "flag", {
        question,
        module: moduleMeta?.position,
      });
    }
  };
  const toggleEliminate = (qid: string, letter: Letter) => {
    const wasStruck = eliminated[qid]?.has(letter) ?? false;
    setEliminated((prev) => {
      const cur = new Set(prev[qid] ?? []);
      if (cur.has(letter)) cur.delete(letter);
      else cur.add(letter);
      return { ...prev, [qid]: cur };
    });
    if (runId && proctorOn) {
      const question = questions.find((qq) => qq.id === qid)?.number;
      void logAction(runId, wasStruck ? "uneliminate" : "eliminate", {
        question,
        module: moduleMeta?.position,
        meta: { choice: letter },
      });
    }
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
            className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
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
              onClick={() => {
                const nv = !calcOpen;
                setCalcOpen(nv);
                if (runId && proctorOn) {
                  void logAction(runId, nv ? "calc_open" : "calc_close", {
                    module: currentModuleRef.current ?? undefined,
                    question: currentQuestionRef.current ?? undefined,
                  });
                }
              }}
              className={[
                "inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border px-3 py-1.5 text-sm font-medium transition",
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
      <DesmosCalculator
        open={calcOpen}
        onClose={() => {
          if (calcOpen && runId && proctorOn) {
            void logAction(runId, "calc_close", {
              module: currentModuleRef.current ?? undefined,
              question: currentQuestionRef.current ?? undefined,
            });
          }
          setCalcOpen(false);
        }}
      />

      {/* ── Study tools: highlight + notes ── */}
      {q && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-1.5 dark:border-slate-800 dark:bg-slate-900/60">
          <HighlighterBar
            active={hlColor}
            onPick={(c) => setHlColor((prev) => (prev === c ? null : c))}
            onClear={() => {
              const had = annot.get(q.id).highlights.length;
              annot.clearHighlights(q.id);
              if (had > 0 && runId && proctorOn) {
                void logAction(runId, "highlight_clear", {
                  question: q.number,
                  module: moduleMeta?.position,
                });
              }
            }}
            count={annot.get(q.id).highlights.length}
          />
          <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
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
            onChange={(e) => {
              const text = e.target.value;
              annot.setNote(q.id, text);
              // Debounced note_edit snapshot for replay (capped length).
              if (runId && proctorOn) {
                window.clearTimeout(noteTimerRef.current);
                const qn = q.number;
                const mod = moduleMeta?.position;
                noteTimerRef.current = window.setTimeout(() => {
                  void logAction(runId, "note_edit", {
                    question: qn,
                    module: mod,
                    meta: { text: text.slice(0, 500) },
                  });
                }, 1500);
              }
            }}
            rows={2}
            placeholder="Jot a note for this question…"
            className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      )}

      {/* ── Body: fills the viewport; only the panes scroll → no layout shift ── */}
      <main
        className="min-h-0 flex-1"
        style={hlColor ? { cursor: highlighterCursor(hlColor) } : undefined}
      >
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
            onRemoveHighlight={(field, offset) => {
              annot.removeHighlightAt(q.id, field, offset);
              if (runId && proctorOn) {
                void logAction(runId, "highlight_remove", {
                  question: q.number,
                  module: moduleMeta?.position,
                  meta: { field, offset },
                });
              }
            }}
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
            className="inline-flex items-center gap-2 min-h-[44px] rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-200 dark:text-slate-900"
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
            className="min-h-[44px] rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
          >
            Back
          </button>
          {index < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="min-h-[44px] rounded-full bg-blue-700 px-7 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPendingSectionSubmit({ blanks: questions.length - answeredCount })}
              className="min-h-[44px] rounded-full bg-blue-700 px-7 py-2 text-sm font-semibold text-white hover:bg-blue-800"
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
              Once you submit, this section is{" "}
              <span className="font-semibold text-rose-700 dark:text-rose-300">
                final
              </span>{" "}
              — you can't return to it or change your answers, and you'll move on
              to the next section.
            </p>
          }
          // One-way action: require a typed confirmation so a section can't be
          // ended by an accidental click (students can't go back to a module).
          confirmPhrase="submit"
          confirmLabel="Submit section"
          destructive
          onConfirm={async () => {
            setPendingSectionSubmit(null);
            // Flush the 2.5s-debounced draft (highlights / notes / mark-for-
            // review) BEFORE submitting, same as the time-up path (F4), so a
            // voluntary submit right after an annotation edit doesn't drop it.
            saveDraftRef.current();
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

      {/* Strict-mode lockdown notice: device can't enforce fullscreen, but we
          still record activity. Non-blocking — sits above the question header. */}
      {lockdownUnsupported && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          Lockdown isn't supported on this device; your activity is still
          recorded.
        </div>
      )}

      {/* Strict-mode fullscreen lockout: a BLOCKING overlay shown when the
          student exits fullscreen mid-test. The only way out is back into
          fullscreen — the button calls requestFullscreen() inside its click
          handler (required for a transient activation). The timer is NOT
          paused; the section clock keeps running behind the overlay.

          BUT suppress it while the submit-section or exit dialog is open: the
          browser exits fullscreen on Esc (unpreventable), and the lockout
          (z-80) would otherwise slam on top of the submit window (z-50) and
          trap the student at the end of the test, unable to finish. Keeping
          the lockout hidden lets them complete the submit; it reappears if
          they cancel back into the still-running section. */}
      {fsLockout && !pendingSectionSubmit && !confirmExit && (
        <FullscreenLockout onReturn={enterFullscreen} />
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

/** Inline, non-blocking notice for strict mode on a device that can't lock
 *  down (e.g. iPhone). Telemetry still records the student's activity. */
function LockdownNotice({ className = "" }: { className?: string }) {
  return (
    <div
      role="note"
      className={[
        "flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
        className,
      ].join(" ")}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
      <span>
        Lockdown isn't supported on this device; your activity is still recorded.
      </span>
    </div>
  );
}

/** Strict-mode blocking overlay: covers the questions when the student leaves
 *  fullscreen mid-test. Dismissible ONLY by returning to fullscreen (the button
 *  calls requestFullscreen() inside its own click handler). Traps interaction
 *  via a fixed, top-most layer; the section timer keeps running behind it. */
function FullscreenLockout({ onReturn }: { onReturn: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);
  return (
    <div
      ref={panelRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="fs-lockout-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </div>
        <h1 id="fs-lockout-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Return to full screen to continue your test
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This test runs in full screen. Your section timer is still running —
          return to full screen now to keep going.
        </p>
        <button
          type="button"
          onClick={onReturn}
          autoFocus
          className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
        >
          Return to full screen
        </button>
      </div>
    </div>
  );
}
