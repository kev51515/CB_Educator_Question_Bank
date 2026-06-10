/**
 * StudentDeadlinesTimeline
 * ========================
 * One student's upcoming counseling deadlines (college application due dates +
 * open counseling task due dates) for a course, as a chronological timeline.
 * Self-contained: fetches its own data and renders DeadlineTimeline. Mounted on
 * the counselor's per-student profile (and usable on the student side).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components";
import { SkeletonRows } from "@/components/Skeleton";
import { DeadlineTimeline, type TimelineItem } from "./DeadlineTimeline";

const DONE_APP_STATUSES = new Set([
  "submitted",
  "accepted",
  "rejected",
  "waitlisted",
  "deferred",
  "enrolled",
]);

interface AppRow {
  id: string;
  college_name: string;
  plan: string | null;
  deadline: string | null;
  status: string;
}
interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  status: "open" | "done";
}

export function StudentDeadlinesTimeline({
  courseId,
  studentId,
}: {
  courseId: string;
  studentId: string;
}): JSX.Element {
  const toast = useToast();
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const [apps, tasks] = await Promise.all([
      supabase
        .from("college_applications")
        .select("id, college_name, plan, deadline, status")
        .eq("course_id", courseId)
        .eq("student_id", studentId)
        .not("deadline", "is", null),
      supabase
        .from("counseling_tasks")
        .select("id, title, due_date, status")
        .eq("course_id", courseId)
        .eq("student_id", studentId)
        .not("due_date", "is", null),
    ]);
    if (!aliveRef.current) return;
    if (apps.error || tasks.error) {
      toast.error(
        "Couldn't load the timeline",
        apps.error?.message ?? tasks.error?.message,
      );
      setItems([]);
      setLoading(false);
      return;
    }
    const appItems: TimelineItem[] = ((apps.data ?? []) as AppRow[]).map((a) => ({
      id: `c-${a.id}`,
      date: a.deadline as string,
      title: a.college_name,
      sublabel: a.plan ?? "Application",
      kind: "college",
      done: DONE_APP_STATUSES.has(a.status),
    }));
    const taskItems: TimelineItem[] = ((tasks.data ?? []) as TaskRow[]).map((t) => ({
      id: `t-${t.id}`,
      date: t.due_date as string,
      title: t.title,
      sublabel: "Task",
      kind: "task",
      done: t.status === "done",
    }));
    setItems([...appItems, ...taskItems]);
    setLoading(false);
  }, [courseId, studentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
        Deadline timeline
      </h3>
      {loading ? (
        <SkeletonRows count={4} />
      ) : (
        <DeadlineTimeline
          items={items}
          emptyHint="No college deadlines or task due dates yet — add a college with a deadline or a task with a due date to see them here in order."
        />
      )}
    </section>
  );
}
