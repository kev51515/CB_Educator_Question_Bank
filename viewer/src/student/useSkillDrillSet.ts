/**
 * useSkillDrillSet
 * ================
 * Resolves which pre-built Question Bank set a "Skill Drill" module item should
 * serve to THIS student. A Skill Drill auto-targets the student's WEAK skills:
 *
 *   1. Read the student's per-skill mastery (`my_skill_mastery` RPC) — same
 *      source `useWeakSkills` uses, but we keep the mastery numbers so we can
 *      pick the *weakest* matching skill, not just any weak one.
 *   2. From the static catalog (`useQuestionBankCatalog`), keep only entries
 *      whose normalized `topic` matches a weak skill (and `section`, when the
 *      teacher constrained the drill to one section).
 *   3. Pick the entry on the lowest-mastery skill. Deterministic tiebreaks:
 *      lower mastery first, then lower setId, then lexicographic uid — so the
 *      same student always lands on the same drill until their mastery shifts.
 *   4. Compute its `qbankSetUid` (canonical encoder) so the existing
 *      QBankAssignmentRunner can resolve + grade it with zero new logic.
 *
 * Returns an `empty` result when the student has no weak-skill match yet (e.g.
 * they haven't taken a practice test) — the route renders a friendly nudge.
 *
 * No new tables/RPCs: grading flows through the qbank_set path unchanged, and
 * those attempts feed back into my_skill_mastery, so the drill self-improves.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { qbankSetUid } from "@/lib/qbankSetUid";
import {
  useQuestionBankCatalog,
  type CatalogEntry,
} from "@/teacher/useQuestionBankCatalog";

/** Normalize a skill/topic label for comparison: lowercase + collapse any run
 *  of non-alphanumerics to a single space, trimmed. Tolerant of the small
 *  punctuation/spacing differences between `my_skill_mastery.skill` and a
 *  catalog entry's `topic`. */
function normSkill(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STRONG_THRESHOLD = 65;
const MIN_SAMPLE = 3;

interface MasteryRow {
  domain: string;
  skill: string;
  attempts: number;
  correct: number;
  mastery: number | null;
}

export type SkillDrillResolved = {
  loading: false;
  empty: false;
  entry: CatalogEntry;
  uid: string;
  label: string;
};

export type SkillDrillEmpty = {
  loading: false;
  empty: true;
  entry?: undefined;
  uid?: undefined;
  label?: undefined;
};

export type SkillDrillLoading = {
  loading: true;
  empty?: undefined;
  entry?: undefined;
  uid?: undefined;
  label?: undefined;
};

export type SkillDrillResult =
  | SkillDrillLoading
  | SkillDrillEmpty
  | SkillDrillResolved;

/**
 * @param section Optional section filter from the module_item config —
 *   "math" | "reading-and-writing". Falsy = any section.
 */
export function useSkillDrillSet(section?: string): SkillDrillResult {
  const { catalog, loading: catalogLoading } = useQuestionBankCatalog();
  const [mastery, setMastery] = useState<MasteryRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("my_skill_mastery");
      if (cancelled) return;
      // On error treat as "no mastery yet" → empty state (not a hard error).
      setMastery(error ? [] : ((data ?? []) as MasteryRow[]));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (catalogLoading || mastery === null) {
    return { loading: true };
  }

  // Map each weak skill (normalized) → its mastery score for ordering. A skill
  // is weak if it's low-sample (< 3 attempts) or below the strong cutoff;
  // low-sample skills get score 0 so they surface first.
  const weakMastery = new Map<string, number>();
  for (const r of mastery) {
    const lowSample = r.attempts < MIN_SAMPLE;
    const weak = lowSample || (r.mastery !== null && r.mastery < STRONG_THRESHOLD);
    if (!weak) continue;
    const key = normSkill(r.skill);
    const score = lowSample ? 0 : r.mastery ?? 0;
    // Keep the lowest score if a skill somehow appears twice.
    const prev = weakMastery.get(key);
    if (prev === undefined || score < prev) weakMastery.set(key, score);
  }

  if (weakMastery.size === 0) {
    return { loading: false, empty: true };
  }

  const wantSection =
    section === "math" || section === "reading-and-writing" ? section : null;

  // Candidate catalog entries whose topic matches a weak skill (+ section).
  const candidates: Array<{ entry: CatalogEntry; mastery: number }> = [];
  for (const entry of catalog) {
    if (wantSection && entry.section !== wantSection) continue;
    const m = weakMastery.get(normSkill(entry.topic));
    if (m === undefined) continue;
    candidates.push({ entry, mastery: m });
  }

  if (candidates.length === 0) {
    return { loading: false, empty: true };
  }

  // Deterministic pick: lowest mastery, then lower setId, then lexicographic
  // uid so the same student is sent to the same drill until mastery changes.
  candidates.sort((a, b) => {
    if (a.mastery !== b.mastery) return a.mastery - b.mastery;
    const aSet = Number(a.entry.setId);
    const bSet = Number(b.entry.setId);
    if (Number.isFinite(aSet) && Number.isFinite(bSet) && aSet !== bSet) {
      return aSet - bSet;
    }
    return qbankSetUid(a.entry).localeCompare(qbankSetUid(b.entry));
  });

  const { entry } = candidates[0];
  return {
    loading: false,
    empty: false,
    entry,
    uid: qbankSetUid(entry),
    label: `Skill Drill: ${entry.topic}`,
  };
}
