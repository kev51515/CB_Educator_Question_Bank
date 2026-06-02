/**
 * TestReviewPage (staff)
 * ======================
 * Teacher QA surface for a full test: renders every question with its figure,
 * choices, and the ANSWER KEY, grouped by module — so staff can eyeball the
 * OCR-sourced content for transcription errors before students rely on it.
 *
 * Staff may SELECT test_questions directly (0048 RLS: is_staff). Students
 * cannot reach this route (it's mounted only in the staff tree) and could not
 * read the rows even if they did.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ROUTES } from "../lib/routes";
import type { Letter, QType, Section } from "./types";

interface QRow {
  position: number;
  ref: string;
  number: number;
  type: QType;
  passage: string | null;
  passage_alt: string | null;
  stem: string;
  choices: Record<Letter, string> | null;
  figure: string | null;
  correct_answer: string | null;
  accepted: string[] | null;
  source_page: number | null;
}
interface MRow {
  position: number;
  label: string;
  section: Section;
  test_questions: QRow[];
}
interface TRow {
  slug: string;
  title: string;
  total_questions: number;
  test_modules: MRow[];
}

export function TestReviewPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<TRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: err } = await supabase
        .from("tests")
        .select(
          "slug,title,total_questions,test_modules(position,label,section,test_questions(position,ref,number,type,passage,passage_alt,stem,choices,figure,correct_answer,accepted,source_page))",
        )
        .eq("slug", slug)
        .single();
      if (!alive) return;
      if (err) setError(err.message);
      else setTest(data as unknown as TRow);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  if (loading) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate-500">Loading…</div>;
  }
  if (error || !test) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-rose-600">Couldn't load test: {error ?? "not found"}</p>
      </div>
    );
  }

  const modules = [...test.test_modules].sort((a, b) => a.position - b.position);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{test.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            QA review · {test.total_questions} questions · answer key visible to staff only
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(ROUTES.TESTS_ADMIN)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
        >
          ← All tests
        </button>
      </div>

      {modules.map((m) => {
        const qs = [...m.test_questions].sort((a, b) => a.position - b.position);
        return (
          <section key={m.position} className="mb-8">
            <h2 className="sticky top-0 z-10 mb-3 bg-slate-50/95 py-2 text-sm font-semibold uppercase tracking-wide text-slate-600 backdrop-blur dark:bg-slate-950/95 dark:text-slate-300">
              {m.label} · {qs.length} questions
            </h2>
            <div className="space-y-3">
              {qs.map((q) => (
                <article
                  key={q.ref}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Q{q.number}
                    </span>
                    <span className="uppercase">{q.type}</span>
                    {q.source_page && <span>· PDF p.{q.source_page}</span>}
                  </div>

                  {q.figure && (
                    <img
                      src={q.figure}
                      alt={q.passage_alt ?? `Figure for Q${q.number}`}
                      className="mb-2 max-h-72 rounded border border-slate-200 dark:border-slate-700"
                    />
                  )}
                  {q.passage && (
                    <p className="mb-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                      {q.passage}
                    </p>
                  )}
                  <p className="mb-2 whitespace-pre-wrap text-sm font-medium text-slate-900 dark:text-slate-100">
                    {q.stem}
                  </p>

                  {q.type === "mcq" && q.choices && (
                    <ul className="space-y-1">
                      {(["A", "B", "C", "D"] as Letter[]).map((l) => {
                        if (q.choices![l] === undefined) return null;
                        const correct = q.correct_answer === l;
                        return (
                          <li
                            key={l}
                            className={[
                              "flex items-start gap-2 rounded px-2 py-1 text-sm",
                              correct
                                ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "text-slate-700 dark:text-slate-300",
                            ].join(" ")}
                          >
                            <span className="font-semibold">{l}.</span>
                            <span className="whitespace-pre-wrap">{q.choices![l]}</span>
                            {correct && <span className="ml-auto text-xs">✓ key</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {q.type === "grid" && (
                    <div className="rounded bg-emerald-50 px-2 py-1 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Answer:{" "}
                      <span className="font-semibold">
                        {q.correct_answer ?? q.accepted?.[0] ?? "—"}
                      </span>
                      {q.accepted && q.accepted.length > 1 && (
                        <span className="ml-2 text-xs text-emerald-700/80 dark:text-emerald-400/80">
                          (accepts: {q.accepted.join(", ")})
                        </span>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
