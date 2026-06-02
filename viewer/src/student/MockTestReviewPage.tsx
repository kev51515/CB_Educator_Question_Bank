/**
 * MockTestReviewPage
 * ==================
 * Per-attempt review surface for a single free-mode `test_attempts` row.
 *
 * Why this exists
 * ---------------
 * Free-mode mock tests persist into `test_attempts` (migration 0042) with
 * per-question detail in `test_answers` (chosen / is_correct / answer_time_ms
 * / time_spent_ms / revisit_count, added in 0043). Until Wave 21 M12 the
 * Review button on `MockTestHistoryPage` just toasted "coming soon" and
 * dropped the student back into the mock-test runner — this surface
 * replaces that stub with a real read-only review.
 *
 * Data model gap (read this before adding fancy stuff)
 * ----------------------------------------------------
 * Unlike assignment-mode review (`StudentAttemptReview`, which uses
 * `lib/attemptReview.ts` to load a SNAPSHOTTED `result_detail` jsonb plus an
 * inlined question payload), `test_attempts` only stores aggregates
 * (`score`, `total`, `seconds_taken`, `source`, `set_uid`) plus per-question
 * status rows in `test_answers`. The actual question stems / rationales live
 * in the static-export HTML on disk under `/exports/...`, not in the DB.
 *
 * That means we CANNOT render the full `AnswerReview` component here (it
 * needs `TestQuestion[]` with stems + rationales + correctAnswer). Instead
 * we render a compact per-question table from `test_answers` showing:
 *   - sequence #
 *   - status (correct / wrong / skipped)
 *   - chosen letter
 *   - time spent (from time_spent_ms or answer_time_ms fallback)
 *   - revisit count when > 1
 *
 * If/when free-mode persistence starts snapshotting a result_detail (post
 * Wave 21), this page can switch to `AnswerReview` exactly like
 * `StudentAttemptReview` does. Until then this is the best we can render
 * without round-tripping into the static-export bundles.
 *
 * Auth
 * ----
 * RLS on `test_attempts` and `test_answers` already scopes to `auth.uid()`
 * (see 0042 policies). A student loading someone else's attempt id gets
 * zero rows → we render the error state. No explicit owner check needed.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ScoreHero } from "../mocktest/components/ScoreHero";
import { Skeleton, useToast } from "../components";
import { supabase } from "../lib/supabase";
import { ROUTES } from "../lib/routes";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface TestAttemptRow {
  id: string;
  user_id: string;
  set_uid: string | null;
  started_at: string;
  submitted_at: string | null;
  seconds_taken: number | null;
  score: number | null;
  total: number | null;
  source: string | null;
}

interface TestAnswerRow {
  question_id: string;
  chosen: string | null;
  is_correct: boolean | null;
  answer_time_ms: number | null;
  time_spent_ms: number | null;
  revisit_count: number | null;
}

type SourceLabel = "CB" | "SAT" | "Mixed";

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function deriveSourceLabel(setUid: string | null): SourceLabel {
  const head = (setUid ?? "").toLowerCase();
  if (head.startsWith("cb")) return "CB";
  if (head.startsWith("sat")) return "SAT";
  return "Mixed";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function formatMs(ms: number | null): string {
  if (ms == null || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

interface AnswerStatusCellProps {
  chosen: string | null;
  isCorrect: boolean | null;
}

function AnswerStatusCell({ chosen, isCorrect }: AnswerStatusCellProps) {
  // A null `chosen` means the student left the question blank (skipped).
  // `is_correct` may be null for blank rows too — guard against both.
  const skipped = chosen == null;
  if (skipped) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-xs font-medium">
        <span aria-hidden>○</span> Skipped
      </span>
    );
  }
  if (isCorrect) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-900 px-2 py-0.5 text-xs font-medium">
        <span aria-hidden>✓</span> Correct
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900 px-2 py-0.5 text-xs font-medium">
      <span aria-hidden>✕</span> Wrong
    </span>
  );
}

interface StatChipProps {
  label: string;
  value: string;
}

function StatChip({ label, value }: StatChipProps) {
  return (
    <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────

export function MockTestReviewPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [attempt, setAttempt] = useState<TestAttemptRow | null>(null);
  const [answers, setAnswers] = useState<TestAnswerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) {
      setError("Missing attempt id.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      // Load the attempt row. RLS scopes to the current user; if the id
      // belongs to someone else (or doesn't exist) we get zero rows.
      const { data: attemptRow, error: attemptError } = await supabase
        .from("test_attempts")
        .select(
          "id, user_id, set_uid, started_at, submitted_at, seconds_taken, score, total, source",
        )
        .eq("id", attemptId)
        .maybeSingle();

      if (cancelled) return;

      if (attemptError) {
        setError(attemptError.message);
        toast.error(
          "Couldn't load this attempt",
          attemptError.message,
        );
        setLoading(false);
        return;
      }

      if (!attemptRow) {
        setError("Attempt not found.");
        setLoading(false);
        return;
      }

      const row = attemptRow as TestAttemptRow;

      if (!row.submitted_at) {
        // Drafts shouldn't be reviewable — they're still in progress.
        setAttempt(row);
        setError("This attempt is still in progress.");
        setLoading(false);
        return;
      }

      setAttempt(row);

      // Fetch per-question rows. answer_time_ms order is the closest proxy
      // we have to "the order the student saw them"; final fallback is
      // question_id alpha so the table is at least deterministic. The
      // mock-test runner doesn't currently persist an explicit ordinal.
      const { data: answerRows, error: answersError } = await supabase
        .from("test_answers")
        .select(
          "question_id, chosen, is_correct, answer_time_ms, time_spent_ms, revisit_count",
        )
        .eq("attempt_id", row.id);

      if (cancelled) return;

      if (answersError) {
        // Non-fatal — render the score summary without the per-question
        // table and surface the issue inline.
        setAnswers([]);
        setLoading(false);
        toast.info(
          "Per-question detail unavailable",
          answersError.message,
        );
        return;
      }

      const parsed = (answerRows ?? []) as TestAnswerRow[];
      // Sort by question_id for a stable, deterministic order.
      parsed.sort((a, b) => a.question_id.localeCompare(b.question_id));
      setAnswers(parsed);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [attemptId, toast]);

  const handleBack = (): void => {
    navigate(ROUTES.MOCK_TEST_HISTORY);
  };

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-8 w-64 rounded" />
            <Skeleton className="h-4 w-48 rounded" />
          </div>
          <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-8 space-y-3">
            <Skeleton className="mx-auto h-4 w-24 rounded" />
            <Skeleton className="mx-auto h-20 w-40 rounded" />
            <Skeleton className="mx-auto h-4 w-32 rounded" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (error || !attempt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-12 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Couldn't load this attempt
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {error ?? "Attempt not found."}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-lg min-h-[40px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-slate-950"
            >
              Back to history
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: loaded ────────────────────────────────────────────────────
  const total = attempt.total ?? 0;
  const score = attempt.score ?? 0;
  const scorePercent = total > 0 ? Math.round((score / total) * 100) : 0;
  const duration = attempt.seconds_taken ?? 0;
  const sourceLabel = deriveSourceLabel(attempt.set_uid);
  const correctCount = answers.filter((a) => a.is_correct === true).length;
  const wrongCount = answers.filter(
    (a) => a.chosen != null && a.is_correct === false,
  ).length;
  const skippedCount = answers.filter((a) => a.chosen == null).length;
  // For the chips we want a graceful fallback when test_answers is missing —
  // use the aggregate `score` as the correct-count signal.
  const hasPerQuestion = answers.length > 0;
  const correctChipValue = hasPerQuestion
    ? `${correctCount}`
    : `${score}`;
  const totalChipValue = hasPerQuestion
    ? `${answers.length}`
    : `${total}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Back button */}
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 rounded-lg min-h-[40px] px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span aria-hidden>←</span> Back to history
        </button>

        {/* Header card */}
        <header className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-1">
          <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
            Mock test review
          </p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {attempt.submitted_at
              ? formatDateTime(attempt.submitted_at)
              : "In progress"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            <span>Source: {sourceLabel}</span>
            {attempt.set_uid && (
              <span className="font-mono text-xs">{attempt.set_uid}</span>
            )}
          </p>
        </header>

        {/* Score hero — free-mode mocks don't carry a teacher override. */}
        <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6">
          <ScoreHero
            scorePercent={scorePercent}
            correctCount={hasPerQuestion ? correctCount : score}
            totalQuestions={hasPerQuestion ? answers.length : total}
          />
        </div>

        {/* Quick stat chips — duration + accuracy + correct/wrong/skipped */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatChip label="Duration" value={formatDuration(duration)} />
          <StatChip
            label="Correct"
            value={`${correctChipValue} / ${totalChipValue}`}
          />
          {hasPerQuestion ? (
            <>
              <StatChip label="Wrong" value={String(wrongCount)} />
              <StatChip label="Skipped" value={String(skippedCount)} />
            </>
          ) : (
            <>
              <StatChip label="Wrong" value="—" />
              <StatChip label="Skipped" value="—" />
            </>
          )}
        </div>

        {/* Per-question breakdown */}
        {hasPerQuestion ? (
          <section
            aria-label="Per-question breakdown"
            className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <header className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Per-question breakdown ({answers.length} questions)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Question stems aren't stored for free-mode attempts — open the
                test set again to see the full question text.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/60 dark:bg-slate-900/40 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      #
                    </th>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      Your answer
                    </th>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      Time
                    </th>
                    <th scope="col" className="text-left px-4 py-2 font-medium">
                      Visits
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {answers.map((a, i) => {
                    // Prefer `time_spent_ms` (total across visits, added in
                    // 0043). Fall back to `answer_time_ms` (time-to-first-
                    // answer, the original column) for legacy rows.
                    const ms = a.time_spent_ms ?? a.answer_time_ms;
                    const revisits = a.revisit_count ?? 0;
                    return (
                      <tr
                        key={a.question_id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
                      >
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400 font-mono text-xs">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2">
                          <AnswerStatusCell
                            chosen={a.chosen}
                            isCorrect={a.is_correct}
                          />
                        </td>
                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100 font-medium">
                          {a.chosen ?? (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400 tabular-nums">
                          {formatMs(ms)}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400 tabular-nums">
                          {revisits > 1 ? revisits : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section
            aria-label="Per-question breakdown"
            className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-400"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Per-question review unavailable
            </h2>
            <p className="mt-2">
              Per-question detail for this attempt wasn't saved — only the
              score summary above is available. New attempts persist a full
              question-by-question breakdown.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
