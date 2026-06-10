/**
 * TeacherAttemptDetailView — pure derivations
 * ===========================================
 * Pure helpers for the per-question status table + skill tallies + pacing,
 * derived from the loaded attempt snapshot (no extra SELECTs). Moved verbatim
 * from the original single-file component; the orchestrator wraps each in a
 * useMemo with the same dependency arrays so behavior is identical.
 */
import type { AttemptReviewData } from "@/lib/attemptReview";

type AnswerStatus = "correct" | "wrong" | "skipped";

export function computePerQuestionRows(data: AttemptReviewData | null) {
  const answers = data?.answers ?? {};
  return (data?.questions ?? []).map((q, index) => {
    const chosen = answers[q.id] ?? null;
    let status: AnswerStatus;
    if (chosen === null) status = "skipped";
    else if (chosen === q.correctAnswer) status = "correct";
    else status = "wrong";
    return {
      position: index + 1,
      questionId: q.id,
      chosen,
      correctAnswer: q.correctAnswer,
      status,
      skill: q.skill ?? null,
      domain: q.domain,
    };
  });
}

export type PerQuestionRow = ReturnType<typeof computePerQuestionRows>[number];

export function computeSkillTallies(perQuestionRows: PerQuestionRow[]) {
  // Group by skill (falling back to domain) → {correct, wrong, skipped, total}.
  const map = new Map<
    string,
    { correct: number; wrong: number; skipped: number; total: number }
  >();
  for (const row of perQuestionRows) {
    const key = row.skill ?? row.domain ?? "Unspecified";
    const bucket = map.get(key) ?? {
      correct: 0,
      wrong: 0,
      skipped: 0,
      total: 0,
    };
    bucket.total += 1;
    if (row.status === "correct") bucket.correct += 1;
    else if (row.status === "wrong") bucket.wrong += 1;
    else bucket.skipped += 1;
    map.set(key, bucket);
  }
  // Sort by weakest-first (lowest correct rate) so the teacher's eye
  // lands on what to address. Stable secondary sort by total desc.
  return Array.from(map.entries())
    .map(([label, counts]) => ({ label, ...counts }))
    .sort((a, b) => {
      const ar = a.total === 0 ? 1 : a.correct / a.total;
      const br = b.total === 0 ? 1 : b.correct / b.total;
      if (ar !== br) return ar - br;
      return b.total - a.total;
    });
}

export type SkillTally = ReturnType<typeof computeSkillTallies>[number];

// The question-snapshot is the source of truth for "do we have skill data".
// If every question lacks a skill AND there's no domain string, we skip the
// section. In practice CB questions always have a domain, so this rarely
// fires; mostly it's a guard against future drift.
export function computeHasSkillData(data: AttemptReviewData | null): boolean {
  return (data?.questions ?? []).some(
    (q) => (q.skill ?? q.domain) !== undefined,
  );
}

// Avg time per question — only meaningful when both numerator and
// denominator are defined and the test isn't empty.
export function computeAvgSecondsPerQuestion(
  data: AttemptReviewData | null,
): number | null {
  const dur = data?.durationSeconds ?? data?.result?.durationSeconds ?? null;
  const total = data?.totalQuestions ?? data?.result?.totalQuestions ?? null;
  if (dur === null || total === null || total <= 0) return null;
  return dur / total;
}
