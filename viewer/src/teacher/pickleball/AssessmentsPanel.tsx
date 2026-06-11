/**
 * AssessmentsPanel — teacher surface for recording per-player skill assessments.
 *
 * Flow:
 *   1. Pick a player from the course roster.
 *   2. Score each of the 10 fixed pickleball skills (PICKLEBALL_SKILLS) on a
 *      1.0–5.0 ladder in 0.5 steps via a segmented control.
 *   3. Choose the assessment type (intake / progress / level-up).
 *   4. The overall level auto-suggests the average of the graded skills; the
 *      coach can override it (an override requires a reason).
 *   5. Optional notes via MarkdownEditor.
 *   Saved through `pk_record_assessment` (immutable snapshot insert).
 *
 * Below the form, the selected player's latest skill matrix + a pure-SVG
 * per-skill trend (newest assessments left→right) is rendered from
 * `pk_player_skill_series`.
 *
 * Skeleton load, empty state with CTA, toast feedback.
 *
 * Prop contract (do not change): { courseId: string }.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Combobox, MarkdownEditor, useToast } from "@/components";
import { Skeleton, SkeletonRows } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PICKLEBALL_SKILLS } from "@/lib/pickleballSkills";

type AssessmentType = "intake" | "progress" | "level_up";

const TYPE_OPTIONS: { value: AssessmentType; label: string }[] = [
  { value: "intake", label: "Intake" },
  { value: "progress", label: "Progress" },
  { value: "level_up", label: "Level-up" },
];

// Score ladder for an individual skill: 1.0 → 5.0 in half-steps.
const SCORE_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

interface RosterRow {
  student_id: string;
  display_name: string | null;
  email: string;
}

interface MembershipRow {
  student_id: string;
  student: {
    display_name: string | null;
    email: string;
  } | null;
}

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

const inputCls =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function fmtScore(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

// Skills are scored 1.0–5.0; the overall level uses the
// USA-Pickleball/DUPR 2.0–5.5 band. These two scales are NOT the same, so the
// raw skill average must be re-mapped onto the level band before suggesting it.
const SKILL_MIN = 1;
const SKILL_MAX = 5;
const LEVEL_MIN = 2.0;
const LEVEL_MAX = 5.5;

// Raw mean of the graded 1–5 skill scores (rounded to nearest half-step).
function skillAverage(scores: Record<string, number>): number | null {
  const vals = Object.values(scores).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(avg * 2) / 2;
}

// Map a 1–5 skill average onto the 2.0–5.5 overall-level band (linear),
// rounded to the nearest 0.5 and clamped to the band.
function skillAvgToLevel(avg: number | null): number | null {
  if (avg == null) return null;
  const mapped =
    LEVEL_MIN + ((avg - SKILL_MIN) / (SKILL_MAX - SKILL_MIN)) * (LEVEL_MAX - LEVEL_MIN);
  const rounded = Math.round(mapped * 2) / 2;
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, rounded));
}

// ─── Segmented score control ────────────────────────────────────────────────

function ScoreControl({
  skillSlug,
  label,
  value,
  onChange,
}: {
  skillSlug: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={`${label} score`}
        className="flex flex-wrap gap-1"
      >
        {SCORE_STEPS.map((step) => {
          const active = value === step;
          return (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${label} ${fmtScore(step)}`}
              onClick={() => onChange(active ? null : step)}
              className={`min-h-[40px] min-w-[40px] rounded-md px-2 text-xs font-semibold transition ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
              data-skill={skillSlug}
            >
              {fmtScore(step)}
            </button>
          );
        })}
      </div>
    </div>
  );
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
    // A single reading: show a dot at its relative height.
    const v = points[0].score;
    const y = H - PAD - ((v - 1) / 4) * (H - 2 * PAD);
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <circle cx={W / 2} cy={y} r={2.5} className="fill-indigo-500" />
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
        className="stroke-indigo-500"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} className="fill-indigo-500" />
    </svg>
  );
}

// ─── Latest matrix for a player ─────────────────────────────────────────────

function SkillMatrix({ series }: { series: SkillSeries }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Latest skill matrix
      </h4>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
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
  );
}

export function AssessmentsPanel({ courseId }: { courseId: string }) {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [series, setSeries] = useState<SkillSeries | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);

  // Composer state.
  const [scores, setScores] = useState<Record<string, number>>({});
  const [type, setType] = useState<AssessmentType>("progress");
  const [overrideLevel, setOverrideLevel] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [notesMd, setNotesMd] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const loadRoster = useCallback(async (): Promise<void> => {
    setLoadingRoster(true);
    const { data, error } = await supabase
      .from("course_memberships")
      .select(
        "student_id, student:profiles!course_memberships_student_id_fkey(display_name, email)",
      )
      .eq("course_id", courseId)
      .order("joined_at", { ascending: true });
    if (!aliveRef.current) return;
    if (error) {
      toast.error("Couldn't load players", error.message);
      setRoster([]);
    } else {
      const rows = (data ?? []) as unknown as MembershipRow[];
      setRoster(
        rows.map((r) => ({
          student_id: r.student_id,
          display_name: r.student?.display_name ?? null,
          email: r.student?.email ?? "",
        })),
      );
    }
    setLoadingRoster(false);
  }, [courseId, toast]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const loadSeries = useCallback(
    async (playerId: string): Promise<void> => {
      setLoadingSeries(true);
      const { data, error } = await supabase.rpc("pk_player_skill_series", {
        p_course_id: courseId,
        p_player_id: playerId,
      });
      if (!aliveRef.current) return;
      setLoadingSeries(false);
      if (error) {
        toast.error("Couldn't load assessments", error.message);
        setSeries(null);
        return;
      }
      setSeries((data ?? null) as SkillSeries | null);
    },
    [courseId, toast],
  );

  const selectPlayer = (playerId: string): void => {
    setSelectedId(playerId);
    setSeries(null);
    // Reset composer for the newly selected player.
    setScores({});
    setType("progress");
    setOverrideLevel("");
    setOverrideReason("");
    setNotesMd("");
    void loadSeries(playerId);
  };

  const skillAvg = useMemo(() => skillAverage(scores), [scores]);
  const suggested = useMemo(() => skillAvgToLevel(skillAvg), [skillAvg]);
  const hasOverride = overrideLevel.trim() !== "";
  const effectiveLevel = hasOverride ? Number(overrideLevel) : suggested;

  const setSkillScore = (slug: string, v: number | null): void => {
    setScores((prev) => {
      const next = { ...prev };
      if (v == null) delete next[slug];
      else next[slug] = v;
      return next;
    });
  };

  const canSave =
    selectedId != null && Object.keys(scores).length > 0 && !saving;

  const onSave = async (): Promise<void> => {
    if (!selectedId || saving) return;
    if (Object.keys(scores).length === 0) {
      toast.error("Score at least one skill");
      return;
    }
    if (hasOverride && overrideReason.trim() === "") {
      toast.error("Add a reason for the level override");
      return;
    }
    if (hasOverride && !Number.isFinite(Number(overrideLevel))) {
      toast.error("Override level must be a number");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("pk_record_assessment", {
      p_course_id: courseId,
      p_player_id: selectedId,
      p_type: type,
      p_scores: scores,
      p_overall_level: effectiveLevel ?? null,
      p_notes: notesMd.trim() === "" ? null : notesMd,
      p_override_reason:
        hasOverride && overrideReason.trim() !== "" ? overrideReason.trim() : null,
      p_corrects_id: null,
    });
    if (!aliveRef.current) return;
    setSaving(false);
    if (error) {
      toast.error("Couldn't record assessment", error.message);
      return;
    }
    toast.success("Assessment recorded");
    // Reset composer + refresh the matrix.
    setScores({});
    setOverrideLevel("");
    setOverrideReason("");
    setNotesMd("");
    void loadSeries(selectedId);
  };

  const nameOf = (r: RosterRow): string =>
    r.display_name?.trim() || r.email || "Player";

  const selectedRow = roster.find((r) => r.student_id === selectedId) ?? null;

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-5">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Skill assessments
      </h3>

      {loadingRoster ? (
        <SkeletonRows count={3} />
      ) : roster.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No players enrolled yet"
          body="Add players to this course from the People tab, then record their skill assessments here."
        />
      ) : (
        <>
          {/* Player picker */}
          <div>
            <label
              htmlFor="pk-assess-player"
              className="mb-1 block text-xs text-slate-500 dark:text-slate-400"
            >
              Player
            </label>
            <Combobox
              id="pk-assess-player"
              value={selectedId}
              onChange={(v) => selectPlayer(v)}
              options={roster.map((r) => ({
                value: r.student_id,
                label: nameOf(r),
              }))}
              placeholder="Choose a player…"
              ariaLabel="Player"
              className="max-w-md"
            />
          </div>

          {selectedId == null ? (
            <EmptyState
              icon="sparkles"
              title="Pick a player to begin"
              body="Select a player above to view their skill history and record a new assessment."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Composer */}
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Record assessment
                  </p>
                  {selectedRow && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      for {nameOf(selectedRow)}
                    </p>
                  )}
                </div>

                {/* Type */}
                <div>
                  <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                    Type
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Assessment type"
                    className="inline-flex rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 p-0.5"
                  >
                    {TYPE_OPTIONS.map((opt) => {
                      const active = type === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setType(opt.value)}
                          className={`min-h-[40px] rounded-md px-3 text-sm font-medium transition ${
                            active
                              ? "bg-indigo-600 text-white"
                              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Skill scores */}
                <div className="space-y-3 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Per-skill scores
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Scale 1.0–5.0 (0.5 steps)
                    </span>
                  </div>
                  {PICKLEBALL_SKILLS.map((skill) => (
                    <ScoreControl
                      key={skill.slug}
                      skillSlug={skill.slug}
                      label={skill.label}
                      value={scores[skill.slug] ?? null}
                      onChange={(v) => setSkillScore(skill.slug, v)}
                    />
                  ))}
                </div>

                {/* Overall level */}
                <div className="space-y-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Overall level{" "}
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        (2.0–5.5)
                      </span>
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Suggested:{" "}
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {suggested == null ? "—" : fmtScore(suggested)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="pk-assess-override" className="sr-only">
                      Override overall level
                    </label>
                    <input
                      id="pk-assess-override"
                      type="number"
                      min={LEVEL_MIN}
                      max={LEVEL_MAX}
                      step="0.5"
                      inputMode="decimal"
                      value={overrideLevel}
                      onChange={(e) => setOverrideLevel(e.target.value)}
                      placeholder={
                        suggested == null
                          ? "Override level (2.0–5.5)"
                          : `Override (${fmtScore(suggested)})`
                      }
                      className={`${inputCls} min-h-[40px] max-w-[180px]`}
                    />
                    {hasOverride && (
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideLevel("");
                          setOverrideReason("");
                        }}
                        className="min-h-[40px] rounded-md px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {hasOverride && (
                    <div>
                      <label
                        htmlFor="pk-assess-reason"
                        className="mb-1 block text-xs text-slate-500 dark:text-slate-400"
                      >
                        Override reason{" "}
                        <span className="text-rose-500">(required)</span>
                      </label>
                      <input
                        id="pk-assess-reason"
                        type="text"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Why the manual level?"
                        className={`${inputCls} min-h-[40px]`}
                      />
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <span className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                    Notes
                  </span>
                  <MarkdownEditor
                    value={notesMd}
                    onChange={setNotesMd}
                    placeholder="Coaching observations for this assessment…"
                    minHeight={100}
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      void onSave();
                    }}
                    disabled={!canSave}
                    className="min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Recording…" : "Record assessment"}
                  </button>
                </div>
              </div>

              {/* History / matrix */}
              <div>
                {loadingSeries ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-40 rounded" />
                    <SkeletonRows count={5} />
                  </div>
                ) : series == null || series.count === 0 ? (
                  <EmptyState
                    icon="check"
                    title="No assessments yet"
                    body="Record this player's first assessment to start tracking their skill trajectory."
                  />
                ) : (
                  <div className="space-y-3">
                    {series.overall?.level != null && (
                      <div className="flex items-center justify-between rounded-xl bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2">
                        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                          Current overall level
                        </span>
                        <span className="text-lg font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
                          {fmtScore(series.overall.level)}
                        </span>
                      </div>
                    )}
                    <SkillMatrix series={series} />
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {series.count} assessment
                      {series.count === 1 ? "" : "s"} on record.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
