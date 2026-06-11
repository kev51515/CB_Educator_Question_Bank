/**
 * modules-page/inline-add/fulltest-ui
 * ===================================
 * Presentational pieces for the Full-Test picker section of InlineAddItemRow.
 * Extracted verbatim from the pre-split inline-add.tsx — no behavior change.
 */
import { sectionSummary, formatTestDuration } from "@/fulltest/testSections";
import type { TestCatalogEntry } from "@/fulltest/types";
import { SmartDatePicker, Combobox } from "@/components";
import type { FullTestSelection } from "./fulltest-hooks";

interface FullTestSectionProps {
  fullTests: TestCatalogEntry[];
  title: string;
  setTitle: (v: string) => void;
  busy: boolean;
  chipClass: (active: boolean) => string;
  ft: FullTestSelection;
}

export function FullTestSection({
  fullTests,
  title,
  setTitle,
  busy,
  chipClass,
  ft,
}: FullTestSectionProps) {
  const {
    fullTestSlug,
    setFullTestSlug,
    ftModules,
    ftDeployed,
    ftOpensAt,
    setFtOpensAt,
    ftContiguous,
    toggleFtModule,
    setFtBySection,
    ftSections,
    ftSectionActive,
  } = ft;

  return (
    <div className="space-y-1.5">
      <Combobox
        value={fullTestSlug || null}
        onChange={(v) => setFullTestSlug(v)}
        options={fullTests.map((t) => {
          const sum = sectionSummary(t.sections);
          return {
            value: t.slug,
            label: `${t.title}${sum ? ` — ${sum.short}` : ""}`,
          };
        })}
        disabled={busy}
        ariaLabel="Full-length test"
        placeholder={
          fullTests.length === 0 ? "No full-length tests yet" : "Pick a full-length test…"
        }
        className="w-full"
      />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Display title (optional — defaults to the test title)"
        disabled={busy}
        className="w-full rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
      />
      {(() => {
        // Show the chosen test's section composition so the teacher knows
        // whether it's RW-only, Math-only, or a full SAT before adding it.
        const chosen = fullTests.find((t) => t.slug === fullTestSlug);
        if (!chosen) {
          return (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Adds the full-length, Bluebook-style test. Enrolled students open
              it straight from this module.
            </p>
          );
        }
        const sum = sectionSummary(chosen.sections);
        return (
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700"
            aria-label="Test composition"
          >
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {sum?.label ?? "Full-length test"}
            </span>
            <span className="text-slate-400">·</span>
            <span className="tabular-nums">
              {chosen.total_questions} question
              {chosen.total_questions === 1 ? "" : "s"}
            </span>
            {chosen.module_count != null && (
              <>
                <span className="text-slate-400">·</span>
                <span className="tabular-nums">
                  {chosen.module_count} timed module
                  {chosen.module_count === 1 ? "" : "s"}
                </span>
              </>
            )}
            {formatTestDuration(chosen.total_time_seconds) && (
              <>
                <span className="text-slate-400">·</span>
                <span className="tabular-nums">
                  ~{formatTestDuration(chosen.total_time_seconds)}
                </span>
              </>
            )}
          </div>
        );
      })()}

      {/* Module selection — pick which modules to deploy to this course.
          All selected = the full test. A contiguous subset (e.g. R&W only)
          writes set_test_module_windows after the link is created. */}
      {fullTestSlug && ftModules.length > 1 && (
        <div className="space-y-1.5 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-900 p-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Modules to deploy
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setFtBySection("all")}
                aria-pressed={ftDeployed.size === ftModules.length}
                disabled={busy}
                className={chipClass(ftDeployed.size === ftModules.length)}
              >
                All
              </button>
              {ftSections.includes("reading-writing") && (
                <button
                  type="button"
                  onClick={() => setFtBySection("reading-writing")}
                  aria-pressed={ftSectionActive("reading-writing")}
                  disabled={busy}
                  className={chipClass(ftSectionActive("reading-writing"))}
                >
                  R&amp;W only
                </button>
              )}
              {ftSections.includes("math") && (
                <button
                  type="button"
                  onClick={() => setFtBySection("math")}
                  aria-pressed={ftSectionActive("math")}
                  disabled={busy}
                  className={chipClass(ftSectionActive("math"))}
                >
                  Math only
                </button>
              )}
            </div>
          </div>
          <ul className="space-y-0.5">
            {ftModules.map((m) => {
              const on = ftDeployed.has(m.position);
              return (
                <li key={m.position}>
                  <label
                    className={
                      "flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 " +
                      (on ? "" : "opacity-50")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleFtModule(m.position)}
                      disabled={busy}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400/60"
                      aria-label={`Deploy ${m.label}`}
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {m.label}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {m.section === "math" ? "Math" : "R&W"} · {m.question_count}q ·{" "}
                      {Math.round(m.time_limit_seconds / 60)}m
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {ftDeployed.size > 0 && !ftContiguous && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Pick a continuous range — e.g. R&amp;W (M1–M2) or Math (M1–M2).
            </p>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            All modules = the full test. Deselect to deploy a subset (e.g. Reading &amp;
            Writing only).
          </p>
        </div>
      )}

      {/* One open date for the whole occurrence. NULL = open now. */}
      {fullTestSlug && (
        <div className="block">
          <SmartDatePicker
            label="Available from (optional)"
            value={ftOpensAt}
            onChange={setFtOpensAt}
            allowClear
          />
        </div>
      )}
    </div>
  );
}
