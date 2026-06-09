/**
 * CollegeApplicationsPanel
 * ========================
 * The counselor-facing "College list" panel on a student's profile. Lists the
 * student's `college_applications` rows for a course, lets the counselor change
 * each application's status inline, remove an application, and add a new one.
 * The viewer is the COUNSELOR; RLS enforces who can read/write these rows.
 *
 * Conventions copied from CourseSharingControls.tsx: `@/lib/supabase`,
 * `useToast`, the `aliveRef` mounted-guard for every setState-after-await, and
 * the slate/indigo dark-mode card styling.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDialog } from "../ConfirmDialog";

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

const TIER_OPTIONS: Tier[] = ["reach", "target", "safety", "likely"];
const PLAN_OPTIONS: Plan[] = ["ED", "ED2", "EA", "REA", "RD", "rolling"];
const STATUS_OPTIONS: Status[] = [
  "considering",
  "in_progress",
  "submitted",
  "accepted",
  "rejected",
  "waitlisted",
  "deferred",
  "enrolled",
];

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

// Tier chip palette (rose / indigo / emerald + a neutral amber for "likely").
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

export function CollegeApplicationsPanel({
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<CollegeApplication | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);

  // Add-a-college form state.
  const [name, setName] = useState("");
  const [tier, setTier] = useState<Tier | "">("");
  const [plan, setPlan] = useState<Plan | "">("");
  const [deadline, setDeadline] = useState("");
  const [adding, setAdding] = useState(false);

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
      toast.error("Couldn't load the college list", error.message);
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

  const onChangeStatus = async (
    app: CollegeApplication,
    next: Status,
  ): Promise<void> => {
    if (next === app.status) return;
    setBusyId(app.id);
    const patch: { status: Status; submitted_at?: string } = { status: next };
    // Stamp submission time the first time it moves to "submitted".
    if (next === "submitted" && !app.submitted_at) {
      patch.submitted_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("college_applications")
      .update(patch)
      .eq("id", app.id);
    if (!aliveRef.current) return;
    setBusyId(null);
    if (error) {
      toast.error("Couldn't update status", error.message);
      return;
    }
    toast.success(`${app.college_name} → ${STATUS_LABEL[next]}`);
    void load();
  };

  const onRemove = async (): Promise<void> => {
    if (!confirmRemove) return;
    setRemoving(true);
    const { error } = await supabase
      .from("college_applications")
      .delete()
      .eq("id", confirmRemove.id);
    if (!aliveRef.current) return;
    setRemoving(false);
    if (error) {
      toast.error("Couldn't remove college", error.message);
      return;
    }
    const removed = confirmRemove.college_name;
    setConfirmRemove(null);
    toast.success(`Removed ${removed}`);
    void load();
  };

  const onAdd = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Add a college", "Enter a college name first.");
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("college_applications").insert({
      course_id: courseId,
      student_id: studentId,
      college_name: trimmed,
      tier: tier || null,
      plan: plan || null,
      deadline: deadline || null,
      status: "considering",
    });
    if (!aliveRef.current) return;
    setAdding(false);
    if (error) {
      toast.error("Couldn't add college", error.message);
      return;
    }
    setName("");
    setTier("");
    setPlan("");
    setDeadline("");
    toast.success(`Added ${trimmed}`);
    void load();
  };

  const selectClass =
    "rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          College list
        </h3>
        {!loading && (
          <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
            {countLabel}
          </span>
        )}
      </div>

      {/* List */}
      {loading ? (
        <SkeletonRows count={3} />
      ) : apps.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No colleges on this list yet. Add the first one below.
        </p>
      ) : (
        <ul className="space-y-2">
          {apps.map((app) => (
            <li
              key={app.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5"
            >
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

              <div className="flex shrink-0 items-center gap-2">
                <label className="sr-only" htmlFor={`status-${app.id}`}>
                  Status for {app.college_name}
                </label>
                <select
                  id={`status-${app.id}`}
                  value={app.status}
                  disabled={busyId === app.id}
                  onChange={(e) => {
                    void onChangeStatus(app, e.target.value as Status);
                  }}
                  className={`${selectClass} min-h-[40px] disabled:opacity-50`}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(app)}
                  aria-label={`Remove ${app.college_name}`}
                  className="min-h-[40px] shrink-0 rounded-md ring-1 ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add a college */}
      <form
        onSubmit={(e) => {
          void onAdd(e);
        }}
        className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4"
      >
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Add a college
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="College name"
            aria-label="College name"
            required
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <label className="sr-only" htmlFor="add-tier">
            Tier
          </label>
          <select
            id="add-tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier | "")}
            className={`${selectClass} min-h-[40px]`}
          >
            <option value="">Tier…</option>
            {TIER_OPTIONS.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="add-plan">
            Plan
          </label>
          <select
            id="add-plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value as Plan | "")}
            className={`${selectClass} min-h-[40px]`}
          >
            <option value="">Plan…</option>
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="add-deadline">
            Deadline
          </label>
          <input
            id="add-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            aria-label="Deadline"
            className={`${selectClass} min-h-[40px]`}
          />
          <button
            type="submit"
            disabled={adding || !name.trim()}
            className="min-h-[40px] shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </form>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove this college?"
          body={
            <p>
              This removes{" "}
              <span className="font-semibold">{confirmRemove.college_name}</span>{" "}
              from the student's college list.
            </p>
          }
          confirmLabel="Remove"
          destructive
          busy={removing}
          onConfirm={() => {
            void onRemove();
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </section>
  );
}
