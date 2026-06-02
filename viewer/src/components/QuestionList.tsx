import { useMemo } from "react";
import type { Filters, IndexEntry } from "@/types";
import { Highlight } from "./Highlight";
import { CompactToggle, QuestionPreviewTooltip, useHoverPreview } from "./ListExtras";
import { UndoChip } from "./FilterShortcuts";
import { VirtualList } from "./VirtualList";

interface QuestionListProps {
  entries: IndexEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  setupComplete: boolean;
  missingRequired: string[];
  isBookmarked: (id: string) => boolean;
  isDone: (id: string) => boolean;
  isSelected: (id: string) => boolean;
  /** Toggle, or range-extend from the last-clicked anchor when `range=true`. */
  onToggleSelected: (id: string, range: boolean) => void;
  selectedCount: number;
  onClearSelected: () => void;
  onPrintSelected: () => void;
  onExportPdf?: () => void;
  onManagePrintSet?: () => void;
  filters: Filters;
  onReset?: () => void;
  searchQuery?: string;
  compact?: boolean;
  onToggleCompact?: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
}

const REQUIRED_LABEL: { [k: string]: string } = {
  sections: "section",
  difficulties: "difficulty",
};

function requiredMessage(missing: string[]): string {
  const labels = missing.map((k) => REQUIRED_LABEL[k] ?? k);
  if (labels.length === 0) return "";
  if (labels.length === 1) return `Choose a ${labels[0]} to begin.`;
  return `Choose a ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]} to begin.`;
}

function difficultyColor(d: string): string {
  switch (d) {
    case "Easy":
      return "bg-emerald-400";
    case "Medium":
      return "bg-amber-400";
    case "Hard":
      return "bg-rose-400";
    default:
      return "bg-ink-300";
  }
}

function difficultyText(d: string): string {
  switch (d) {
    case "Easy":
      return "text-emerald-600";
    case "Medium":
      return "text-amber-600";
    case "Hard":
      return "text-rose-600";
    default:
      return "text-ink-500";
  }
}

export function QuestionList({
  entries,
  selectedId,
  onSelect,
  setupComplete,
  missingRequired,
  isBookmarked,
  isDone,
  isSelected,
  onToggleSelected,
  selectedCount,
  onClearSelected,
  onPrintSelected,
  onExportPdf,
  onManagePrintSet,
  filters,
  onReset,
  searchQuery,
  compact,
  onToggleCompact,
  canUndo,
  onUndo,
}: QuestionListProps) {
  // Hide the per-row domain/skill line when every visible row shares the same
  // skill (and domain) — it would just repeat what's in the sticky header.
  // Show it otherwise so the user can distinguish rows when the filter is broad.
  const showSkillPerRow = useMemo(() => {
    if (entries.length <= 1) return false;
    const first = entries[0].skill;
    return entries.some((e) => e.skill !== first);
  }, [entries]);
  const showDomainPerRow = useMemo(() => {
    if (entries.length <= 1) return false;
    const first = entries[0].domain;
    return entries.some((e) => e.domain !== first);
  }, [entries]);

  const filterChips = useMemo(() => {
    const chips: { label: string; tone?: "amber" | "emerald" }[] = [];
    if (filters.status.has("bookmarked")) chips.push({ label: "Bookmarked", tone: "amber" });
    if (filters.status.has("done")) chips.push({ label: "Done", tone: "emerald" });
    for (const s of filters.sections) chips.push({ label: s });
    for (const d of filters.difficulties) chips.push({ label: d });
    for (const d of filters.domains) chips.push({ label: d });
    for (const s of filters.skills) chips.push({ label: s });
    return chips;
  }, [filters]);
  const hoverPreview = useHoverPreview(400);
  const selectedIndex = useMemo(
    () => entries.findIndex((e) => e.id === selectedId),
    [entries, selectedId],
  );

  if (!setupComplete) {
    return (
      <div role="region" aria-label="Question list" className="w-80 max-[899px]:w-full shrink-0 max-[899px]:shrink border-r border-ink-150 bg-white p-8 text-center flex flex-col items-center justify-center">
        <div className="w-9 h-9 rounded-full bg-ink-100 flex items-center justify-center mb-3">
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 text-ink-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="6" y1="12" x2="18" y2="12" />
            <line x1="9" y1="18" x2="15" y2="18" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-ink-800 mb-1">Start by filtering</p>
        <p className="text-[12px] text-ink-600 leading-snug">
          {requiredMessage(missingRequired)}
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div role="region" aria-label="Question list" className="w-80 max-[899px]:w-full shrink-0 max-[899px]:shrink border-r border-ink-150 bg-white p-6 flex flex-col items-center justify-center text-center">
        <p className="text-[13px] text-ink-600 mb-3">No questions match the current filters.</p>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-[12.5px] text-accent-600 hover:text-accent-700 font-medium transition-colors focus-ring rounded px-2 py-1"
          >
            Reset filters
          </button>
        )}
      </div>
    );
  }

  return (
    <nav aria-label="Question list" className="w-80 max-[899px]:w-full shrink-0 max-[899px]:shrink border-r border-ink-150 bg-white relative flex flex-col">
      {selectedCount > 0 && (
        <div className="sticky top-0 z-[2] bg-accent-50 border-b border-accent-100 px-3 py-2 flex items-center gap-2 text-[12px] text-accent-700 print:hidden">
          <span className="font-semibold tabular-nums">{selectedCount}</span>
          <span>in print set</span>
          <span className="flex-1" />
          <button
            onClick={onPrintSelected}
            className="px-2.5 py-1 rounded-md bg-accent-600 text-white text-[11.5px] font-medium hover:bg-accent-700 transition-colors focus-ring"
          >
            Print
          </button>
          {onExportPdf && (
            <button
              onClick={onExportPdf}
              className="px-2.5 py-1 rounded-md border border-accent-200 text-accent-700 text-[11.5px] font-medium hover:bg-accent-50 transition-colors focus-ring"
            >
              PDF
            </button>
          )}
          {onManagePrintSet && (
            <button
              onClick={onManagePrintSet}
              className="px-1.5 py-1 rounded-md text-accent-700 text-[11.5px] hover:bg-accent-100 transition-colors focus-ring"
            >
              Manage
            </button>
          )}
          <button
            onClick={onClearSelected}
            className="px-1.5 py-1 rounded-md text-accent-700 text-[11.5px] hover:bg-accent-100 transition-colors focus-ring"
            title="Clear print set"
          >
            Clear
          </button>
        </div>
      )}
      {(filterChips.length > 0 || onToggleCompact != null) && (
        <div className="sticky top-0 z-[1] bg-white/85 backdrop-blur-md border-b border-ink-150 px-4 py-2 text-[11px] text-ink-500 flex flex-wrap items-center gap-1.5">
          <span className="tabular-nums text-ink-400">{entries.length.toLocaleString()}</span>
          {filterChips.length > 0 && <span className="text-ink-300">·</span>}
          {filterChips.slice(0, 4).map((c, i) => (
            <span
              key={i}
              className={
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] " +
                (c.tone === "amber"
                  ? "bg-amber-50 text-amber-700"
                  : c.tone === "emerald"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-ink-100 text-ink-600")
              }
            >
              {c.label}
            </span>
          ))}
          {filterChips.length > 4 && (
            <span className="text-ink-400">+{filterChips.length - 4}</span>
          )}
          {canUndo && onUndo && (
            <UndoChip canUndo={canUndo} onUndo={onUndo} />
          )}
          {onToggleCompact != null && (
            <>
              <span className="flex-1" />
              <CompactToggle compact={compact ?? false} onToggle={onToggleCompact} />
            </>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <VirtualList
          items={entries}
          itemHeight={compact ? 36 : 76}
          overscan={5}
          ariaLabel="Questions"
          // No `role="list"` — parent `<nav aria-label="Question list">` already
          // names the region, and axe-core rejects `role="list"` when children
          // are <button>s with aria-current / aria-label (not role="listitem").

          scrollToIndex={selectedIndex >= 0 ? selectedIndex : undefined}
          renderItem={(e, i) => {
            const isSel = e.id === selectedId;
            const showDivider = i > 0 && !isSel;
            const bm = isBookmarked(e.id);
            const dn = isDone(e.id);
            const inSet = isSelected(e.id);
            return (
              <div key={e.id} className="relative group h-full">
                {/* Selection checkbox — sibling of the row button (no nested buttons) */}
                <button
                  type="button"
                  onClick={(ev) => onToggleSelected(e.id, ev.shiftKey)}
                  aria-label={inSet ? "Remove from print set" : "Add to print set (shift-click for range)"}
                  aria-pressed={inSet}
                  title={
                    inSet
                      ? "Remove from print set"
                      : "Add to print set · Shift-click for range"
                  }
                  className={
                    "absolute right-3 top-3 z-[1] w-[16px] h-[16px] rounded-[4px] border inline-flex items-center justify-center transition-opacity focus-ring " +
                    (inSet
                      ? "bg-accent-600 border-accent-600 opacity-100"
                      : "bg-white border-ink-300 opacity-0 group-hover:opacity-100") +
                    (selectedCount > 0 && !inSet ? " opacity-100" : "")
                  }
                >
                  {inSet && (
                    <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => onSelect(e.id)}
                  onMouseEnter={(ev) => { if (compact) hoverPreview.show(e, ev.currentTarget.getBoundingClientRect()); }}
                  onMouseLeave={() => hoverPreview.hide()}
                  aria-current={isSel ? "true" : undefined}
                  className={
                    "w-full h-full text-left pl-5 pr-10 relative transition-colors duration-150 focus-ring " +
                    (compact ? "py-1.5 " : "py-3 ") +
                    (isSel ? "bg-accent-50/60" : "hover:bg-ink-50")
                  }
                >
                  {showDivider && (
                    <span
                      aria-hidden
                      className="absolute left-5 right-4 top-0 h-px bg-ink-100"
                    />
                  )}
                  {/* Difficulty stripe always present on the far-left edge.
                      Replaced by the accent rail when selected. */}
                  {isSel ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm bg-accent-600"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className={
                        "absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-r-sm " +
                        difficultyColor(e.difficulty)
                      }
                    />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={
                          "tabular-nums text-[13px] font-semibold tracking-tight " +
                          (isSel ? "text-accent-700" : "text-ink-800")
                        }
                      >
                        {e.number != null ? (
                          <>
                            <span
                              className={
                                "font-medium " +
                                (isSel ? "text-accent-400" : "text-ink-400")
                              }
                            >
                              #
                            </span>
                            {e.number}
                          </>
                        ) : (
                          e.id
                        )}
                      </span>
                      {bm && (
                        <svg
                          viewBox="0 0 24 24"
                          className="w-3 h-3 text-amber-500"
                          fill="currentColor"
                          aria-label="Bookmarked"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      )}
                      {dn && (
                        <svg
                          viewBox="0 0 24 24"
                          className="w-3 h-3 text-emerald-600"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-label="Done"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {e.type === "spr" && (
                        <span
                          className="font-mono text-[9px] uppercase tracking-[0.1em] px-1 py-px rounded bg-violet-50 text-violet-700"
                          title="Student-produced response"
                        >
                          SPR
                        </span>
                      )}
                    </span>
                    <span
                      className={
                        "text-[11px] font-medium " + difficultyText(e.difficulty)
                      }
                    >
                      {e.difficulty || "?"}
                    </span>
                  </div>
                  {!compact && (showSkillPerRow || showDomainPerRow) && (
                    <div
                      className={
                        "text-[11.5px] mt-0.5 truncate " +
                        (isSel ? "text-ink-600" : "text-ink-500")
                      }
                      title={[e.domain, e.skill].filter(Boolean).join(" · ")}
                    >
                      {showDomainPerRow && showSkillPerRow ? (
                        <>
                          <Highlight text={e.domain} query={searchQuery ?? ""} />
                          <span className="mx-1 text-ink-300">·</span>
                          <Highlight text={e.skill} query={searchQuery ?? ""} />
                        </>
                      ) : showSkillPerRow ? (
                        <Highlight text={e.skill} query={searchQuery ?? ""} />
                      ) : (
                        <Highlight text={e.domain} query={searchQuery ?? ""} />
                      )}
                    </div>
                  )}
                  {!compact && e.preview && (() => {
                    const cleanPreview = (e.preview ?? "").replace(/\s*\?\s*$/, " [formula]").replace(/\bto \?\b/g, "to [formula]");
                    return (
                      <p
                        className={
                          "text-[12px] leading-snug line-clamp-2 " +
                          (showSkillPerRow || showDomainPerRow ? "mt-1.5 " : "mt-1 ") +
                          (isSel ? "text-ink-700" : "text-ink-600/85")
                        }
                      >
                        <Highlight text={cleanPreview} query={searchQuery ?? ""} />
                      </p>
                    );
                  })()}
                </button>
              </div>
            );
          }}
        />
      </div>
      <QuestionPreviewTooltip {...hoverPreview.props} />
    </nav>
  );
}
