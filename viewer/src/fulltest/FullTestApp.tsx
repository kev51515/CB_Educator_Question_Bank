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
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "../components";
import { ROUTES } from "../lib/routes";
import { useProfile } from "../lib/profile";
import { ConfirmDialog } from "../teacher/ConfirmDialog";
import { DesmosCalculator } from "./DesmosCalculator";
import { QuestionPane } from "./QuestionPane";
import { ResultView } from "./ResultView";
import {
  clearCachedAnswers,
  getModule,
  getResult,
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
  const toast = useToast();
  // Role gates the end-of-test screen: staff (teacher previewing / reviewing)
  // see the full result; students see only a neutral "submitted" confirmation —
  // no score, no questions — until the teacher releases results.
  const { profile, loading: profileLoading } = useProfile();
  const isStaff = profile?.role === "teacher" || profile?.role === "admin";

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [start, setStart] = useState<StartTestResult | null>(null);

  // Active module state
  const [moduleMeta, setModuleMeta] = useState<ModuleMeta | null>(null);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [index, setIndex] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const [result, setResult] = useState<TestResult | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
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
        setIndex(0);
        // Hydrate answers: server drafts (cross-device) overlaid with the local
        // cache (freshest, saved on every keystroke). Local wins when present.
        const cached = loadCachedAnswers(runId, position);
        const server = m.saved_answers ?? {};
        const merged = { ...server, ...cached };
        const seed: Record<string, string | null> = {};
        for (const q of m.questions) seed[q.id] = merged[q.id] ?? null;
        setAnswers(seed);
        // Rehydrate eliminated (struck) choices saved on the server so a
        // resume restores them — and so they're re-submitted at section end.
        const savedElim = m.saved_eliminations ?? {};
        const elimSeed: Record<string, Set<Letter>> = {};
        for (const q of m.questions) {
          const letters = savedElim[q.id];
          if (letters && letters.length > 0) elimSeed[q.id] = new Set(letters);
        }
        setEliminated(elimSeed);
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
    if (phase !== "result" || !isStaff || result || !runId) return;
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
  }, [phase, isStaff, result, runId]);

  // --- timer ----------------------------------------------------------------
  useEffect(() => {
    if (phase !== "module" || deadline === null) return;
    const tick = () => {
      const left = Math.round((deadline - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) {
        toast.info("Time's up for this section — submitting your answers.");
        void doSubmitModule();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [phase, deadline, doSubmitModule, toast]);

  // P2: debounced server-side draft autosave. Each answer change resets a
  // 2.5s timer; on idle we persist the active module's drafts so a device
  // loss mid-module doesn't lose work (localStorage is the immediate backup;
  // this is the cross-device one). Best-effort — failures are swallowed.
  useEffect(() => {
    if (phase !== "module" || !runId || !moduleMeta) return;
    const pos = moduleMeta.position;
    const t = window.setTimeout(() => {
      void saveProgress(runId, pos, answers, elimToPayload(eliminated));
    }, 2500);
    return () => window.clearTimeout(t);
  }, [answers, eliminated, phase, runId, moduleMeta]);

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
    // Wait until we know the role (and, for staff, the fetched result) before
    // deciding — avoids flashing the student screen to a teacher.
    if (profileLoading || (isStaff && !result)) {
      return <CenterCard><Spinner label="Processing your test…" /></CenterCard>;
    }
    // Staff (teacher previewing / reviewing) see the full breakdown.
    if (isStaff && result) {
      return <ResultView result={result} testTitle={start?.test.title ?? "Test"} />;
    }
    // Student: neutral confirmation only — no score, no questions. The teacher
    // releases results separately (server also locks get_test_result for them).
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
