/**
 * atRiskHelpers — At-Risk Triage v2 pure logic
 * ============================================
 * The "why + suggested action" layer on top of the NeedsAttention rail. Where
 * the three v1 lanes answer *what work is waiting on the teacher*, the at-risk
 * lane answers *which students are struggling, and why* — so the teacher can
 * Nudge one of them in a single click.
 *
 * This file is intentionally pure (no React, no Supabase). It owns:
 *   - the `AtRiskItem` row shape the panel renders, and
 *   - `buildReasons` / `buildAtRiskItem`, which turn a student's raw signals
 *     into a short, specific, human "why" string list capped at the top two.
 *
 * Signals (all teacher-readable, no migration):
 *   - overdueCount   — assignments past due with no submitted attempt by the
 *                      student in a course they're enrolled in.
 *   - lowScoreCount  — assignments whose best EFFECTIVE score < LOW_SCORE_PCT.
 *   - weakestDomain  — the student's lowest-% SAT skill domain (from the
 *                      per-course `course_skill_by_student` RPC), only counted
 *                      when its mastery is below WEAK_DOMAIN_PCT.
 *
 * Severity is a simple, explainable rollup so the panel can sort + tint:
 * each firing signal adds weight; overdue weighs heaviest.
 */

/** Best effective score below this (percent) counts as a low-score signal. */
export const LOW_SCORE_PCT = 60;

/** A weakest-domain mastery below this (percent) counts as a weak-skill signal. */
export const WEAK_DOMAIN_PCT = 60;

export type AtRiskSeverity = "low" | "medium" | "high";

/** A student's weakest SAT skill domain, when it's below the weak threshold. */
export interface WeakestDomain {
  name: string;
  /** 0–100 mastery percentage. */
  masteryPct: number;
}

/** The raw per-student signals the lane computes before reason-building. */
export interface AtRiskSignals {
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  /** Past-due assignments with no submitted attempt by this student. */
  overdueCount: number;
  /** Assignments whose best effective score is below LOW_SCORE_PCT. */
  lowScoreCount: number;
  /** Weakest domain, only present when below WEAK_DOMAIN_PCT. */
  weakestDomain: WeakestDomain | null;
}

/** One rendered at-risk row. */
export interface AtRiskItem {
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  /** Top-2 specific "why" strings. Always ≥1 (caller only builds firing rows). */
  reasons: string[];
  severity: AtRiskSeverity;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Build the ordered, specific reason strings for a student. Overdue first
 * (most actionable), then low scores, then weakest domain. Capped at the top
 * two so the row stays scannable. Returns `[]` when no signal fires — callers
 * use that to drop the row.
 */
export function buildReasons(signals: AtRiskSignals): string[] {
  const reasons: string[] = [];
  if (signals.overdueCount > 0) {
    reasons.push(`${plural(signals.overdueCount, "assignment")} overdue`);
  }
  if (signals.lowScoreCount > 0) {
    reasons.push(`${plural(signals.lowScoreCount, "low score")} (< ${LOW_SCORE_PCT}%)`);
  }
  if (signals.weakestDomain) {
    reasons.push(
      `weakest: ${signals.weakestDomain.name} (${Math.round(
        signals.weakestDomain.masteryPct,
      )}%)`,
    );
  }
  return reasons.slice(0, 2);
}

/**
 * Severity rollup. Overdue is the strongest single signal (work simply not
 * done); low scores + weak skills compound. Thresholds chosen so a single
 * mild signal is "low", two compounding signals reach "medium", and a heavy
 * overdue load or a full house reaches "high".
 */
export function severityOf(signals: AtRiskSignals): AtRiskSeverity {
  let weight = 0;
  weight += Math.min(signals.overdueCount, 3) * 2; // 0..6
  weight += Math.min(signals.lowScoreCount, 3); // 0..3
  if (signals.weakestDomain) weight += 1;
  if (weight >= 5) return "high";
  if (weight >= 2) return "medium";
  return "low";
}

/**
 * Turn raw signals into a rendered row, or `null` when nothing fires (so the
 * student is excluded from the lane entirely).
 */
export function buildAtRiskItem(signals: AtRiskSignals): AtRiskItem | null {
  const reasons = buildReasons(signals);
  if (reasons.length === 0) return null;
  return {
    studentId: signals.studentId,
    studentName: signals.studentName,
    courseId: signals.courseId,
    courseName: signals.courseName,
    reasons,
    severity: severityOf(signals),
  };
}

/** Sort key: high → low severity, then more reasons, then name. */
export function compareAtRisk(a: AtRiskItem, b: AtRiskItem): number {
  const rank: Record<AtRiskSeverity, number> = { high: 0, medium: 1, low: 2 };
  if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
  if (a.reasons.length !== b.reasons.length) return b.reasons.length - a.reasons.length;
  return a.studentName.localeCompare(b.studentName);
}
