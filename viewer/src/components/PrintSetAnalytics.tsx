import { useMemo } from "react";
import type { Question, IndexEntry } from "@/types";

interface PrintSetAnalyticsProps {
  questions: Question[];
  entries: IndexEntry[];
}

interface AnswerDistEntry {
  letter: string;
  count: number;
  pct: number;
}

const LETTERS = ["A", "B", "C", "D"];

/**
 * Compute answer-key distribution for MCQ questions.
 * Maps each question's correct key to a letter (A/B/C/D) by finding its index
 * in answerOptions, then returns counts and percentages.
 */
export function computeAnswerDistribution(questions: Question[]): AnswerDistEntry[] {
  const mcqs = questions.filter(
    (q) => q.type === "mcq" && Array.isArray(q.answerOptions) && q.answerOptions.length > 0,
  );

  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };

  for (const q of mcqs) {
    const correctId = q.keys?.[0];
    if (!correctId) continue;
    const idx = (q.answerOptions ?? []).findIndex((o) => o.id === correctId);
    if (idx >= 0 && idx < LETTERS.length) {
      counts[LETTERS[idx]] += 1;
    }
  }

  const total = mcqs.length || 1;
  return LETTERS.map((letter) => ({
    letter,
    count: counts[letter],
    pct: (counts[letter] / total) * 100,
  }));
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-emerald-400",
  medium: "bg-amber-400",
  hard: "bg-rose-400",
};

const DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"];

export function PrintSetAnalytics({ questions, entries: _entries }: PrintSetAnalyticsProps): JSX.Element {
  // --- Answer distribution (MCQ only) ---
  const answerDist = useMemo(() => computeAnswerDistribution(questions), [questions]);
  const mcqCount = useMemo(
    () => questions.filter((q) => q.type === "mcq").length,
    [questions],
  );
  const skewedLetter = useMemo(() => {
    if (mcqCount === 0) return null;
    const skewed = answerDist.find((d) => d.pct > 40);
    return skewed ?? null;
  }, [answerDist, mcqCount]);

  // --- Difficulty breakdown ---
  const difficultyRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions) {
      const d = q.difficulty || "Unknown";
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const rows: { label: string; count: number; color: string }[] = [];
    for (const label of DIFFICULTY_ORDER) {
      const count = counts.get(label) ?? 0;
      if (count > 0) {
        rows.push({
          label,
          count,
          color: DIFFICULTY_COLORS[label.toLowerCase()] ?? "bg-ink-300",
        });
      }
    }
    return rows;
  }, [questions]);

  // --- Skill coverage ---
  const skillStats = useMemo(() => {
    const skillCounts = new Map<string, number>();
    for (const q of questions) {
      const s = q.skill || "Unknown";
      skillCounts.set(s, (skillCounts.get(s) ?? 0) + 1);
    }
    const sorted = [...skillCounts.entries()].sort((a, b) => b[1] - a[1]);
    const uniqueCount = sorted.length;
    let note: string | null = null;
    if (uniqueCount === 1) note = "Single skill focus";
    else if (uniqueCount >= 5) note = "Broad coverage";
    return { skills: sorted, uniqueCount, note };
  }, [questions]);

  // --- Estimated time ---
  const estimatedMinutes = useMemo(() => {
    let total = 0;
    for (const q of questions) {
      if (q.stimulus) {
        total += 3;
      } else if (q.type === "spr") {
        total += 2;
      } else {
        total += 1.5;
      }
    }
    return Math.round(total);
  }, [questions]);

  // --- Section split ---
  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions) {
      const s = q.section || "Unknown";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [questions]);

  if (questions.length === 0) return <></>;

  const maxAnswerCount = Math.max(...answerDist.map((d) => d.count), 1);

  return (
    <div className="p-4 rounded-xl border border-ink-200 bg-ink-50 text-[12px] space-y-3">
      {/* Answer key distribution */}
      {mcqCount > 0 && (
        <div>
          <h4 className="font-semibold text-ink-700 mb-1.5">Answer Distribution</h4>
          <div className="flex items-end gap-2">
            {answerDist.map((d) => {
              const isSkewed = skewedLetter !== null && d.letter === skewedLetter.letter;
              const barHeight = maxAnswerCount > 0 ? (d.count / maxAnswerCount) * 32 : 0;
              return (
                <div key={d.letter} className="flex flex-col items-center gap-0.5 flex-1">
                  <span className="tabular-nums text-ink-500">{d.count}</span>
                  <div
                    className={`w-full rounded-sm transition-all ${
                      isSkewed ? "bg-amber-400" : "bg-accent-300"
                    }`}
                    style={{ height: `${Math.max(barHeight, 2)}px` }}
                  />
                  <span
                    className={`font-medium ${isSkewed ? "text-amber-700" : "text-ink-600"}`}
                  >
                    {d.letter}
                  </span>
                </div>
              );
            })}
          </div>
          {skewedLetter && (
            <p className="mt-1.5 text-amber-700 flex items-center gap-1">
              <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0" fill="currentColor" aria-hidden>
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4.75v4a.75.75 0 01-1.5 0v-4a.75.75 0 011.5 0z" />
              </svg>
              Distribution skewed toward {skewedLetter.letter} ({skewedLetter.pct.toFixed(0)}%)
            </p>
          )}
        </div>
      )}

      {/* Difficulty breakdown */}
      {difficultyRows.length > 0 && (
        <div>
          <h4 className="font-semibold text-ink-700 mb-1.5">Difficulty</h4>
          <div className="flex items-center gap-3">
            {difficultyRows.map((r) => (
              <span key={r.label} className="flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-full ${r.color}`} />
                <span className="text-ink-600">
                  {r.label}: {r.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Skill coverage */}
      {skillStats.skills.length > 0 && (
        <div>
          <h4 className="font-semibold text-ink-700 mb-1.5">
            Skills{" "}
            <span className="font-normal text-ink-400">({skillStats.uniqueCount})</span>
          </h4>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-ink-600">
            {skillStats.skills.map(([skill, count]) => (
              <span key={skill}>
                {skill}{" "}
                <span className="text-ink-400 tabular-nums">{count}</span>
              </span>
            ))}
          </div>
          {skillStats.note && (
            <p className="mt-1 text-ink-400 italic">{skillStats.note}</p>
          )}
        </div>
      )}

      {/* Estimated time + Section split (same row) */}
      <div className="flex items-center justify-between pt-2 border-t border-ink-200">
        <span className="text-ink-600">
          Est. time:{" "}
          <span className="font-medium text-ink-700">~{estimatedMinutes} min</span>
        </span>
        <span className="text-ink-500">
          {sectionCounts.map(([sec, count], i) => (
            <span key={sec}>
              {i > 0 && <span className="mx-1">&middot;</span>}
              {sec}: {count}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
