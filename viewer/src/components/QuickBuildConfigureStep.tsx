/**
 * QuickBuildConfigureStep
 * =======================
 * First step of the Quick Build wizard. Lets the user pick:
 *   - Section(s) and difficulty pills
 *   - Optional domain filter (multi-select dropdown)
 *   - Count of questions (1–50)
 *   - Exclusion toggles (already-selected / done)
 *
 * Surfaces the live match count and the "Build set" CTA that transitions the
 * wizard to the preview step. All state lives in the parent QuickBuildWizard;
 * this component is fully controlled.
 *
 * Co-located with QuickBuild — not re-exported from the components barrel so
 * it stays inside the lazy chunk.
 */
import { useEffect, useRef, useState } from "react";
import { QuickBuildPill } from "@/components/QuickBuildPill";

interface QuickBuildConfigureStepProps {
  allSections: string[];
  allDifficulties: string[];
  availableDomains: string[];
  sections: Set<string>;
  difficulties: Set<string>;
  domains: Set<string>;
  count: number;
  excludeSelected: boolean;
  excludeDone: boolean;
  matchCount: number;
  onToggleSection: (s: string) => void;
  onToggleDifficulty: (d: string) => void;
  onToggleDomain: (d: string) => void;
  onSetCount: (n: number) => void;
  onSetExcludeSelected: (v: boolean) => void;
  onSetExcludeDone: (v: boolean) => void;
  onBuild: () => void;
}

export function QuickBuildConfigureStep({
  allSections,
  allDifficulties,
  availableDomains,
  sections,
  difficulties,
  domains,
  count,
  excludeSelected,
  excludeDone,
  matchCount,
  onToggleSection,
  onToggleDifficulty,
  onToggleDomain,
  onSetCount,
  onSetExcludeSelected,
  onSetExcludeDone,
  onBuild,
}: QuickBuildConfigureStepProps) {
  const [domainOpen, setDomainOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // Close domain dropdown on outside click
  useEffect(() => {
    if (!domainOpen) return;
    const onClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDomainOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [domainOpen]);

  return (
    <div className="space-y-5">
      {/* Section */}
      <fieldset>
        <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400 mb-2">
          Section
        </legend>
        <div className="flex flex-wrap gap-2">
          {allSections.map((s) => (
            <QuickBuildPill key={s} label={s} active={sections.has(s)} onClick={() => onToggleSection(s)} />
          ))}
        </div>
      </fieldset>

      {/* Difficulty */}
      <fieldset>
        <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400 mb-2">
          Difficulty
        </legend>
        <div className="flex flex-wrap gap-2">
          {allDifficulties.map((d) => (
            <QuickBuildPill key={d} label={d} active={difficulties.has(d)} onClick={() => onToggleDifficulty(d)} />
          ))}
        </div>
      </fieldset>

      {/* Domain */}
      <fieldset>
        <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400 mb-2">
          Domain <span className="font-normal text-ink-300">(optional)</span>
        </legend>
        <div ref={dropRef} className="relative">
          <button
            type="button"
            onClick={() => setDomainOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-ink-200 text-[13px] text-ink-700 hover:border-ink-300 transition-colors focus-ring"
          >
            <span className={domains.size === 0 ? "text-ink-400" : ""}>
              {domains.size === 0
                ? "All domains"
                : `${domains.size} selected`}
            </span>
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {domainOpen && (
            <div className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-ink-150 shadow-modal max-h-48 overflow-y-auto thin-scrollbar py-1">
              {availableDomains.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onToggleDomain(d)}
                  className={
                    "w-full text-left px-3 py-1.5 text-[12.5px] transition-colors hover:bg-ink-50 flex items-center gap-2 " +
                    (domains.has(d) ? "text-accent-700 font-medium" : "text-ink-600")
                  }
                >
                  <span
                    className={
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 " +
                      (domains.has(d)
                        ? "bg-accent-600 border-accent-600"
                        : "border-ink-300")
                    }
                  >
                    {domains.has(d) && (
                      <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  {d}
                </button>
              ))}
              {availableDomains.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-ink-400">No domains available</div>
              )}
            </div>
          )}
        </div>
      </fieldset>

      {/* Count */}
      <fieldset>
        <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400 mb-2">
          Number of questions
        </legend>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSetCount(Math.max(1, count - 1))}
            className="w-8 h-8 rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50 transition-colors flex items-center justify-center text-[16px] font-medium focus-ring"
            aria-label="Decrease count"
          >
            &minus;
          </button>
          <input
            type="number"
            value={count}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) onSetCount(Math.max(1, Math.min(50, n)));
            }}
            min={1}
            max={50}
            className="w-16 text-center px-2 py-1.5 rounded-lg border border-ink-200 text-[14px] tabular-nums text-ink-800 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-400"
          />
          <button
            type="button"
            onClick={() => onSetCount(Math.min(50, count + 1))}
            className="w-8 h-8 rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50 transition-colors flex items-center justify-center text-[16px] font-medium focus-ring"
            aria-label="Increase count"
          >
            +
          </button>
        </div>
      </fieldset>

      {/* Exclusion checkboxes */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-[13px] text-ink-600 cursor-pointer">
          <input
            type="checkbox"
            checked={excludeSelected}
            onChange={(e) => onSetExcludeSelected(e.target.checked)}
            className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
          />
          Exclude already selected
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-600 cursor-pointer">
          <input
            type="checkbox"
            checked={excludeDone}
            onChange={(e) => onSetExcludeDone(e.target.checked)}
            className="rounded border-ink-300 text-accent-600 focus:ring-accent-500"
          />
          Exclude done
        </label>
      </div>

      {/* Live match count + build button */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[12.5px] text-ink-500 tabular-nums">
          {matchCount.toLocaleString()} question{matchCount === 1 ? "" : "s"} match
        </span>
        <button
          type="button"
          onClick={onBuild}
          disabled={matchCount === 0}
          className="px-5 py-2 rounded-lg bg-accent-600 text-white text-[13px] font-medium hover:bg-accent-700 transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Build set
        </button>
      </div>
    </div>
  );
}
