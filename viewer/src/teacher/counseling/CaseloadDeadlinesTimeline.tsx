/**
 * CaseloadDeadlinesTimeline
 * =========================
 * The counselor's "who has what due when" view — every enrolled student's
 * UPCOMING college application deadlines + open task due dates across the whole
 * course, on one chronological track grouped by month. Self-contained: fetches
 * its own data (counselor RLS allows reading all course rows) and renders
 * DeadlineTimeline with the student's name as each item's sublabel.
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

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

interface MemberRow {
  student_id: string;
  // PostgREST types an embedded relation as an array even for a to-one FK.
  profiles: { display_name: string | null }[] | null;
}
interface AppRow {
  id: string;
  student_id: string;
  college_name: string;
  plan: string | null;
  deadline: string | null;
  status: string;
}
interface TaskRow {
  id: string;
  student_id: string;
  title: string;
  due_date: string | null;
}

export function CaseloadDeadlinesTimeline({
  courseId,
}: {
  courseId: string;
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
    const today = todayISO();
    const [members, apps, tasks] = await Promise.all([
      supabase
        .from("course_memberships")
        .select("student_id, profiles(display_name)")
        .eq("course_id", courseId),
      supabase
        .from("college_applications")
        .select("id, student_id, college_name, plan, deadline, status")
        .eq("course_id", courseId)
        .not("deadline", "is", null)
        .gte("deadline", today),
      supabase
        .from("counseling_tasks")
        .select("id, student_id, title, due_date")
        .eq("course_id", courseId)
        .eq("status", "open")
        .not("due_date", "is", null)
        .gte("due_date", today),
    ]);
    if (!aliveRef.current) return;
    if (members.error || apps.error || tasks.error) {
      toast.error(
        "Couldn't load the deadline timeline",
        members.error?.message ?? apps.error?.message ?? tasks.error?.message,
      );
      setItems([]);
      setLoading(false);
      return;
    }
    const nameById = new Map<string, string>();
    for (const m of (members.data ?? []) as MemberRow[]) {
      nameById.set(m.student_id, m.profiles?.[0]?.display_name ?? "Student");
    }
    const appItems: TimelineItem[] = ((apps.data ?? []) as AppRow[]).map((a) => ({
      id: `c-${a.id}`,
      date: a.deadline as string,
      title: `${nameById.get(a.student_id) ?? "Student"} — ${a.college_name}`,
      sublabel: a.plan ?? "Application",
      kind: "college",
      done: DONE_APP_STATUSES.has(a.status),
    }));
    const taskItems: TimelineItem[] = ((tasks.data ?? []) as TaskRow[]).map((t) => ({
      id: `t-${t.id}`,
      date: t.due_date as string,
      title: `${nameById.get(t.student_id) ?? "Student"} — ${t.title}`,
      sublabel: "Task",
      kind: "task",
      done: false,
    }));
    setItems([...appItems, ...taskItems]);
    setLoading(false);
  }, [courseId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white/80 dark:bg-slate-900/60 px-5 py-5 space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Upcoming deadlines
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Every student's college deadlines and open task due dates, in order.
        </p>
      </div>
      {loading ? (
        <SkeletonRows count={5} />
      ) : (
        <DeadlineTimeline
          items={items}
          emptyHint="No upcoming deadlines across the caseload."
        />
      )}
    </section>
  );
}
