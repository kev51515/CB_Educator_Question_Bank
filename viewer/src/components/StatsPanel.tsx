import { useEffect, useRef, useMemo } from "react";
import type { IndexEntry } from "@/types";
import { IDENTITY } from "../lib/designTokens";
import { useFocusTrap } from "../hooks";

interface StatsPanelProps {
  entries: IndexEntry[];
  totalCount: number;
  open: boolean;
  onClose: () => void;
}

interface BarRow {
  label: string;
  count: number;
  pct: number;
  /** Width as a percentage of the maximum bar in the group (0-100). */
  barWidth: number;
}

/** Build bar rows from a label/count map, sorted by count descending. */
function buildRows(
  counts: Map<string, number>,
  total: number,
): BarRow[] {
  const rows: BarRow[] = [];
  for (const [label, count] of counts) {
    rows.push({ label, count, pct: total > 0 ? (count / total) * 100 : 0, barWidth: 0 });
  }
  rows.sort((a, b) => b.count - a.count);
  const max = rows.length > 0 ? rows[0].count : 1;
  for (const r of rows) {
    r.barWidth = max > 0 ? (r.count / max) * 100 : 0;
  }
  return rows;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-emerald-400",
  medium: "bg-amber-400",
  hard: "bg-rose-400",
};

const DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"];

export function StatsPanel({ entries, totalCount, open, onClose }: StatsPanelProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, open);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Compute distributions
  const total = entries.length;

  const difficultyRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const d = e.difficulty || "Unknown";
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    // Sort in canonical order
    const rows: BarRow[] = [];
    for (const label of DIFFICULTY_ORDER) {
      const count = counts.get(label) ?? 0;
      if (count > 0) {
        rows.push({ label, count, pct: total > 0 ? (count / total) * 100 : 0, barWidth: 0 });
      }
      counts.delete(label);
    }
    // Any remaining (unknown labels)
    for (const [label, count] of counts) {
      rows.push({ label, count, pct: total > 0 ? (count / total) * 100 : 0, barWidth: 0 });
    }
    const max = rows.reduce((m, r) => Math.max(m, r.count), 1);
    for (const r of rows) {
      r.barWidth = max > 0 ? (r.count / max) * 100 : 0;
    }
    return rows;
  }, [entries, total]);

  const sectionRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const s = e.section || "Unknown";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return buildRows(counts, total);
  }, [entries, total]);

  const domainRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const d = e.domain || "Unknown";
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return buildRows(counts, total);
  }, [entries, total]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-10 bg-ink-800/25 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-title"
    >
      <div
        ref={dialogRef}
        className={"bg-white rounded-2xl shadow-modal border border-ink-100 border-t-[3px] " + IDENTITY.content.topBorder + " w-full max-w-lg p-7 max-h-[85vh] overflow-y-auto"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 id="stats-title" className="text-[15px] font-semibold tracking-tight">
            Question Statistics
          </h2>
          <button
            data-close
            data-autofocus
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {total === 0 ? (
          <p className="text-[13px] text-ink-500">No questions match the current filters.</p>
        ) : (
          <div className="space-y-6">
            {/* Difficulty Distribution */}
            <section>
              <h3 className="text-[13px] font-semibold text-ink-700 mb-3">
                Difficulty Distribution
              </h3>
              <div className="space-y-2.5">
                {difficultyRows.map((row) => (
                  <BarRowView
                    key={row.label}
                    row={row}
                    colorClass={DIFFICULTY_COLORS[row.label.toLowerCase()] ?? "bg-ink-300"}
                  />
                ))}
              </div>
            </section>

            {/* Section Distribution */}
            <section>
              <h3 className="text-[13px] font-semibold text-ink-700 mb-3">
                Section Distribution
              </h3>
              <div className="space-y-2.5">
                {sectionRows.map((row) => (
                  <BarRowView
                    key={row.label}
                    row={row}
                    colorClass={
                      row.label.toLowerCase().includes("math")
                        ? "bg-accent-400"
                        : "bg-ink-400"
                    }
                  />
                ))}
              </div>
            </section>

            {/* Domain Distribution */}
            <section>
              <h3 className="text-[13px] font-semibold text-ink-700 mb-3">
                Domain Distribution
              </h3>
              <div className="space-y-2.5">
                {domainRows.map((row) => (
                  <BarRowView key={row.label} row={row} colorClass="bg-accent-200" />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Footer */}
        <p className="mt-6 pt-4 border-t border-ink-150 text-[12px] text-ink-500 tabular-nums">
          Showing {total.toLocaleString()} of {totalCount.toLocaleString()} questions
        </p>
      </div>
    </div>
  );
}

function BarRowView({ row, colorClass }: { row: BarRow; colorClass: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className="text-ink-700">{row.label}</span>
        <span className="text-ink-500 tabular-nums">
          {row.count.toLocaleString()}{" "}
          <span className="text-ink-400">({row.pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full ${colorClass} transition-all duration-300 ease-out`}
          style={{ width: `${row.barWidth}%`, minWidth: row.count > 0 ? "2px" : undefined }}
        />
      </div>
    </div>
  );
}
