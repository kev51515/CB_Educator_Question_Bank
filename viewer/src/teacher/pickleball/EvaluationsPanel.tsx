/**
 * EvaluationsPanel — coach evaluations (teacher view).
 *
 * For a 'pickleball_coach' course: pick a coach from the roster, record a
 * rubric evaluation across four competency dimensions (instruction,
 * communication, safety, retention — each 0..5 via StarRating, where 0 means
 * "not scored"), add written notes (MarkdownEditor), and review the coach's
 * evaluation history with a simple per-dimension trend (pure inline SVG).
 *
 * Backs migration 0169:
 *   pickleball_coach_evaluations + pk_add_evaluation(...).
 *
 * UX bar: coach selector, optimistic insert + toast, skeleton load, empty-state
 * CTA, ≥40px tap targets, no emoji.
 *
 *   export function EvaluationsPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClassRoster } from "@/teacher/useClassRoster";
import {
  Combobox,
  EmptyState,
  MarkdownEditor,
  SkeletonRows,
  StarRating,
  useToast,
} from "@/components";

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

const RPC_ERROR_LABELS: Record<string, string> = {
  not_authenticated: "Please sign in again.",
  not_authorized: "You do not have permission to do that.",
  invalid_input: "Score at least one dimension (or add a note) before saving.",
};

function rpcMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  for (const code of Object.keys(RPC_ERROR_LABELS)) {
    if (raw.includes(code)) return RPC_ERROR_LABELS[code];
  }
  return "Something went wrong. Please try again.";
}

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

/**
 * TrendSparkline — a tiny inline-SVG line of a single dimension's scores over
 * time (oldest → newest). Scores are 1..5; nulls are skipped. No chart lib.
 */
function TrendSparkline({
  scores,
}: {
  scores: number[];
}): React.ReactElement {
  const W = 96;
  const H = 28;
  const PAD = 3;
  if (scores.length === 0) {
    return (
      <span className="text-xs text-slate-400 dark:text-slate-600">
        No scores
      </span>
    );
  }
  if (scores.length === 1) {
    return (
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {scores[0]} / 5
      </span>
    );
  }
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const points = scores.map((s, i) => {
    const x = PAD + (innerW * i) / (scores.length - 1);
    // y: score 5 at top, 1 at bottom.
    const y = PAD + innerH * (1 - (s - 1) / 4);
    return { x, y };
  });
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const first = scores[0];
  const latest = scores[scores.length - 1];
  const up = latest > first;
  const down = latest < first;
  const stroke = up
    ? "stroke-emerald-500"
    : down
      ? "stroke-rose-500"
      : "stroke-slate-400";
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Trend: ${scores.join(", ")} out of 5`}
      className="overflow-visible"
    >
      <path
        d={path}
        fill="none"
        className={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={1.6}
          className={`${stroke} fill-current`}
        />
      ))}
      <circle
        cx={last.x}
        cy={last.y}
        r={2.6}
        className={`${stroke} fill-current`}
      />
    </svg>
  );
}

function DimensionStat({
  label,
  scores,
}: {
  label: string;
  scores: number[];
}): React.ReactElement {
  const avg =
    scores.length === 0
      ? null
      : scores.reduce((a, b) => a + b, 0) / scores.length;
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 ring-1 ring-slate-200 dark:ring-slate-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {label}
        </span>
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          {avg === null ? "—" : `avg ${avg.toFixed(1)}`}
        </span>
      </div>
      <div className="mt-2">
        <TrendSparkline scores={scores} />
      </div>
    </div>
  );
}

export function EvaluationsPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const { roster, loading: rosterLoading } = useClassRoster(courseId);
  const [selectedCoach, setSelectedCoach] = useState<string | null>(null);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const aliveRef = useRef(true);

  // New-evaluation form. 0 = not scored.
  const [scores, setScores] = useState<Record<DimensionKey, number>>({
    instruction: 0,
    communication: 0,
    safety: 0,
    retention: 0,
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCoach && roster.length > 0) {
      setSelectedCoach(roster[0].student_id);
    }
  }, [roster, selectedCoach]);

  const loadEvals = useCallback(async () => {
    if (!selectedCoach) {
      setEvals([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pickleball_coach_evaluations")
        .select("*")
        .eq("course_id", courseId)
        .eq("coach_id", selectedCoach)
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
  }, [courseId, selectedCoach, toast]);

  useEffect(() => {
    void loadEvals();
  }, [loadEvals]);

  const coachName = useMemo(() => {
    const c = roster.find((r) => r.student_id === selectedCoach);
    return c?.display_name || c?.email || "this coach";
  }, [roster, selectedCoach]);

  // Per-dimension score series (oldest → newest), nulls skipped.
  const trends = useMemo(() => {
    const ordered = [...evals].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const out: Record<DimensionKey, number[]> = {
      instruction: [],
      communication: [],
      safety: [],
      retention: [],
    };
    for (const ev of ordered) {
      for (const { key } of DIMENSIONS) {
        const v = ev[key];
        if (typeof v === "number") out[key].push(v);
      }
    }
    return out;
  }, [evals]);

  const hasAnyScore =
    scores.instruction > 0 ||
    scores.communication > 0 ||
    scores.safety > 0 ||
    scores.retention > 0;
  const canSave = hasAnyScore || notes.trim() !== "";

  const setDim = (key: DimensionKey, quality: number) =>
    setScores((prev) => ({ ...prev, [key]: quality }));

  const resetForm = () => {
    setScores({ instruction: 0, communication: 0, safety: 0, retention: 0 });
    setNotes("");
  };

  async function saveEvaluation() {
    if (!selectedCoach || !canSave) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("pk_add_evaluation", {
        p_course_id: courseId,
        p_coach_id: selectedCoach,
        p_instruction: scores.instruction > 0 ? scores.instruction : null,
        p_communication:
          scores.communication > 0 ? scores.communication : null,
        p_safety: scores.safety > 0 ? scores.safety : null,
        p_retention: scores.retention > 0 ? scores.retention : null,
        p_notes: notes.trim() || null,
      });
      if (error) {
        toast.error(rpcMessage(error));
        return;
      }
      if (aliveRef.current && data) {
        setEvals((prev) => [data as Evaluation, ...prev]);
        resetForm();
        toast.success("Evaluation recorded — the coach has been notified.");
      }
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Coach selector */}
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
        <label
          htmlFor="eval-coach"
          className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
        >
          Coach
        </label>
        {rosterLoading ? (
          <SkeletonRows count={1} />
        ) : roster.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No coaches enrolled yet. Add coaches from the Coaches tab.
          </p>
        ) : (
          <Combobox
            id="eval-coach"
            ariaLabel="Coach"
            value={selectedCoach}
            onChange={(v) => setSelectedCoach(v)}
            options={roster.map((r) => ({
              value: r.student_id,
              label: r.display_name || r.email,
            }))}
            placeholder="Select a coach…"
            className="w-full max-w-sm"
          />
        )}
      </div>

      {selectedCoach && (
        <>
          {/* Record an evaluation */}
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Evaluate {coachName}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rate each competency 1–5 (leave at zero to skip a dimension).
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DIMENSIONS.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2 ring-1 ring-slate-200 dark:ring-slate-800"
                >
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    {label}
                  </span>
                  <div className="flex items-center gap-2">
                    <StarRating
                      value={scores[key]}
                      max={5}
                      interactive
                      size="md"
                      label={`Rate ${label}`}
                      onChange={(q) => setDim(key, q)}
                    />
                    <span className="w-8 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {scores[key] > 0 ? `${scores[key]}/5` : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Notes (shared with the coach)
              </label>
              <MarkdownEditor
                value={notes}
                onChange={setNotes}
                placeholder="What went well, what to work on next…"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveEvaluation()}
                disabled={saving || !canSave}
                className="min-h-[44px] rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Record evaluation"}
              </button>
              {(hasAnyScore || notes.trim() !== "") && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 px-3 text-sm disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Trend summary */}
          {evals.length > 0 && (
            <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
                Competency trend
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DIMENSIONS.map(({ key, label }) => (
                  <DimensionStat
                    key={key}
                    label={label}
                    scores={trends[key]}
                  />
                ))}
              </div>
            </div>
          )}

          {/* History */}
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Evaluation history
              </h3>
              {evals.length > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {evals.length} recorded
                </span>
              )}
            </div>

            {loading ? (
              <SkeletonRows count={3} />
            ) : evals.length === 0 ? (
              <EmptyState
                icon="check"
                title="No evaluations yet"
                body={`Record ${coachName}'s first evaluation above.`}
              />
            ) : (
              <ul className="space-y-2">
                {evals.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {formatDate(ev.created_at)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {DIMENSIONS.map(({ key, label }) => {
                        const v = ev[key];
                        if (typeof v !== "number") return null;
                        return (
                          <div
                            key={key}
                            className="flex items-center gap-1.5"
                          >
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
