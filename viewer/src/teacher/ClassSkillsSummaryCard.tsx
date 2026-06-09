/**
 * ClassSkillsSummaryCard — compact class-skills teaser for the course Overview
 * ===========================================================================
 * Surfaces the class's weakest few SAT skill domains so a teacher sees where the
 * class needs help without navigating to the full "Skills" tab (links there for
 * the rest). Shares the data + grouping with ClassSkillsView via
 * useCourseSkillMastery. Renders nothing until the class has skill data — the
 * Overview shouldn't carry an empty card.
 */
import { Link } from "react-router-dom";
import { classPath } from "@/lib/routes";
import { band } from "@/fulltest/skills";
import { useClassContext } from "./classLayoutContext";
import { useCourseSkillMastery } from "./useCourseSkillMastery";

const TEASER_COUNT = 3;

export function ClassSkillsSummaryCard(): JSX.Element | null {
  const { cls } = useClassContext();
  const { loading, error, all, mastery } = useCourseSkillMastery(cls.id);

  // Stay invisible until there's something worth showing.
  if (loading || error || all.length === 0) return null;

  const weakest = [...all].sort((a, b) => a.pct - b.pct).slice(0, TEASER_COUNT);
  const skillsHref = `${classPath(cls.short_code)}/skills`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Class skills — focus areas
        </h2>
        <Link
          to={skillsHref}
          className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          View all skills →
        </Link>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Lowest %-correct across {mastery!.tests} test{mastery!.tests === 1 ? "" : "s"} ·{" "}
        {mastery!.students} student{mastery!.students === 1 ? "" : "s"}
      </p>
      <ul className="space-y-2">
        {weakest.map((d) => (
          <li key={d.domain} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{d.domain}</span>
            <span className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span className="block h-full rounded-full" style={{ width: `${d.pct}%`, backgroundColor: band(d.pct).bg }} />
            </span>
            <span className="w-12 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{d.pct}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
