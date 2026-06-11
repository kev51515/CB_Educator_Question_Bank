/**
 * modules-page/inline-add/practicetest-ui
 * =======================================
 * Presentational pieces for the Practice-Test picker section of
 * InlineAddItemRow. Extracted verbatim from the pre-split inline-add.tsx — no
 * behavior change.
 */
import { ROUTES } from "@/lib/routes";
import { SmartDatePicker } from "@/components";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/Skeleton";
import type { PracticeTestSelection } from "./practicetest-hooks";

interface PracticeTestSectionProps {
  pt: PracticeTestSelection;
  title: string;
  setTitle: (v: string) => void;
  busy: boolean;
  chipClass: (active: boolean) => string;
  showOverrideTitle: boolean;
  setShowOverrideTitle: (v: boolean) => void;
  titleRef: React.MutableRefObject<HTMLInputElement | null>;
  navigate: (to: string) => void;
}

export function PracticeTestSection({
  pt,
  title,
  setTitle,
  busy,
  chipClass,
  showOverrideTitle,
  setShowOverrideTitle,
  titleRef,
  navigate,
}: PracticeTestSectionProps) {
  const {
    ptLibrary,
    ptLibraryLoading,
    ptLibraryError,
    ptTemplateId,
    setPtTemplateId,
    ptDueAt,
    setPtDueAt,
    ptQuery,
    setPtQuery,
    ptSourceFilter,
    setPtSourceFilter,
    ptCourseFilter,
    setPtCourseFilter,
    ptHighlightIdx,
    setPtHighlightIdx,
    ptListRef,
    ptLibraryCourses,
    filteredPtLibrary,
    ptSourceLabel,
  } = pt;

  return (
    <div className="space-y-2">
      {/* When the teacher has zero practice tests anywhere, the picker
          is meaningless. Render an EmptyState CTA that points them at
          the Question Bank Practice Tests tab. The chip row above
          stays visible so they can switch to another type without
          backtracking. */}
      {!ptLibraryLoading && !ptLibraryError && ptLibrary.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="No practice tests yet"
          body="Practice Tests live in the Question Bank. Author one there first, then come back to assign it."
          cta={{
            label: "Open Question Bank",
            onClick: () => navigate(`${ROUTES.QUESTION_BANK}?tab=practice-tests`),
          }}
          framed
        />
      ) : (
        <>
          {/* Source filter pills — narrows by template's source_id. */}
          <div>
            <span className="block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
              Source
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setPtSourceFilter("all")}
                aria-pressed={ptSourceFilter === "all"}
                disabled={busy}
                className={chipClass(ptSourceFilter === "all")}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setPtSourceFilter("cb")}
                aria-pressed={ptSourceFilter === "cb"}
                disabled={busy}
                className={chipClass(ptSourceFilter === "cb")}
              >
                CB
              </button>
              <button
                type="button"
                onClick={() => setPtSourceFilter("sat")}
                aria-pressed={ptSourceFilter === "sat"}
                disabled={busy}
                className={chipClass(ptSourceFilter === "sat")}
              >
                SAT
              </button>
              <button
                type="button"
                onClick={() => setPtSourceFilter("mixed")}
                aria-pressed={ptSourceFilter === "mixed"}
                disabled={busy}
                className={chipClass(ptSourceFilter === "mixed")}
              >
                Mixed
              </button>
            </div>
          </div>

          {/* Course filter pills — only shown when the teacher actually
              owns tests in >1 course. Single-course teachers don't need
              to see this row. */}
          {ptLibraryCourses.length > 1 && (
            <div>
              <span className="block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                Course
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPtCourseFilter("all")}
                  aria-pressed={ptCourseFilter === "all"}
                  disabled={busy}
                  className={chipClass(ptCourseFilter === "all")}
                >
                  All
                </button>
                {ptLibraryCourses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPtCourseFilter(c.id)}
                    aria-pressed={ptCourseFilter === c.id}
                    disabled={busy}
                    className={chipClass(ptCourseFilter === c.id)}
                    title={c.name}
                  >
                    <span className="truncate inline-block max-w-[140px] align-bottom">
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Type-to-filter input + ↑/↓ Enter Esc keyboard nav. */}
          <input
            ref={titleRef}
            type="text"
            value={ptQuery}
            onChange={(e) => setPtQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setPtHighlightIdx((idx) =>
                  Math.min(filteredPtLibrary.length - 1, idx + 1),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setPtHighlightIdx((idx) => Math.max(0, idx - 1));
              } else if (e.key === "Enter") {
                if (filteredPtLibrary.length > 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  const chosen = filteredPtLibrary[ptHighlightIdx];
                  if (chosen) setPtTemplateId(chosen.id);
                }
              } else if (e.key === "Escape" && ptQuery) {
                // Spec: Esc clears the query when non-empty; the
                // form-level Esc handler cancels otherwise.
                e.preventDefault();
                e.stopPropagation();
                setPtQuery("");
              }
            }}
            placeholder="Filter your practice tests…"
            disabled={busy}
            aria-label="Filter your practice tests"
            className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {/* Result list — error / skeletons / empty / rows. */}
          <div
            ref={ptListRef}
            className="max-h-60 overflow-y-auto rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900"
            role="listbox"
            aria-label="Your practice tests"
          >
            {ptLibraryError ? (
              <div className="p-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-950/30">
                Couldn't load practice tests: {ptLibraryError}
              </div>
            ) : ptLibraryLoading ? (
              <div className="p-2">
                <SkeletonRows count={4} rowClassName="h-10" gap={6} />
              </div>
            ) : filteredPtLibrary.length === 0 ? (
              <div className="p-4 text-sm text-center text-slate-500 dark:text-slate-400">
                <div>No practice tests match these filters.</div>
                <button
                  type="button"
                  onClick={() => {
                    setPtSourceFilter("all");
                    setPtCourseFilter("all");
                    setPtQuery("");
                  }}
                  className="mt-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <ul className="py-1">
                {filteredPtLibrary.map((t, idx) => {
                  const selected = ptTemplateId === t.id;
                  const highlighted = idx === ptHighlightIdx;
                  const sourceKey = t.source_id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPtTemplateId(t.id);
                          setPtHighlightIdx(idx);
                        }}
                        onMouseEnter={() => setPtHighlightIdx(idx)}
                        role="option"
                        aria-selected={selected}
                        className={
                          "w-full text-left px-2 py-2 text-sm flex items-center gap-2 min-h-[40px] " +
                          (selected
                            ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-100"
                            : highlighted
                              ? "bg-indigo-50 dark:bg-indigo-950/30 text-slate-900 dark:text-slate-100"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800")
                        }
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{t.title}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="truncate" title={t.course.name}>
                              {t.course.name}
                            </span>
                            <span aria-hidden>·</span>
                            <span className="tabular-nums shrink-0">
                              {t.time_limit_minutes}m · {t.question_count}q
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                          {ptSourceLabel[sourceKey]}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Due date — full-width row so SmartDatePicker preset pills
              don't wrap. */}
          <div className="block">
            <SmartDatePicker
              label="Due date (optional)"
              value={ptDueAt}
              onChange={setPtDueAt}
              allowClear
            />
          </div>

          {/* Override display title hidden behind a disclosure. */}
          <details
            className="text-[12px] text-slate-600 dark:text-slate-300"
            open={showOverrideTitle}
            onToggle={(e) =>
              setShowOverrideTitle((e.target as HTMLDetailsElement).open)
            }
          >
            <summary className="cursor-pointer select-none text-indigo-600 dark:text-indigo-400 hover:underline">
              + Override display title
            </summary>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Display title in module (optional)"
              disabled={busy}
              className="mt-1.5 w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </details>
        </>
      )}
    </div>
  );
}
