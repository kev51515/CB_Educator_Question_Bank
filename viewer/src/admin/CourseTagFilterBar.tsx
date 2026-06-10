/**
 * CourseTagFilterBar — a row of tag chips that filter the grid (any-of). A
 * "Manage" toggle turns each chip into a deletable one (delete removes the tag
 * everywhere via the org hook's cascade). Renders nothing when there are no
 * tags yet — tags are born from a course's "Tags & folder…" dialog.
 */
import { useState } from "react";
import { colorClasses, type CourseTag } from "./courseOrg";

interface Props {
  tags: CourseTag[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
  onDelete: (id: string) => void;
}

export function CourseTagFilterBar({ tags, selected, onToggle, onClear, onDelete }: Props): JSX.Element | null {
  const [managing, setManaging] = useState(false);
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Tags
      </span>
      {tags.map((t) => {
        const c = colorClasses(t.color);
        const on = selected.has(t.id);
        return (
          <span key={t.id} className="inline-flex">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => (managing ? onDelete(t.id) : onToggle(t.id))}
              title={managing ? `Delete tag “${t.name}”` : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
                managing
                  ? "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
                  : on
                    ? c.chip
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${c.dot}`} />
              {t.name}
              {managing ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : on ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : null}
            </button>
          </span>
        );
      })}

      {selected.size > 0 && !managing && (
        <button
          type="button"
          onClick={onClear}
          className="ml-0.5 text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={() => setManaging((v) => !v)}
        className={`ml-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
          managing
            ? "bg-rose-600 text-white"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        }`}
      >
        {managing ? "Done" : "Manage"}
      </button>
    </div>
  );
}
