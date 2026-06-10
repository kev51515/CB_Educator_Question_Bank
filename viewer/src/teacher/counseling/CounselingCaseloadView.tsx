/**
 * CounselingCaseloadView — the course-level "Caseload" dashboard for a
 * counseling course. One roll-up across every enrolled student: application
 * progress, upcoming deadlines, open/overdue tasks, last meeting. Each row
 * deep-links into that student's counseling workspace.
 *
 * Counseling-only tab (gated in ClassLayout). Reads the counseling_caseload
 * RPC (0135) via useCounselingCaseload.
 *
 * Wave 22 enhancement: turned the totals strip into an at-a-glance analytics
 * dashboard — a status pipeline bar, a plan-distribution mini display, a
 * highlighted 14-day-deadline card, per-student at-risk flagging, richer
 * filters/sorts, and a no-deps CSV export. All additive: the original
 * clickable stat cards, status chips, filter/sort, and localStorage
 * persistence are preserved.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useClassContext } from "../classLayoutContext";
import { CaseloadDeadlinesTimeline } from "./CaseloadDeadlinesTimeline";
import { courseStudentProfilePath, coursePeoplePath } from "@/lib/routes";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components";
import {
  useCounselingCaseload,
  type CaseloadStudent,
} from "./useCounselingCaseload";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  // Parse a plain YYYY-MM-DD at local noon to avoid a TZ off-by-one.
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return "—";
  return new Date(y, m - 1, day, 12).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Days between today and a YYYY-MM-DD date (positive = future). null-safe. */
function daysFromToday(d: string | null): number | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return null;
  const target = new Date(y, m - 1, day, 12).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime();
  return Math.round((target - today) / 86_400_000);
}

const STATUS_ORDER = [
  "considering",
  "in_progress",
  "submitted",
  "accepted",
  "enrolled",
  "waitlisted",
  "deferred",
  "rejected",
] as const;

const STATUS_LABEL: Record<string, string> = {
  considering: "Considering",
  in_progress: "In progress",
  submitted: "Submitted",
  accepted: "Accepted",
  enrolled: "Enrolled",
  waitlisted: "Waitlisted",
  deferred: "Deferred",
  rejected: "Rejected",
};

// The four headline pipeline stages, in funnel order, plus an aggregated
// "Outcomes" bucket for everything terminal/other.
const PIPELINE_STAGES = [
  { key: "considering", label: "Considering", fill: "bg-slate-400 dark:bg-slate-500" },
  { key: "in_progress", label: "In progress", fill: "bg-indigo-500 dark:bg-indigo-500" },
  { key: "submitted", label: "Submitted", fill: "bg-sky-500 dark:bg-sky-500" },
  { key: "accepted", label: "Accepted", fill: "bg-emerald-500 dark:bg-emerald-500" },
  { key: "other", label: "Other outcomes", fill: "bg-amber-500 dark:bg-amber-500" },
] as const;
const OTHER_STATUSES = ["enrolled", "waitlisted", "deferred", "rejected"] as const;

// Plan distribution display order.
const PLAN_ORDER = ["ED", "ED2", "EA", "REA", "RD", "rolling"] as const;
const PLAN_LABEL: Record<string, string> = {
  ED: "ED",
  ED2: "ED II",
  EA: "EA",
  REA: "REA",
  RD: "RD",
  rolling: "Rolling",
};

function StatCard({
  label,
  value,
  hint,
  tone = "slate",
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "slate" | "rose" | "indigo";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneClass =
    tone === "rose"
      ? "text-rose-700 dark:text-rose-300"
      : tone === "indigo"
        ? "text-indigo-700 dark:text-indigo-300"
        : "text-slate-900 dark:text-slate-100";
  const base = `rounded-xl ring-1 px-4 py-3 text-left transition-colors ${
    active
      ? "ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
      : "ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900"
  }`;
  const body = (
    <>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      {hint && <div className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</div>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`${base} block w-full min-h-[40px] hover:ring-indigo-400 dark:hover:ring-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

type SortKey =
  | "name"
  | "applications"
  | "accepted"
  | "deadline"
  | "docs"
  | "tasks"
  | "meeting";
type CaseloadFilter =
  | "all"
  | "attention"
  | "missing_docs"
  | "deadline_soon"
  | "at_risk"
  | "overdue_tasks"
  | "no_meeting_30d";

// Per-student "at risk" reasons. Stale-meeting threshold (days).
const STALE_MEETING_DAYS = 30;

interface RiskInfo {
  atRisk: boolean;
  reasons: string[];
}

function computeRisk(s: CaseloadStudent): RiskInfo {
  const reasons: string[] = [];
  if (s.tasks_overdue > 0) {
    reasons.push(s.tasks_overdue === 1 ? "1 overdue task" : `${s.tasks_overdue} overdue tasks`);
  }
  if (s.docs_missing > 0) {
    reasons.push(s.docs_missing === 1 ? "1 doc missing" : `${s.docs_missing} docs missing`);
  }
  const meetingAge = daysFromToday(s.last_meeting);
  if (meetingAge === null) {
    reasons.push("no meeting yet");
  } else if (-meetingAge > STALE_MEETING_DAYS) {
    // meetingAge is negative for past dates; -meetingAge = days since.
    reasons.push(`no meeting in ${-meetingAge}d`);
  }
  return { atRisk: reasons.length > 0, reasons };
}

// Persist the counselor's preferred caseload view (filter + sort) per device,
// per the project's "persist filter selections" UX bar.
const PREF_KEY = "staff.caseload.view";
const FILTERS_SET = new Set<CaseloadFilter>([
  "all",
  "attention",
  "missing_docs",
  "deadline_soon",
  "at_risk",
  "overdue_tasks",
  "no_meeting_30d",
]);
const SORTKEYS_SET = new Set<SortKey>([
  "name", "applications", "accepted", "deadline", "docs", "tasks", "meeting",
]);
function readPref(): { filter: CaseloadFilter; sortKey: SortKey; sortDir: "asc" | "desc" } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    return {
      filter: FILTERS_SET.has(p.filter) ? p.filter : "all",
      sortKey: SORTKEYS_SET.has(p.sortKey) ? p.sortKey : "name",
      sortDir: p.sortDir === "desc" ? "desc" : "asc",
    };
  } catch {
    return { filter: "all", sortKey: "name", sortDir: "asc" };
  }
}

/** Quote a CSV cell (RFC-4180-ish): wrap + double internal quotes when needed. */
function csvCell(v: string | number | null): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function CounselingCaseloadView() {
  const { cls } = useClassContext();
  const toast = useToast();
  const { data, loading, error } = useCounselingCaseload(cls.id);

  const totals = data?.totals;
  const students = useMemo(() => data?.students ?? [], [data?.students]);

  const statusChips = useMemo(() => {
    const by = totals?.by_status ?? {};
    return STATUS_ORDER.filter((s) => (by[s] ?? 0) > 0).map((s) => ({
      key: s,
      label: STATUS_LABEL[s] ?? s,
      count: by[s] ?? 0,
    }));
  }, [totals?.by_status]);

  // ── Status pipeline segments (considering → in_progress → submitted →
  // accepted, plus aggregated "other outcomes"). ─────────────────────────────
  const pipeline = useMemo(() => {
    const by = totals?.by_status ?? {};
    const segs = PIPELINE_STAGES.map((stage) => {
      const count =
        stage.key === "other"
          ? OTHER_STATUSES.reduce((sum, k) => sum + (by[k] ?? 0), 0)
          : by[stage.key] ?? 0;
      return { ...stage, count };
    });
    const total = segs.reduce((sum, s) => sum + s.count, 0);
    return { segs, total };
  }, [totals?.by_status]);

  // ── Plan distribution (ED/ED2/EA/REA/RD/rolling + any extra keys). ─────────
  const plans = useMemo(() => {
    const by = totals?.by_plan ?? {};
    const known = PLAN_ORDER.filter((p) => (by[p] ?? 0) > 0).map((p) => ({
      key: p as string,
      label: PLAN_LABEL[p] ?? p,
      count: by[p] ?? 0,
    }));
    const extra = Object.keys(by)
      .filter((k) => !PLAN_ORDER.includes(k as (typeof PLAN_ORDER)[number]) && (by[k] ?? 0) > 0)
      .map((k) => ({ key: k, label: PLAN_LABEL[k] ?? k, count: by[k] ?? 0 }));
    const list = [...known, ...extra];
    const max = list.reduce((m, p) => Math.max(m, p.count), 0);
    return { list, max };
  }, [totals?.by_plan]);

  // ── Per-student risk map + aggregate count. ───────────────────────────────
  const riskById = useMemo(() => {
    const map = new Map<string, RiskInfo>();
    for (const s of students) map.set(s.id, computeRisk(s));
    return map;
  }, [students]);
  const atRiskCount = useMemo(() => {
    let n = 0;
    for (const r of riskById.values()) if (r.atRisk) n++;
    return n;
  }, [riskById]);

  const [filter, setFilter] = useState<CaseloadFilter>(() => readPref().filter);
  const [sortKey, setSortKey] = useState<SortKey>(() => readPref().sortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => readPref().sortDir);
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ filter, sortKey, sortDir }));
    } catch {
      /* ignore */
    }
  }, [filter, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const displayed = useMemo(() => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 14);
    const soonStr = soon.toISOString().slice(0, 10);
    const filtered = students.filter((s) => {
      const risk = riskById.get(s.id);
      const meetingAge = daysFromToday(s.last_meeting);
      const noMeeting30d = meetingAge === null || -meetingAge > STALE_MEETING_DAYS;
      switch (filter) {
        case "missing_docs": return s.docs_missing > 0;
        case "attention": return s.docs_missing > 0 || s.tasks_overdue > 0;
        case "deadline_soon": return !!s.next_deadline && s.next_deadline <= soonStr;
        case "at_risk": return !!risk?.atRisk;
        case "overdue_tasks": return s.tasks_overdue > 0;
        case "no_meeting_30d": return noMeeting30d;
        default: return true;
      }
    });
    const dir = sortDir === "asc" ? 1 : -1;
    // Dates: nulls always sort last, regardless of direction.
    const byDate = (a: string | null, b: string | null): number => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return (a < b ? -1 : a > b ? 1 : 0) * dir;
    };
    const name = (s: CaseloadStudent) => (s.display_name?.trim() || s.email);
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name": return name(a).localeCompare(name(b)) * dir;
        case "applications": return (a.applications_total - b.applications_total) * dir;
        case "accepted": return (a.applications_accepted - b.applications_accepted) * dir;
        case "deadline": return byDate(a.next_deadline, b.next_deadline);
        case "docs": return (a.docs_missing - b.docs_missing) * dir;
        case "tasks": return (a.tasks_open - b.tasks_open) * dir;
        case "meeting": return byDate(a.last_meeting, b.last_meeting);
        default: return 0;
      }
    });
  }, [students, filter, sortKey, sortDir, riskById]);

  // ── CSV export of the per-student table (respects current filter+sort). ────
  const exportCsv = () => {
    if (displayed.length === 0) {
      toast.info("Nothing to export for this filter.");
      return;
    }
    try {
      const header = [
        "Student",
        "Email",
        "Applications total",
        "Applications submitted",
        "Applications accepted",
        "Next deadline",
        "Open tasks",
        "Overdue tasks",
        "Docs missing",
        "Last meeting",
        "At risk",
        "Risk reasons",
      ];
      const rows = displayed.map((s) => {
        const risk = riskById.get(s.id);
        return [
          csvCell(s.display_name?.trim() || s.email),
          csvCell(s.email),
          csvCell(s.applications_total),
          csvCell(s.applications_submitted),
          csvCell(s.applications_accepted),
          csvCell(s.next_deadline),
          csvCell(s.tasks_open),
          csvCell(s.tasks_overdue),
          csvCell(s.docs_missing),
          csvCell(s.last_meeting),
          csvCell(risk?.atRisk ? "yes" : "no"),
          csvCell(risk?.reasons.join("; ") ?? ""),
        ].join(",");
      });
      // Prepend a BOM so Excel reads UTF-8 correctly.
      const csv = "﻿" + [header.map(csvCell).join(","), ...rows].join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      const safeName = (cls.short_code || "course").replace(/[^A-Za-z0-9_-]/g, "");
      a.href = url;
      a.download = `caseload-${safeName}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${displayed.length} student${displayed.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error("Couldn't export the caseload", e instanceof Error ? e.message : undefined);
    }
  };

  const sortTh = (label: string, key: SortKey) => (
    <th className="px-4 py-2.5 font-medium">
      <button
        type="button"
        onClick={() => onSort(key)}
        className="inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        {label}
        <svg
          width={10}
          height={10}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`transition ${sortKey === key ? "opacity-100" : "opacity-0"} ${
            sortKey === key && sortDir === "asc" ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </th>
  );

  const FILTERS: { value: CaseloadFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "at_risk", label: "At risk" },
    { value: "overdue_tasks", label: "Has overdue tasks" },
    { value: "no_meeting_30d", label: "No meeting 30d" },
    { value: "attention", label: "Needs attention" },
    { value: "deadline_soon", label: "Deadline soon" },
    { value: "missing_docs", label: "Missing docs" },
  ];

  // Must list EVERY SortKey the column-header buttons can set, else the <select>
  // renders blank when a header sets a key with no matching <option>.
  const SORTS: { value: SortKey; label: string }[] = [
    { value: "name", label: "Name" },
    { value: "applications", label: "Applications" },
    { value: "accepted", label: "Accepted" },
    { value: "deadline", label: "Next deadline" },
    { value: "docs", label: "Docs missing" },
    { value: "tasks", label: "Open tasks" },
    { value: "meeting", label: "Last meeting" },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Caseload
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          College-application progress, deadlines, and tasks across every student
          in this counseling course.
        </p>
      </header>

      {/* "Who has what due when" — every student's upcoming deadlines in order. */}
      <CaseloadDeadlinesTimeline courseId={cls.id} />

      {error && (
        <p className="rounded-lg bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-200 dark:ring-rose-900 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          Couldn't load the caseload: {error}
        </p>
      )}

      {loading ? (
        <SkeletonRows count={5} />
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Students" value={totals?.students ?? 0} />
            <StatCard label="Applications" value={totals?.applications ?? 0} />
            <StatCard
              label="Due in 14 days"
              value={totals?.upcoming_deadlines_14d ?? 0}
              tone={(totals?.upcoming_deadlines_14d ?? 0) > 0 ? "indigo" : "slate"}
              onClick={() => setFilter((f) => (f === "deadline_soon" ? "all" : "deadline_soon"))}
              active={filter === "deadline_soon"}
            />
            <StatCard
              label="Docs missing"
              value={totals?.docs_missing ?? 0}
              tone={(totals?.docs_missing ?? 0) > 0 ? "rose" : "slate"}
              onClick={() => setFilter((f) => (f === "missing_docs" ? "all" : "missing_docs"))}
              active={filter === "missing_docs"}
            />
            <StatCard label="Open tasks" value={totals?.tasks_open ?? 0} />
            <StatCard
              label="Overdue tasks"
              value={totals?.tasks_overdue ?? 0}
              tone={(totals?.tasks_overdue ?? 0) > 0 ? "rose" : "slate"}
              onClick={() => setFilter((f) => (f === "overdue_tasks" ? "all" : "overdue_tasks"))}
              active={filter === "overdue_tasks"}
            />
          </div>

          {/* Analytics row: pipeline + side cards. Only meaningful with data. */}
          {students.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Application pipeline */}
              <section className="lg:col-span-2 rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Application pipeline
                  </h3>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {pipeline.total} application{pipeline.total === 1 ? "" : "s"}
                  </span>
                </div>
                {pipeline.total === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No applications tracked yet — add colleges to a student's list to
                    populate the pipeline.
                  </p>
                ) : (
                  <>
                    <div
                      className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                      role="img"
                      aria-label={`Application pipeline: ${pipeline.segs
                        .filter((s) => s.count > 0)
                        .map((s) => `${s.count} ${s.label}`)
                        .join(", ")}`}
                    >
                      {pipeline.segs.map((seg) =>
                        seg.count > 0 ? (
                          <div
                            key={seg.key}
                            className={seg.fill}
                            style={{ width: `${(seg.count / pipeline.total) * 100}%` }}
                            title={`${seg.label}: ${seg.count}`}
                          />
                        ) : null,
                      )}
                    </div>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {pipeline.segs.map((seg) => (
                        <li
                          key={seg.key}
                          className={`inline-flex items-center gap-1.5 text-xs ${
                            seg.count > 0
                              ? "text-slate-600 dark:text-slate-300"
                              : "text-slate-400 dark:text-slate-600"
                          }`}
                        >
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-sm ${seg.fill}`}
                            aria-hidden
                          />
                          {seg.label}
                          <span className="font-semibold tabular-nums">{seg.count}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {/* Side stack: at-risk + 14-day deadlines highlight. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                <button
                  type="button"
                  aria-pressed={filter === "at_risk"}
                  onClick={() => setFilter((f) => (f === "at_risk" ? "all" : "at_risk"))}
                  className={`rounded-2xl ring-1 p-4 text-left transition-colors min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    filter === "at_risk"
                      ? "ring-rose-400 dark:ring-rose-600 bg-rose-50 dark:bg-rose-950/40"
                      : atRiskCount > 0
                        ? "ring-rose-200 dark:ring-rose-900 bg-rose-50/60 dark:bg-rose-950/20 hover:ring-rose-300 dark:hover:ring-rose-700"
                        : "ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 hover:ring-indigo-400 dark:hover:ring-indigo-700"
                  }`}
                >
                  <div
                    className={`text-2xl font-bold ${
                      atRiskCount > 0
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {atRiskCount}
                  </div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Students at risk
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">
                    Overdue tasks, missing docs, or no recent meeting
                  </div>
                </button>

                <div
                  className={`rounded-2xl ring-1 p-4 ${
                    (totals?.upcoming_deadlines_14d ?? 0) > 0
                      ? "ring-indigo-200 dark:ring-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/30"
                      : "ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg
                      width={18}
                      height={18}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className={
                        (totals?.upcoming_deadlines_14d ?? 0) > 0
                          ? "text-indigo-600 dark:text-indigo-300"
                          : "text-slate-400 dark:text-slate-500"
                      }
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    <div
                      className={`text-2xl font-bold ${
                        (totals?.upcoming_deadlines_14d ?? 0) > 0
                          ? "text-indigo-700 dark:text-indigo-300"
                          : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {totals?.upcoming_deadlines_14d ?? 0}
                    </div>
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Deadlines in next 14 days
                  </div>
                  {plans.list.length > 0 && (
                    <div className="mt-3 border-t border-slate-200 dark:border-slate-800 pt-3 space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        By plan
                      </div>
                      {plans.list.map((p) => (
                        <div key={p.key} className="flex items-center gap-2">
                          <span className="w-12 shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {p.label}
                          </span>
                          <span className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <span
                              className="block h-full rounded-full bg-indigo-400 dark:bg-indigo-500"
                              style={{
                                width: `${plans.max > 0 ? (p.count / plans.max) * 100 : 0}%`,
                              }}
                            />
                          </span>
                          <span className="w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                            {p.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Status breakdown chips (full granularity) */}
          {statusChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {statusChips.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  {c.label}
                  <span className="rounded-full bg-white dark:bg-slate-900 px-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {c.count}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Per-student table */}
          {students.length === 0 ? (
            <div className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/60 dark:bg-slate-900/40 p-8 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                No students enrolled yet — add students to start building their
                college lists and tracking applications.
              </p>
              <Link
                to={coursePeoplePath(cls.short_code)}
                className="inline-flex items-center rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 min-h-[40px]"
              >
                Go to Roster
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Filters + sort + export */}
              <div className="flex flex-wrap items-center gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={filter === f.value}
                    onClick={() => setFilter(f.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      filter === f.value
                        ? "bg-indigo-600 text-white ring-indigo-600"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}

                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {displayed.length} of {students.length}
                </span>

                {/* Right-aligned: sort selector + CSV export */}
                <div className="ml-auto flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="hidden sm:inline">Sort</span>
                    <select
                      value={sortKey}
                      onChange={(e) => {
                        setSortKey(e.target.value as SortKey);
                        setSortDir("asc");
                      }}
                      className="rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      {SORTS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}`}
                    title={sortDir === "asc" ? "Ascending" : "Descending"}
                    className="inline-flex items-center justify-center rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className={`transition ${sortDir === "asc" ? "rotate-180" : ""}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="inline-flex items-center gap-1.5 rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <path d="M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Export CSV
                  </button>
                </div>
              </div>

              {displayed.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No students match this filter.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <tr>
                        {sortTh("Student", "name")}
                        {sortTh("Applications", "applications")}
                        {sortTh("Accepted", "accepted")}
                        {sortTh("Next deadline", "deadline")}
                        {sortTh("Docs", "docs")}
                        {sortTh("Tasks", "tasks")}
                        {sortTh("Last meeting", "meeting")}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {displayed.map((s: CaseloadStudent) => {
                        const risk = riskById.get(s.id);
                        return (
                          <tr
                            key={s.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  to={courseStudentProfilePath(cls.short_code, s.id)}
                                  className="font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
                                >
                                  {s.display_name?.trim() || s.email}
                                </Link>
                                {risk?.atRisk && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950/50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                                    title={risk.reasons.join(" • ")}
                                  >
                                    <svg
                                      width={10}
                                      height={10}
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={3}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden
                                    >
                                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                                      <path d="M12 9v4M12 17h.01" />
                                    </svg>
                                    At risk
                                  </span>
                                )}
                              </div>
                              {risk?.atRisk && (
                                <div className="mt-0.5 text-[11px] text-rose-600/80 dark:text-rose-400/80">
                                  {risk.reasons.join(" • ")}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                              {s.applications_submitted}/{s.applications_total} submitted
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                              {s.applications_accepted > 0 ? s.applications_accepted : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                              {fmtDate(s.next_deadline)}
                            </td>
                            <td className="px-4 py-2.5">
                              {s.docs_missing > 0 ? (
                                <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                  {s.docs_missing} missing
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-slate-700 dark:text-slate-200">
                                {s.tasks_open} open
                              </span>
                              {s.tasks_overdue > 0 && (
                                <span className="ml-1.5 rounded-full bg-rose-100 dark:bg-rose-950/50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                                  {s.tasks_overdue} overdue
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                              {fmtDate(s.last_meeting)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
