/**
 * StudentCollegeListCard
 * ======================
 * The STUDENT's view of their OWN college list — now EDITABLE. As of migration
 * 0139 students have RLS write access to their own `college_applications` rows,
 * so this card lets a student build the list themselves: search the shared
 * `public.colleges` catalog (or add a free-text name), change a college's tier
 * and status inline, and remove a college. Writes go directly to
 * `college_applications`; RLS scopes every read/write to the signed-in student.
 *
 * Conventions copied from CourseSharingControls.tsx / CollegeApplicationsPanel:
 * `@/lib/supabase`, `useToast`, the `aliveRef` mounted-guard for every
 * setState-after-await, `SkeletonRows` (with `count`), `ConfirmDialog`,
 * slate/indigo dark-mode ring-1 cards, NO emojis.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { ConfirmDialog } from "../../teacher/ConfirmDialog";

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
  college_id: string | null;
  tier: Tier | null;
  plan: Plan | null;
  deadline: string | null;
  status: Status;
  notes: string | null;
  documents: { label: string; done: boolean }[] | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CollegeMatch {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

const TIER_OPTIONS: Tier[] = ["reach", "target", "safety", "likely"];
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

function matchSubtitle(m: CollegeMatch): string {
  return [m.city, m.state].filter(Boolean).join(", ");
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<CollegeApplication | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);

  // Add-a-college form state: a typeahead against the shared catalog plus a
  // tier that applies to whatever the student adds.
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CollegeMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [addTier, setAddTier] = useState<Tier>("target");
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

  // Catalog search — debounced so we don't fire a query on every keystroke.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase
          .from("colleges")
          .select("id,name,city,state")
          .ilike("name", `%${q}%`)
          .order("name")
          .limit(8);
        if (!aliveRef.current) return;
        setSearching(false);
        if (error) {
          setMatches([]);
          return;
        }
        setMatches((data ?? []) as CollegeMatch[]);
      })();
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const count = apps.length;
  const countLabel = useMemo(
    () => `${count} ${count === 1 ? "college" : "colleges"}`,
    [count],
  );

  // Colleges already on the list (by catalog id) so we can hide dupes.
  const usedCollegeIds = useMemo(
    () => new Set(apps.map((a) => a.college_id).filter((id): id is string => !!id)),
    [apps],
  );

  const onChangeStatus = async (
    app: CollegeApplication,
    next: Status,
  ): Promise<void> => {
    if (next === app.status) return;
    setBusyId(app.id);
    const patch: { status: Status; submitted_at?: string } = { status: next };
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

  const onChangeTier = async (
    app: CollegeApplication,
    next: Tier | "",
  ): Promise<void> => {
    const value = next || null;
    if (value === app.tier) return;
    setBusyId(app.id);
    const { error } = await supabase
      .from("college_applications")
      .update({ tier: value })
      .eq("id", app.id);
    if (!aliveRef.current) return;
    setBusyId(null);
    if (error) {
      toast.error("Couldn't update tier", error.message);
      return;
    }
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

  const insertCollege = async (
    collegeName: string,
    collegeId: string | null,
  ): Promise<void> => {
    const trimmed = collegeName.trim();
    if (!trimmed) return;
    setAdding(true);
    const { error } = await supabase.from("college_applications").insert({
      course_id: courseId,
      student_id: studentId,
      college_name: trimmed,
      college_id: collegeId,
      tier: addTier,
      status: "considering",
    });
    if (!aliveRef.current) return;
    setAdding(false);
    if (error) {
      toast.error("Couldn't add college", error.message);
      return;
    }
    setQuery("");
    setMatches([]);
    toast.success(`Added ${trimmed}`);
    void load();
  };

  const selectClass =
    "rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

  const trimmedQuery = query.trim();
  const visibleMatches = matches.filter((m) => !usedCollegeIds.has(m.id));
  const showFreeText =
    !!trimmedQuery &&
    !visibleMatches.some((m) => m.name.toLowerCase() === trimmedQuery.toLowerCase());

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

      {/* List */}
      {loading ? (
        <SkeletonRows count={3} />
      ) : apps.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Build your list — search for a college above to add it.
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

              <div className="flex shrink-0 items-center gap-2">
                <label className="sr-only" htmlFor={`tier-${app.id}`}>
                  Tier for {app.college_name}
                </label>
                <select
                  id={`tier-${app.id}`}
                  value={app.tier ?? ""}
                  disabled={busyId === app.id}
                  onChange={(e) => {
                    void onChangeTier(app, e.target.value as Tier | "");
                  }}
                  className={`${selectClass} min-h-[40px] capitalize disabled:opacity-50`}
                >
                  <option value="">Tier…</option>
                  {TIER_OPTIONS.map((t) => (
                    <option key={t} value={t} className="capitalize">
                      {t}
                    </option>
                  ))}
                </select>
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
      <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Add a college
          </label>
          <label className="sr-only" htmlFor="add-tier">
            Tier for new college
          </label>
          <select
            id="add-tier"
            value={addTier}
            onChange={(e) => setAddTier(e.target.value as Tier)}
            className={`${selectClass} ml-auto min-h-[36px] capitalize`}
          >
            {TIER_OPTIONS.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a college by name…"
          aria-label="Search for a college to add"
          disabled={adding}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        />
        {trimmedQuery && (
          <div className="max-h-60 overflow-auto rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {searching && visibleMatches.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                Searching…
              </p>
            ) : (
              <>
                {visibleMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={adding}
                    onClick={() => {
                      void insertCollege(m.name, m.id);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {m.name}
                      </span>
                      {matchSubtitle(m) && (
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {matchSubtitle(m)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      Add
                    </span>
                  </button>
                ))}
                {showFreeText && (
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => {
                      void insertCollege(trimmedQuery, null);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-300">
                      Add &ldquo;{trimmedQuery}&rdquo;
                    </span>
                    <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {adding ? "Adding…" : "Add"}
                    </span>
                  </button>
                )}
                {!searching && visibleMatches.length === 0 && !showFreeText && (
                  <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    No matching colleges.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove this college?"
          body={
            <p>
              This removes{" "}
              <span className="font-semibold">{confirmRemove.college_name}</span>{" "}
              from your college list.
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
