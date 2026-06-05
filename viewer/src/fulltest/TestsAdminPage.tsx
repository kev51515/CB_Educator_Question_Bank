/**
 * TestsAdminPage (staff)
 * ======================
 * Staff catalog of full-length tests. Each row links to the QA/answer-key
 * review. This is the discoverable entry for teachers to vet test content
 * before students take it.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { testReviewPath, testRunPath } from "@/lib/routes";
import type { TestCatalogEntry } from "./types";

export function TestsAdminPage() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<TestCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("tests")
        .select("slug,ordinal,title,short_title,total_questions")
        .order("ordinal", { ascending: true });
      if (!alive) return;
      setTests((data ?? []) as TestCatalogEntry[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tests</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Full-length proctored tests. Review the answer key and question content before assigning.
      </p>

      {loading ? (
        <div className="mt-6 h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : tests.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No tests yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {tests.map((t) => (
            <li
              key={t.slug}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{t.title}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {t.total_questions} questions
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(testRunPath(t.slug))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => navigate(testReviewPath(t.slug))}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  QA review →
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
