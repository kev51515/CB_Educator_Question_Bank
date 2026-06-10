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
import { ApplicationDocsChecklist } from "./ApplicationDocsChecklist";
import {
  type CatalogCollege,
  deadlineUrgency,
  effectiveDeadline,
  formatAdmitRate,
  formatRequirements,
  formatTypeSize,
  listCatalogDeadlines,
  tierBalance,
  useCollegeCatalog,
} from "./collegeAppHelpers";

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

function matchSubtitle(m: CollegeMatch): string {
  return [m.city, m.state].filter(Boolean).join(", ");
}

// Format a YYYY-MM-DD catalog deadline as a short, year-aware label.
function shortDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type SortKey = "deadline" | "status" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "deadline", label: "Deadline" },
  { key: "status", label: "Status" },
  { key: "name", label: "Name" },
];

// Deterministic status ordering for the "status" sort (workflow order).
const STATUS_ORDER: Status[] = [
  "considering",
  "in_progress",
  "submitted",
  "waitlisted",
  "deferred",
  "accepted",
  "enrolled",
  "rejected",
];

/**
 * ApplicationBalanceHeader — the reach/target/safety/likely summary with a thin
 * proportion bar and (when unbalanced) a gentle advice line. Shared between the
 * counselor + student surfaces via the exported component below.
 */
export function ApplicationBalanceHeader({
  apps,
}: {
  apps: { tier: Tier | null }[];
}) {
  const balance = tierBalance(apps);
  if (balance.total === 0) return null;

  const SEGMENTS: { tier: Tier; count: number; bar: string }[] = [
    { tier: "reach", count: balance.reach, bar: "bg-rose-400 dark:bg-rose-500" },
    {
      tier: "target",
      count: balance.target,
      bar: "bg-indigo-400 dark:bg-indigo-500",
    },
    {
      tier: "safety",
      count: balance.safety,
      bar: "bg-emerald-400 dark:bg-emerald-500",
    },
    {
      tier: "likely",
      count: balance.likely,
      bar: "bg-amber-400 dark:bg-amber-500",
    },
  ];
  const classified = balance.reach + balance.target + balance.safety + balance.likely;

  return (
    <div className="space-y-2 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Application balance
        </span>
        {SEGMENTS.map((s) => (
          <span
            key={s.tier}
            className={`inline-flex items-center gap-1 rounded-full ring-1 px-2 py-0.5 text-[11px] font-medium capitalize ${tierChipClass(s.tier)}`}
          >
            {s.tier}
            <span className="tabular-nums font-semibold">{s.count}</span>
          </span>
        ))}
      </div>
      {classified > 0 && (
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          aria-hidden
        >
          {SEGMENTS.filter((s) => s.count > 0).map((s) => (
            <div
              key={s.tier}
              className={s.bar}
              style={{ width: `${(s.count / classified) * 100}%` }}
            />
          ))}
        </div>
      )}
      {balance.advice && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0"
            aria-hidden
          >
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <span>{balance.advice}</span>
        </p>
      )}
    </div>
  );
}

/**
 * CatalogDetail — the rich catalog block revealed when a row is expanded and the
 * application has a `college_id`. Surfaces admit rate, type/size, website, the
 * per-plan deadlines, essay prompts, and humanized requirements. Shared between
 * both surfaces via export.
 */
export function CatalogDetail({
  college,
}: {
  college: CatalogCollege | undefined;
}) {
  if (!college) {
    return (
      <p className="text-xs italic text-slate-500 dark:text-slate-400">
        No catalog details (free-text entry).
      </p>
    );
  }

  const admit = formatAdmitRate(college.admit_rate);
  const typeSize = formatTypeSize(college.type, college.size);
  const deadlines = listCatalogDeadlines(college.deadlines);
  const prompts = college.essay_prompts ?? [];
  const requirements = formatRequirements(college.requirements);

  return (
    <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {admit && (
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {admit}
            </span>
          </span>
        )}
        {typeSize && <span>{typeSize}</span>}
        {college.common_app && (
          <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-900">
            Common App
          </span>
        )}
        {college.website && (
          <a
            href={college.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Website
            <svg
              width={11}
              height={11}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <path d="M15 3h6v6M10 14 21 3" />
            </svg>
          </a>
        )}
      </div>

      {deadlines.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Deadlines
          </p>
          <div className="flex flex-wrap gap-1.5">
            {deadlines.map((d) => (
              <span
                key={d.plan}
                className="inline-flex items-center gap-1 rounded-full ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px]"
              >
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {d.plan}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {shortDate(d.date)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {prompts.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Essay prompts
          </p>
          <ul className="space-y-1">
            {prompts.map((p, i) => (
              <li
                key={i}
                className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-2 py-1.5 ring-1 ring-slate-200/70 dark:ring-slate-800"
              >
                <span className="text-slate-700 dark:text-slate-200">
                  {p.prompt}
                </span>
                {typeof p.words === "number" && p.words > 0 && (
                  <span className="ml-1 text-slate-500 dark:text-slate-400">
                    ({p.words} words)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {requirements.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Requirements
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {requirements.map((r, i) => (
              <li
                key={i}
                className="rounded-full ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!admit &&
        !typeSize &&
        deadlines.length === 0 &&
        prompts.length === 0 &&
        requirements.length === 0 && (
          <p className="italic text-slate-500 dark:text-slate-400">
            Catalog entry has no additional details yet.
          </p>
        )}
    </div>
  );
}

// A small chevron toggle used to expand/collapse a row's catalog detail.
function ExpandToggle({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} details for ${label}`}
      className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        aria-hidden
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
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
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Add-a-college form state: a typeahead against the shared `public.colleges`
  // catalog (with a free-text fallback) plus tier/plan/deadline that apply to
  // whatever the counselor adds.
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CollegeMatch[]>([]);
  const [searching, setSearching] = useState(false);
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
    () =>
      new Set(
        apps.map((a) => a.college_id).filter((id): id is string => !!id),
      ),
    [apps],
  );

  // Batch-fetch the rich catalog rows for every linked college on the list, so
  // an expanded row can surface admit rate / deadlines / essays / requirements.
  const linkedIds = useMemo(
    () => apps.map((a) => a.college_id),
    [apps],
  );
  const { byId: catalogById } = useCollegeCatalog(linkedIds);

  // Apply the active sort. `deadline` uses the effective deadline (app's own,
  // else the catalog fallback) so rows order the way the chips read.
  const sortedApps = useMemo(() => {
    const copy = [...apps];
    copy.sort((a, b) => {
      if (sortKey === "name") {
        return a.college_name.localeCompare(b.college_name);
      }
      if (sortKey === "status") {
        const ai = STATUS_ORDER.indexOf(a.status);
        const bi = STATUS_ORDER.indexOf(b.status);
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return a.college_name.localeCompare(b.college_name);
      }
      // deadline ascending, nulls last
      const ad = effectiveDeadline(a, a.college_id ? catalogById[a.college_id] : undefined);
      const bd = effectiveDeadline(b, b.college_id ? catalogById[b.college_id] : undefined);
      if (ad && bd) {
        if (ad !== bd) return ad < bd ? -1 : 1;
        return a.college_name.localeCompare(b.college_name);
      }
      if (ad) return -1;
      if (bd) return 1;
      return a.college_name.localeCompare(b.college_name);
    });
    return copy;
  }, [apps, sortKey, catalogById]);

  const toggleExpanded = (id: string): void =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

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

  const insertCollege = async (
    collegeName: string,
    collegeId: string | null,
  ): Promise<void> => {
    const trimmed = collegeName.trim();
    if (!trimmed) {
      toast.error("Add a college", "Enter a college name first.");
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("college_applications").insert({
      course_id: courseId,
      student_id: studentId,
      college_name: trimmed,
      college_id: collegeId,
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
    setQuery("");
    setMatches([]);
    setTier("");
    setPlan("");
    setDeadline("");
    toast.success(`Added ${trimmed}`);
    void load();
  };

  const selectClass =
    "rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

  const trimmedQuery = query.trim();
  const visibleMatches = matches.filter((m) => !usedCollegeIds.has(m.id));
  const showFreeText =
    !!trimmedQuery &&
    !visibleMatches.some(
      (m) => m.name.toLowerCase() === trimmedQuery.toLowerCase(),
    );

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          College list
        </h3>
        {!loading && (
          <div className="flex shrink-0 items-center gap-2">
            {apps.length > 1 && (
              <>
                <label className="sr-only" htmlFor="college-sort">
                  Sort colleges
                </label>
                <select
                  id="college-sort"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className={`${selectClass} min-h-[36px] text-xs`}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      Sort: {o.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {countLabel}
            </span>
          </div>
        )}
      </div>

      {/* Application balance summary. */}
      {!loading && apps.length > 0 && <ApplicationBalanceHeader apps={apps} />}

      {/* List */}
      {loading ? (
        <SkeletonRows count={3} />
      ) : apps.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No colleges on this list yet. Add the first one below.
        </p>
      ) : (
        <ul className="space-y-2">
          {sortedApps.map((app) => {
            const catalog = app.college_id
              ? catalogById[app.college_id]
              : undefined;
            const isOpen = !!expanded[app.id];
            const dueDate = effectiveDeadline(app, catalog);
            const urgency = deadlineUrgency(dueDate);
            return (
              <li
                key={app.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <ExpandToggle
                    expanded={isOpen}
                    onToggle={() => toggleExpanded(app.id)}
                    label={app.college_name}
                  />
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
                        {formatDeadline(dueDate)}
                      </span>
                      {urgency && (
                        <span
                          className={`shrink-0 rounded-full ring-1 px-2 py-0.5 text-[11px] font-medium ${urgency.className}`}
                        >
                          {urgency.label}
                        </span>
                      )}
                    </div>
                    {app.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {app.notes}
                      </p>
                    )}
                  </div>
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

                {/* Expanded catalog detail + per-application document
                    checklist. Mounted only when the row is expanded so each
                    row's `select('documents')` query fires lazily, not on
                    initial render (avoids an N+1 on load). */}
                {isOpen && (
                  <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-2.5">
                    <CatalogDetail college={catalog} />
                    <ApplicationDocsChecklist appId={app.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add a college — catalog typeahead with a free-text fallback. */}
      <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Add a college
        </label>
        <div className="flex flex-wrap items-center gap-2">
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
