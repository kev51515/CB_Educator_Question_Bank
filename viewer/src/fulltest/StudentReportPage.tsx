/**
 * StudentReportPage — /educator/tests/:slug/report/:runId
 * ========================================================
 * Staff view of ONE student's test report rendered EXACTLY as the student
 * sees it (the same `ResultView`, pacing band included) — no proctoring
 * timeline, no admin controls. Linked from the per-row "Report" action on
 * TestOverviewPage; exists so a teacher can answer "what will this student
 * see when I release?" and so QA can eyeball the student surface without
 * provisioning a student session.
 *
 * `get_test_result` admits staff regardless of release state, so this works
 * before AND after release; a slim banner up top says whose report it is and
 * whether the student can see it yet.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Skeleton } from "@/components/Skeleton";
import { useBreadcrumbLabel } from "@/components";
import { testOverviewPath } from "@/lib/routes";
import { getResult } from "./api";
import { useFullTests } from "./useFullTests";
import { ResultView } from "./ResultView";
import type { TestResult } from "./types";

export function StudentReportPage(): JSX.Element {
  const { slug = "", runId = "" } = useParams();
  const { tests } = useFullTests(true);
  const title = tests.find((t) => t.slug === slug)?.title ?? "Full-length test";
  // Crumb labels for the dynamic segments (else the trail reads "Item · Item").
  useBreadcrumbLabel(slug, title);
  useBreadcrumbLabel(runId, "Student report");

  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setResult(null);
    setError(null);
    getResult(runId)
      .then((r) => {
        if (alive) setResult(r);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't load this report.");
      });
    return () => {
      alive = false;
    };
  }, [runId]);

  return (
    <div>
      {/* Staff banner — make it unmistakable that this is the student's view. */}
      <div className="sticky top-0 z-20 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
        Student report preview — this page is exactly what the student sees once results are released.{" "}
        <Link
          to={testOverviewPath(slug)}
          className="font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
        >
          Back to test overview
        </Link>
      </div>

      {error ? (
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
          <Link
            to={testOverviewPath(slug)}
            className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Back to test overview
          </Link>
        </div>
      ) : !result ? (
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <ResultView result={result} testTitle={title} />
      )}
    </div>
  );
}

export default StudentReportPage;
