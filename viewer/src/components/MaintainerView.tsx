/**
 * MaintainerView
 * ==============
 * Data-quality dashboard for question-bank maintainers. Surfaces aggregate
 * health metrics derived purely from the in-memory index (no per-question
 * fetches required) so reviewers can spot gaps:
 *
 *   - Coverage counts (preview/skill/domain/type/stimulus)
 *   - Update-date histogram (year-month buckets)
 *
 * Pure CSS bars to match the existing StatsPanel aesthetic. Modal with
 * full focus management, Escape-to-close, click-outside-to-close, and
 * focus restoration on unmount.
 */
import { useEffect, useMemo, useRef } from "react";
import type { IndexEntry } from "@/types";
import { IDENTITY } from "../lib/designTokens";
import { useFocusTrap } from "../hooks";

interface MaintainerViewProps {
  open: boolean;
  onClose: () => void;
  index: IndexEntry[];
  /**
   * Optional question-loader. Unused by the current view (everything is
   * index-driven) but kept in the public signature so future deep-dives
   * (e.g. rationale-missing detection) can wire in lazily.
   */
  fetchQuestion?: (path: string) => Promise<unknown>;
}

interface MetricRow {
  label: string;
  count: number;
  total: number;
  pct: number;
  barWidth: number;
  emphasis?: "warn" | "ok";
}

interface BucketRow {
  label: string;
  count: number;
  barWidth: number;
}

const KNOWN_TYPES = new Set(["mcq", "spr"]);

/** YYYY-MM string for a Unix-ms timestamp, in local time. */
function yearMonth(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildBucketRows(counts: Map<string, number>, sortKey: "label" | "count" = "label"): BucketRow[] {
  const rows: BucketRow[] = [];
  for (const [label, count] of counts) {
    rows.push({ label, count, barWidth: 0 });
  }
  if (sortKey === "label") {
    rows.sort((a, b) => a.label.localeCompare(b.label));
  } else {
    rows.sort((a, b) => b.count - a.count);
  }
  const max = rows.reduce((m, r) => Math.max(m, r.count), 1);
  for (const r of rows) {
    r.barWidth = max > 0 ? (r.count / max) * 100 : 0;
  }
  return rows;
}

export function MaintainerView({
  open,
  onClose,
  index,
}: MaintainerViewProps): JSX.Element | null {
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

  // Aggregations -------------------------------------------------------
  const total = index.length;

  const coverage = useMemo<MetricRow[]>(() => {
    if (total === 0) return [];
    let missingPreview = 0;
    let missingSkillOrDomain = 0;
    let typeUnknown = 0;
    let hasStimulus = 0;
    let noStimulus = 0;

    for (const e of index) {
      if (!e.preview || e.preview.trim().length === 0) missingPreview++;
      if (!e.skill || !e.domain || e.skill.trim() === "" || e.domain.trim() === "") {
        missingSkillOrDomain++;
      }
      const t = (e.type ?? "").toLowerCase();
      if (!KNOWN_TYPES.has(t)) typeUnknown++;
      if (e.hasStimulus) hasStimulus++;
      else noStimulus++;
    }

    const mk = (
      label: string,
      count: number,
      emphasis?: "warn" | "ok",
    ): MetricRow => ({
      label,
      count,
      total,
      pct: total > 0 ? (count / total) * 100 : 0,
      barWidth: total > 0 ? (count / total) * 100 : 0,
      emphasis,
    });

    return [
      mk("Missing preview", missingPreview, missingPreview > 0 ? "warn" : "ok"),
      mk(
        "Missing skill or domain",
        missingSkillOrDomain,
        missingSkillOrDomain > 0 ? "warn" : "ok",
      ),
      mk("Type unknown (not mcq/spr)", typeUnknown, typeUnknown > 0 ? "warn" : "ok"),
      mk("Has stimulus", hasStimulus, "ok"),
      mk("No stimulus", noStimulus),
    ];
  }, [index, total]);

  const updateMonthRows = useMemo<BucketRow[]>(() => {
    const counts = new Map<string, number>();
    let unknown = 0;
    for (const e of index) {
      const ts = e.updateDate;
      if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) {
        const key = yearMonth(ts);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      } else {
        unknown++;
      }
    }
    const rows = buildBucketRows(counts, "label");
    if (unknown > 0) {
      const max = rows.reduce((m, r) => Math.max(m, r.count), 1);
      rows.push({
        label: "Unknown",
        count: unknown,
        barWidth: max > 0 ? (unknown / max) * 100 : 0,
      });
    }
    return rows;
  }, [index]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-10 bg-ink-800/25 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintainer-title"
    >
      <div
        ref={dialogRef}
        className={"bg-white rounded-2xl shadow-modal border border-ink-100 border-t-[3px] " + IDENTITY.status.topBorder + " w-full max-w-xl p-7 max-h-[85vh] overflow-y-auto"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 id="maintainer-title" className="text-[15px] font-semibold tracking-tight">
            Maintainer View — Data Quality
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
          <p className="text-[13px] text-ink-500">No questions in the index.</p>
        ) : (
          <div className="space-y-6">
            {/* Totals */}
            <section>
              <h3 className="text-[13px] font-semibold text-ink-700 mb-3">Overview</h3>
              <div className="grid grid-cols-1 gap-3 text-[12px]">
                <div className="rounded-lg border border-ink-150 bg-ink-50 p-3">
                  <div className="text-ink-500">Total questions</div>
                  <div className="text-[18px] font-semibold tabular-nums text-ink-800">
                    {total.toLocaleString()}
                  </div>
                </div>
              </div>
            </section>

            {/* Coverage Metrics */}
            <section>
              <h3 className="text-[13px] font-semibold text-ink-700 mb-3">Coverage</h3>
              <div className="space-y-2.5">
                {coverage.map((row) => (
                  <MetricRowView key={row.label} row={row} />
                ))}
              </div>
            </section>

            {/* Update Date Histogram */}
            <section>
              <h3 className="text-[13px] font-semibold text-ink-700 mb-3">
                Update Date (year-month)
              </h3>
              {updateMonthRows.length === 0 ? (
                <p className="text-[12px] text-ink-500">No update dates recorded.</p>
              ) : (
                <div className="space-y-2.5">
                  {updateMonthRows.map((row) => (
                    <BucketBarView
                      key={row.label}
                      row={row}
                      colorClass={row.label === "Unknown" ? "bg-ink-300" : "bg-accent-200"}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Footer */}
        <p className="mt-6 pt-4 border-t border-ink-150 text-[12px] text-ink-500 tabular-nums">
          Showing {total.toLocaleString()} indexed questions
        </p>
      </div>
    </div>
  );
}

function MetricRowView({ row }: { row: MetricRow }) {
  const labelColor =
    row.emphasis === "warn" && row.count > 0
      ? "text-rose-600"
      : row.emphasis === "ok"
      ? "text-emerald-700"
      : "text-ink-700";
  const barColor =
    row.emphasis === "warn" && row.count > 0
      ? "bg-rose-400"
      : row.emphasis === "ok"
      ? "bg-emerald-400"
      : "bg-ink-400";
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className={labelColor}>{row.label}</span>
        <span className="text-ink-500 tabular-nums">
          {row.count.toLocaleString()}{" "}
          <span className="text-ink-400">({row.pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-300 ease-out`}
          style={{
            width: `${row.barWidth}%`,
            minWidth: row.count > 0 ? "2px" : undefined,
          }}
        />
      </div>
    </div>
  );
}

function BucketBarView({ row, colorClass }: { row: BucketRow; colorClass: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className="text-ink-700 tabular-nums">{row.label}</span>
        <span className="text-ink-500 tabular-nums">{row.count.toLocaleString()}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full ${colorClass} transition-all duration-300 ease-out`}
          style={{
            width: `${row.barWidth}%`,
            minWidth: row.count > 0 ? "2px" : undefined,
          }}
        />
      </div>
    </div>
  );
}
