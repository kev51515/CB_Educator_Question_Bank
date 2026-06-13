/**
 * SessionBalanceCard — read-only student view of their session balance.
 * ============================================================================
 * Mounted on the student per-course view (class courses) next to the score
 * trajectory / study coach block. Reads the student's OWN balance row from the
 * `session_package_balances` view (RLS own-row) and shows remaining sessions.
 *
 * Renders null when the student has no package for this course (nothing to show
 * — don't manufacture an empty card). Degrades silently on error: a student
 * surface shouldn't show a scary banner for a non-critical stat.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/lib/profile";

interface BalanceRow {
  total_sessions: number | null;
  used: number | null;
  remaining: number | null;
  low_balance_threshold: number | null;
}

const DEFAULT_LOW_BALANCE = 2;

interface SessionBalanceCardProps {
  courseId: string;
  className?: string;
}

export function SessionBalanceCard({
  courseId,
  className,
}: SessionBalanceCardProps): JSX.Element | null {
  const { profile } = useProfile();
  const [row, setRow] = useState<BalanceRow | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const studentId = profile?.id;
    if (!studentId) return;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("session_package_balances")
          .select("total_sessions, used, remaining, low_balance_threshold")
          .eq("student_id", studentId)
          .eq("course_id", courseId)
          .maybeSingle();
        if (!aliveRef.current || error) return;
        setRow((data as BalanceRow | null) ?? null);
      } catch {
        /* non-fatal — card just stays hidden */
      }
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [courseId, profile?.id]);

  if (!row || row.remaining == null) return null;

  const threshold = row.low_balance_threshold ?? DEFAULT_LOW_BALANCE;
  const remaining = row.remaining;
  const low = remaining <= threshold;
  const empty = remaining <= 0;

  const tone = empty
    ? "ring-rose-200 dark:ring-rose-900"
    : low
      ? "ring-amber-200 dark:ring-amber-900"
      : "ring-slate-200 dark:ring-slate-800";
  const numberTone = empty
    ? "text-rose-700 dark:text-rose-300"
    : low
      ? "text-amber-700 dark:text-amber-300"
      : "text-slate-900 dark:text-slate-100";

  return (
    <div
      className={`rounded-2xl bg-white dark:bg-slate-900 ring-1 ${tone} shadow-card p-5 ${className ?? ""}`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
        Session package
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${numberTone}`}>{remaining}</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          session{remaining === 1 ? "" : "s"} remaining
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {row.used ?? 0} of {row.total_sessions ?? 0} used
      </p>
      {empty ? (
        <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
          No sessions left — ask your teacher to add more.
        </p>
      ) : low ? (
        <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
          Running low — you have {remaining} left.
        </p>
      ) : null}
    </div>
  );
}
