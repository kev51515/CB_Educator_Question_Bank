/**
 * useWeakSkills
 * =============
 * Reads the current student's per-skill mastery via the `my_skill_mastery`
 * RPC and exposes the skills that are below the strong-mastery cutoff
 * (mastery < 65% or fewer than 3 attempts — low-sample-size skills count as
 * weak so they surface for practice). Used by `WeakSkillsToggle` to drive
 * the "Focus weak skills" filter pill in the question bank.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface WeakSkillsResult {
  weakSkills: Set<string>;
  loading: boolean;
  error: string | null;
}

interface MasteryRow {
  domain: string;
  skill: string;
  attempts: number;
  correct: number;
  mastery: number | null;
}

const STRONG_THRESHOLD = 65;
const MIN_SAMPLE = 3;

export function useWeakSkills(): WeakSkillsResult {
  const [weakSkills, setWeakSkills] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc("my_skill_mastery");
        if (cancelled) return;
        if (rpcError) {
          setError(rpcError.message);
          setWeakSkills(new Set());
          return;
        }
        const rows = (data ?? []) as MasteryRow[];
        const weak = new Set<string>();
        for (const r of rows) {
          if (
            r.attempts < MIN_SAMPLE ||
            (r.mastery !== null && r.mastery < STRONG_THRESHOLD)
          ) {
            weak.add(r.skill);
          }
        }
        setWeakSkills(weak);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load mastery.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { weakSkills, loading, error };
}
