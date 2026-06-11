/**
 * AssignTestModal
 * ===============
 * One-click assign a full-length test to a course: pick a course, and a Modules
 * link to the test is added (assign_test_to_course, 0089). Idempotent — a course
 * that already has the test shows "Assigned".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { useEscapeKey, useFocusTrap } from "@/hooks";
import { SkeletonRows } from "@/components/Skeleton";
import { SectionBadge } from "./testSections";
import type { Section } from "./types";

interface CourseRow {
  id: string;
  name: string;
  short_code: string | null;
}

interface AssignTestModalProps {
  slug: string;
  title: string;
  /** Section composition (RW / Math / both) so the teacher sets expectations. */
  sections?: Section[];
  onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function AssignTestModal({ slug, title, sections, onClose }: AssignTestModalProps) {
  const toast = useToast();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true);
  useEscapeKey(onClose);

  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // RLS scopes courses to the teacher's own (admins see all). In parallel,
        // ask which of those courses already link this test (Modules → /test/<slug>)
        // so we can mark them "Assigned" up front instead of only after a click.
        const [coursesRes, assignedRes] = await Promise.all([
          supabase.from("courses").select("id, name, short_code").eq("archived", false).order("name"),
          supabase.rpc("list_test_review_courses", { p_slug: slug }),
        ]);
        if (!alive) return;
        setCourses((coursesRes.data ?? []) as CourseRow[]);
        if (!assignedRes.error && Array.isArray(assignedRes.data)) {
          setAssignedIds(
            new Set((assignedRes.data as { course_id: string }[]).map((r) => r.course_id)),
          );
        }
      } catch {
        /* non-fatal */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  const onAssign = useCallback(
    async (course: CourseRow): Promise<void> => {
      setBusyId(course.id);
      try {
        const { data, error } = await supabase.rpc("assign_test_to_course", {
          p_course_id: course.id,
          p_slug: slug,
        });
        if (error) {
          toast.error("Couldn't assign", error.message);
          return;
        }
        const res = (data ?? {}) as { assigned?: boolean; already?: boolean };
        setAssignedIds((prev) => new Set(prev).add(course.id));
        toast.success(
          res.already ? "Already assigned" : "Assigned",
          `${title} → ${course.name} · set modules & open date from the course's Modules page`,
        );
      } catch (err: unknown) {
        toast.error("Couldn't assign", getErrorMessage(err, "Try again."));
      } finally {
        setBusyId(null);
      }
    },
    [slug, title, toast],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-test-title"
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
              Assign to a course
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{title}</p>
            <div className="mt-1.5">
              <SectionBadge sections={sections} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md inline-flex items-center justify-center min-h-[40px] min-w-[40px] -mt-1 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex-none"
          >
            ✕
          </button>
        </header>

        {!loaded ? (
          <SkeletonRows count={3} rowClassName="h-11" />
        ) : courses.length === 0 ? (
          <p className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            You don't have any active courses yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
            {courses.map((course) => {
              const done = assignedIds.has(course.id);
              return (
                <li
                  key={course.id}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {course.name}
                    </p>
                    {course.short_code && (
                      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
                        {course.short_code}
                      </p>
                    )}
                  </div>
                  {done ? (
                    <span className="inline-flex flex-none items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
                      ✓ Assigned
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onAssign(course)}
                      disabled={busyId === course.id}
                      className="rounded-md min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
                    >
                      {busyId === course.id ? "Assigning…" : "Assign"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
