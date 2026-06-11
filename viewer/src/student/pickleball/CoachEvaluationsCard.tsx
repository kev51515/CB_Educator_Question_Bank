/**
 * CoachEvaluationsCard — the signed-in coach reads their own shared
 * evaluations (competency ratings + written feedback the academy owner
 * released to them). Read-only on the student side.
 *
 * Backs migration 0169: pickleball_coach_evaluations (RLS: coach reads own).
 *
 *   export function CoachEvaluationsCard({ courseId, studentId }: {
 *     courseId: string; studentId: string })  // studentId = signed-in coach's profiles.id
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { EmptyState, SkeletonRows, StarRating, useToast } from "@/components";

interface Evaluation {
  id: string;
  course_id: string;
  coach_id: string;
  evaluator_id: string;
  instruction: number | null;
  communication: number | null;
  safety: number | null;
  retention: number | null;
  notes: string | null;
  created_at: string;
}

type DimensionKey = "instruction" | "communication" | "safety" | "retention";

const DIMENSIONS: { key: DimensionKey; label: string }[] = [
  { key: "instruction", label: "Instruction" },
  { key: "communication", label: "Communication" },
  { key: "safety", label: "Safety" },
  { key: "retention", label: "Retention" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CoachEvaluationsCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const toast = useToast();
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pickleball_coach_evaluations")
        .select("*")
        .eq("course_id", courseId)
        .eq("coach_id", studentId)
        .order("created_at", { ascending: false });
      if (!aliveRef.current) return;
      if (error) {
        toast.error(error.message);
        setEvals([]);
        return;
      }
      setEvals((data ?? []) as Evaluation[]);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Per-dimension averages across all evaluations (nulls skipped).
  const averages = useMemo(() => {
    const out: Record<DimensionKey, number | null> = {
      instruction: null,
      communication: null,
      safety: null,
      retention: null,
    };
    for (const { key } of DIMENSIONS) {
      const vals = evals
        .map((e) => e[key])
        .filter((v): v is number => typeof v === "number");
      out[key] =
        vals.length === 0
          ? null
          : vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return out;
  }, [evals]);

  return (
    <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          My evaluations
        </h3>
        {evals.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {evals.length} shared
          </span>
        )}
      </div>

      {loading ? (
        <SkeletonRows count={3} />
      ) : evals.length === 0 ? (
        <EmptyState
          icon="check"
          title="No evaluations yet"
          body="Your academy owner hasn't shared any evaluations yet. Check back soon."
        />
      ) : (
        <>
          {/* Averages summary */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DIMENSIONS.map(({ key, label }) => (
              <div
                key={key}
                className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200 dark:ring-slate-800 p-3 text-center"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                  {averages[key] === null
                    ? "—"
                    : (averages[key] as number).toFixed(1)}
                </p>
              </div>
            ))}
          </div>

          {/* History */}
          <ul className="mt-3 space-y-2">
            {evals.map((ev) => (
              <li
                key={ev.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3"
              >
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {formatDate(ev.created_at)}
                </span>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                  {DIMENSIONS.map(({ key, label }) => {
                    const v = ev[key];
                    if (typeof v !== "number") return null;
                    return (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {label}
                        </span>
                        <StarRating
                          value={v}
                          max={5}
                          size="sm"
                          label={`${label}: ${v} of 5`}
                        />
                      </div>
                    );
                  })}
                </div>
                {ev.notes && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                    {ev.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
