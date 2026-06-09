/**
 * StudentCounselingProfileCard
 * ============================
 * The STUDENT-facing editable form for THEIR OWN college-counseling profile
 * within a course. One row per (course, student) in the `counseling_profiles`
 * table (UNIQUE(course_id, student_id)); the viewer is the STUDENT and RLS lets
 * a student SELECT/INSERT/UPDATE their own row. The row may not exist yet —
 * that's normal and is treated as an empty profile until the first save UPSERTs
 * it.
 *
 * Mirrors the counselor-side CounselingProfilePanel: a single editable form
 * (not inline-per-field) with one dirty-gated "Save" button. Scalar fields
 * (grad year, GPA, intended major, goals) plus SAT/ACT folded into the
 * `test_scores` jsonb object, plus an editable `activities` jsonb list (add/
 * remove rows with name/role/hours). Saving UPDATEs by id when a row exists,
 * else INSERTs (with course_id + student_id), then refetches + toasts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";

interface Activity {
  name: string;
  role?: string;
  hours_per_week?: number;
}

interface ProfileRow {
  id: string;
  course_id: string;
  student_id: string;
  grad_year: number | null;
  gpa: number | null;
  intended_major: string | null;
  goals: string | null;
  activities: Activity[];
  test_scores: { sat?: number; act?: number };
}

interface FormState {
  gradYear: string;
  gpa: string;
  intendedMajor: string;
  sat: string;
  act: string;
  goals: string;
  activities: Activity[];
}

const EMPTY_FORM: FormState = {
  gradYear: "",
  gpa: "",
  intendedMajor: "",
  sat: "",
  act: "",
  goals: "",
  activities: [],
};

/** Empty string → null; otherwise Number(...) (NaN guarded back to null). */
function toNumOrNull(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toTextOrNull(raw: string): string | null {
  const s = raw.trim();
  return s === "" ? null : s;
}

function rowToForm(row: ProfileRow | null): FormState {
  if (!row) return { ...EMPTY_FORM, activities: [] };
  return {
    gradYear: row.grad_year == null ? "" : String(row.grad_year),
    gpa: row.gpa == null ? "" : String(row.gpa),
    intendedMajor: row.intended_major ?? "",
    sat: row.test_scores?.sat == null ? "" : String(row.test_scores.sat),
    act: row.test_scores?.act == null ? "" : String(row.test_scores.act),
    goals: row.goals ?? "",
    activities: Array.isArray(row.activities)
      ? row.activities.map((a) => ({
          name: a?.name ?? "",
          role: a?.role ?? "",
          hours_per_week: a?.hours_per_week,
        }))
      : [],
  };
}

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const LABEL_CLASS =
  "text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";

export function StudentCounselingProfileCard({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}) {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [rowId, setRowId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const { data, error } = await supabase
      .from("counseling_profiles")
      .select("*")
      .eq("course_id", courseId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!aliveRef.current) return;
    if (error) {
      toast.error("Couldn't load your profile", error.message);
      setLoading(false);
      return;
    }
    const row = (data as ProfileRow | null) ?? null;
    setRowId(row?.id ?? null);
    setForm(rowToForm(row));
    setDirty(false);
    setLoading(false);
  }, [courseId, studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Generic scalar-field updater that also flips the dirty flag.
  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // Activity helpers (immutable updates).
  const addActivity = (): void => {
    setForm((prev) => ({
      ...prev,
      activities: [...prev.activities, { name: "", role: "", hours_per_week: undefined }],
    }));
    setDirty(true);
  };

  const removeActivity = (idx: number): void => {
    setForm((prev) => ({
      ...prev,
      activities: prev.activities.filter((_, i) => i !== idx),
    }));
    setDirty(true);
  };

  const updateActivity = (idx: number, patch: Partial<Activity>): void => {
    setForm((prev) => ({
      ...prev,
      activities: prev.activities.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
    setDirty(true);
  };

  const onSave = async (): Promise<void> => {
    setSaving(true);

    // Normalise activities: drop fully-blank rows, coerce hours to number|undefined.
    const activities: Activity[] = form.activities
      .map((a) => {
        const name = a.name.trim();
        const role = (a.role ?? "").trim();
        const hours =
          a.hours_per_week == null || Number.isNaN(a.hours_per_week)
            ? undefined
            : Number(a.hours_per_week);
        const out: Activity = { name };
        if (role) out.role = role;
        if (hours != null) out.hours_per_week = hours;
        return out;
      })
      .filter((a) => a.name !== "" || a.role || a.hours_per_week != null);

    const test_scores: { sat?: number; act?: number } = {};
    const sat = toNumOrNull(form.sat);
    const act = toNumOrNull(form.act);
    if (sat != null) test_scores.sat = sat;
    if (act != null) test_scores.act = act;

    const fields = {
      grad_year: toNumOrNull(form.gradYear),
      gpa: toNumOrNull(form.gpa),
      intended_major: toTextOrNull(form.intendedMajor),
      goals: toTextOrNull(form.goals),
      activities,
      test_scores,
    };

    const { error } = rowId
      ? await supabase.from("counseling_profiles").update(fields).eq("id", rowId)
      : await supabase.from("counseling_profiles").insert({
          course_id: courseId,
          student_id: studentId,
          ...fields,
        });

    if (!aliveRef.current) return;
    setSaving(false);
    if (error) {
      toast.error("Couldn't save your profile", error.message);
      return;
    }
    toast.success("Profile saved");
    void load();
  };

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        My profile
      </h3>

      {loading ? (
        <SkeletonRows count={3} />
      ) : (
        <div className="space-y-5">
          {/* Scalar fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className={LABEL_CLASS}>Grad year</span>
              <input
                type="number"
                value={form.gradYear}
                onChange={(e) => update("gradYear", e.target.value)}
                placeholder="2027"
                className={FIELD_CLASS}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={LABEL_CLASS}>GPA</span>
              <input
                type="number"
                step="0.01"
                value={form.gpa}
                onChange={(e) => update("gpa", e.target.value)}
                placeholder="3.85"
                className={FIELD_CLASS}
              />
            </label>

            <label className="block space-y-1.5 sm:col-span-2">
              <span className={LABEL_CLASS}>Intended major</span>
              <input
                type="text"
                value={form.intendedMajor}
                onChange={(e) => update("intendedMajor", e.target.value)}
                placeholder="e.g. Computer Science"
                className={FIELD_CLASS}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={LABEL_CLASS}>SAT</span>
              <input
                type="number"
                value={form.sat}
                onChange={(e) => update("sat", e.target.value)}
                placeholder="1500"
                className={FIELD_CLASS}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={LABEL_CLASS}>ACT</span>
              <input
                type="number"
                value={form.act}
                onChange={(e) => update("act", e.target.value)}
                placeholder="34"
                className={FIELD_CLASS}
              />
            </label>
          </div>

          {/* Activities list */}
          <div className="space-y-2">
            <span className={LABEL_CLASS}>Activities</span>
            {form.activities.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No activities yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {form.activities.map((a, idx) => (
                  <li
                    key={idx}
                    className="flex flex-col gap-2 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 px-3 py-3 sm:flex-row sm:items-center"
                  >
                    <input
                      type="text"
                      value={a.name}
                      onChange={(e) => updateActivity(idx, { name: e.target.value })}
                      placeholder="Activity name"
                      aria-label={`Activity ${idx + 1} name`}
                      className={`${FIELD_CLASS} sm:flex-1`}
                    />
                    <input
                      type="text"
                      value={a.role ?? ""}
                      onChange={(e) => updateActivity(idx, { role: e.target.value })}
                      placeholder="Role"
                      aria-label={`Activity ${idx + 1} role`}
                      className={`${FIELD_CLASS} sm:flex-1`}
                    />
                    <input
                      type="number"
                      value={a.hours_per_week == null ? "" : String(a.hours_per_week)}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        updateActivity(idx, {
                          hours_per_week: v === "" ? undefined : Number(v),
                        });
                      }}
                      placeholder="Hrs/wk"
                      aria-label={`Activity ${idx + 1} hours per week`}
                      className={`${FIELD_CLASS} sm:w-28`}
                    />
                    <button
                      type="button"
                      onClick={() => removeActivity(idx)}
                      aria-label={`Remove activity ${idx + 1}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 ring-rose-300 dark:ring-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M5 5l10 10M15 5L5 15" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={addActivity}
              className="inline-flex h-10 items-center gap-1.5 rounded-md ring-1 ring-slate-300 dark:ring-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M10 4v12M4 10h12" />
              </svg>
              Add activity
            </button>
          </div>

          {/* Goals */}
          <label className="block space-y-1.5">
            <span className={LABEL_CLASS}>Goals</span>
            <textarea
              value={form.goals}
              onChange={(e) => update("goals", e.target.value)}
              rows={4}
              placeholder="Your goals, target schools, notes…"
              className={`${FIELD_CLASS} resize-y`}
            />
          </label>

          {/* Save */}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                void onSave();
              }}
              className="inline-flex h-10 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
