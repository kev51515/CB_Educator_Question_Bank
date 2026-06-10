/**
 * CounselingProfilePanel
 * ======================
 * The counselor-facing editable form for a single student's college-counseling
 * profile within a course. One row per (course, student) in the
 * `counseling_profiles` table (UNIQUE(course_id, student_id)); the viewer is the
 * COUNSELOR and RLS enforces access. The row may not exist yet — that's normal
 * and is treated as an empty profile until the first save UPSERTs it.
 *
 * UI: a single editable form (not inline-per-field) with one "Save profile"
 * button. Scalar fields (grad year, GPA, intended major) plus a rich Goals
 * editor (MarkdownEditor), a structured SAT/ACT score block folded into the
 * `test_scores` jsonb object ({ sat:{total,ebrw,math}, act:{composite} }), and
 * an editable `activities` jsonb list (add/edit/remove rows with
 * name/role/hours_per_week). A profile-completeness meter summarises how many
 * key fields are filled. A "dirty" flag gates Save; saving UPDATEs by id when a
 * row exists, else INSERTs, then refetches.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast, MarkdownEditor } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";

interface Activity {
  name: string;
  role?: string;
  hours_per_week?: number;
}

/** Form-only activity row: a synthetic stable client id for React keys (never persisted). */
interface ActivityRow extends Activity {
  _id: string;
}

/**
 * Structured test scores. The jsonb is intentionally free-form in the schema,
 * so we read defensively and only write the keys we have a value for.
 */
interface SatScores {
  total?: number;
  ebrw?: number;
  math?: number;
}
interface ActScores {
  composite?: number;
}
interface TestScores {
  sat?: SatScores;
  act?: ActScores;
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
  test_scores: TestScores | null;
}

interface FormState {
  gradYear: string;
  gpa: string;
  intendedMajor: string;
  satTotal: string;
  satEbrw: string;
  satMath: string;
  actComposite: string;
  goals: string;
  activities: ActivityRow[];
}

const EMPTY_FORM: FormState = {
  gradYear: "",
  gpa: "",
  intendedMajor: "",
  satTotal: "",
  satEbrw: "",
  satMath: "",
  actComposite: "",
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

/** A jsonb number value may arrive as number or numeric-string. */
function readNum(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return String(Number(v));
  }
  return "";
}

/**
 * Goals may be stored as plain text by an older save, or as HTML once the rich
 * editor wrote it. The MarkdownEditor accepts either transparently, so we just
 * pass the stored string straight through.
 */
function rowToForm(row: ProfileRow | null): FormState {
  if (!row) return { ...EMPTY_FORM, activities: [] };
  const ts = (row.test_scores ?? {}) as TestScores;
  return {
    gradYear: row.grad_year == null ? "" : String(row.grad_year),
    gpa: row.gpa == null ? "" : String(row.gpa),
    intendedMajor: row.intended_major ?? "",
    satTotal: readNum(ts.sat?.total),
    satEbrw: readNum(ts.sat?.ebrw),
    satMath: readNum(ts.sat?.math),
    actComposite: readNum(ts.act?.composite),
    goals: row.goals ?? "",
    activities: Array.isArray(row.activities)
      ? row.activities.map((a) => ({
          _id: crypto.randomUUID(),
          name: a?.name ?? "",
          role: a?.role ?? "",
          hours_per_week: a?.hours_per_week,
        }))
      : [],
  };
}

/** A textual goals value — MarkdownEditor emits HTML, so strip tags for "filled?" checks. */
function goalsHasText(goals: string): boolean {
  return goals.replace(/<[^>]*>/g, "").trim() !== "";
}

const FIELD_CLASS =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const LABEL_CLASS =
  "text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";
const HINT_CLASS = "text-xs text-slate-400 dark:text-slate-500";
const WARN_CLASS = "text-xs text-amber-600 dark:text-amber-400";

/** Inline range hint that turns amber when an out-of-range value is present. */
function rangeWarn(raw: string, lo: number, hi: number): string | null {
  const n = toNumOrNull(raw);
  if (n == null) return null;
  return n < lo || n > hi ? `Expected ${lo}–${hi}` : null;
}

export function CounselingProfilePanel({
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
      toast.error("Couldn't load profile", error.message);
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
      activities: [
        ...prev.activities,
        { _id: crypto.randomUUID(), name: "", role: "", hours_per_week: undefined },
      ],
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

  // Completeness: count how many of the key fields are filled.
  const completeness = useMemo(() => {
    const hasActivity = form.activities.some((a) => a.name.trim() !== "");
    const hasScore =
      toNumOrNull(form.satTotal) != null ||
      toNumOrNull(form.satEbrw) != null ||
      toNumOrNull(form.satMath) != null ||
      toNumOrNull(form.actComposite) != null;
    const checks: boolean[] = [
      form.gradYear.trim() !== "",
      form.gpa.trim() !== "",
      form.intendedMajor.trim() !== "",
      goalsHasText(form.goals),
      hasActivity,
      hasScore,
    ];
    const filled = checks.filter(Boolean).length;
    return { filled, total: checks.length, pct: Math.round((filled / checks.length) * 100) };
  }, [form]);

  const onSave = async (): Promise<void> => {
    setSaving(true);

    // Normalise activities: drop the synthetic _id, drop fully-blank rows, coerce
    // hours to number|undefined. The mapped `out` object intentionally omits `_id`
    // so the persisted jsonb stays { name, role, hours_per_week } only.
    const activities: Activity[] = form.activities
      .map((a) => {
        const name = a.name.trim();
        const role = (a.role ?? "").trim();
        const hours =
          a.hours_per_week == null || Number.isNaN(a.hours_per_week)
            ? undefined
            : Math.max(0, Number(a.hours_per_week));
        const out: Activity = { name };
        if (role) out.role = role;
        if (hours != null) out.hours_per_week = hours;
        return out;
      })
      .filter((a) => a.name !== "" || a.role || a.hours_per_week != null);

    // Structured test scores — only include keys we actually have.
    const sat: SatScores = {};
    const satTotal = toNumOrNull(form.satTotal);
    const satEbrw = toNumOrNull(form.satEbrw);
    const satMath = toNumOrNull(form.satMath);
    if (satTotal != null) sat.total = satTotal;
    if (satEbrw != null) sat.ebrw = satEbrw;
    if (satMath != null) sat.math = satMath;

    const act: ActScores = {};
    const actComposite = toNumOrNull(form.actComposite);
    if (actComposite != null) act.composite = actComposite;

    const test_scores: TestScores = {};
    if (Object.keys(sat).length > 0) test_scores.sat = sat;
    if (Object.keys(act).length > 0) test_scores.act = act;

    const fields = {
      grad_year: toNumOrNull(form.gradYear),
      gpa: toNumOrNull(form.gpa),
      intended_major: toTextOrNull(form.intendedMajor),
      // MarkdownEditor emits HTML; persist null when there's no real text (an
      // empty editor leaves behind "<p></p>"/"<p><br></p>" which is non-null).
      goals: goalsHasText(form.goals) ? form.goals : null,
      activities,
      // Store null rather than {} when no scores are present (consistent with goals/gpa).
      test_scores: Object.keys(test_scores).length > 0 ? test_scores : null,
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
      toast.error("Couldn't save profile", error.message);
      return;
    }
    toast.success("Profile saved");
    void load();
  };

  const satTotalWarn = rangeWarn(form.satTotal, 400, 1600);
  const satEbrwWarn = rangeWarn(form.satEbrw, 200, 800);
  const satMathWarn = rangeWarn(form.satMath, 200, 800);
  const actWarn = rangeWarn(form.actComposite, 1, 36);

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Student profile
        </h3>
      </div>

      {loading ? (
        <SkeletonRows count={4} />
      ) : (
        <div className="space-y-6">
          {/* Completeness meter */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={LABEL_CLASS}>Profile completeness</span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {completeness.pct}% complete
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
              role="progressbar"
              aria-valuenow={completeness.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Profile completeness"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  completeness.pct >= 100
                    ? "bg-emerald-500"
                    : completeness.pct >= 50
                      ? "bg-indigo-500"
                      : "bg-amber-500"
                }`}
                style={{ width: `${completeness.pct}%` }}
              />
            </div>
            <p className={HINT_CLASS}>
              {completeness.filled} of {completeness.total} key fields filled
            </p>
          </div>

          {/* Scalar fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className={LABEL_CLASS}>Grad year</span>
              <input
                type="number"
                min={2020}
                max={2035}
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
                min={0}
                max={5}
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
          </div>

          {/* Test scores */}
          <div className="space-y-3">
            <span className={LABEL_CLASS}>Test scores</span>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <label className="block space-y-1.5">
                <span className={HINT_CLASS}>SAT total</span>
                <input
                  type="number"
                  value={form.satTotal}
                  onChange={(e) => update("satTotal", e.target.value)}
                  placeholder="1500"
                  aria-label="SAT total score"
                  className={FIELD_CLASS}
                />
                {satTotalWarn ? <span className={WARN_CLASS}>{satTotalWarn}</span> : null}
              </label>
              <label className="block space-y-1.5">
                <span className={HINT_CLASS}>SAT EBRW</span>
                <input
                  type="number"
                  value={form.satEbrw}
                  onChange={(e) => update("satEbrw", e.target.value)}
                  placeholder="750"
                  aria-label="SAT EBRW score"
                  className={FIELD_CLASS}
                />
                {satEbrwWarn ? <span className={WARN_CLASS}>{satEbrwWarn}</span> : null}
              </label>
              <label className="block space-y-1.5">
                <span className={HINT_CLASS}>SAT Math</span>
                <input
                  type="number"
                  value={form.satMath}
                  onChange={(e) => update("satMath", e.target.value)}
                  placeholder="750"
                  aria-label="SAT Math score"
                  className={FIELD_CLASS}
                />
                {satMathWarn ? <span className={WARN_CLASS}>{satMathWarn}</span> : null}
              </label>
              <label className="block space-y-1.5">
                <span className={HINT_CLASS}>ACT composite</span>
                <input
                  type="number"
                  value={form.actComposite}
                  onChange={(e) => update("actComposite", e.target.value)}
                  placeholder="34"
                  aria-label="ACT composite score"
                  className={FIELD_CLASS}
                />
                {actWarn ? <span className={WARN_CLASS}>{actWarn}</span> : null}
              </label>
            </div>
          </div>

          {/* Activities list */}
          <div className="space-y-2">
            <span className={LABEL_CLASS}>Activities</span>
            {form.activities.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No activities yet. Add the student's extracurriculars, leadership roles, and
                weekly time commitments.
              </p>
            ) : (
              <ul className="space-y-2">
                {form.activities.map((a, idx) => (
                  <li
                    key={a._id}
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
                      min={0}
                      value={a.hours_per_week == null ? "" : String(a.hours_per_week)}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        updateActivity(idx, {
                          hours_per_week: v === "" ? undefined : Math.max(0, Number(v)),
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

          {/* Goals (rich text) */}
          <div className="space-y-1.5">
            <span className={LABEL_CLASS}>Goals</span>
            <MarkdownEditor
              value={form.goals}
              onChange={(html) => update("goals", html)}
              placeholder="Counseling goals, target schools, narrative themes, notes…"
              minHeight={140}
            />
          </div>

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
