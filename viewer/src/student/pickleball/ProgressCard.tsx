/**
 * ProgressCard — Pickleball PLAYER-track student card. The signed-in player
 * sees their own skill assessment progress: the 10-skill matrix (latest score +
 * a pure-SVG trend per skill), their current overall level, and a level-up
 * checklist measuring each skill against their program's target level band
 * (level_min / level_max on pickleball_programs).
 *
 * Read-only. Data comes from `pk_player_skill_series` (RLS + RPC both scope to
 * the caller) and the course's programs (RLS scopes to enrolled members).
 *
 * Prop contract (do not change): { courseId: string; studentId: string }.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Skeleton, SkeletonRows } from "@/components";
import { PICKLEBALL_SKILLS } from "@/lib/pickleballSkills";

interface SkillHistoryPoint {
  at: string;
  score: number;
}

interface SkillSeries {
  latest: Record<string, number>;
  history: Record<string, SkillHistoryPoint[]>;
  overall: { level: number | null; at: string } | null;
  count: number;
}

interface ProgramBand {
  id: string;
  name: string;
  level_min: number | null;
  level_max: number | null;
}

function fmtScore(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

// ─── Per-skill trend sparkline (pure inline SVG, no chart lib) ───────────────

function SkillTrend({ points }: { points: SkillHistoryPoint[] }) {
  const W = 72;
  const H = 24;
  const PAD = 3;
  if (points.length === 0) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  }
  if (points.length === 1) {
    const v = points[0].score;
    const y = H - PAD - ((v - 1) / 4) * (H - 2 * PAD);
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <circle cx={W / 2} cy={y} r={2.5} className="fill-emerald-500" />
      </svg>
    );
  }
  const n = points.length;
  const coords = points.map((p, i) => {
    const x = PAD + (i / (n - 1)) * (W - 2 * PAD);
    const y = H - PAD - ((p.score - 1) / 4) * (H - 2 * PAD);
    return { x, y };
  });
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className="overflow-visible"
    >
      <path
        d={path}
        fill="none"
        className="stroke-emerald-500"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} className="fill-emerald-500" />
    </svg>
  );
}

// ─── Level-up checklist ──────────────────────────────────────────────────────
//
// Pick the program whose target band best fits the player's current overall
// level (the band that contains it, else the next band up). Each skill is "met"
// if its latest score >= the band's minimum target.

function pickTargetProgram(
  programs: ProgramBand[],
  overall: number | null,
): ProgramBand | null {
  const banded = programs.filter((p) => p.level_min != null || p.level_max != null);
  if (banded.length === 0) return null;
  const sorted = [...banded].sort(
    (a, b) => (a.level_min ?? a.level_max ?? 0) - (b.level_min ?? b.level_max ?? 0),
  );
  if (overall == null) return sorted[0];
  // Band that currently contains the player.
  const containing = sorted.find(
    (p) =>
      (p.level_min == null || overall >= p.level_min) &&
      (p.level_max == null || overall <= p.level_max),
  );
  if (containing) return containing;
  // Otherwise the lowest band above the player's level (their next target).
  const above = sorted.find((p) => p.level_min != null && overall < p.level_min);
  return above ?? sorted[sorted.length - 1];
}

function CheckIcon({ met }: { met: boolean }) {
  if (met) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 text-emerald-500"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-slate-300 dark:text-slate-600"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function ProgressCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const aliveRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<SkillSeries | null>(null);
  const [programs, setPrograms] = useState<ProgramBand[]>([]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [seriesRes, programsRes] = await Promise.all([
        supabase.rpc("pk_player_skill_series", {
          p_course_id: courseId,
          p_player_id: studentId,
        }),
        supabase
          .from("pickleball_programs")
          .select("id, name, level_min, level_max")
          .eq("course_id", courseId)
          .eq("archived", false)
          .order("sort_order", { ascending: true }),
      ]);
      if (!aliveRef.current) return;
      if (seriesRes.error) throw new Error(seriesRes.error.message);
      setSeries((seriesRes.data ?? null) as SkillSeries | null);
      // Programs are best-effort; a load failure just hides the checklist.
      setPrograms(
        programsRes.error
          ? []
          : ((programsRes.data ?? []) as unknown as ProgramBand[]),
      );
    } catch (err) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err.message : "Couldn't load progress.");
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const wrapCls =
    "rounded-2xl bg-white/80 p-6 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800";

  if (loading) {
    return (
      <div
        className={`space-y-3 ${wrapCls}`}
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <Skeleton className="h-5 w-32 rounded" />
        <SkeletonRows count={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`text-center ${wrapCls}`}
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Couldn't load your progress
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex min-h-[40px] items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (series == null || series.count === 0) {
    return (
      <div
        className={`text-center ${wrapCls}`}
        data-course-id={courseId}
        data-student-id={studentId}
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          My progress
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your coach hasn't recorded any assessments yet — check back soon.
        </p>
      </div>
    );
  }

  const overall = series.overall?.level ?? null;
  const target = pickTargetProgram(programs, overall);
  const targetMin = target?.level_min ?? null;

  return (
    <div
      className={`space-y-5 ${wrapCls}`}
      data-course-id={courseId}
      data-student-id={studentId}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          My progress
        </h2>
        {overall != null && (
          <div className="flex items-baseline gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Level
            </span>
            <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {fmtScore(overall)}
            </span>
          </div>
        )}
      </div>

      {/* Skill matrix */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Skills
        </h3>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800">
          {PICKLEBALL_SKILLS.map((skill) => {
            const latest = series.latest[skill.slug];
            const hist = series.history[skill.slug] ?? [];
            return (
              <li
                key={skill.slug}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-300">
                  {skill.label}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <SkillTrend points={hist} />
                  <span className="w-9 text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {latest == null ? "—" : fmtScore(latest)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Level-up checklist */}
      {target && targetMin != null && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ready to level up?
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {target.name} targets level{" "}
            <span className="font-semibold">{fmtScore(targetMin)}</span>
            {target.level_max != null && (
              <>
                –<span className="font-semibold">{fmtScore(target.level_max)}</span>
              </>
            )}
            . Each skill is met once it reaches {fmtScore(targetMin)}.
          </p>
          <ul className="space-y-1.5">
            {PICKLEBALL_SKILLS.map((skill) => {
              const latest = series.latest[skill.slug];
              const met = latest != null && latest >= targetMin;
              return (
                <li
                  key={skill.slug}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <CheckIcon met={met} />
                    {skill.label}
                  </span>
                  <span
                    className={`tabular-nums ${
                      met
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {latest == null ? "—" : fmtScore(latest)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
