// ─── Course filter chip row ───────────────────────────────────────────────

export interface CourseChipEntry {
  shortCode: string;
  name: string;
  count: number;
}

interface CourseChipRowProps {
  courses: CourseChipEntry[];
  totalCount: number;
  activeCourseId: string | null;
  onSelect: (shortCode: string | null) => void;
}

export function CourseChipRow({
  courses,
  totalCount,
  activeCourseId,
  onSelect,
}: CourseChipRowProps) {
  const baseChip =
    "shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full " +
    "text-xs font-medium transition-colors " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
  const activeChip =
    "bg-indigo-600 text-white dark:bg-indigo-500 " +
    "hover:bg-indigo-700 dark:hover:bg-indigo-400";
  const inactiveChip =
    "bg-white/70 dark:bg-slate-900/40 " +
    "text-slate-700 dark:text-slate-200 " +
    "ring-1 ring-slate-200/80 dark:ring-slate-700 " +
    "hover:bg-white hover:ring-indigo-200 " +
    "dark:hover:bg-slate-900 dark:hover:ring-indigo-800";

  const countBadge = (active: boolean) =>
    "inline-flex items-center justify-center min-w-[1.25rem] px-1 " +
    "h-4 rounded-full text-[10px] font-semibold " +
    (active
      ? "bg-white/25 text-white"
      : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200");

  return (
    <div
      role="group"
      aria-label="Filter by course"
      className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeCourseId === null}
        className={`${baseChip} ${activeCourseId === null ? activeChip : inactiveChip}`}
      >
        <span>All courses</span>
        <span aria-hidden className={countBadge(activeCourseId === null)}>
          {totalCount}
        </span>
      </button>
      {courses.map((course) => {
        const active = activeCourseId === course.shortCode;
        return (
          <button
            key={course.shortCode}
            type="button"
            onClick={() => onSelect(course.shortCode)}
            aria-pressed={active}
            className={`${baseChip} ${active ? activeChip : inactiveChip}`}
            title={course.name}
          >
            <span className="truncate max-w-[10rem]">{course.name}</span>
            <span aria-hidden className={countBadge(active)}>
              {course.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
