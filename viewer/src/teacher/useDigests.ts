/**
 * useDigests — teacher-side data + mutations for parent progress digests.
 *
 * `useCourseDigests(courseId)` lists the roster joined with each student's
 * current-week digest (if composed) and a guardian count, so the DigestsPage
 * can show per-student draft status. Mutations:
 *   • composeDigest(studentId)        — compose/refresh this week's draft
 *   • composeAll()                    — compose for every roster student
 *   • requestAiSummary(...)           — invoke the digest-ai-summary edge fn
 *   • approveAndSend(digestId, …)     — enqueue LINE to guardians; returns count
 *
 * Reads go through the RLS-guarded student_progress_digests table + the
 * existing SECURITY DEFINER RPCs (compose_student_digest /
 * approve_and_send_digest from 0239, list_guardians_for_student from 0155).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClassRoster } from "./useClassRoster";
import type { DigestRosterRow, DigestStats, StudentDigest } from "./digests";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

/** Monday of the current ISO week, as a YYYY-MM-DD string (local time). */
function currentWeekStart(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

interface GuardianRow {
  guardian_id: string;
  display_name: string | null;
  login_code: string | null;
  created_at: string;
}

export interface UseCourseDigests {
  rows: DigestRosterRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  composeDigest: (studentId: string) => Promise<StudentDigest>;
  composeAll: () => Promise<number>;
  requestAiSummary: (input: {
    digestId?: string;
    stats?: DigestStats;
  }) => Promise<string>;
  approveAndSend: (
    digestId: string,
    aiSummary: string,
    note: string,
  ) => Promise<number>;
}

export function useCourseDigests(courseId: string | null): UseCourseDigests {
  const { roster, loading: rosterLoading } = useClassRoster(courseId);
  const [digests, setDigests] = useState<StudentDigest[]>([]);
  const [guardianCounts, setGuardianCounts] = useState<Record<string, number>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!courseId) {
      setDigests([]);
      setGuardianCounts({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const weekStart = currentWeekStart();
      const { data, error: qErr } = await supabase
        .from("student_progress_digests")
        .select("*")
        .eq("course_id", courseId)
        .eq("period_start", weekStart);
      if (qErr) {
        if (aliveRef.current) setError(qErr.message);
        return;
      }
      if (aliveRef.current) setDigests((data ?? []) as StudentDigest[]);
    } catch (err: unknown) {
      if (aliveRef.current) setError(getErrorMessage(err));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Guardian counts per roster student (best-effort; a student with no
  // guardian gets a "no guardian linked" hint in the UI). Reads the
  // SECURITY DEFINER list RPC per student.
  useEffect(() => {
    if (!roster.length) {
      setGuardianCounts({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        roster.map(async (s) => {
          const { data } = await supabase.rpc("list_guardians_for_student", {
            p_student_id: s.student_id,
          });
          const count = ((data ?? []) as GuardianRow[]).length;
          return [s.student_id, count] as const;
        }),
      );
      if (cancelled) return;
      setGuardianCounts(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [roster]);

  const composeDigest = useCallback(
    async (studentId: string): Promise<StudentDigest> => {
      if (!courseId) throw new Error("No course.");
      const { data, error: rpcErr } = await supabase.rpc(
        "compose_student_digest",
        { p_course_id: courseId, p_student_id: studentId },
      );
      if (rpcErr) throw new Error(rpcErr.message);
      const row = data as StudentDigest;
      // Merge into local state so the row reflects immediately.
      setDigests((prev) => {
        const next = prev.filter((d) => d.id !== row.id);
        next.push(row);
        return next;
      });
      return row;
    },
    [courseId],
  );

  const composeAll = useCallback(async (): Promise<number> => {
    if (!courseId) return 0;
    let n = 0;
    for (const s of roster) {
      try {
        await composeDigest(s.student_id);
        n += 1;
      } catch {
        /* skip individual failures; the count reflects successes */
      }
    }
    return n;
  }, [courseId, roster, composeDigest]);

  const requestAiSummary = useCallback(
    async (input: { digestId?: string; stats?: DigestStats }): Promise<string> => {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "digest-ai-summary",
        {
          body: input.digestId
            ? { digest_id: input.digestId }
            : { stats: input.stats },
        },
      );
      if (fnErr) {
        const msg =
          (await fnErr.context?.text?.().catch(() => "")) || fnErr.message;
        throw new Error(msg || "AI summary unavailable.");
      }
      const summary = (data as { summary?: string })?.summary;
      if (!summary) throw new Error("AI returned no summary.");
      return summary;
    },
    [],
  );

  const approveAndSend = useCallback(
    async (
      digestId: string,
      aiSummary: string,
      note: string,
    ): Promise<number> => {
      const { data, error: rpcErr } = await supabase.rpc(
        "approve_and_send_digest",
        {
          p_digest_id: digestId,
          p_ai_summary: aiSummary || null,
          p_teacher_note: note || null,
        },
      );
      if (rpcErr) throw new Error(rpcErr.message);
      // Mark the row sent locally.
      setDigests((prev) =>
        prev.map((d) =>
          d.id === digestId
            ? {
                ...d,
                status: "sent",
                ai_summary: aiSummary || null,
                teacher_note: note || null,
                sent_at: new Date().toISOString(),
              }
            : d,
        ),
      );
      return (data as number) ?? 0;
    },
    [],
  );

  const rows: DigestRosterRow[] = roster.map((s) => {
    const digest = digests.find((d) => d.student_id === s.student_id) ?? null;
    return {
      student_id: s.student_id,
      display_name: s.display_name,
      email: s.email,
      digest,
      guardian_count: guardianCounts[s.student_id] ?? 0,
      // The DB enqueue (approve_and_send_digest) is the source of truth for
      // actual LINE reach; we surface the guardian count as the proxy here
      // (teachers can't read guardians' line_links rows under RLS).
      line_linked_guardian_count: guardianCounts[s.student_id] ?? 0,
    };
  });

  return {
    rows,
    loading: loading || rosterLoading,
    error,
    refresh,
    composeDigest,
    composeAll,
    requestAiSummary,
    approveAndSend,
  };
}
