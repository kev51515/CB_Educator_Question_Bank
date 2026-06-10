/**
 * TestScheduleEditor
 * ==================
 * Teacher control for PARTIAL / SCHEDULED module deployment of a full test in a
 * given course (migrations 0143/0144). For each module the teacher chooses:
 *   • whether it's DEPLOYED at all (exclude Math to ship a "Reading & Writing
 *     only" test — a permanent subset), and
 *   • when it OPENS ("Now", or a date/time — meter the test out over days).
 *
 * Deployed modules must form a CONTIGUOUS range (the run walks first→last); the
 * editor blocks Save with an inline hint if not, and `set_test_module_windows`
 * is the server-side backstop. Reads `get_test_module_windows`, writes
 * `set_test_module_windows` (optimistic + toast). A test with no windows = the
 * full test, open immediately (the one-click assign default).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { SkeletonRows } from "@/components/Skeleton";
import { SectionBadge } from "./testSections";
import type { Section } from "./types";

interface WindowRow {
  position: number;
  section: Section;
  label: string;
  time_limit_seconds: number;
  question_count: number;
  deployed: boolean;
  opens_at: string | null;
  submitted_count?: number;
}

interface TestScheduleEditorProps {
  courseId: string;
  courseName: string;
  slug: string;
  /** Called after a successful save (e.g. to collapse the editor). */
  onSaved?: () => void;
  onBack?: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/** Local datetime <input> value (yyyy-MM-ddTHH:mm) from an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** N calendar days from now at a fixed local hour (DST-safe — wall-clock 8am). */
function daysAtHour(days: number, hour = 8): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
function relTime(iso: string | null): string {
  if (!iso) return "Open now";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = d.getTime() - now;
  const abs = Math.abs(diffMs);
  const day = 86_400_000;
  const date = d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (diffMs <= 0) return `Opened · ${date}`;
  if (abs < day) return `Opens in ${Math.round(abs / 3_600_000)}h · ${date}`;
  return `Opens in ${Math.round(abs / day)}d · ${date}`;
}

export function TestScheduleEditor({ courseId, courseName, slug, onSaved, onBack }: TestScheduleEditorProps) {
  const toast = useToast();
  const [rows, setRows] = useState<WindowRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const { data, error } = await supabase.rpc("get_test_module_windows", { p_course_id: courseId, p_slug: slug });
      if (!aliveRef.current) return;
      if (error) toast.error("Couldn't load schedule", error.message);
      else setRows(((data ?? []) as WindowRow[]).slice().sort((a, b) => a.position - b.position));
      setLoaded(true);
    })();
    return () => { aliveRef.current = false; };
  }, [courseId, slug, toast]);

  const setRow = useCallback((position: number, patch: Partial<WindowRow>) => {
    setRows((prev) => prev.map((r) => (r.position === position ? { ...r, ...patch } : r)));
  }, []);

  const deployedPositions = useMemo(
    () => rows.filter((r) => r.deployed).map((r) => r.position).sort((a, b) => a - b),
    [rows],
  );
  const contiguous = useMemo(() => {
    if (deployedPositions.length === 0) return false;
    return deployedPositions[deployedPositions.length - 1] - deployedPositions[0] + 1 === deployedPositions.length;
  }, [deployedPositions]);

  const deployAllNow = useCallback(() => {
    setRows((prev) => prev.map((r) => ({ ...r, deployed: true, opens_at: null })));
  }, []);

  const staggerDaily = useCallback(() => {
    setRows((prev) => {
      let i = 0;
      return prev.map((r) => {
        if (!r.deployed) return r;
        const opens_at = i === 0 ? null : daysAtHour(i); // first open now, then +1 day @8am each
        i += 1;
        return { ...r, opens_at };
      });
    });
  }, []);

  const save = useCallback(async () => {
    if (!contiguous) {
      toast.error("Pick a contiguous set", "Deployed modules must be a continuous range (e.g. RW M1–M2).");
      return;
    }
    setSaving(true);
    try {
      const windows = rows.map((r) => ({ position: r.position, deployed: r.deployed, opens_at: r.deployed ? r.opens_at : null }));
      const { data, error } = await supabase.rpc("set_test_module_windows", { p_course_id: courseId, p_slug: slug, p_windows: windows });
      if (error) {
        const friendly =
          /position_already_passed/.test(error.message) ? "A student already reached a module you're trying to lock."
          : /non_contiguous_deployment/.test(error.message) ? "Deployed modules must be a contiguous range."
          : /no_modules_deployed/.test(error.message) ? "Deploy at least one module."
          : /not_assigned/.test(error.message) ? "Assign the test to this course first."
          : error.message;
        toast.error("Couldn't save schedule", friendly);
        return;
      }
      if (Array.isArray(data)) setRows((data as WindowRow[]).slice().sort((a, b) => a.position - b.position));
      const deployed = deployedPositions.length;
      toast.success("Schedule saved", `${deployed} module${deployed === 1 ? "" : "s"} → ${courseName}`);
      onSaved?.();
    } catch (err) {
      toast.error("Couldn't save schedule", getErrorMessage(err, "Try again."));
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, [contiguous, rows, courseId, slug, courseName, deployedPositions.length, toast, onSaved]);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              ← Courses
            </button>
          )}
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Schedule module release</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{courseName}</p>
        </div>
        <div className="flex flex-none gap-1.5">
          <button
            type="button"
            onClick={deployAllNow}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Deploy all now
          </button>
          <button
            type="button"
            onClick={staggerDaily}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
          >
            Stagger daily
          </button>
        </div>
      </header>

      {!loaded ? (
        <SkeletonRows count={4} rowClassName="h-14" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
          {rows.map((r) => (
            <li key={r.position} className={`px-3 py-3 bg-white dark:bg-slate-900 ${r.deployed ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={r.deployed}
                    onChange={(e) => setRow(r.position, { deployed: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={`Deploy ${r.label}`}
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.label}</span>
                      <SectionBadge sections={[r.section]} />
                    </span>
                    <span className="block text-xs text-slate-400 dark:text-slate-500">
                      {r.question_count} Q · {Math.round(r.time_limit_seconds / 60)} min
                      {typeof r.submitted_count === "number" && r.submitted_count > 0 ? ` · ${r.submitted_count} submitted` : ""}
                    </span>
                  </span>
                </label>
                {r.deployed && (
                  <div className="flex flex-none items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRow(r.position, { opens_at: null })}
                      className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${r.opens_at === null ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900" : "text-slate-500 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                    >
                      Now
                    </button>
                    <input
                      type="datetime-local"
                      value={toLocalInput(r.opens_at)}
                      onChange={(e) => setRow(r.position, { opens_at: fromLocalInput(e.target.value) })}
                      className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      aria-label={`${r.label} opens at`}
                    />
                  </div>
                )}
              </div>
              {r.deployed && (
                <p className="mt-1 pl-6 text-[11px] text-slate-400 dark:text-slate-500">{relTime(r.opens_at)}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {loaded && !contiguous && (
        <p className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900">
          Deployed modules must be a contiguous range (e.g. Reading &amp; Writing M1–M2, or Math M1–M2). Adjust the checkboxes to save.
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Students take one run; each module unlocks on its date. Excluded modules never appear.
        </p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !contiguous || !loaded}
          className="rounded-md min-h-[36px] px-4 py-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
      </div>
    </div>
  );
}
