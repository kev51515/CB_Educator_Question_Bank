/**
 * TestReviewPage (staff "Review" / answer key + class results)
 * ============================================================
 * The teacher's review surface for a full-length test. Same one-question-at-a-
 * time layout as the educator Preview, but built for going over a test WITH a
 * class:
 *   • the correct answer is marked on every question (answer key),
 *   • a collapsible LEFT sidebar shows, per question, how the chosen class
 *     answered — per-option counts + which students picked each (0112 RPCs) —
 *     plus a section overview list with %-correct per question,
 *   • text highlighting for live discussion, saved per teacher (localStorage,
 *     via useRunnerAnnotations — survives across review sessions),
 *   • a class picker (the courses the teacher teaches that link this test).
 *
 * Content comes from a direct staff SELECT on tests → test_modules →
 * test_questions (0048 RLS is_staff). With no class data it degrades to a clean
 * answer-key walkthrough. Full-screen takeover for projector/tablet use.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useBreadcrumbLabel } from "@/components";
import { testOverviewPath } from "@/lib/routes";
import { QuestionPane } from "./QuestionPane";
import { captureSelectionHighlight, useRunnerAnnotations } from "./annotations";
import {
  listReviewCourses,
  getAnswerBreakdown,
  type ReviewCourse,
  type BreakdownRow,
} from "./api";
import type { Letter, Section, TestQuestion } from "./types";

const LETTERS: Letter[] = ["A", "B", "C", "D"];

interface RawQuestion {
  id: string;
  ref: string;
  number: number;
  position: number;
  type: "mcq" | "grid";
  passage: string | null;
  passage_alt: string | null;
  stem: string;
  choices: Record<Letter, string> | null;
  figure: string | null;
  correct_answer: string | null;
  accepted: string[] | null;
}
interface RawModule {
  position: number;
  label: string;
  section: Section;
  test_questions: RawQuestion[];
}
interface RawTest {
  title: string;
  test_modules: RawModule[];
}
interface ReviewQuestion extends TestQuestion {
  correct_answer: string | null;
}
interface ReviewModule {
  position: number;
  label: string;
  section: Section;
  questions: ReviewQuestion[];
}

const SELECT =
  "title,test_modules(position,label,section,test_questions(id,ref,number,position,type,passage,passage_alt,stem,choices,figure,correct_answer,accepted))";

export function TestReviewPage(): JSX.Element {
  const { slug = "" } = useParams();
  const navigate = useNavigate();

  const [modules, setModules] = useState<ReviewModule[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mi, setMi] = useState(0);
  const [qi, setQi] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window === "undefined" ? true : window.innerWidth >= 1024,
  );

  // class results
  const [courses, setCourses] = useState<ReviewCourse[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  // highlights, saved per (teacher device, test)
  const annot = useRunnerAnnotations(slug);

  useBreadcrumbLabel(slug, title || undefined);

  // --- load test content ---
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const { data, error: err } = await supabase
        .from("tests")
        .select(SELECT)
        .eq("slug", slug)
        .single();
      if (!alive) return;
      if (err || !data) {
        setError(err?.message ?? "Test not found.");
        setLoading(false);
        return;
      }
      const raw = data as unknown as RawTest;
      const mods: ReviewModule[] = [...(raw.test_modules ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((m) => ({
          position: m.position,
          label: m.label,
          section: m.section,
          questions: [...(m.test_questions ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((q) => ({
              id: q.id,
              ref: q.ref,
              number: q.number,
              type: q.type,
              section: m.section,
              passage: q.passage,
              passage_alt: q.passage_alt,
              stem: q.stem,
              choices: q.choices,
              figure: q.figure,
              correct_answer: q.correct_answer ?? q.accepted?.[0] ?? null,
            })),
        }));
      setTitle(raw.title);
      setModules(mods);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  // --- load reviewable classes; default to the one with the most submitters ---
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const cs = await listReviewCourses(slug);
        if (!alive) return;
        setCourses(cs);
        const firstWithData = cs.find((c) => c.taken > 0) ?? cs[0] ?? null;
        setCourseId(firstWithData ? firstWithData.course_id : null);
      } catch {
        if (alive) setCourses([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  // --- load the chosen class's answers ---
  useEffect(() => {
    if (!courseId) {
      setBreakdown([]);
      return;
    }
    let alive = true;
    setBreakdownLoading(true);
    void (async () => {
      try {
        const rows = await getAnswerBreakdown(slug, courseId);
        if (alive) setBreakdown(rows);
      } catch {
        if (alive) setBreakdown([]);
      } finally {
        if (alive) setBreakdownLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, courseId]);

  const byQ = useMemo(() => {
    const m = new Map<string, BreakdownRow[]>();
    for (const r of breakdown) {
      const arr = m.get(r.question_id);
      if (arr) arr.push(r);
      else m.set(r.question_id, [r]);
    }
    return m;
  }, [breakdown]);

  const activeModule = modules[mi] ?? null;
  const questions = activeModule?.questions ?? [];
  const question = questions[qi] ?? null;

  const goModule = useCallback((next: number) => {
    setMi(next);
    setQi(0);
    setNavOpen(false);
  }, []);

  const goPrev = useCallback(() => {
    setNavOpen(false);
    if (qi > 0) setQi(qi - 1);
    else if (mi > 0) {
      const prevLen = modules[mi - 1]?.questions.length ?? 0;
      setMi(mi - 1);
      setQi(Math.max(0, prevLen - 1));
    }
  }, [qi, mi, modules]);

  const goNext = useCallback(() => {
    setNavOpen(false);
    if (qi < questions.length - 1) setQi(qi + 1);
    else if (mi < modules.length - 1) {
      setMi(mi + 1);
      setQi(0);
    }
  }, [qi, questions.length, mi, modules.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  const exit = () => navigate(testOverviewPath(slug));

  const atFirst = mi === 0 && qi === 0;
  const atLast = mi === modules.length - 1 && qi === questions.length - 1;

  const addHighlight = () => {
    if (!question) return;
    const hl = captureSelectionHighlight();
    if (hl) {
      annot.addHighlight(question.id, hl);
      window.getSelection()?.removeAllRanges();
    }
  };

  // --- per-question stats for the section overview list ---
  const qStat = useCallback(
    (qid: string): { total: number; correct: number } | null => {
      const rows = byQ.get(qid);
      if (!rows || rows.length === 0) return null;
      return { total: rows.length, correct: rows.filter((r) => r.is_correct).length };
    },
    [byQ],
  );

  const curRows = question ? (byQ.get(question.id) ?? []) : [];
  const curTotal = curRows.length;
  const curCorrect = curRows.filter((r) => r.is_correct).length;
  const hlCount = question ? annot.get(question.id).highlights.length : 0;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-slate-950">
      {/* ---- top bar ---- */}
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Review
            </span>
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {title || "Loading…"}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {courses.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="hidden sm:inline">Class</span>
                <select
                  value={courseId ?? ""}
                  onChange={(e) => setCourseId(e.target.value || null)}
                  className="max-w-[14rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {courses.map((c) => (
                    <option key={c.course_id} value={c.course_id}>
                      {c.title} ({c.taken})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={exit}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Exit review
            </button>
          </div>
        </div>

        {/* module tabs */}
        {modules.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2">
            {modules.map((m, i) => {
              const active = i === mi;
              return (
                <button
                  key={m.position}
                  type="button"
                  onClick={() => goModule(i)}
                  aria-current={active ? "true" : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {m.label}
                  <span className={`ml-1.5 tabular-nums ${active ? "opacity-70" : "text-slate-400 dark:text-slate-500"}`}>
                    {m.questions.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* ---- nav strip ---- */}
      {question && (
        <div className="relative z-10 shrink-0 border-b border-slate-200 bg-slate-50/70 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center gap-2">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                title="Show class results"
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-white dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                ☰ Results
              </button>
            )}
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-expanded={navOpen}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Question {question.number}
              <span className="font-normal text-slate-400 dark:text-slate-500">of {questions.length}</span>
              <span aria-hidden className={`transition-transform ${navOpen ? "rotate-180" : ""}`}>▾</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={addHighlight}
              title="Select text in the passage or question, then highlight it"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-amber-50 hover:text-amber-700 dark:text-slate-300 dark:hover:bg-amber-950/30 dark:hover:text-amber-300"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 11-6 6v3h3l6-6M22 6 18 2l-7 7 4 4 7-7Z" />
              </svg>
              Highlight
            </button>
            {hlCount > 0 && question && (
              <button
                type="button"
                onClick={() => annot.clearHighlights(question.id)}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Clear ({hlCount})
              </button>
            )}

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={atFirst}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={atLast}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                Next →
              </button>
            </div>
          </div>

          {navOpen && (
            <div className="absolute left-3 top-full z-20 mt-1 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {activeModule?.label}
              </p>
              <div className="grid grid-cols-8 gap-1.5">
                {questions.map((q, i) => {
                  const st = qStat(q.id);
                  const cur = i === qi;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setQi(i);
                        setNavOpen(false);
                      }}
                      title={st ? `${Math.round((st.correct / st.total) * 100)}% correct` : undefined}
                      className={`flex h-8 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        cur
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
                      }`}
                    >
                      {q.number}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- body: sidebar + question ---- */}
      <div className="flex min-h-0 flex-1">
        {/* left sidebar: class results */}
        {sidebarOpen && (
          <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/30">
            <div className="flex items-center justify-between px-3 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Class results
              </h2>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                title="Collapse"
                className="rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                ‹
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              {!courseId ? (
                <p className="rounded-lg bg-white px-3 py-3 text-xs text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
                  No class is linked to this test yet — showing the answer key.
                </p>
              ) : breakdownLoading ? (
                <p className="text-xs text-slate-400">Loading results…</p>
              ) : question ? (
                <>
                  {/* current-question breakdown */}
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Q{question.number}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {curTotal === 0
                          ? "no responses"
                          : `${curCorrect}/${curTotal} correct${
                              curTotal ? ` (${Math.round((curCorrect / curTotal) * 100)}%)` : ""
                            }`}
                      </span>
                    </div>
                    {curTotal === 0 ? (
                      <p className="text-[11px] text-slate-400">
                        No one in this class has answered this yet.
                      </p>
                    ) : (
                      <BreakdownBody question={question} rows={curRows} total={curTotal} />
                    )}
                  </div>

                  {/* section overview */}
                  <p className="mb-1.5 mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {activeModule?.label}
                  </p>
                  <ul className="space-y-0.5">
                    {questions.map((q, i) => {
                      const st = qStat(q.id);
                      const pct = st && st.total ? Math.round((st.correct / st.total) * 100) : null;
                      const cur = i === qi;
                      return (
                        <li key={q.id}>
                          <button
                            type="button"
                            onClick={() => setQi(i)}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                              cur
                                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            }`}
                          >
                            <span className="w-6 shrink-0 tabular-nums">Q{q.number}</span>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                              {pct != null && (
                                <span
                                  className={`block h-full rounded-full ${
                                    pct >= 70
                                      ? "bg-emerald-500"
                                      : pct >= 40
                                        ? "bg-amber-500"
                                        : "bg-rose-500"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              )}
                            </span>
                            <span className="w-9 shrink-0 text-right tabular-nums text-slate-400 dark:text-slate-500">
                              {pct != null ? `${pct}%` : "—"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </div>
          </aside>
        )}

        {/* the question */}
        <main className="min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Loading review…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          ) : !question ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              This test has no questions.
            </div>
          ) : (
            <QuestionPane
              key={question.id}
              question={question}
              value={null}
              onChange={() => {}}
              disabled
              fullHeight
              correctAnswer={question.correct_answer}
              highlights={annot.get(question.id).highlights}
              onRemoveHighlight={(field, offset) =>
                annot.removeHighlightAt(question.id, field, offset)
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}

/** Per-option (mcq) or per-distinct-answer (grid) breakdown for one question. */
function BreakdownBody({
  question,
  rows,
  total,
}: {
  question: ReviewQuestion;
  rows: BreakdownRow[];
  total: number;
}): JSX.Element {
  const names = (rs: BreakdownRow[]): string =>
    rs.map((r) => r.student_name ?? "Unknown").join(", ");

  if (question.type === "mcq" && question.choices) {
    const present = LETTERS.filter((l) => question.choices![l] !== undefined);
    const blanks = rows.filter((r) => !r.chosen);
    return (
      <div className="space-y-2">
        {present.map((letter) => {
          const picks = rows.filter((r) => (r.chosen ?? "") === letter);
          const n = picks.length;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const isKey = question.correct_answer === letter;
          return (
            <div key={letter}>
              <div className="flex items-center gap-2 text-[11px]">
                <span
                  className={`w-3 font-semibold ${
                    isKey ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {letter}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <span
                    className={`block h-full rounded-full ${isKey ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                {isKey && <span className="text-emerald-600 dark:text-emerald-400">✓</span>}
                <span className="w-6 text-right tabular-nums text-slate-500 dark:text-slate-400">{n}</span>
              </div>
              {n > 0 && (
                <p className="ml-5 mt-0.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                  {names(picks)}
                </p>
              )}
            </div>
          );
        })}
        {blanks.length > 0 && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            No answer · {blanks.length} — {names(blanks)}
          </div>
        )}
      </div>
    );
  }

  // grid — group by the typed value
  const groups = new Map<string, BreakdownRow[]>();
  for (const r of rows) {
    const key = r.chosen?.trim() ? r.chosen.trim() : "—";
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <div className="space-y-2">
      {entries.map(([val, rs]) => {
        const n = rs.length;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const isKey = rs.some((r) => r.is_correct);
        return (
          <div key={val}>
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className={`min-w-[2.5rem] font-mono font-semibold ${
                  isKey ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {val}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <span
                  className={`block h-full rounded-full ${isKey ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              {isKey && <span className="text-emerald-600 dark:text-emerald-400">✓</span>}
              <span className="w-6 text-right tabular-nums text-slate-500 dark:text-slate-400">{n}</span>
            </div>
            <p className="ml-1 mt-0.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
              {names(rs)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
