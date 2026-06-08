/**
 * TestPreviewRunner (staff "Preview test")
 * ========================================
 * Free-roam preview of a full-length test for educators. Unlike the proctored
 * student runner (FullTestRunner), this is a pure client-side browser:
 *   • NO server run — never creates a test_runs row, so previewing can't
 *     pollute rosters/metrics.
 *   • NO timers, auto-submit, proctoring, or grading.
 *   • Jump freely across every module AND every question via the top bar —
 *     module tabs + a question navigator (prev/next + a jump grid).
 *   • Optional "Show answer key" toggle (staff can read the key already; the
 *     student fidelity view hides it by default).
 *
 * Content comes from a direct staff SELECT on tests → test_modules →
 * test_questions (0048 RLS: is_staff) — the same path TestReviewPage uses.
 * Questions render through the real QuestionPane so the educator sees exactly
 * what a student sees; answer selection is local and ephemeral.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useBreadcrumbLabel } from "@/components";
import { testOverviewPath } from "@/lib/routes";
import { QuestionPane } from "./QuestionPane";
import type { Letter, Section, TestQuestion } from "./types";

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
  slug: string;
  title: string;
  total_questions: number;
  test_modules: RawModule[];
}

interface PreviewQuestion extends TestQuestion {
  correct_answer: string | null;
  accepted: string[] | null;
}
interface PreviewModule {
  position: number;
  label: string;
  section: Section;
  questions: PreviewQuestion[];
}

const SELECT =
  "slug,title,total_questions,test_modules(position,label,section,test_questions(id,ref,number,position,type,passage,passage_alt,stem,choices,figure,correct_answer,accepted))";

/** Friendly answer-key text for the banner. */
function keyText(q: PreviewQuestion): string {
  if (q.type === "grid") {
    const main = q.correct_answer ?? q.accepted?.[0] ?? "—";
    const extra =
      q.accepted && q.accepted.length > 1 ? ` (accepts: ${q.accepted.join(", ")})` : "";
    return `${main}${extra}`;
  }
  return q.correct_answer ?? "—";
}

export function TestPreviewRunner(): JSX.Element {
  const { slug = "" } = useParams();
  const navigate = useNavigate();

  const [modules, setModules] = useState<PreviewModule[]>([]);
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mi, setMi] = useState(0); // active module index
  const [qi, setQi] = useState(0); // active question index (within module)
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [showKey, setShowKey] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useBreadcrumbLabel(slug, title || undefined);

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
      const mods: PreviewModule[] = [...(raw.test_modules ?? [])]
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
              correct_answer: q.correct_answer,
              accepted: q.accepted,
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

  const activeModule = modules[mi] ?? null;
  const questions = activeModule?.questions ?? [];
  const question = questions[qi] ?? null;

  const goModule = useCallback((nextMi: number) => {
    setMi(nextMi);
    setQi(0);
    setNavOpen(false);
  }, []);

  const goPrev = useCallback(() => {
    setNavOpen(false);
    if (qi > 0) {
      setQi(qi - 1);
    } else if (mi > 0) {
      const prevLen = modules[mi - 1]?.questions.length ?? 0;
      setMi(mi - 1);
      setQi(Math.max(0, prevLen - 1)); // wrap to previous module's last question
    }
  }, [qi, mi, modules]);

  const goNext = useCallback(() => {
    setNavOpen(false);
    if (qi < questions.length - 1) {
      setQi(qi + 1);
    } else if (mi < modules.length - 1) {
      setMi(mi + 1);
      setQi(0); // wrap to next module's first question
    }
  }, [qi, questions.length, mi, modules.length]);

  // Keyboard: ←/→ move between questions (ignore while typing in a grid input).
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
  const lastModule = modules.length - 1;
  const atLast = mi === lastModule && qi === questions.length - 1;

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
                  <span
                    className={`ml-1.5 tabular-nums ${active ? "opacity-70" : "text-slate-400 dark:text-slate-500"}`}
                  >
                    {m.questions.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
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
              <span className="font-semibold">Key:</span> {keyText(question)}
            </div>
          )}
        </div>
      )}

      {/* ---- the question ---- */}
      <main className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Loading preview…
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
