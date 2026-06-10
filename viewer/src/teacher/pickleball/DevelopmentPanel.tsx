/**
 * DevelopmentPanel — coach development next-steps (teacher view).
 *
 * For a 'pickleball_coach' course: pick a coach from the roster, see their
 * development next-steps, assign new ones, edit / check them off, and leave
 * private notes + a due date (SmartDatePicker). Mirrors the counseling-task
 * UX bar: inline affordances, optimistic toggle, skeleton load, empty-state
 * CTA, toast feedback.
 *
 *   export function DevelopmentPanel({ courseId }: { courseId: string })
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClassRoster } from "@/teacher/useClassRoster";
import {
  EmptyState,
  MarkdownEditor,
  SkeletonRows,
  SmartDatePicker,
  useToast,
} from "@/components";

interface DevStep {
  id: string;
  course_id: string;
  coach_id: string;
  title: string;
  detail: string | null;
  status: "open" | "done";
  notes: string | null;
  due_on: string | null;
  completed_at: string | null;
  created_at: string;
}

const RPC_ERROR_LABELS: Record<string, string> = {
  not_authenticated: "Please sign in again.",
  not_authorized: "You do not have permission to do that.",
  not_found: "That item no longer exists.",
  invalid_input: "Please check the fields and try again.",
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

export function DevelopmentPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const { roster, loading: rosterLoading } = useClassRoster(courseId);
  const [selectedCoach, setSelectedCoach] = useState<string | null>(null);
  const [steps, setSteps] = useState<DevStep[]>([]);
  const [loading, setLoading] = useState(false);
  const aliveRef = useRef(true);

  // New-step form
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newDue, setNewDue] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDue, setEditDue] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Default-select the first coach once the roster lands.
  useEffect(() => {
    if (!selectedCoach && roster.length > 0) {
      setSelectedCoach(roster[0].student_id);
    }
  }, [roster, selectedCoach]);

  const loadSteps = useCallback(async () => {
    if (!selectedCoach) {
      setSteps([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pickleball_coach_devsteps")
        .select("*")
        .eq("course_id", courseId)
        .eq("coach_id", selectedCoach)
        .order("status", { ascending: true })
        .order("created_at", { ascending: false });
      if (!aliveRef.current) return;
      if (error) {
        toast.error(error.message);
        setSteps([]);
        return;
      }
      setSteps((data ?? []) as DevStep[]);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, selectedCoach, toast]);

  useEffect(() => {
    void loadSteps();
  }, [loadSteps]);

  const coachName = useMemo(() => {
    const c = roster.find((r) => r.student_id === selectedCoach);
    return c?.display_name || c?.email || "this coach";
  }, [roster, selectedCoach]);

  async function addStep() {
    if (!selectedCoach || !newTitle.trim()) return;
    setAdding(true);
    try {
      const { data, error } = await supabase.rpc("pk_add_devstep", {
        p_course_id: courseId,
        p_coach_id: selectedCoach,
        p_title: newTitle.trim(),
        p_detail: newDetail.trim() || null,
        p_due_on: newDue ? newDue.slice(0, 10) : null,
      });
      if (error) {
        toast.error(rpcMessage(error));
        return;
      }
      if (aliveRef.current && data) {
        setSteps((prev) => [data as DevStep, ...prev]);
        setNewTitle("");
        setNewDetail("");
        setNewDue(null);
        toast.success("Next step assigned.");
      }
    } finally {
      if (aliveRef.current) setAdding(false);
    }
  }

  async function toggleStep(step: DevStep) {
    const done = step.status !== "done";
    // Optimistic
    setSteps((prev) =>
      prev.map((s) =>
        s.id === step.id
          ? {
              ...s,
              status: done ? "done" : "open",
              completed_at: done ? new Date().toISOString() : null,
            }
          : s,
      ),
    );
    const { error } = await supabase.rpc("pk_complete_devstep", {
      p_id: step.id,
      p_done: done,
    });
    if (error) {
      toast.error(rpcMessage(error));
      // Roll back
      setSteps((prev) =>
        prev.map((s) => (s.id === step.id ? step : s)),
      );
    }
  }

  function beginEdit(step: DevStep) {
    setEditingId(step.id);
    setEditTitle(step.title);
    setEditNotes(step.notes ?? "");
    setEditDue(step.due_on ? `${step.due_on}T00:00:00` : null);
  }

  async function saveEdit(step: DevStep) {
    if (!editTitle.trim()) return;
    setSavingEdit(true);
    try {
      const { data, error } = await supabase.rpc("pk_update_devstep", {
        p_id: step.id,
        p_title: editTitle.trim(),
        p_detail: step.detail,
        p_notes: editNotes.trim() || null,
        p_due_on: editDue ? editDue.slice(0, 10) : null,
      });
      if (error) {
        toast.error(rpcMessage(error));
        return;
      }
      if (aliveRef.current && data) {
        setSteps((prev) =>
          prev.map((s) => (s.id === step.id ? (data as DevStep) : s)),
        );
        setEditingId(null);
        toast.success("Saved.");
      }
    } finally {
      if (aliveRef.current) setSavingEdit(false);
    }
  }

  const openCount = steps.filter((s) => s.status === "open").length;

  return (
    <div className="space-y-4">
      {/* Coach selector */}
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
        <label
          htmlFor="dev-coach"
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
          <select
            id="dev-coach"
            value={selectedCoach ?? ""}
            onChange={(e) => setSelectedCoach(e.target.value)}
            className="min-h-[44px] w-full max-w-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
          >
            {roster.map((r) => (
              <option key={r.student_id} value={r.student_id}>
                {r.display_name || r.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedCoach && (
        <>
          {/* Assign new step */}
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Assign a next step for {coachName}
            </h3>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Shadow an intermediate clinic"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
            />
            <MarkdownEditor
              value={newDetail}
              onChange={setNewDetail}
              placeholder="Details / expectations (optional)"
            />
            <SmartDatePicker
              value={newDue}
              onChange={setNewDue}
              label="Target date (optional)"
            />
            <div>
              <button
                type="button"
                onClick={() => void addStep()}
                disabled={adding || !newTitle.trim()}
                className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {adding ? "Assigning…" : "Assign next step"}
              </button>
            </div>
          </div>

          {/* Steps list */}
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Development plan
              </h3>
              {steps.length > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {openCount} open · {steps.length - openCount} done
                </span>
              )}
            </div>

            {loading ? (
              <SkeletonRows count={3} />
            ) : steps.length === 0 ? (
              <EmptyState
                icon="check"
                title="No next steps yet"
                body={`Assign ${coachName}'s first development step above.`}
              />
            ) : (
              <ul className="space-y-2">
                {steps.map((step) => {
                  const done = step.status === "done";
                  const editing = editingId === step.id;
                  return (
                    <li
                      key={step.id}
                      className="group rounded-xl border border-slate-200 dark:border-slate-800 p-3"
                    >
                      {editing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm"
                          />
                          <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Private coaching notes"
                            rows={2}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                          />
                          <SmartDatePicker
                            value={editDue}
                            onChange={setEditDue}
                            label="Target date"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void saveEdit(step)}
                              disabled={savingEdit || !editTitle.trim()}
                              className="min-h-[40px] rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {savingEdit ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 px-3 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => void toggleStep(step)}
                            aria-label={
                              done ? "Mark as open" : "Mark as done"
                            }
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                              done
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-slate-300 dark:border-slate-600"
                            }`}
                          >
                            {done && (
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  d="M5 13l4 4L19 7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm font-medium ${
                                done
                                  ? "text-slate-400 line-through dark:text-slate-500"
                                  : "text-slate-800 dark:text-slate-100"
                              }`}
                            >
                              {step.title}
                            </p>
                            {step.detail && (
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                                {step.detail}
                              </p>
                            )}
                            {step.notes && (
                              <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">
                                Note: {step.notes}
                              </p>
                            )}
                            {step.due_on && (
                              <p className="mt-1 text-xs text-slate-400">
                                Target: {formatDate(step.due_on)}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => beginEdit(step)}
                            aria-label="Edit next step"
                            className="opacity-0 transition group-hover:opacity-100 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                            >
                              <path
                                d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
