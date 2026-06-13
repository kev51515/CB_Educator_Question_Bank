/**
 * ClassSkillsView — "Skills" tab inside ClassLayout
 * =================================================
 * Class-wide, cross-test SAT skill mastery: per-domain %-correct aggregated over
 * every full-length test the class's enrolled students have taken (latest
 * attempt per student per test). Answers "where is this class weak overall?" —
 * the cross-test generalisation of the per-test Review heatmap/comparison.
 *
 * Layers two teacher-actionable views on top of the heatmap:
 *   • "Teach next" — the class's weakest domains ranked ascending, so the teacher
 *     sees at a glance what to cover next.
 *   • Drill-down — clicking any domain reveals WHICH students are weak in it
 *     (their per-domain mastery), so the teacher can target individuals.
 *
 * Data + grouping come from useCourseSkillMastery (course_skill_mastery, 0123)
 * and useCourseSkillByStudent (course_skill_by_student, 0238). Reuses the shared
 * skill palette + helpers (fulltest/skills.ts) and CSV helper (lib/csv.ts) so it
 * matches the other skill surfaces. Empty state until a class sits a full test.
 */
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { downloadCsv } from "@/lib/csv";
import { band, sectionLabel, pctOf, type SkillDomainStat } from "@/fulltest/skills";
import { useClassContext } from "./classLayoutContext";
import {
  useCourseSkillMastery,
  useCourseSkillByStudent,
  type StudentSkillRow,
} from "./useCourseSkillMastery";

/** How many weakest domains to surface in the "Teach next" panel. */
const TEACH_NEXT_LIMIT = 5;

export function ClassSkillsView(): JSX.Element {
  const { cls } = useClassContext();
  const { loading, error, mastery, grouped, all, weakest } = useCourseSkillMastery(cls.id);
  const byStudent = useCourseSkillByStudent(cls.id);

  // The domain whose per-student drill-down is open (by domain name; domains are
  // section-exclusive so the name is a safe key — matches sectionForDomain).
  const [openDomain, setOpenDomain] = useState<string | null>(null);

  // Weakest domains ascending for the "Teach next" panel.
  const teachNext = useMemo(
    () => [...all].sort((a, b) => a.pct - b.pct).slice(0, TEACH_NEXT_LIMIT),
    [all],
  );

  // Per-student rows for the open domain, weakest-first. Each student already
  // arrives as one aggregated (student, section, domain) row from the RPC.
  const drillStudents = useMemo(() => {
    if (!openDomain) return [];
    return byStudent.rows
      .filter((r) => r.domain === openDomain)
      .map((r) => ({ ...r, pct: pctOf(r.correct, r.total) ?? 0 }))
      .sort((a, b) => a.pct - b.pct || a.student_name.localeCompare(b.student_name));
  }, [openDomain, byStudent.rows]);

  const exportCsv = () => {
    const header = ["Section", "Domain", "% correct", "Correct", "Total"];
    const body = grouped.flatMap((g) =>
      g.domains.map((d) => [sectionLabel(g.section), d.domain, d.pct, d.correct, d.total]),
    );
    downloadCsv(`class-skills-${cls.short_code ?? cls.id}.csv`, [header, ...body]);
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading class skills">
        <Skeleton className="h-8 w-64 rounded" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 rounded-lg" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900">
        {error}
      </p>
    );
  }
  if (all.length === 0) {
    return (
      <EmptyState
        icon="sparkles"
        title="No skill data yet"
        body="Once students in this class submit a full-length practice test, their per-skill mastery rolls up here."
      />
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Class skills
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Across {mastery!.tests} test{mastery!.tests === 1 ? "" : "s"} · {mastery!.students} student
            {mastery!.students === 1 ? "" : "s"} · latest attempt per test
            {weakest && (
              <>
                {" · "}weakest:{" "}
                <span
                  className="rounded px-1.5 py-0.5 font-semibold"
                  style={{ backgroundColor: band(weakest.pct).bg, color: band(weakest.pct).fg }}
                >
                  {weakest.domain} {weakest.pct}%
                </span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Teach next — weakest domains ranked ascending. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Teach next
        </h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          The class's weakest skill domains. Click one to see which students need it most.
        </p>
        <div className="space-y-2.5">
          {teachNext.map((d) => (
            <DomainRow
              key={d.domain}
              d={d}
              open={openDomain === d.domain}
              onToggle={() => setOpenDomain((cur) => (cur === d.domain ? null : d.domain))}
              section={sectionLabel(d.section)}
            >
              <DrillDown
                loading={byStudent.loading}
                error={byStudent.error}
                students={drillStudents}
              />
            </DomainRow>
          ))}
        </div>
      </div>

      {grouped.map((g) => (
        <div
          key={g.section}
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {sectionLabel(g.section)}
          </h3>
          <div className="space-y-2.5">
            {g.domains.map((d) => (
              <DomainRow
                key={d.domain}
                d={d}
                open={openDomain === d.domain}
                onToggle={() => setOpenDomain((cur) => (cur === d.domain ? null : d.domain))}
              >
                <DrillDown
                  loading={byStudent.loading}
                  error={byStudent.error}
                  students={drillStudents}
                />
              </DomainRow>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** One clickable domain mastery bar; expands to reveal its drill-down children. */
function DomainRow({
  d,
  open,
  onToggle,
  section,
  children,
}: {
  d: SkillDomainStat;
  open: boolean;
  onToggle: () => void;
  section?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800/60"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="w-44 shrink-0 truncate text-sm text-slate-700 dark:text-slate-200 sm:w-56">
          {d.domain}
          {section && (
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {section}
            </span>
          )}
        </span>
        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <span
            className="block h-full rounded-full"
            style={{ width: `${d.pct}%`, backgroundColor: band(d.pct).bg }}
          />
        </span>
        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {d.correct}/{d.total} · {d.pct}%
        </span>
      </button>
      {open && <div className="mt-2 pl-6">{children}</div>}
    </div>
  );
}

/** Per-student list for the open domain, weakest-first. */
function DrillDown({
  loading,
  error,
  students,
}: {
  loading: boolean;
  error: string | null;
  students: (StudentSkillRow & { pct: number })[];
}): JSX.Element {
  if (loading) {
    return (
      <div className="space-y-1.5" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-7 rounded" />
        ))}
      </div>
    );
  }
  if (error) {
    return <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>;
  }
  if (students.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        No students have answered questions in this domain yet.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {students.map((s) => (
        <li key={s.student_id} className="flex items-center gap-3">
          <span className="w-44 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300 sm:w-56">
            {s.student_name}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <span
              className="block h-full rounded-full"
              style={{ width: `${s.pct}%`, backgroundColor: band(s.pct).bg }}
            />
          </span>
          <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {s.correct}/{s.total} · {s.pct}%
          </span>
        </li>
      ))}
    </ul>
  );
}
