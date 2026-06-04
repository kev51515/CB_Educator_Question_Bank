/**
 * StudentAttemptReview
 * ====================
 * Read-only view of a single submitted assignment_attempts row. Loads the
 * persisted answers + result_detail (which includes the inlined question
 * snapshot — see `lib/attemptReview.ts` for why), then renders the score
 * hero, breakdowns, and the per-question answer review.
 *
 * No retake / re-submit affordances — MVP is one-attempt-per-assignment and
 * we don't want the student to think they can re-grade.
 */
import { useEffect, useState } from "react";
import {
  fetchAttemptReview,
  formatAttemptTimestamp,
  type AttemptReviewData,
} from "@/lib/attemptReview";
import { SafeHtml } from "@/components/SafeHtml";
import { supabase } from "@/lib/supabase";
import { useStudentSession } from "@/auth/session";
import { ModuleBreakdownTable } from "@/mocktest/components/ModuleBreakdownTable";
import { RichText } from "@/mocktest/components/RichText";
import { ScoreHero } from "@/mocktest/components/ScoreHero";
import { SectionBreakdownCards } from "@/mocktest/components/SectionBreakdownCards";
import { SkillBreakdownCard } from "@/mocktest/components/SkillBreakdownCard";
import { truncate } from "@/mocktest/components/resultsHelpers";
import type { Letter, TestQuestion } from "@/mocktest/types";

// Local relative-time formatter — mirrors the dashboard's `timeAgo` so the
// student sees the same phrasing as teachers/staff elsewhere ("3h ago",
// "2d ago"). We keep it local rather than dragging in NeedsAttentionPanel's
// helper since that module pulls in dashboard concerns we don't need here.
function gradedTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return seconds <= 5 ? "just now" : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

interface StudentAttemptReviewProps {
  attemptId: string;
  onExit: () => void;
}

type ReviewFilter = "all" | "wrong" | "skipped";

interface ReviewRow {
  index: number;
  question: TestQuestion;
  selectedLetter: Letter | null;
  isCorrect: boolean;
  isSkipped: boolean;
}

const FILTER_STORAGE_PREFIX = "student.attemptReview.filter";

function loadStoredFilter(userId: string | null): ReviewFilter {
  if (!userId || typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(`${FILTER_STORAGE_PREFIX}:${userId}`);
    if (!raw) return "all";
    const parsed = JSON.parse(raw) as { filter?: unknown };
    if (parsed.filter === "wrong" || parsed.filter === "skipped" || parsed.filter === "all") {
      return parsed.filter;
    }
  } catch {
    // Corrupt JSON — fall back to default.
  }
  return "all";
}

function persistFilter(userId: string | null, filter: ReviewFilter): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${FILTER_STORAGE_PREFIX}:${userId}`,
      JSON.stringify({ filter }),
    );
  } catch {
    // Storage quota / disabled — non-fatal for a UI preference.
  }
}

export function StudentAttemptReview({
  attemptId,
  onExit,
}: StudentAttemptReviewProps) {
  const { session } = useStudentSession();
  const userId = session?.userId ?? null;

  const [data, setData] = useState<AttemptReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(true);
  // Resolved teacher display name for the "Teacher feedback" card. Looked
  // up lazily when feedback is present so we don't pay the round-trip for
  // ungraded attempts.
  const [graderName, setGraderName] = useState<string | null>(null);
  // Filter pill state — persisted per user so reloads keep focus on the
  // category the student was already triaging.
  const [filter, setFilter] = useState<ReviewFilter>(() => loadStoredFilter(userId));
  // aria-live announcement for screen readers when the filter changes.
  const [announce, setAnnounce] = useState<string>("");

  // Re-hydrate the filter once the session resolves (userId may arrive after
  // the first render in some flows).
  useEffect(() => {
    if (userId) {
      setFilter(loadStoredFilter(userId));
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data: fetched, error: fetchError } = await fetchAttemptReview(
        attemptId,
      );
      if (cancelled) return;
      setData(fetched);
      setError(fetchError);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  // Lazy-fetch the grader's display_name when feedback is present. RLS
  // grants every authenticated user SELECT on profiles, so this is one
  // safe round-trip. We don't surface failures — the card just falls back
  // to "your teacher" if the lookup errors.
  useEffect(() => {
    let cancelled = false;
    if (!data?.graderId || !data.feedbackText) {
      setGraderName(null);
      return;
    }
    void (async () => {
      const { data: row } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.graderId)
        .maybeSingle();
      if (cancelled) return;
      setGraderName((row as { display_name: string | null } | null)?.display_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.graderId, data?.feedbackText]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500 dark:text-slate-400">
        Loading your attempt…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-4 text-center">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Couldn't load this attempt
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {error ?? "Attempt not found."}
          </p>
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const hasResult = data.result !== null;
  const cbCount = data.questions.filter((q) => q.source === "cb").length;
  const satCount = data.questions.filter((q) => q.source === "sat").length;

  // Precompute per-question correctness once so the filter pills, counts,
  // and the rendered list all read from the same derived rows.
  const rows: ReviewRow[] = data.questions.map((q, index) => {
    const selectedLetter = data.answers[q.id] ?? null;
    const isSkipped = selectedLetter == null;
    return {
      index,
      question: q,
      selectedLetter,
      isCorrect: !isSkipped && selectedLetter === q.correctAnswer,
      isSkipped,
    };
  });

  const counts: Record<ReviewFilter, number> = {
    all: rows.length,
    wrong: rows.filter((r) => !r.isCorrect && !r.isSkipped).length,
    skipped: rows.filter((r) => r.isSkipped).length,
  };

  const visibleRows: ReviewRow[] =
    filter === "wrong"
      ? rows.filter((r) => !r.isCorrect && !r.isSkipped)
      : filter === "skipped"
        ? rows.filter((r) => r.isSkipped)
        : rows;

  const handleFilterChange = (next: ReviewFilter): void => {
    setFilter(next);
    persistFilter(userId, next);
    const label =
      next === "wrong"
        ? `Filtered to ${counts.wrong} wrong answers`
        : next === "skipped"
          ? `Filtered to ${counts.skipped} skipped questions`
          : `Showing all ${counts.all} questions`;
    setAnnounce(label);
  };

  // Scroll the list to the next wrong-or-skipped question below the user's
  // current viewport. Wraps to the top if there is nothing further down.
  const jumpToNextProblem = (): void => {
    const targets = rows.filter((r) => !r.isCorrect); // wrong OR skipped
    if (targets.length === 0) return;
    const viewportTop = window.scrollY + 80; // small offset for sticky-ish headers
    const candidates = targets
      .map((r) => {
        const el = document.getElementById(`q-${r.index}`);
        if (!el) return null;
        const top = el.getBoundingClientRect().top + window.scrollY;
        return { row: r, el, top };
      })
      .filter((c): c is { row: ReviewRow; el: HTMLElement; top: number } => c !== null);
    if (candidates.length === 0) return;
    const next =
      candidates.find((c) => c.top > viewportTop + 10) ?? candidates[0];
    next.el.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const totalProblems = counts.wrong + counts.skipped;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <span aria-hidden>←</span> Back
        </button>

        <header className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 space-y-1">
          <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-medium">
            Assignment review
          </p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {data.assignmentTitle}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Submitted {formatAttemptTimestamp(data.submittedAt)}
          </p>
        </header>

        {hasResult && data.result ? (
          <>
            {data.feedbackText && data.gradedAt && (
              <section
                aria-label="Teacher feedback"
                className="rounded-2xl bg-white dark:bg-slate-900 ring-2 ring-indigo-300 dark:ring-indigo-800 p-5 space-y-2"
              >
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-indigo-600 dark:text-indigo-400 font-semibold">
                      Teacher feedback
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Graded {gradedTimeAgo(data.gradedAt)} by{" "}
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {graderName ?? "your teacher"}
                      </span>
                    </p>
                  </div>
                </header>
                <div className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200">
                  <SafeHtml html={data.feedbackText} />
                </div>
              </section>
            )}
            <ScoreHero
              scorePercent={data.result.scorePercent}
              correctCount={data.result.correctCount}
              totalQuestions={data.result.totalQuestions}
              scoreOverride={data.scoreOverride}
            />
            <SectionBreakdownCards
              byDomain={data.result.byDomain}
              byDifficulty={data.result.byDifficulty}
            />
            <ModuleBreakdownTable
              durationSeconds={data.result.durationSeconds}
              totalQuestions={data.result.totalQuestions}
              cbCount={cbCount}
              satCount={satCount}
            />
            <SkillBreakdownCard bySkill={data.result.bySkill} />
          </>
        ) : (
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-6 text-sm text-slate-600 dark:text-slate-400">
            Aggregate breakdowns are unavailable for this attempt.
          </div>
        )}

        {data.questions.length > 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setReviewOpen((open) => !open)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 motion-safe:transition-colors"
              aria-expanded={reviewOpen}
              aria-controls="student-attempt-review-list"
            >
              <span>Answer Review ({rows.length} questions)</span>
              <span aria-hidden="true">{reviewOpen ? "▲" : "▼"}</span>
            </button>
            {reviewOpen && (
              <>
                <div
                  className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40"
                  role="tablist"
                  aria-label="Filter answer review"
                >
                  <FilterPill
                    label="All"
                    count={counts.all}
                    active={filter === "all"}
                    tone="indigo"
                    onClick={() => handleFilterChange("all")}
                  />
                  <FilterPill
                    label="Wrong"
                    count={counts.wrong}
                    active={filter === "wrong"}
                    tone="rose"
                    onClick={() => handleFilterChange("wrong")}
                  />
                  <FilterPill
                    label="Skipped"
                    count={counts.skipped}
                    active={filter === "skipped"}
                    tone="slate"
                    onClick={() => handleFilterChange("skipped")}
                  />
                  <div className="ml-auto">
                    <button
                      type="button"
                      onClick={jumpToNextProblem}
                      disabled={totalProblems === 0}
                      aria-label="Jump to next wrong answer"
                      className="inline-flex items-center gap-1 min-h-[40px] rounded-md text-xs font-medium px-3 py-1.5 bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 motion-safe:transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next <span aria-hidden="true">▼</span>
                    </button>
                  </div>
                </div>
                <div
                  className="sr-only"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {announce}
                </div>
                <div
                  id="student-attempt-review-list"
                  className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950"
                >
                  {visibleRows.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500 dark:text-slate-400 text-center space-y-3">
                      <p>No questions match this filter.</p>
                      <button
                        type="button"
                        onClick={() => handleFilterChange("all")}
                        className="inline-flex items-center min-h-[40px] rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 motion-safe:transition-colors"
                      >
                        Show all
                      </button>
                    </div>
                  ) : (
                    visibleRows.map((row) => <ReviewRowItem key={row.question.id} row={row} />)
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">
            Per-question review is unavailable for this attempt (no question
            snapshot was saved).
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Local components
// ──────────────────────────────────────────────────────────────────────────

type PillTone = "indigo" | "rose" | "slate" | "amber";

interface FilterPillProps {
  label: string;
  count: number;
  active: boolean;
  tone: PillTone;
  onClick: () => void;
}

function FilterPill({ label, count, active, tone, onClick }: FilterPillProps) {
  // Tone palette per the design canon — wrong=rose, skipped=slate,
  // marked=amber (not used yet — data doesn't expose `marked`), default
  // indigo for "All".
  const activeClasses: Record<PillTone, string> = {
    indigo: "bg-indigo-600 text-white",
    rose: "bg-rose-600 text-white",
    slate: "bg-slate-700 text-white",
    amber: "bg-amber-500 text-white",
  };
  const inactiveClasses =
    "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 ring-1 ring-transparent";

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "inline-flex items-center min-h-[40px] rounded-md text-xs font-medium px-3 py-1.5 motion-safe:transition-colors",
        active ? activeClasses[tone] : inactiveClasses,
      ].join(" ")}
    >
      <span>{label}</span>
      <span className={`ml-1.5 ${active ? "opacity-80" : "opacity-60"}`}>
        ({count})
      </span>
    </button>
  );
}

interface ReviewRowItemProps {
  row: ReviewRow;
}

function ReviewRowItem({ row }: ReviewRowItemProps) {
  const { index, question, selectedLetter, isCorrect, isSkipped } = row;
  const plainStem = question.isHtml ? stripHtml(question.stem) : question.stem;
  const stemPreview = truncate(plainStem, 80);

  let rowColor = "bg-white dark:bg-slate-950";
  let icon = "○";
  let iconColor = "text-slate-400";
  if (!isSkipped && isCorrect) {
    rowColor = "bg-emerald-50/60 dark:bg-emerald-950/30";
    icon = "✓";
    iconColor = "text-emerald-500";
  } else if (!isSkipped && !isCorrect) {
    rowColor = "bg-rose-50/60 dark:bg-rose-950/30";
    icon = "✕";
    iconColor = "text-rose-500";
  }

  const correctRationale =
    question.correctRationale ??
    (selectedLetter && question.wrongRationales
      ? question.wrongRationales[selectedLetter]
      : undefined);

  return (
    <div
      id={`q-${index}`}
      data-question-id={question.id}
      className={`group flex items-start gap-3 px-4 py-3 text-sm scroll-mt-20 ${rowColor}`}
    >
      <span className={`w-6 shrink-0 mt-0.5 text-xs font-medium text-slate-400`} aria-hidden="true">
        {index + 1}.
      </span>
      <span className={`w-4 shrink-0 mt-0.5 text-base ${iconColor}`} aria-hidden="true">
        {icon}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-slate-900 dark:text-slate-100 leading-snug">{stemPreview}</p>
        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
          <span>
            Your answer:{" "}
            <span
              className={
                isSkipped
                  ? "text-slate-400"
                  : isCorrect
                    ? "text-emerald-500 font-semibold"
                    : "text-rose-500 font-semibold"
              }
            >
              {selectedLetter ?? "—"}
            </span>
          </span>
          {!isCorrect && !isSkipped && (
            <span>
              Correct:{" "}
              <span className="text-emerald-500 font-semibold">{question.correctAnswer}</span>
            </span>
          )}
          {isSkipped && <span className="text-slate-400 italic">Skipped</span>}
        </div>
        {correctRationale && (
          <RichText
            text={correctRationale}
            isHtml={question.isHtml}
            className="text-xs text-slate-500 mt-1"
          />
        )}
      </div>
    </div>
  );
}

function stripHtml(html: string): string {
  // Lightweight tag/MathML strip for previews; not for trusted contexts.
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
