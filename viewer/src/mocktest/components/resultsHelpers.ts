/**
 * Shared formatters used by the results screen.
 */
import type { Letter, TestQuestion, TestResult } from "@/mocktest/types";

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function pct(correct: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}

export function scoreColor(percent: number): string {
  if (percent >= 85) return "text-emerald-500";
  if (percent >= 65) return "text-amber-500";
  return "text-red-500";
}

export function motivationalMessage(percent: number): string {
  if (percent >= 95) return "Perfect! Outstanding performance!";
  if (percent >= 85) return "Excellent work!";
  if (percent >= 70) return "Great score! Keep pushing higher!";
  if (percent >= 55) return "Solid effort. Practice makes perfect!";
  if (percent >= 40) return "Good start. Focus on your weak areas!";
  return "Keep working at it — progress takes time!";
}

export function truncate(text: string, maxLen = 80): string {
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

export function computeTestResult(
  questions: TestQuestion[],
  answers: Record<string, Letter | null>,
  startedAt: number,
  submittedAt: number,
): TestResult {
  let correctCount = 0;
  const domainMap = new Map<string, { total: number; correct: number }>();
  const skillMap = new Map<string, { total: number; correct: number }>();
  const difficultyMap = new Map<TestQuestion["difficulty"], { total: number; correct: number }>();

  for (const q of questions) {
    const selected = answers[q.id] ?? null;
    const isCorrect = selected != null && selected === q.correctAnswer;
    if (isCorrect) correctCount += 1;

    const domainStats = domainMap.get(q.domain) ?? { total: 0, correct: 0 };
    domainStats.total += 1;
    if (isCorrect) domainStats.correct += 1;
    domainMap.set(q.domain, domainStats);

    if (q.skill) {
      const skillStats = skillMap.get(q.skill) ?? { total: 0, correct: 0 };
      skillStats.total += 1;
      if (isCorrect) skillStats.correct += 1;
      skillMap.set(q.skill, skillStats);
    }

    const diffStats = difficultyMap.get(q.difficulty) ?? { total: 0, correct: 0 };
    diffStats.total += 1;
    if (isCorrect) diffStats.correct += 1;
    difficultyMap.set(q.difficulty, diffStats);
  }

  const totalQuestions = questions.length;
  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return {
    totalQuestions,
    correctCount,
    scorePercent,
    byDomain: [...domainMap.entries()].map(([domain, s]) => ({ domain, ...s })),
    bySkill: [...skillMap.entries()].map(([skill, s]) => ({ skill, ...s })),
    byDifficulty: [...difficultyMap.entries()].map(([difficulty, s]) => ({ difficulty, ...s })),
    durationSeconds: Math.max(0, Math.round((submittedAt - startedAt) / 1000)),
  };
}
