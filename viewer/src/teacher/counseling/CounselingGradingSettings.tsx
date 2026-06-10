/**
 * CounselingGradingSettings
 * =========================
 * The educator's control over the counseling star-grading scheme (migration
 * 0140). The counselor owns whether grading is on, the punctuality/quality
 * split, and the resubmission policy. Renders inside the "Grading" card on
 * CourseSettings, and only for counseling courses.
 *
 * The scheme:
 *   - on_time_stars  — guaranteed baseline for an on-time submission
 *   - late_stars     — what a late submission earns (must be <= on_time_stars)
 *   - quality_max_stars — the most the counselor can add on top for quality
 *   - max_stars      — derived cap = on_time_stars + quality_max_stars
 *   - allow_resubmission / max_resubmissions — resubmit-to-improve policy
 *
 * Reads the row directly under RLS (counselor manages, student reads) and
 * upserts on save, persisting the derived cap so the RPCs and the UI agree.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { useProfile } from "@/lib/profile";
import {
  DEFAULT_GRADING_SETTINGS,
  type GradingSettings,
} from "./grading";

interface Props {
  courseId: string;
}

/** The editable subset (everything except course_id, which is the conflict key,
 *  and max_stars, which we derive on save). */
type EditableSettings = Omit<GradingSettings, "course_id" | "max_stars">;

/** Clamp a free-typed number to the supported 0..10 range; NaN -> floor. */
function clampStars(raw: number, floor = 0): number {
  if (Number.isNaN(raw)) return floor;
  return Math.max(0, Math.min(10, Math.trunc(raw)));
}

export function CounselingGradingSettings({ courseId }: Props) {
  const toast = useToast();
  const { profile } = useProfile();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditableSettings>(DEFAULT_GRADING_SETTINGS);

  // ---------- load ----------
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      const { data, error } = await supabase
        .from("counseling_grading_settings")
        .select("*")
        .eq("course_id", courseId)
        .maybeSingle();
      if (cancelled || !aliveRef.current) return;
      if (error) {
        toast.error("Couldn't load grading settings", error.message);
      }
      const row = (data as GradingSettings | null) ?? null;
      setForm(
        row
          ? {
              enabled: row.enabled,
              on_time_stars: row.on_time_stars,
              late_stars: row.late_stars,
              quality_max_stars: row.quality_max_stars,
              allow_resubmission: row.allow_resubmission,
              max_resubmissions: row.max_resubmissions,
            }
          : { ...DEFAULT_GRADING_SETTINGS },
      );
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
    // toast is stable per Wave 21I; re-run only when the course changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const patch = useCallback((next: Partial<EditableSettings>): void => {
    setForm((prev) => ({ ...prev, ...next }));
  }, []);

  // Derived cap shown in the live preview + persisted as max_stars. The DB
  // CHECK (cgs_stars_sane) requires max_stars BETWEEN 1 AND 10, so guard the
  // derived total before the upsert or it hard-errors.
  const maxStars = form.on_time_stars + form.quality_max_stars;
  const lateExceedsOnTime = form.late_stars > form.on_time_stars;
  const maxStarsOutOfRange = maxStars < 1 || maxStars > 10;
  const canSave = !lateExceedsOnTime && !maxStarsOutOfRange;

  // ---------- save ----------
  const onSave = async (): Promise<void> => {
    if (lateExceedsOnTime) {
      toast.error(
        "Late can't beat on time",
        "Late stars must be less than or equal to on-time stars.",
      );
      return;
    }
    if (maxStarsOutOfRange) {
      toast.error(
        "Total stars out of range",
        "On-time + quality stars must total between 1 and 10.",
      );
      return;
    }
    setSaving(true);
    let userId = profile?.id ?? null;
    if (!userId) {
      const { data: auth } = await supabase.auth.getUser();
      userId = auth.user?.id ?? null;
    }
    const { error } = await supabase
      .from("counseling_grading_settings")
      .upsert(
        {
          course_id: courseId,
          enabled: form.enabled,
          on_time_stars: form.on_time_stars,
          late_stars: form.late_stars,
          quality_max_stars: form.quality_max_stars,
          max_stars: maxStars,
          allow_resubmission: form.allow_resubmission,
          max_resubmissions: form.max_resubmissions,
          updated_by: userId,
        },
        { onConflict: "course_id" },
      );
    if (!aliveRef.current) return;
    setSaving(false);
    if (error) {
      toast.error("Couldn't save grading settings", error.message);
      return;
    }
    toast.success("Grading settings saved");
  };

  if (loading) {
    return <SkeletonRows count={5} rowClassName="h-10" />;
  }

  return (
    <div className="space-y-5">
      {/* Master enable toggle */}
      <label className="inline-flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="mt-0.5 h-5 w-5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-sm text-slate-700 dark:text-slate-200">
          <span className="font-medium">Star grading</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {form.enabled
              ? "Gradable tasks earn stars for punctuality, plus counselor-awarded quality stars."
              : "Tasks use the simple open / done flow with no stars."}
          </span>
        </span>
      </label>

      {/* The scheme — dim when disabled but keep editable so a counselor can set
          it up before flipping grading on. */}
      <div
        className={`space-y-5 transition-opacity ${
          form.enabled ? "" : "opacity-60"
        }`}
      >
        {/* Punctuality split */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Punctuality (locked at submission)
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StarNumberField
              id="on-time-stars"
              label="On-time stars"
              hint="Baseline earned when submitted on or before the due date."
              value={form.on_time_stars}
              onChange={(v) => patch({ on_time_stars: clampStars(v) })}
            />
            <StarNumberField
              id="late-stars"
              label="Late stars"
              hint="Earned for a late submission. Must be ≤ on-time stars."
              value={form.late_stars}
              onChange={(v) => patch({ late_stars: clampStars(v) })}
              invalid={lateExceedsOnTime}
            />
          </div>
          {lateExceedsOnTime && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Late stars can't be greater than on-time stars.
            </p>
          )}
        </fieldset>

        {/* Quality */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Quality (counselor-awarded after review)
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StarNumberField
              id="quality-max-stars"
              label="Max quality stars"
              hint="The most you can add on top of the punctuality baseline."
              value={form.quality_max_stars}
              onChange={(v) => patch({ quality_max_stars: clampStars(v) })}
            />
          </div>
        </fieldset>

        {/* Live preview */}
        <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-900 px-4 py-3 space-y-1">
          <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
            On time = {form.on_time_stars}{" "}
            {form.on_time_stars === 1 ? "star" : "stars"}; up to{" "}
            {form.quality_max_stars} quality → {maxStars} max
          </p>
          <p className="text-xs text-indigo-800/80 dark:text-indigo-300/80">
            On-time submission is the baseline; quality lifts it. A late
            submission earns {form.late_stars}{" "}
            {form.late_stars === 1 ? "star" : "stars"} and can still gain
            quality stars after review.
          </p>
          {maxStarsOutOfRange && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
              On-time + quality must total between 1 and 10 stars (currently{" "}
              {maxStars}).
            </p>
          )}
        </div>

        {/* Resubmission policy */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Resubmission
          </legend>
          <label className="inline-flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allow_resubmission}
              onChange={(e) =>
                patch({ allow_resubmission: e.target.checked })
              }
              className="mt-0.5 h-5 w-5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-medium">Allow resubmission</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Students can resubmit to improve a grade; punctuality stays
                locked from the first submission.
              </span>
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StarNumberField
              id="max-resubmissions"
              label="Max resubmissions"
              hint="How many times a task may be resubmitted."
              value={form.max_resubmissions}
              onChange={(v) => patch({ max_resubmissions: clampStars(v) })}
              disabled={!form.allow_resubmission}
            />
          </div>
        </fieldset>
      </div>

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          disabled={saving || !canSave}
          onClick={() => {
            void onSave();
          }}
          className="min-h-[40px] rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save grading settings"}
        </button>
      </div>
    </div>
  );
}

interface StarNumberFieldProps {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  invalid?: boolean;
}

function StarNumberField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled = false,
  invalid = false,
}: StarNumberFieldProps) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-slate-700 dark:text-slate-200"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={10}
        step={1}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-invalid={invalid}
        className={`w-full min-h-[40px] rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          invalid
            ? "border-rose-400 dark:border-rose-700 focus:ring-rose-500"
            : "border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
        }`}
      />
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}
