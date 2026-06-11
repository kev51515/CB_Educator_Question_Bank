/**
 * CoachDevelopmentCard — the signed-in coach sees + checks off their own
 * development next-steps.
 *
 *   export function CoachDevelopmentCard({ courseId, studentId }: {
 *     courseId: string; studentId: string })  // studentId = signed-in coach's profiles.id
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { EmptyState, SkeletonRows, useToast } from "@/components";

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
  not_authorized: "You can only update your own next steps.",
  not_found: "That item no longer exists.",
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

export function CoachDevelopmentCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const toast = useToast();
  const [steps, setSteps] = useState<DevStep[]>([]);
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
        .from("pickleball_coach_devsteps")
        .select("*")
        .eq("course_id", courseId)
        .eq("coach_id", studentId)
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
  }, [courseId, studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setSteps((prev) => prev.map((s) => (s.id === step.id ? step : s)));
    } else if (done) {
      toast.success("Nice work — step complete.");
    }
  }

  const openCount = steps.filter((s) => s.status === "open").length;

  return (
    <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          My development plan
        </h3>
        {steps.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {openCount} to go
          </span>
        )}
      </div>

      {loading ? (
        <SkeletonRows count={3} />
      ) : steps.length === 0 ? (
        <EmptyState
          icon="check"
          title="No next steps yet"
          body="Your coach hasn't assigned any development steps yet. Check back soon."
        />
      ) : (
        <ul className="space-y-2">
          {steps.map((step) => {
            const done = step.status === "done";
            return (
              <li
                key={step.id}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 p-3"
              >
                <button
                  type="button"
                  onClick={() => void toggleStep(step)}
                  aria-label={done ? "Mark as not done" : "Mark as done"}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
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
                  {step.due_on && (
                    <p className="mt-1 text-xs text-slate-400">
                      Target: {formatDate(step.due_on)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
