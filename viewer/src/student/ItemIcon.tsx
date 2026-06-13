import type { ModuleItemRow } from "./studentCourseHelpers";

/**
 * Sunken icon tile per item type — mirrors the educator modules page
 * (modules-page/tree.tsx ItemTypeIcon): a quiet rounded-lg tile on a
 * slate-50 ground with a 1.6px-stroke line icon inside.
 */
export function ItemIcon({ type }: { type: ModuleItemRow["item_type"] }): JSX.Element {
  const paths: Record<string, JSX.Element> = {
    assignment: (
      <>
        <path d="M5 4a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6M9 16.5h4" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L11 5" />
        <path d="M14 11a5 5 0 0 0-7.07 0L5 12.93a5 5 0 0 0 7.07 7.07L13 19" />
      </>
    ),
    page: (
      <>
        <path d="M5 4a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
        <path d="M14 2v5h5" />
      </>
    ),
    file: (
      <path d="M21.44 11.05 12.25 20.24a4 4 0 0 1-5.66-5.66l8.49-8.49a2.5 2.5 0 0 1 3.54 3.54l-8.49 8.49a1 1 0 0 1-1.41-1.41l7.78-7.78" />
    ),
    header: <path d="M4 7h16M4 12h10M4 17h7" />,
    video: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="m10 9 5 3-5 3Z" />
      </>
    ),
  };
  return (
    <span
      aria-hidden
      className="h-7 w-7 flex-none inline-flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-slate-500 dark:text-slate-400"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[15px] w-[15px]"
      >
        {paths[type] ?? paths.header}
      </svg>
    </span>
  );
}

/**
 * Sunken clock tile for full-length test links — same shape as the educator
 * modules page's "Practice Test" icon (clock face, accent ink).
 */
export function FullTestIcon(): JSX.Element {
  return (
    <span
      aria-hidden
      className="h-7 w-7 flex-none inline-flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-indigo-600 dark:text-indigo-400"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[15px] w-[15px]"
      >
        <circle cx="12" cy="13" r="7.5" />
        <path d="M12 9.5V13l2.5 2M10 2.5h4" />
      </svg>
    </span>
  );
}
