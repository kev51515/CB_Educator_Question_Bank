/**
 * modules-page/inline-add/questionset-ui
 * ======================================
 * Presentational pieces for the Question-Set picker section of
 * InlineAddItemRow. Extracted verbatim from the pre-split inline-add.tsx — no
 * behavior change.
 */
import { SmartDatePicker } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { computeDefaultQbankTimeLimit } from "../persistence";
import type { QuestionSetSelection } from "./questionset-hooks";

interface QuestionSetSectionProps {
  qs: QuestionSetSelection;
  title: string;
  setTitle: (v: string) => void;
  busy: boolean;
  chipClass: (active: boolean) => string;
  showOverrideTitle: boolean;
  setShowOverrideTitle: (v: boolean) => void;
  titleRef: React.MutableRefObject<HTMLInputElement | null>;
}

export function QuestionSetSection({
  qs,
  title,
  setTitle,
  busy,
  chipClass,
  showOverrideTitle,
  setShowOverrideTitle,
  titleRef,
}: QuestionSetSectionProps) {
  const {
    catalogLoading,
    catalogError,
    refreshCatalog,
    catalogOptions,
    psSetUid,
    setPsSetUid,
    psTitle,
    setPsTitle,
    setPsTitleDirty,
    psDueAt,
    setPsDueAt,
    psSectionFilter,
    setPsSectionFilter,
    psDifficultyFilter,
    setPsDifficultyFilter,
    psQuery,
    setPsQuery,
    psHighlightIdx,
    setPsHighlightIdx,
    psListRef,
    filteredCatalog,
  } = qs;

  return (
    <div className="space-y-2">
      {/* Filter pill rows — Section + Difficulty (2d). */}
      <div className="space-y-1.5">
        <div>
          <span className="block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            Section
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPsSectionFilter("all")}
              aria-pressed={psSectionFilter === "all"}
              className={chipClass(psSectionFilter === "all")}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setPsSectionFilter("math")}
              aria-pressed={psSectionFilter === "math"}
              className={chipClass(psSectionFilter === "math")}
            >
              Math
            </button>
            <button
              type="button"
              onClick={() => setPsSectionFilter("reading-and-writing")}
              aria-pressed={psSectionFilter === "reading-and-writing"}
              className={chipClass(psSectionFilter === "reading-and-writing")}
            >
              R&amp;W
            </button>
          </div>
        </div>
        <div>
          <span className="block text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            Difficulty
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPsDifficultyFilter("all")}
              aria-pressed={psDifficultyFilter === "all"}
              className={chipClass(psDifficultyFilter === "all")}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setPsDifficultyFilter("easy")}
              aria-pressed={psDifficultyFilter === "easy"}
              className={chipClass(psDifficultyFilter === "easy")}
            >
              Easy
            </button>
            <button
              type="button"
              onClick={() => setPsDifficultyFilter("medium")}
              aria-pressed={psDifficultyFilter === "medium"}
              className={chipClass(psDifficultyFilter === "medium")}
            >
              Medium
            </button>
            <button
              type="button"
              onClick={() => setPsDifficultyFilter("hard")}
              aria-pressed={psDifficultyFilter === "hard"}
              className={chipClass(psDifficultyFilter === "hard")}
            >
              Hard
            </button>
          </div>
        </div>
      </div>

      {/* Type-to-filter input with keyboard navigation (2d). */}
      <input
        ref={titleRef}
        type="text"
        value={psQuery}
        onChange={(e) => setPsQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setPsHighlightIdx((idx) =>
              Math.min(filteredCatalog.length - 1, idx + 1),
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setPsHighlightIdx((idx) => Math.max(0, idx - 1));
          } else if (e.key === "Enter") {
            if (filteredCatalog.length > 0) {
              e.preventDefault();
              e.stopPropagation();
              const chosen = filteredCatalog[psHighlightIdx];
              if (chosen) {
                setPsSetUid(chosen.uid);
                setPsTitleDirty(false);
              }
            }
          } else if (e.key === "Escape" && psQuery) {
            // Per spec: Esc clears query when query is non-empty;
            // the form-level Esc handler cancels otherwise.
            e.preventDefault();
            e.stopPropagation();
            setPsQuery("");
          }
        }}
        placeholder="Type to filter sets (label, topic, section, difficulty)…"
        disabled={busy}
        aria-label="Filter Question Sets"
        className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
      />

      {/* Result list — error / loading skeletons / empty state / rows. */}
      <div
        ref={psListRef}
        className="max-h-60 overflow-y-auto rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900"
        role="listbox"
        aria-label="Question Set catalog"
      >
        {catalogError ? (
          <div className="p-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-950/30 flex items-center justify-between gap-2">
            <span>Couldn't load catalog: {catalogError}</span>
            <button
              type="button"
              onClick={() => void refreshCatalog()}
              className="rounded-lg bg-white dark:bg-slate-900 ring-1 ring-rose-300 dark:ring-rose-800 px-2 py-1 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              Retry
            </button>
          </div>
        ) : catalogLoading ? (
          <div className="p-2">
            <SkeletonRows count={4} rowClassName="h-8" gap={6} />
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div className="p-4 text-sm text-center text-slate-500 dark:text-slate-400">
            <div>No sets match these filters.</div>
            <button
              type="button"
              onClick={() => {
                setPsSectionFilter("all");
                setPsDifficultyFilter("all");
                setPsQuery("");
              }}
              className="mt-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <ul className="py-1">
            {filteredCatalog.map(({ entry, uid }, idx) => {
              const selected = psSetUid === uid;
              const highlighted = idx === psHighlightIdx;
              return (
                <li key={uid}>
                  <button
                    type="button"
                    onClick={() => {
                      setPsSetUid(uid);
                      setPsTitleDirty(false);
                      setPsHighlightIdx(idx);
                    }}
                    onMouseEnter={() => setPsHighlightIdx(idx)}
                    role="option"
                    aria-selected={selected}
                    className={
                      "w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 " +
                      (selected
                        ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-100"
                        : highlighted
                          ? "bg-indigo-50 dark:bg-indigo-950/30 text-slate-900 dark:text-slate-100"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800")
                    }
                  >
                    <span className="flex-1 truncate">{entry.label}</span>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {entry.section === "math" ? "Math" : "R&W"}
                    </span>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">
                      {entry.difficulty}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {entry.questionCount}q
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Selected-set title field — only meaningful once a row is chosen. */}
      <input
        type="text"
        value={psTitle}
        onChange={(e) => {
          setPsTitle(e.target.value);
          setPsTitleDirty(true);
        }}
        placeholder={psSetUid ? "Title (defaults to set label)" : "Pick a set above first"}
        disabled={busy || !psSetUid}
        maxLength={200}
        className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 disabled:opacity-60"
      />

      {/* Read-only meta — set definitions live in the catalog. */}
      {psSetUid &&
        (() => {
          const chosen = catalogOptions.find((o) => o.uid === psSetUid);
          if (!chosen) return null;
          const minutes = computeDefaultQbankTimeLimit(
            chosen.entry.questionCount,
          );
          return (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700"
              aria-label="Set defaults"
            >
              <span>
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  ~{minutes} min
                </span>{" "}
                suggested
              </span>
              <span className="text-slate-400">·</span>
              <span>unlimited attempts</span>
              <span className="text-slate-400">·</span>
              <span>
                {chosen.entry.questionCount} question
                {chosen.entry.questionCount === 1 ? "" : "s"}
              </span>
            </div>
          );
        })()}

      {/* Due date — full-width row (2a). */}
      <div className="block">
        <SmartDatePicker
          label="Due date (optional)"
          value={psDueAt}
          onChange={setPsDueAt}
          allowClear
        />
      </div>

      {/* Override display title disclosure (2b). */}
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
          className="mt-1.5 w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
        />
      </details>
    </div>
  );
}
