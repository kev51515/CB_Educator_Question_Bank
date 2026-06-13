/**
 * useCohortItemAnalysis — per-assignment item analysis for a mocktest cohort
 * ==========================================================================
 * Fetches the `get_cohort_item_analysis` RPC (0245) for one assignment and
 * returns the typed, position-ordered rows. Mirrors useCourseSkillMastery's
 * fetch + aliveRef pattern. The RPC returns an empty array for non-mocktest
 * assignments, which the view renders as its empty state.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface ItemChoiceCounts {
  A: number;
  B: number;
  C: number;
  D: number;
}

export type ChoiceLetter = "A" | "B" | "C" | "D";

export interface ItemAnalysisRow {
  position: number;
  question_number: number;
  prompt_excerpt: string;
  domain: string | null;
  correct_answer: ChoiceLetter | null;
  choice_counts: ItemChoiceCounts;
  n_responses: number;
  pct_correct: number | null;
  top_distractor: ChoiceLetter | null;
}

export interface CohortItemAnalysis {
  loading: boolean;
  error: string | null;
  rows: ItemAnalysisRow[];
}

export function useCohortItemAnalysis(assignmentId: string | null): CohortItemAnalysis {
  const [rows, setRows] = useState<ItemAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assignmentId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const alive = { current: true };
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { data, error: err } = await supabase.rpc("get_cohort_item_analysis", {
          p_assignment_id: assignmentId,
        });
        if (!alive.current) return;
        if (err) throw err;
        setRows((data as ItemAnalysisRow[]) ?? []);
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : "Could not load item analysis.");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [assignmentId]);

  return { loading, error, rows };
}
