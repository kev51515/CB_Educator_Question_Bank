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
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Combobox, useBreadcrumbLabel } from "@/components";
import { Skeleton } from "@/components/Skeleton";
import { testOverviewPath } from "@/lib/routes";
import { QuestionPane } from "./QuestionPane";
import { ReferenceSheet } from "./ReferenceSheet";
import { ReviewHeatmap } from "./ReviewHeatmap";
import { ClassComparison } from "./ClassComparison";
import { ModuleTabs } from "./ModuleTabs";
import { useTestNavigation } from "./useTestNavigation";
import {
  correctValue,
  fetchTestContent,
  type TestContentModule,
  type TestContentQuestion,
} from "./testContent";
import { captureSelectionHighlight, useRunnerAnnotations } from "./annotations";
import {
  listReviewCourses,
  getAnswerBreakdown,
  type ReviewCourse,
  type BreakdownRow,
} from "./api";
import type { Letter } from "./types";

const LETTERS: Letter[] = ["A", "B", "C", "D"];

// Remember the class an educator last reviewed for a given test, so reopening
// Review Mode "inherits" their class instead of resetting to the first one.
const reviewClassKey = (slug: string): string => `fulltest:review:class:${slug}`;
function readReviewClass(slug: string): string | null {
  try {
    return window.localStorage.getItem(reviewClassKey(slug));
  } catch {
    return null;
  }
}
function writeReviewClass(slug: string, courseId: string | null): void {
  try {
    if (courseId) window.localStorage.setItem(reviewClassKey(slug), courseId);
    else window.localStorage.removeItem(reviewClassKey(slug));
  } catch {
    /* ignore (private mode / quota) */
  }
}

export function TestReviewPage(): JSX.Element {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  // Occurrence context, passed from the course's test link / overview:
  //   ?course=<id> pre-selects that course's class results (no cross-course mix)
  //   ?m=<first>-<last> scopes the answer key + stats to that module range
  // so a Module-1-only assignment reviews as Module 1 only, for that course.
  const [searchParams] = useSearchParams();
  const courseParam = searchParams.get("course");
  const moduleRange = useMemo(() => {
    const m = searchParams.get("m");
    if (m && /^\d+-\d+$/.test(m)) {
      const [f, l] = m.split("-").map((n) => Number.parseInt(n, 10));
      if (Number.isFinite(f) && Number.isFinite(l)) return { first: f, last: l };
    }
    return null;
  }, [searchParams]);

  const [modules, setModules] = useState<TestContentModule[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window === "undefined" ? true : window.innerWidth >= 1024,
  );
  // User override: force the passage/question to stack (single column) even when
  // there's room to split. Off = auto (container-query) split.
  const [forceStacked, setForceStacked] = useState(false);
  // "Explain" toggle: reveal per-choice rationale (which word is wrong + why).
  const [showRationale, setShowRationale] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  // Whole-test class heatmap overlay (% correct per question, click to jump).
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  // Cross-class comparison overlay (per-domain % correct, one column per class).
  const [compareOpen, setCompareOpen] = useState(false);

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
    void fetchTestContent(slug)
      .then((tc) => {
        if (!alive) return;
        setTitle(tc.title);
        // Scope to the occurrence's module range so the answer key, nav, tabs,
        // per-question stats + heatmap all show only the assigned modules.
        setModules(
          moduleRange
            ? tc.modules.filter(
                (m) => m.position >= moduleRange.first && m.position <= moduleRange.last,
              )
            : tc.modules,
        );
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Test not found.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, moduleRange]);

  // --- load reviewable classes; inherit the educator's last class for this
  // test, else default to the one with the most submitters ---
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const cs = await listReviewCourses(slug);
        if (!alive) return;
        setCourses(cs);
        const saved = readReviewClass(slug);
        const pick =
          cs.find((c) => c.course_id === courseParam) ?? // course we came in through (deep-link)
          cs.find((c) => c.course_id === saved) ?? // else their last choice
          cs.find((c) => c.taken > 0) ?? // else the class that actually sat it
          cs[0] ?? // else whatever's linked
          null;
        setCourseId(pick ? pick.course_id : null);
      } catch {
        if (alive) setCourses([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, courseParam]);

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

  const { mi, qi, setQi, navOpen, setNavOpen, activeModule, questions, question, goModule, goPrev, goNext, atFirst, atLast } =
    useTestNavigation(modules);

  const exit = () => navigate(testOverviewPath(slug));

  const addHighlight = () => {
    if (!question) return;
    const hl = captureSelectionHighlight();
    if (hl) {
      annot.addHighlight(question.id, hl);
      window.getSelection()?.removeAllRanges();
    }
  };

  // --- per-question stats for the section overview list + heatmap ---
  // Includes the most-common INCORRECT answer (the distractor the class fell
  // for) — the actionable bit when reviewing a missed question.
  const qStat = useCallback(
    (
      qid: string,
    ): { total: number; correct: number; topWrong: { value: string; count: number } | null } | null => {
      const rows = byQ.get(qid);
      if (!rows || rows.length === 0) return null;
      const wrong = new Map<string, number>();
      for (const r of rows) {
        if (r.is_correct) continue;
        const v = (r.chosen ?? "").trim();
        if (!v) continue;
        wrong.set(v, (wrong.get(v) ?? 0) + 1);
      }
      let topWrong: { value: string; count: number } | null = null;
      for (const [value, count] of wrong) {
        // Stable tie-break (lexicographic) so the "most chose" hint doesn't flip
        // between renders when two distractors are equally common.
        if (!topWrong || count > topWrong.count || (count === topWrong.count && value < topWrong.value)) {
          topWrong = { value, count };
        }
      }
      return { total: rows.length, correct: rows.filter((r) => r.is_correct).length, topWrong };
    },
    [byQ],
  );

  const curRows = question ? (byQ.get(question.id) ?? []) : [];
  const curTotal = curRows.length;
  const curCorrect = curRows.filter((r) => r.is_correct).length;
  const hlCount = question ? annot.get(question.id).highlights.length : 0;
  const selectedCourse = courses.find((c) => c.course_id === courseId) ?? null;
  // Any responses at all for this class? (drives the sidebar empty state).
  const hasClassData = breakdown.length > 0;
  const anotherClassHasData = courses.some((c) => c.course_id !== courseId && c.taken > 0);
  // Classes with submissions — cross-class comparison needs at least two.
  const comparableCourses = courses.filter((c) => c.taken > 0);

  // Per-choice counts + names for the inline pills on each mcq answer choice.
  const choiceStats = useMemo(() => {
    if (!hasClassData || !question || question.type !== "mcq") return undefined;
    const out: Partial<Record<Letter, { count: number; names: string[] }>> = {};
    for (const L of LETTERS) {
      const picks = curRows.filter((r) => (r.chosen ?? "") === L);
      out[L] = { count: picks.length, names: picks.map((r) => r.student_name ?? "Unknown") };
    }
    return out;
  }, [hasClassData, question, curRows]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-slate-950">
      {/* ---- top bar ---- */}
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Review Mode
            </span>
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {title || "Loading…"}
            </span>
            {moduleRange && (
              <span
                className="inline-flex flex-none items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900"
                title="Scoped to this course's assigned modules"
              >
                {modules.length === 1 && modules[0]
                  ? modules[0].label
                  : `Modules ${moduleRange.first}–${moduleRange.last}`}{" "}
                only
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {courses.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="hidden sm:inline">Class</span>
                <Combobox
                  ariaLabel="Class"
                  placeholder="Select class…"
                  value={courseId}
                  onChange={(v) => {
                    const next = v || null;
                    setCourseId(next);
                    writeReviewClass(slug, next);
                  }}
                  options={courses.map((c) => ({
                    value: c.course_id,
                    label: `${c.title} (${c.taken})`,
                  }))}
                  className="max-w-[14rem]"
                />
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

        <ModuleTabs modules={modules} activeIndex={mi} onSelect={goModule} />
      </header>

      {/* ---- nav strip ---- */}
      {question && (
        <div className="relative z-10 shrink-0 border-b border-slate-200 bg-slate-50/70 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center gap-2">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show class results"
                aria-expanded={false}
                aria-controls="review-class-results"
                title="Show class results"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-white dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                </svg>
                Results
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

            {/* current question's SAT domain — context while reviewing */}
            {question.domain && (
              <span
                className="hidden items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 sm:inline-flex dark:bg-indigo-950/40 dark:text-indigo-300"
                title={`SAT skill domain: ${question.domain}`}
              >
                {question.domain}
              </span>
            )}

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
            {question && (
              <button
                type="button"
                onClick={() => annot.clearHighlights(question.id)}
                aria-hidden={hlCount === 0}
                tabIndex={hlCount === 0 ? -1 : 0}
                className={`rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800 ${hlCount > 0 ? "" : "invisible pointer-events-none"}`}
              >
                Clear ({hlCount})
              </button>
            )}

            {/* Manual layout override: force the passage + question to stack
                even when there's room to split (Reading & Writing only). */}
            <button
              type="button"
              onClick={() => setForceStacked((v) => !v)}
              aria-pressed={forceStacked}
              title={forceStacked ? "Side-by-side layout" : "Stack passage & question"}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                forceStacked
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="7" rx="1" />
                <rect x="3" y="13" width="18" height="7" rx="1" />
              </svg>
              Stack
            </button>

            {/* Reveal per-choice rationale (which word is wrong + why). */}
            <button
              type="button"
              onClick={() => setShowRationale((v) => !v)}
              aria-pressed={showRationale}
              title={showRationale ? "Hide explanations" : "Explain why each choice is right or wrong"}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                showRationale
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              Explain
            </button>

            {/* Math reference sheet — the standard SAT formula card, on demand. */}
            <button
              type="button"
              onClick={() => setRefOpen((v) => !v)}
              aria-pressed={refOpen}
              title="Math reference sheet"
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                refOpen
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Reference
            </button>

            {/* Whole-test class heatmap (% correct per question, click to jump). */}
            {hasClassData && (
              <button
                type="button"
                onClick={() => setHeatmapOpen(true)}
                title="Class heatmap — % correct per question across the whole test"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Heatmap
              </button>
            )}

            {/* Cross-class comparison — only when ≥2 classes have submissions. */}
            {comparableCourses.length >= 2 && (
              <button
                type="button"
                onClick={() => setCompareOpen(true)}
                title="Compare classes — % correct by topic across every class that took this test"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 3v18h18" />
                  <rect x="7" y="10" width="3" height="7" />
                  <rect x="14" y="6" width="3" height="11" />
                </svg>
                Compare
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
          <aside id="review-class-results" aria-label="Class results" className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/30">
            <div className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Class results
                </h2>
                {selectedCourse && (
                  <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
                    {selectedCourse.title} · {selectedCourse.taken} submitted
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Collapse class results"
                aria-expanded
                aria-controls="review-class-results"
                title="Collapse"
                className="shrink-0 rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 dark:hover:bg-slate-800"
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
                <div className="space-y-2" aria-busy="true" aria-label="Loading class results">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-9 rounded-lg" />
                  ))}
                </div>
              ) : !hasClassData ? (
                <div className="rounded-lg bg-white px-3 py-3 text-xs ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="font-medium text-slate-700 dark:text-slate-200">No responses yet</p>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    No one in {selectedCourse?.title ?? "this class"} has submitted this
                    test.
                    {anotherClassHasData
                      ? " Another class has — pick it from the Class menu above."
                      : ""}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                    The answer key is shown on the right; per-question class
                    breakdowns appear here once students submit.
                  </p>
                </div>
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
            <div className="mx-auto max-w-2xl space-y-4 px-6 py-8" aria-busy="true" aria-label="Loading review">
              <Skeleton className="h-6 w-40 rounded" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-5 w-3/4 rounded" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
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
              forceStacked={forceStacked}
              correctAnswer={correctValue(question)}
              choiceStats={choiceStats}
              rationale={question.rationale}
              showRationale={showRationale}
              highlights={annot.get(question.id).highlights}
              onRemoveHighlight={(field, offset) =>
                annot.removeHighlightAt(question.id, field, offset)
              }
            />
          )}
        </main>
      </div>

      {heatmapOpen && (
        <ReviewHeatmap
          modules={modules}
          statOf={qStat}
          mi={mi}
          qi={qi}
          onJump={(m, q) => {
            goModule(m);
            setQi(q);
          }}
          onClose={() => setHeatmapOpen(false)}
          courseTitle={selectedCourse?.title ?? null}
          taken={selectedCourse?.taken}
          slug={slug}
          courseId={courseId}
          moduleRange={moduleRange}
        />
      )}

      {compareOpen && (
        <ClassComparison
          slug={slug}
          modules={modules}
          courses={comparableCourses}
          currentCourseId={courseId}
          onClose={() => setCompareOpen(false)}
        />
      )}
      <ReferenceSheet open={refOpen} onClose={() => setRefOpen(false)} />
    </div>
  );
}

/** Per-option (mcq) or per-distinct-answer (grid) breakdown for one question. */
function BreakdownBody({
  question,
  rows,
  total,
}: {
  question: TestContentQuestion;
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
                <p className="ml-5 mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
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
            <p className="ml-1 mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              {names(rs)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
