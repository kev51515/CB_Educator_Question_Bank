/**
 * MockTestHistoryPage
 * ===================
 * Student-facing history of past free-mode mock test attempts.
 *
 * Data source: `test_attempts` (free-mode persistence — see migration 0042).
 * Only submitted rows are listed (`submitted_at IS NOT NULL`). RLS already
 * scopes the query to the current student.
 *
 * Schema note: the brief referenced `score_percent / correct_count /
 * total_questions / duration_seconds / source_id / result_detail`, but the
 * actual table (per 0042/0043/0050) stores `score / total / seconds_taken
 * / source` plus `draft_meta jsonb`. We derive `score_percent` from
 * `score/total` and surface `seconds_taken` as duration. Assignment-mode
 * attempts live in `assignment_attempts` and are excluded here — they
 * already have a per-attempt review surface via `/assignment/:id/review/...`.
 *
 * Interactions (v1):
 *   - List of attempts, most recent first
 *   - Per-row "Review" CTA — for v1 routes back to `/mock-test` (a
 *     per-test_attempt review surface doesn't exist yet; flagged as
 *     follow-up)
 *   - Per-row "Compare" checkbox — up to 2 selectable. A sticky bottom bar
 *     appears when 2 are selected; clicking "Compare" reveals an inline
 *     side-by-side panel above the list (score / duration / correct/total
 *     / source). Question-level diff deferred.
 *
 * Score arc: inline SVG sparkline. Built on the fly here so we don't take a
 * dependency on M13's eventual shared chart component.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ROUTES, mockTestReviewPath } from "../lib/routes";
import { useStudentSession } from "../auth/session";
import { EmptyState, Skeleton, useToast } from "../components";
import type { MockAttempt, TestAttemptRow } from "./mockTestHistoryHelpers";
import { toAttempt, formatDuration, scoreTone, formatDateTime } from "./mockTestHistoryHelpers";
import { ScoreArc } from "./ScoreArc";
import { ComparePanel } from "./ComparePanel";

// ──────────────────────────────────────────────────────────────────────────
// Stats strip
// ──────────────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────

export function MockTestHistoryPage() {
  const navigate = useNavigate();
  const { session } = useStudentSession();
  const toast = useToast();

  const [attempts, setAttempts] = useState<MockAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Up to 2 selected attempt ids for compare.
  const [selected, setSelected] = useState<string[]>([]);
  // Becomes true after the user clicks "Compare" in the sticky bar.
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    if (!session?.userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      const { data, error: fetchError } = await supabase
        .from("test_attempts")
        .select(
          "id, set_uid, started_at, submitted_at, seconds_taken, score, total, source",
        )
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false });

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const rows: TestAttemptRow[] = (data ?? []) as TestAttemptRow[];
      const parsed = rows
        .map(toAttempt)
        .filter((a): a is MockAttempt => a !== null);
      setAttempts(parsed);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  // Stats derived once attempts load.
  const stats = useMemo(() => {
    if (attempts.length === 0) {
      return { total: 0, best: 0, average: 0, totalSeconds: 0 };
    }
    const best = attempts.reduce(
      (acc, a) => Math.max(acc, a.scorePercent),
      0,
    );
    const average = Math.round(
      attempts.reduce((acc, a) => acc + a.scorePercent, 0) / attempts.length,
    );
    const totalSeconds = attempts.reduce(
      (acc, a) => acc + a.durationSeconds,
      0,
    );
    return { total: attempts.length, best, average, totalSeconds };
  }, [attempts]);

  // For the score arc we want chronological (oldest first).
  const chronological = useMemo(
    () => [...attempts].slice().reverse(),
    [attempts],
  );

  const selectedAttempts = useMemo(
    () => selected.map((id) => attempts.find((a) => a.id === id)).filter(
      (a): a is MockAttempt => Boolean(a),
    ),
    [selected, attempts],
  );

  const toggleSelected = (id: string): void => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        // Closing a comparison if we drop below 2.
        if (prev.length === 2) setCompareOpen(false);
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 2) {
        toast.info(
          "Two attempts max",
          "Uncheck one before adding another.",
        );
        return prev;
      }
      return [...prev, id];
    });
  };

  const clearSelection = (): void => {
    setSelected([]);
    setCompareOpen(false);
  };

  const handleReview = (attempt: MockAttempt): void => {
    // Per-attempt review surface (`MockTestReviewPage`) reads the same
    // `test_attempts` row plus the per-question `test_answers` rows.
    navigate(mockTestReviewPath(attempt.id));
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
              Mock tests
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-slate-100">
              Mock test history
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Your past full-length practice.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => navigate(ROUTES.HOME)}
              className="rounded-lg min-h-[40px] px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => navigate(ROUTES.MOCK_TEST)}
              className="rounded-lg min-h-[40px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-slate-950"
            >
              + Take a new mock test
            </button>
          </div>
        </header>

        {/* Loading: skeleton arc + 3 skeleton rows */}
        {loading && (
          <>
            <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4">
              <Skeleton className="h-4 w-32 rounded" />
              <div className="mt-3">
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            </div>
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          </>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-2xl ring-1 ring-rose-200 dark:ring-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300">
            Couldn't load your history: {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && attempts.length === 0 && (
          <EmptyState
            framed
            icon="check"
            title="No mock tests yet"
            body="Your full-length practice attempts will land here once you submit one."
            cta={{
              label: "Take your first mock test",
              onClick: () => navigate(ROUTES.MOCK_TEST),
            }}
          />
        )}

        {/* Loaded */}
        {!loading && !error && attempts.length > 0 && (
          <>
            <ScoreArc attempts={chronological} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Attempts" value={String(stats.total)} />
              <StatCard label="Best score" value={`${stats.best}%`} />
              <StatCard label="Average" value={`${stats.average}%`} />
              <StatCard
                label="Time spent"
                value={formatDuration(stats.totalSeconds)}
              />
            </div>

            {compareOpen && selectedAttempts.length === 2 && (
              <ComparePanel
                a={selectedAttempts[0]}
                b={selectedAttempts[1]}
                onClose={clearSelection}
              />
            )}

            <ul
              className="space-y-2"
              aria-label="Past mock test attempts"
            >
              {attempts.map((a) => {
                const tone = scoreTone(a.scorePercent);
                const isSelected = selected.includes(a.id);
                return (
                  <li
                    key={a.id}
                    className={`rounded-2xl ring-1 ${
                      isSelected
                        ? "ring-indigo-400 dark:ring-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30"
                        : "ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900"
                    } p-4 flex flex-col sm:flex-row sm:items-center gap-3`}
                  >
                    <label
                      className="flex items-center gap-2 cursor-pointer select-none min-h-[40px]"
                      title="Select up to 2 attempts to compare"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(a.id)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`Compare attempt from ${formatDateTime(a.submittedAt)}`}
                      />
                      <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Compare
                      </span>
                    </label>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatDateTime(a.submittedAt)}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                        <span>Source: {a.sourceLabel}</span>
                        <span>
                          {a.score} / {a.total} correct
                        </span>
                        <span>{formatDuration(a.durationSeconds)}</span>
                      </div>
                    </div>

                    <div
                      className={`shrink-0 rounded-xl ring-1 ${tone.ring} ${tone.bg} ${tone.text} px-3 py-1.5 text-lg font-semibold min-w-[64px] text-center`}
                      aria-label={`Score ${a.scorePercent} percent`}
                    >
                      {a.scorePercent}%
                    </div>

                    <button
                      type="button"
                      onClick={() => handleReview(a)}
                      className="shrink-0 rounded-lg min-h-[40px] bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-medium px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-slate-950"
                    >
                      Review
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Sticky compare bar — appears when 2 attempts are selected and the
          inline panel isn't already open. */}
      {selected.length === 2 && !compareOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 pointer-events-none"
          role="region"
          aria-label="Compare selection"
        >
          <div className="mx-auto max-w-3xl pointer-events-auto rounded-2xl shadow-2xl ring-1 ring-indigo-200 dark:ring-indigo-900 bg-white dark:bg-slate-900 p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200">
              Compare{" "}
              <span className="font-medium">
                {formatDateTime(selectedAttempts[0].submittedAt)}
              </span>{" "}
              vs{" "}
              <span className="font-medium">
                {formatDateTime(selectedAttempts[1].submittedAt)}
              </span>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg min-h-[40px] px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="rounded-lg min-h-[40px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-slate-950"
            >
              Compare
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
