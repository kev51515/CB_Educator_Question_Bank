/**
 * TeacherClassHeatmap
 * ===================
 * D2 "class journey heatmap" (docs/JOURNEY_VIEW.md, v3 decision): the
 * at-a-glance educator lens. A pinned CLASS row shows, per checkpoint, a
 * stacked mini-bar (sealed/proficient/attempted/not-started) + sealed-%,
 * red-flagged when weak — so the class's journey reads in one row. Student
 * rows below are the drill-down: state cell per checkpoint (click → that
 * student's best attempt), mastery points, needs-attention sort + Nudge.
 *
 * Full-test link items are excluded: per-student full-test data belongs to
 * the per-test overview (release-gated, different table family).
 */
import { useMemo, useState } from "react";
import { earnedPoints, masteryState, possiblePoints, type MasteryState } from "./mastery";
import { STATE_CLASS } from "./JourneyGrid";
import type { TriageDetail } from "./TeacherCellTriage";

export interface HeatmapColumn {
  refId: string;
  title: string;
  unitName: string;
  kind: string; // 'mocktest' | 'qbank_set'
}

export interface HeatmapStudent {
  id: string;
  name: string;
}

export interface HeatmapEntry {
  /** Best effective score, null = submitted-but-unscored. */
  score: number | null;
  attemptId: string | null;
}

interface TeacherClassHeatmapProps {
  columns: HeatmapColumn[];
  students: HeatmapStudent[];
  /** refId -> studentId -> best-attempt entry (absent = not started). */
  entries: Map<string, Map<string, HeatmapEntry>>;
  triage: Map<string, TriageDetail>;
  onOpenAttempt: (refId: string, attemptId: string) => void;
  onNudgeStudent: (student: HeatmapStudent) => void;
}

type SortMode = "attention" | "points" | "name";

/** Class-row weak-checkpoint flag: under 40% of the class sealed. */
const WARN_SEALED_RATE = 0.4;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function MiniBar({ d }: { d: TriageDetail }): JSX.Element {
  const total = Math.max(1, d.total);
  const seg = (n: number): string => `${(n / total) * 100}%`;
  return (
    <span
      aria-hidden
      className="inline-flex h-9 w-6 flex-col-reverse overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-700"
    >
      <i className="journey-seal block w-full border-0" style={{ height: seg(d.sealed) }} />
      <i className="block w-full bg-indigo-600 dark:bg-indigo-500" style={{ height: seg(d.proficient) }} />
      <i className="block w-full bg-indigo-200 dark:bg-indigo-900" style={{ height: seg(d.attempted) }} />
      <i className="block w-full bg-slate-50 dark:bg-slate-800" style={{ height: seg(d.notStarted) }} />
    </span>
  );
}

export function TeacherClassHeatmap({
  columns,
  students,
  entries,
  triage,
  onOpenAttempt,
  onNudgeStudent,
}: TeacherClassHeatmapProps): JSX.Element {
  const [sort, setSort] = useState<SortMode>("attention");

  // Per-student derived mastery points across all columns.
  const points = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students) {
      let pts = 0;
      for (const col of columns) {
        const e = entries.get(col.refId)?.get(s.id);
        if (!e) continue;
        const state = masteryState(e.score, true, false);
        pts += earnedPoints(possiblePoints(col.kind), state);
      }
      map.set(s.id, pts);
    }
    return map;
  }, [students, columns, entries]);

  const sorted = useMemo(() => {
    const list = [...students];
    if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "points") {
      list.sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0));
    } else {
      list.sort((a, b) => (points.get(a.id) ?? 0) - (points.get(b.id) ?? 0));
    }
    return list;
  }, [students, sort, points]);

  // Group contiguous columns by unit for the header band.
  const groups = useMemo(() => {
    const out: Array<{ name: string; span: number }> = [];
    for (const col of columns) {
      const last = out[out.length - 1];
      if (last && last.name === col.unitName) last.span += 1;
      else out.push({ name: col.unitName, span: 1 });
    }
    return out;
  }, [columns]);

  const maxPoints = Math.max(0, ...points.values());

  if (columns.length === 0 || students.length === 0) {
    return (
      <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-slate-200 dark:ring-slate-800 p-8 text-center space-y-1">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Nothing to map yet
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The heatmap needs published assignments and enrolled students.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="page-title text-base font-semibold text-slate-900 dark:text-slate-100">
          Class journey
        </h3>
        <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
          {students.length} student{students.length === 1 ? "" : "s"} ·{" "}
          {columns.length} checkpoint{columns.length === 1 ? "" : "s"}
        </span>
        <div
          className="ml-auto inline-flex items-center rounded-full bg-indigo-600/[0.08] dark:bg-indigo-400/10 p-0.5"
          role="tablist"
          aria-label="Sort students"
        >
          {(
            [
              ["attention", "Needs attention"],
              ["points", "Points"],
              ["name", "Name"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={sort === mode}
              onClick={() => setSort(mode)}
              className={`min-h-[30px] rounded-full px-3 text-[11px] font-semibold motion-safe:transition-colors ${
                sort === mode
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto thin-scrollbar">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th aria-hidden className="min-w-[150px]" />
              {groups.map((g, i) => (
                <th
                  key={`${g.name}-${i}`}
                  colSpan={g.span}
                  className="border-b border-slate-200 dark:border-slate-700 pb-1 text-center text-[9.5px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300"
                >
                  {g.name}
                </th>
              ))}
              <th aria-hidden />
            </tr>
            <tr>
              <th aria-hidden />
              {columns.map((col) => (
                <th key={col.refId} className="h-24 px-1 align-bottom">
                  <span
                    className="inline-block max-h-[88px] overflow-hidden whitespace-nowrap text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 [writing-mode:vertical-rl] rotate-180"
                    title={col.title}
                  >
                    {col.title.length > 18 ? `${col.title.slice(0, 17)}…` : col.title}
                  </span>
                </th>
              ))}
              <th className="pb-1 pr-1 text-right text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Pinned class summary row — the at-a-glance read. */}
            <tr>
              <td className="border-b-2 border-slate-200 dark:border-slate-700 py-2 pr-2 text-left text-xs font-bold text-indigo-800 dark:text-indigo-300">
                Class
              </td>
              {columns.map((col) => {
                const d = triage.get(col.refId);
                if (!d) {
                  return (
                    <td key={col.refId} className="border-b-2 border-slate-200 dark:border-slate-700 px-1 py-2 text-center text-[10px] text-slate-400">
                      —
                    </td>
                  );
                }
                const rate = d.total > 0 ? d.sealed / d.total : 0;
                const warn = rate < WARN_SEALED_RATE;
                return (
                  <td
                    key={col.refId}
                    className="border-b-2 border-slate-200 dark:border-slate-700 px-1 py-2 text-center"
                    title={`${col.title} · ${d.sealed} sealed · ${d.proficient} proficient · ${d.attempted} attempted · ${d.notStarted} not started`}
                  >
                    <MiniBar d={d} />
                    <span
                      className={`mt-1 block text-[9.5px] font-semibold tabular-nums ${
                        warn
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {Math.round(rate * 100)}%
                      {warn && (
                        <span aria-hidden className="ml-0.5 inline-block h-1 w-1 rounded-full bg-rose-500 align-super" />
                      )}
                    </span>
                  </td>
                );
              })}
              <td className="border-b-2 border-slate-200 dark:border-slate-700 py-2 pr-1 text-right text-xs font-bold tabular-nums text-amber-800 dark:text-amber-300">
                avg{" "}
                {students.length > 0
                  ? Math.round(
                      [...points.values()].reduce((a, b) => a + b, 0) /
                        students.length,
                    )
                  : 0}
              </td>
            </tr>

            {sorted.map((s) => {
              const pts = points.get(s.id) ?? 0;
              const struggling = pts < maxPoints * 0.25;
              return (
                <tr key={s.id}>
                  <td
                    className={`border-t border-slate-100 dark:border-slate-800 py-1.5 pr-2 text-left text-xs font-semibold whitespace-nowrap ${
                      struggling
                        ? "text-rose-700 dark:text-rose-400"
                        : "text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/50 align-middle text-[9px] font-bold text-indigo-700 dark:text-indigo-300"
                    >
                      {initials(s.name)}
                    </span>
                    {s.name}
                  </td>
                  {columns.map((col) => {
                    const e = entries.get(col.refId)?.get(s.id);
                    const state: MasteryState = e
                      ? masteryState(e.score, true, false)
                      : "not_started";
                    const tip = `${s.name} · ${col.title} · ${
                      e
                        ? e.score !== null
                          ? `${Math.round(e.score)}%`
                          : "submitted"
                        : "not started"
                    }`;
                    const clickable = !!e?.attemptId;
                    return (
                      <td key={col.refId} className="border-t border-slate-100 dark:border-slate-800 px-1 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={!clickable}
                          title={tip}
                          aria-label={tip}
                          onClick={() =>
                            e?.attemptId && onOpenAttempt(col.refId, e.attemptId)
                          }
                          className={`inline-flex h-5 w-5 rounded border-2 align-middle ${
                            e
                              ? STATE_CLASS[state]
                              : "bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900"
                          } ${clickable ? "hover:scale-110 motion-safe:transition-transform cursor-pointer" : "cursor-default"}`}
                        />
                      </td>
                    );
                  })}
                  <td className="border-t border-slate-100 dark:border-slate-800 py-1.5 pr-1 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {pts}
                    {struggling && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => onNudgeStudent(s)}
                          className="font-semibold text-indigo-700 dark:text-indigo-300 hover:underline underline-offset-2"
                        >
                          Nudge →
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10.5px] text-slate-400 dark:text-slate-500">
        Cells show each student's best attempt; click a filled cell to open
        it. Full-length tests live on their per-test overview.
      </p>
    </div>
  );
}
