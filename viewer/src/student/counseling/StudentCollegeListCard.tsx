/**
 * StudentCollegeListCard
 * ======================
 * The STUDENT's read-only view of their own college list. The counselor manages
 * these `college_applications` rows (see CollegeApplicationsPanel.tsx); the
 * student can only read them — no add / edit / delete. RLS returns only the
 * signed-in student's own rows.
 *
 * Conventions copied from CourseSharingControls.tsx: `@/lib/supabase`,
 * `useToast`, the `aliveRef` mounted-guard, `SkeletonRows`, slate/indigo
 * dark-mode ring-1 cards, NO emojis.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";

type Tier = "reach" | "target" | "safety" | "likely";
type Plan = "ED" | "ED2" | "EA" | "REA" | "RD" | "rolling";
type Status =
  | "considering"
  | "in_progress"
  | "submitted"
  | "accepted"
  | "rejected"
  | "waitlisted"
  | "deferred"
  | "enrolled";

interface CollegeApplication {
  id: string;
  course_id: string;
  student_id: string;
  college_name: string;
  tier: Tier | null;
  plan: Plan | null;
  deadline: string | null;
  status: Status;
  notes: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABEL: Record<Status, string> = {
  considering: "Considering",
  in_progress: "In progress",
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  waitlisted: "Waitlisted",
  deferred: "Deferred",
  enrolled: "Enrolled",
};

// Tier chip palette (rose / indigo / emerald / amber) — matches the counselor view.
function tierChipClass(tier: Tier): string {
  switch (tier) {
    case "reach":
      return "ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300";
    case "target":
      return "ring-indigo-300 dark:ring-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300";
    case "safety":
      return "ring-emerald-300 dark:ring-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300";
    case "likely":
      return "ring-amber-300 dark:ring-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300";
  }
}

// A read-only status pill, color-coded by where the application stands.
function statusPillClass(status: Status): string {
  switch (status) {
    case "considering":
      return "ring-slate-300 dark:ring-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
    case "in_progress":
      return "ring-indigo-300 dark:ring-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300";
    case "submitted":
      return "ring-sky-300 dark:ring-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300";
    case "accepted":
    case "enrolled":
      return "ring-emerald-300 dark:ring-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300";
    case "rejected":
      return "ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300";
    case "waitlisted":
    case "deferred":
      return "ring-amber-300 dark:ring-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300";
  }
}

// Deadlines are stored as a plain `date` (YYYY-MM-DD). Parse as local noon to
// avoid a TZ-induced off-by-one day, then format human-readable.
function formatDeadline(date: string | null): string {
  if (!date) return "No deadline";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function StudentCollegeListCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [apps, setApps] = useState<CollegeApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const { data, error } = await supabase
      .from("college_applications")
      .select("*")
      .eq("course_id", courseId)
      .eq("student_id", studentId)
      .order("deadline", { ascending: true, nullsFirst: false });
    if (!aliveRef.current) return;
    if (error) {
      toast.error("Couldn't load your college list", error.message);
      setApps([]);
      setLoading(false);
      return;
    }
    setApps((data ?? []) as CollegeApplication[]);
    setLoading(false);
  }, [courseId, studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const count = apps.length;
  const countLabel = useMemo(
    () => `${count} ${count === 1 ? "college" : "colleges"}`,
    [count],
  );

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          My college list
        </h3>
        {!loading && count > 0 && (
          <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
            {countLabel}
          </span>
        )}
      </div>

      {loading ? (
        <SkeletonRows count={3} />
      ) : apps.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your counselor hasn't added any colleges yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {apps.map((app) => (
            <li
              key={app.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {app.college_name}
                  </span>
                  {app.tier && (
                    <span
                      className={`shrink-0 rounded-full ring-1 px-2 py-0.5 text-[11px] font-medium capitalize ${tierChipClass(app.tier)}`}
                    >
                      {app.tier}
                    </span>
                  )}
                  {app.plan && (
                    <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {app.plan}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {formatDeadline(app.deadline)}
                  </span>
                </div>
                {app.notes && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {app.notes}
                  </p>
                )}
              </div>

              <span
                className={`shrink-0 rounded-full ring-1 px-2.5 py-0.5 text-[11px] font-medium ${statusPillClass(app.status)}`}
              >
                {STATUS_LABEL[app.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
