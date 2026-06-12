/**
 * EditTestModulesModal
 * ====================
 * Edit which modules of a full-length test a Modules link deploys. A full-test
 * link is stored as a `module_items` row with url `/test/<slug>` (full test) or
 * `/test/<slug>?m=<first>-<last>` (a contiguous subset — see migration 0156:
 * the run is keyed by the module range, so changing the range starts a fresh
 * run for the new range; students who already submitted keep their result).
 *
 * The picker mirrors the `full_test` section of inline-add.tsx: per-module
 * checkboxes + "All / R&W only / Math only" preset pills; the deployed set must
 * be a non-empty CONTIGUOUS range (amber hint + disabled Save otherwise).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { testRunPath } from "@/lib/routes";
import { useToast } from "@/components/Toast";
import { ResponsiveModal, SmartDatePicker } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import type { ModuleItem } from "@/teacher/useCourseModules";

interface FtModule {
  position: number;
  section: string;
  label: string;
  time_limit_seconds: number;
  question_count: number;
}

interface EditTestModulesModalProps {
  item: ModuleItem;
  courseId: string;
  onClose: () => void;
  onSaved: () => void;
}

type TimeMode = "unlimited" | "strict";

/** Parse the test slug + current `?m=<first>-<last>` range + `&tm=` mode. */
function parseLink(url: string | null): {
  slug: string;
  range: [number, number] | null;
  timeMode: TimeMode;
} {
  const u = url ?? "";
  // url is `/test/<slug>` or `/test/<slug>?m=<first>-<last>[&tm=strict]`.
  // `.slice(6)` drops the leading "/test/" prefix, then split off path + query.
  const slug = u.slice(6).split("/")[0].split("?")[0];
  const m = u.match(/[?&]m=(\d+)-(\d+)/);
  const range: [number, number] | null = m
    ? [Number.parseInt(m[1], 10), Number.parseInt(m[2], 10)]
    : null;
  const timeMode: TimeMode = /[?&]tm=strict/.test(u) ? "strict" : "unlimited";
  return { slug, range, timeMode };
}

export function EditTestModulesModal({ item, courseId, onClose, onSaved }: EditTestModulesModalProps) {
  const toast = useToast();

  const { slug, range, timeMode: initialTimeMode } = useMemo(
    () => parseLink(item.url),
    [item.url],
  );

  const [modules, setModules] = useState<FtModule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deployed, setDeployed] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  // Timer behavior when a student saves-and-leaves (0211): 'unlimited' pauses
  // the clock while away; 'strict' keeps it running and ends at the deadline.
  const [timeMode, setTimeMode] = useState<TimeMode>(initialTimeMode);
  // One "Available from" open date for the whole occurrence (NULL = open now).
  // Seeded from the current occurrence's first in-range position's opens_at.
  const [opensAt, setOpensAt] = useState<string | null>(null);
  // Count of students who already submitted a run for the CURRENT module range.
  const [submittedCount, setSubmittedCount] = useState(0);

  // Fetch the test's modules (two-step: tests by slug → test_modules by id),
  // then pre-select the current range (or all modules if the link is full).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: t } = await supabase
        .from("tests")
        .select("id")
        .eq("slug", slug)
        .single();
      if (!alive) return;
      if (!t) {
        setModules([]);
        setDeployed(new Set());
        setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("test_modules")
        .select("position, section, label, time_limit_seconds, question_count")
        .eq("test_id", t.id)
        .order("position");
      if (!alive) return;
      const mods = (data ?? []) as FtModule[];
      setModules(mods);
      // The current occurrence's range: the parsed `?m=first-last`, or the full
      // module span when the link is a plain /test/<slug>.
      let curFirst: number;
      let curLast: number;
      if (range) {
        const [first, last] = range;
        curFirst = first;
        curLast = last;
        setDeployed(
          new Set(mods.filter((m) => m.position >= first && m.position <= last).map((m) => m.position)),
        );
      } else {
        const positions = mods.map((m) => m.position);
        curFirst = positions.length ? Math.min(...positions) : 1;
        curLast = positions.length ? Math.max(...positions) : 1;
        setDeployed(new Set(positions));
      }

      // Seed the open date from the FIRST in-range position's opens_at.
      const { data: windows } = await supabase.rpc("get_test_module_windows", {
        p_course_id: courseId,
        p_slug: slug,
      });
      if (!alive) return;
      const firstRow = (windows as { position: number; opens_at: string | null }[] | null)?.find(
        (w) => w.position === curFirst,
      );
      setOpensAt(firstRow?.opens_at ?? null);

      // Guard: how many students already submitted a run for the current range
      // in THIS course (rows with a non-null run_id).
      const { data: roster } = await supabase.rpc("test_roster_status", {
        p_slug: slug,
        p_first: curFirst,
        p_last: curLast,
      });
      if (!alive) return;
      const rosterRows =
        (roster as { course_id: string; run_id: string | null }[] | null) ?? [];
      setSubmittedCount(
        rosterRows.filter((r) => r.course_id === courseId && r.run_id != null).length,
      );

      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [slug, range, courseId]);

  // Deployed positions are valid only as a non-empty CONTIGUOUS range (the run
  // walks first→last). Mirrors inline-add.tsx's ftContiguous logic.
  const deployedSorted = useMemo(
    () => [...deployed].sort((a, b) => a - b),
    [deployed],
  );
  const contiguous = useMemo(() => {
    if (deployedSorted.length === 0) return false;
    return (
      deployedSorted[deployedSorted.length - 1] - deployedSorted[0] + 1 ===
      deployedSorted.length
    );
  }, [deployedSorted]);
  const isSubset = modules.length > 0 && deployed.size < modules.length;

  const toggleModule = (position: number): void => {
    setDeployed((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  };
  const setBySection = (section: string | "all"): void => {
    if (section === "all") {
      setDeployed(new Set(modules.map((m) => m.position)));
    } else {
      setDeployed(
        new Set(modules.filter((m) => m.section === section).map((m) => m.position)),
      );
    }
  };
  const sections = useMemo(
    () => Array.from(new Set(modules.map((m) => m.section))),
    [modules],
  );
  const sectionActive = (section: string): boolean => {
    const ps = modules.filter((m) => m.section === section).map((m) => m.position);
    return ps.length > 0 && ps.length === deployed.size && ps.every((p) => deployed.has(p));
  };

  // Unified chip style — matches inline-add's filter pills (Ivy kit `.pill`:
  // compact, hug-content; mobile keeps the ≥40px tap target via min-h).
  const chipClass = (active: boolean): string =>
    "inline-flex items-center justify-center rounded-full px-3 min-h-[40px] md:min-h-[26px] text-xs md:text-[11px] font-medium transition-colors " +
    (active
      ? "bg-indigo-600 text-white ring-1 ring-indigo-600"
      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700 hover:ring-slate-400 dark:hover:ring-slate-500 hover:text-slate-900 dark:hover:text-slate-100");

  const canSave = !saving && deployed.size > 0 && contiguous;

  const onSave = useCallback(async (): Promise<void> => {
    if (deployed.size === 0) {
      toast.warning("Pick at least one module to deploy");
      return;
    }
    if (isSubset && !contiguous) {
      toast.warning(
        "Modules must be contiguous",
        "Pick a continuous range — e.g. Reading & Writing (M1–M2) or Math (M1–M2).",
      );
      return;
    }
    const first = deployedSorted[0];
    const last = deployedSorted[deployedSorted.length - 1];
    // A strict subset encodes the range in the link URL as `?m=<first>-<last>`
    // so it launches its own run with its own report (0156). A full selection
    // uses the plain /test/<slug> link. Strict TIME mode (0211) adds `tm=strict`
    // — appended with `&` after a range, or as the sole `?` query on a full test.
    const base =
      isSubset && first != null
        ? `${testRunPath(slug)}?m=${first}-${last}`
        : testRunPath(slug);
    const newUrl =
      timeMode === "strict" ? `${base}${base.includes("?") ? "&" : "?"}tm=strict` : base;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("module_items")
        .update({ url: newUrl })
        .eq("id", item.id);
      if (error) {
        toast.error("Couldn't update modules", error.message);
        return;
      }
      // Write the single "Available from" date across the new range (NULL =
      // open now). The link is already saved; a scheduling failure shouldn't
      // block the modules update — warn but still treat the save as done.
      const { error: dateError } = await supabase.rpc("set_module_open_date", {
        p_course_id: courseId,
        p_slug: slug,
        p_first: first,
        p_last: last,
        p_opens_at: opensAt,
      });
      if (dateError) {
        toast.warning("Modules saved, but the date didn't update", dateError.message);
      }
      toast.success(
        "Modules updated",
        isSubset ? `${item.title} · modules ${first}–${last}` : `${item.title} · full test`,
      );
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [
    deployed.size,
    isSubset,
    contiguous,
    deployedSorted,
    slug,
    courseId,
    opensAt,
    timeMode,
    item.id,
    item.title,
    onSaved,
    onClose,
    toast,
  ]);

  const footer =
    loaded && modules.length > 0 ? (
      <>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!canSave}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </>
    ) : undefined;

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title="Edit modules"
      subtitle={item.title}
      size="md"
      footer={footer}
    >
      {!loaded ? (
        <SkeletonRows count={4} rowClassName="h-10" />
      ) : modules.length === 0 ? (
        <p className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Couldn't load this test's modules.
        </p>
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-1.5 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-900 p-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Modules to deploy
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setBySection("all")}
                  aria-pressed={deployed.size === modules.length}
                  disabled={saving}
                  data-autofocus
                  className={chipClass(deployed.size === modules.length)}
                >
                  All
                </button>
                  {sections.includes("reading-writing") && (
                    <button
                      type="button"
                      onClick={() => setBySection("reading-writing")}
                      aria-pressed={sectionActive("reading-writing")}
                      disabled={saving}
                      className={chipClass(sectionActive("reading-writing"))}
                    >
                      R&amp;W only
                    </button>
                  )}
                  {sections.includes("math") && (
                    <button
                      type="button"
                      onClick={() => setBySection("math")}
                      aria-pressed={sectionActive("math")}
                      disabled={saving}
                      className={chipClass(sectionActive("math"))}
                    >
                      Math only
                    </button>
                  )}
                </div>
              </div>
              <ul className="space-y-0.5">
                {modules.map((m) => {
                  const on = deployed.has(m.position);
                  return (
                    <li key={m.position}>
                      <label
                        className={
                          "flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 " +
                          (on ? "" : "opacity-50")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleModule(m.position)}
                          disabled={saving}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Deploy ${m.label}`}
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {m.label}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {m.section === "math" ? "Math" : "R&W"} · {m.question_count}q ·{" "}
                          {Math.round(m.time_limit_seconds / 60)}m
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {deployed.size > 0 && !contiguous && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Pick a continuous range — e.g. R&amp;W (M1–M2) or Math (M1–M2).
                </p>
              )}
            </div>

            {/* One open date for the whole occurrence. NULL = open now. */}
            <div className="block">
              <SmartDatePicker
                label="Available from (optional)"
                value={opensAt}
                onChange={setOpensAt}
                allowClear
              />
            </div>

            {/* Timer behavior when a student leaves mid-test (0211). */}
            <fieldset className="space-y-1.5">
              <legend className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                If the student leaves
              </legend>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setTimeMode("unlimited")}
                  aria-pressed={timeMode === "unlimited"}
                  disabled={saving}
                  className={chipClass(timeMode === "unlimited")}
                >
                  Pause the timer
                </button>
                <button
                  type="button"
                  onClick={() => setTimeMode("strict")}
                  aria-pressed={timeMode === "strict"}
                  disabled={saving}
                  className={chipClass(timeMode === "strict")}
                >
                  Keep the clock running
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {timeMode === "strict"
                  ? "Strict timing — like a real exam, the clock keeps counting while they're away and the test auto-submits at the deadline."
                  : "Relaxed — the timer pauses while they're away so they can pick up where they left off (good for homework / practice)."}
              </p>
            </fieldset>

            {submittedCount > 0 && (
              <p className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800">
                {submittedCount} student{submittedCount === 1 ? "" : "s"} already took the
                current modules. Changing the modules won&apos;t affect their results —
                new attempts use the new set.
              </p>
            )}

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Changing the modules affects students who haven't taken it yet;
              students who already submitted keep their existing result.
            </p>
          </div>
        )}
    </ResponsiveModal>
  );
}
