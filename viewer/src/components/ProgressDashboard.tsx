import { useCallback, useEffect, useMemo, useRef } from "react";
import type { IndexEntry } from "@/types";
import { CONFIDENCE } from "../lib/designSystem";
import { useFocusTrap } from "../hooks";
import {
  DIFFICULTY_ORDER,
  SECTIONS,
  pct,
  fmtPct,
  matchSection,
  confLevel,
} from "./progressDashboardHelpers";
import { DomainGroup } from "./DomainGroup";

// ─────────────────────────── types ───────────────────────────────

interface ProgressDashboardProps {
  open: boolean;
  onClose: () => void;
  index: IndexEntry[];
  bookmarks: Set<string>;
  done: Set<string>;
  confidence: { get: (id: string) => number; getAll: () => Record<string, number> };
  recentIds: string[];
  onFilterSkill: (skill: string, difficulty: string) => void;
}

// ─────────────────────── ProgressDashboard ───────────────────────

export function ProgressDashboard({
  open,
  onClose,
  index,
  bookmarks,
  done,
  confidence,
  recentIds,
  onFilterSkill,
}: ProgressDashboardProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confMap = confidence.getAll();

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

  // ── Derived data ──────────────────────────────────────────────

  /** Set of IDs that are either "done" or have a confidence rating (i.e. reviewed). */
  const reviewed = useMemo(() => {
    const s = new Set<string>();
    for (const id of done) s.add(id);
    for (const id of Object.keys(confMap)) {
      if (confMap[id] > 0) s.add(id);
    }
    return s;
  }, [done, confMap]);

  const totalCount = index.length;
  const reviewedCount = useMemo(
    () => index.filter((e) => reviewed.has(e.id)).length,
    [index, reviewed],
  );
  const bookmarkCount = useMemo(
    () => index.filter((e) => bookmarks.has(e.id)).length,
    [index, bookmarks],
  );

  // Confidence breakdown across all index entries
  const confBreakdown = useMemo(() => {
    let unsure = 0;
    let okay = 0;
    let confident = 0;
    for (const e of index) {
      const c = confLevel(e.id, confMap);
      if (c === 1) unsure++;
      else if (c === 2) okay++;
      else if (c === 3) confident++;
    }
    return { unsure, okay, confident };
  }, [index, confMap]);

  // Last active: derive from recentIds → show most recent as "last active" date
  const lastActive = useMemo(() => {
    if (recentIds.length === 0) return null;
    // We don't have timestamps, so just show that the user was active recently
    return "Today";
  }, [recentIds]);

  // Section coverage
  const sectionData = useMemo(() => {
    const data: Record<
      string,
      { total: number; reviewed: number; byDiff: Record<string, { total: number; reviewed: number }> }
    > = {};
    for (const sec of SECTIONS) {
      data[sec] = { total: 0, reviewed: 0, byDiff: {} };
      for (const d of DIFFICULTY_ORDER) {
        data[sec].byDiff[d] = { total: 0, reviewed: 0 };
      }
    }
    for (const e of index) {
      const sec = matchSection(e);
      if (!sec) continue;
      data[sec].total++;
      if (reviewed.has(e.id)) data[sec].reviewed++;
      const d = DIFFICULTY_ORDER.includes(e.difficulty as typeof DIFFICULTY_ORDER[number])
        ? e.difficulty
        : null;
      if (d) {
        data[sec].byDiff[d].total++;
        if (reviewed.has(e.id)) data[sec].byDiff[d].reviewed++;
      }
    }
    return data;
  }, [index, reviewed]);

  // Skill mastery heatmap data: { domain -> { skill -> { difficulty -> cell } } }
  const heatmapData = useMemo(() => {
    // Collect all (domain, skill) pairs preserving insertion order by domain
    const domainSkills = new Map<string, Set<string>>();
    const cellMap = new Map<string, { total: number; confSum: number; confCount: number; doneOnly: number }>();

    for (const e of index) {
      const domain = e.domain || "Other";
      const skill = e.skill || "Unknown";
      const diff = e.difficulty || "Unknown";
      if (!domainSkills.has(domain)) domainSkills.set(domain, new Set());
      domainSkills.get(domain)!.add(skill);
      const key = `${skill}|||${diff}`;
      if (!cellMap.has(key)) cellMap.set(key, { total: 0, confSum: 0, confCount: 0, doneOnly: 0 });
      const cell = cellMap.get(key)!;
      cell.total++;
      const c = confLevel(e.id, confMap);
      if (c > 0) {
        cell.confSum += c;
        cell.confCount++;
      } else if (done.has(e.id)) {
        cell.doneOnly++;
      }
    }

    return { domainSkills, cellMap };
  }, [index, confMap, done]);

  // Skill gap analysis
  const skillGaps = useMemo(() => {
    const skillStats = new Map<string, { confSum: number; confCount: number; attempted: number; total: number }>();

    for (const e of index) {
      const skill = e.skill || "Unknown";
      if (!skillStats.has(skill)) skillStats.set(skill, { confSum: 0, confCount: 0, attempted: 0, total: 0 });
      const s = skillStats.get(skill)!;
      s.total++;
      const c = confLevel(e.id, confMap);
      if (c > 0) {
        s.confSum += c;
        s.confCount++;
        s.attempted++;
      } else if (done.has(e.id)) {
        s.attempted++;
      }
    }

    const needsWork: { skill: string; avg: number; attempted: number; total: number }[] = [];
    const notStarted: { skill: string; total: number }[] = [];

    for (const [skill, stats] of skillStats) {
      if (stats.attempted === 0) {
        notStarted.push({ skill, total: stats.total });
      } else if (stats.confCount > 0 && stats.confSum / stats.confCount <= 1.5) {
        needsWork.push({
          skill,
          avg: stats.confSum / stats.confCount,
          attempted: stats.attempted,
          total: stats.total,
        });
      }
    }

    // Sort needs-work by average confidence ascending (weakest first)
    needsWork.sort((a, b) => a.avg - b.avg);
    // Sort not-started by total descending (biggest gaps first)
    notStarted.sort((a, b) => b.total - a.total);

    return { needsWork: needsWork.slice(0, 5), notStarted: notStarted.slice(0, 5) };
  }, [index, confMap, done]);

  const handleCellClick = useCallback(
    (skill: string, difficulty: string) => {
      onFilterSkill(skill, difficulty);
      onClose();
    },
    [onFilterSkill, onClose],
  );

  const handleSkillFilter = useCallback(
    (skill: string) => {
      onFilterSkill(skill, "");
      onClose();
    },
    [onFilterSkill, onClose],
  );

  if (!open) return null;

  // ── Confidence pie segments (pure CSS) ────────────────────────

  const confTotal = confBreakdown.unsure + confBreakdown.okay + confBreakdown.confident;
  const confPieParts: { color: string; pct: number }[] = [];
  if (confTotal > 0) {
    if (confBreakdown.unsure > 0)
      confPieParts.push({ color: CONFIDENCE.unsure.hex, pct: (confBreakdown.unsure / confTotal) * 100 });
    if (confBreakdown.okay > 0)
      confPieParts.push({ color: CONFIDENCE.okay.hex, pct: (confBreakdown.okay / confTotal) * 100 });
    if (confBreakdown.confident > 0)
      confPieParts.push({ color: CONFIDENCE.confident.hex, pct: (confBreakdown.confident / confTotal) * 100 });
  }
  let pieGradient: string = CONFIDENCE.unrated.hex; // fallback gray
  if (confPieParts.length > 0) {
    const stops: string[] = [];
    let acc = 0;
    for (const p of confPieParts) {
      stops.push(`${p.color} ${acc}% ${acc + p.pct}%`);
      acc += p.pct;
    }
    pieGradient = `conic-gradient(${stops.join(", ")})`;
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-30 bg-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-title"
    >
      {/* Fixed header */}
      <header className="shrink-0 flex items-center justify-between gap-4 px-6 h-12 border-b border-ink-150 bg-white">
        <h2 id="progress-title" className="text-[14px] font-semibold tracking-tight text-ink-800">
          Your Progress
        </h2>
        <button
          data-close
          data-autofocus
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors flex items-center justify-center focus-ring shrink-0"
          aria-label="Close progress dashboard"
          title="Close (Esc)"
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
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">
          {/* ── Section 1: Overview cards ─────────────────────────── */}
          <section>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Reviewed */}
              <div className="rounded-xl border border-ink-200 bg-white p-4 border-t-[3px] border-t-accent-400">
                <div className="text-[11px] font-medium text-ink-500 uppercase tracking-wide mb-2">
                  Reviewed
                </div>
                <div className="text-[24px] font-semibold tabular-nums text-ink-800 leading-none">
                  {reviewedCount.toLocaleString()}
                </div>
                <div className="mt-1 text-[12px] text-ink-500 tabular-nums">
                  of {totalCount.toLocaleString()} ({fmtPct(reviewedCount, totalCount)})
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-accent-500 transition-all duration-300 ease-out"
                    style={{
                      width: `${pct(reviewedCount, totalCount)}%`,
                      minWidth: reviewedCount > 0 ? "2px" : undefined,
                    }}
                  />
                </div>
              </div>

              {/* Confidence breakdown */}
              <div className="rounded-xl border border-ink-200 bg-white p-4 border-t-[3px] border-t-amber-400">
                <div className="text-[11px] font-medium text-ink-500 uppercase tracking-wide mb-2">
                  Confidence
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full shrink-0"
                    style={{ background: pieGradient }}
                    aria-hidden
                  />
                  <div className="text-[11px] space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
                      <span className="text-ink-600 tabular-nums">{confBreakdown.unsure} unsure</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-ink-600 tabular-nums">{confBreakdown.okay} okay</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-ink-600 tabular-nums">{confBreakdown.confident} confident</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bookmarked */}
              <div className="rounded-xl border border-ink-200 bg-white p-4 border-t-[3px] border-t-amber-400">
                <div className="text-[11px] font-medium text-ink-500 uppercase tracking-wide mb-2">
                  Bookmarked
                </div>
                <div className="text-[24px] font-semibold tabular-nums text-ink-800 leading-none">
                  {bookmarkCount.toLocaleString()}
                </div>
                <div className="mt-1 text-[12px] text-ink-500">
                  questions saved for review
                </div>
              </div>

              {/* Last active */}
              <div className="rounded-xl border border-ink-200 bg-white p-4 border-t-[3px] border-t-emerald-400">
                <div className="text-[11px] font-medium text-ink-500 uppercase tracking-wide mb-2">
                  Activity
                </div>
                <div className="text-[16px] font-semibold text-ink-800 leading-snug">
                  {lastActive ?? "No activity yet"}
                </div>
                <div className="mt-1 text-[12px] text-ink-500 tabular-nums">
                  {recentIds.length > 0
                    ? `${recentIds.length} recently viewed`
                    : "Start reviewing questions"}
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 2: Coverage by Section ───────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" aria-hidden />
              <h3 className="text-[13px] font-semibold text-ink-700">
                Coverage by Section
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SECTIONS.map((sec) => {
                const d = sectionData[sec];
                if (!d) return null;
                return (
                  <div key={sec} className="rounded-xl border border-ink-200 bg-white p-5">
                    <div className="flex items-baseline justify-between mb-3">
                      <h4 className="text-[13px] font-semibold text-ink-800">{sec}</h4>
                      <span className="text-[12px] text-ink-500 tabular-nums">
                        {d.reviewed} / {d.total} ({fmtPct(d.reviewed, d.total)})
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-ink-100 mb-4">
                      <div
                        className={
                          "h-full rounded-full transition-all duration-300 ease-out " +
                          (sec === "Math" ? "bg-accent-500" : "bg-ink-500")
                        }
                        style={{
                          width: `${pct(d.reviewed, d.total)}%`,
                          minWidth: d.reviewed > 0 ? "2px" : undefined,
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      {DIFFICULTY_ORDER.map((diff) => {
                        const dd = d.byDiff[diff];
                        if (!dd || dd.total === 0) return null;
                        const colors: Record<string, string> = {
                          Easy: "bg-emerald-400",
                          Medium: "bg-amber-400",
                          Hard: "bg-rose-400",
                        };
                        return (
                          <div key={diff}>
                            <div className="flex items-center justify-between text-[11px] mb-0.5">
                              <span className="text-ink-600">{diff}</span>
                              <span className="text-ink-400 tabular-nums">
                                {dd.reviewed}/{dd.total}
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-ink-100">
                              <div
                                className={`h-full rounded-full ${colors[diff] ?? "bg-ink-300"} transition-all duration-300 ease-out`}
                                style={{
                                  width: `${pct(dd.reviewed, dd.total)}%`,
                                  minWidth: dd.reviewed > 0 ? "2px" : undefined,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Section 3: Skill mastery heatmap ─────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" aria-hidden />
              <h3 className="text-[13px] font-semibold text-ink-700">
                Skill Mastery
              </h3>
            </div>
            <p className="text-[11px] text-ink-500 mb-4">
              Click a cell to filter questions by that skill and difficulty.
            </p>
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-3 text-ink-500 font-medium sticky left-0 bg-white min-w-[180px]">
                      Skill
                    </th>
                    {DIFFICULTY_ORDER.map((d) => (
                      <th key={d} className="text-center py-2 px-2 text-ink-500 font-medium w-20">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...heatmapData.domainSkills.entries()].map(([domain, skills]) => (
                    <DomainGroup
                      key={domain}
                      domain={domain}
                      skills={[...skills]}
                      cellMap={heatmapData.cellMap}
                      onCellClick={handleCellClick}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Section 4: Suggested focus areas ─────────────────── */}
          {(skillGaps.needsWork.length > 0 || skillGaps.notStarted.length > 0) && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden />
                <h3 className="text-[13px] font-semibold text-ink-700">
                  Suggested Focus Areas
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Needs work */}
                {skillGaps.needsWork.length > 0 && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5">
                    <h4 className="text-[12px] font-semibold text-rose-700 mb-3">
                      Needs Work
                    </h4>
                    <div className="space-y-2">
                      {skillGaps.needsWork.map((s) => (
                        <div
                          key={s.skill}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-[12px] text-ink-700 truncate flex-1">
                            {s.skill}
                          </span>
                          <span className="text-[11px] text-ink-500 tabular-nums shrink-0">
                            avg {s.avg.toFixed(1)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSkillFilter(s.skill)}
                            className="text-[11px] text-rose-600 hover:text-rose-800 font-medium shrink-0 focus-ring rounded px-1.5 py-0.5 hover:bg-rose-100 transition-colors"
                          >
                            Practice
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Not started */}
                {skillGaps.notStarted.length > 0 && (
                  <div className="rounded-xl border border-ink-200 bg-ink-50 p-5">
                    <h4 className="text-[12px] font-semibold text-ink-700 mb-3">
                      Not Started
                    </h4>
                    <div className="space-y-2">
                      {skillGaps.notStarted.map((s) => (
                        <div
                          key={s.skill}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-[12px] text-ink-700 truncate flex-1">
                            {s.skill}
                          </span>
                          <span className="text-[11px] text-ink-400 tabular-nums shrink-0">
                            {s.total} questions
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSkillFilter(s.skill)}
                            className="text-[11px] text-accent-600 hover:text-accent-700 font-medium shrink-0 focus-ring rounded px-1.5 py-0.5 hover:bg-accent-50 transition-colors"
                          >
                            Start
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
