/**
 * TestPreviewRunner (staff "Preview test")
 * ========================================
 * Free-roam preview of a full-length test for educators. Unlike the proctored
 * student runner (FullTestRunner), this is a pure client-side browser:
 *   • NO server run — never creates a test_runs row, so previewing can't
 *     pollute rosters/metrics.
 *   • NO timers, auto-submit, proctoring, or grading.
 *   • Jump freely across every module AND every question (module tabs + a
 *     question navigator with prev/next + a jump grid + ←/→ keys).
 *   • Optional "Show answer key" toggle (off by default → student fidelity).
 *
 * Content + navigation come from the shared testContent loader and
 * useTestNavigation, the same pieces TestReviewPage uses. Questions render
 * through the real QuestionPane; answer selection is local and ephemeral.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBreadcrumbLabel } from "@/components";
import { Skeleton } from "@/components/Skeleton";
import { testOverviewPath } from "@/lib/routes";
import { QuestionPane } from "./QuestionPane";
import { ModuleTabs } from "./ModuleTabs";
import { useTestNavigation } from "./useTestNavigation";
import {
  answerKeyText,
  fetchTestContent,
  type TestContentModule,
} from "./testContent";

export function TestPreviewRunner(): JSX.Element {
  const { slug = "" } = useParams();
  const navigate = useNavigate();

  const [modules, setModules] = useState<TestContentModule[]>([]);
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [showKey, setShowKey] = useState(false);

  const nav = useTestNavigation(modules);
  const { mi, qi, setQi, navOpen, setNavOpen, activeModule, questions, question, goModule, goPrev, goNext, atFirst, atLast } = nav;

  useBreadcrumbLabel(slug, title || undefined);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchTestContent(slug)
      .then((tc) => {
        if (!alive) return;
        setTitle(tc.title);
        setModules(tc.modules);
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
  }, [slug]);

  const exit = () => navigate(testOverviewPath(slug));

  const answeredInModule = useMemo(
    () => questions.filter((q) => answers[q.id] != null && answers[q.id] !== "").length,
    [questions, answers],
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-slate-950">
      {/* ---- top bar: identity + module tabs + tools ---- */}
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              Preview
            </span>
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {title || "Loading…"}
            </span>
            <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:inline">
              · nothing is saved or graded
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-pressed={showKey}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                showKey
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              {showKey ? "Hide answer key" : "Show answer key"}
            </button>
            <button
              type="button"
              onClick={exit}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Exit preview
            </button>
          </div>
        </div>

        <ModuleTabs modules={modules} activeIndex={mi} onSelect={goModule} />
      </header>

      {/* ---- question navigator strip ---- */}
      {question && (
        <div className="relative shrink-0 border-b border-slate-200 bg-slate-50/70 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-expanded={navOpen}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Question {question.number}
              <span className="font-normal text-slate-400 dark:text-slate-500">
                of {questions.length}
              </span>
              <span aria-hidden className={`transition-transform ${navOpen ? "rotate-180" : ""}`}>
                ▾
              </span>
            </button>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {answeredInModule}/{questions.length} answered in this section
            </span>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={atFirst}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                ← Prev
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={atLast}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Next →
              </button>
            </div>
          </div>

          {/* jump grid */}
          {navOpen && (
            <div className="absolute left-3 top-full z-20 mt-1 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {activeModule?.label}
              </p>
              <div className="grid grid-cols-8 gap-1.5">
                {questions.map((q, i) => {
                  const done = answers[q.id] != null && answers[q.id] !== "";
                  const cur = i === qi;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setQi(i);
                        setNavOpen(false);
                      }}
                      className={`flex h-8 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        cur
                          ? "bg-indigo-600 text-white"
                          : done
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
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

          {/* answer-key banner */}
          {showKey && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
              <span className="font-semibold">Key:</span> {answerKeyText(question)}
            </div>
          )}
        </div>
      )}

      {/* ---- the question ---- */}
      <main className="min-h-0 flex-1">
        {loading ? (
          <div className="mx-auto max-w-2xl space-y-4 px-6 py-8" aria-busy="true" aria-label="Loading preview">
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
            This test has no questions to preview.
          </div>
        ) : (
          <QuestionPane
            key={question.id}
            question={question}
            value={answers[question.id] ?? null}
            onChange={(v) => setAnswers((a) => ({ ...a, [question.id]: v }))}
            fullHeight
          />
        )}
      </main>
    </div>
  );
}
