/**
 * TeacherAttemptDetailView — sibling navigation hook
 * ==================================================
 * Loads the sibling attempts (other students on the same assignment), derives
 * prev/next, and provides the navigate-to-sibling action. Moved verbatim from
 * the original single-file component.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { AttemptReviewData } from "@/lib/attemptReview";
import { classAssignmentAttemptPath } from "@/lib/routes";
import type { SiblingAttempt } from "./types";

export function useSiblingNav(
  data: AttemptReviewData | null,
  attemptId: string,
  courseShortCode: string | null,
) {
  const navigate = useNavigate();

  // Sibling attempts for J/K navigation. Loaded after data resolves.
  const [siblings, setSiblings] = useState<SiblingAttempt[]>([]);

  // Load sibling attempts (other students on the same assignment) so we
  // can offer prev/next navigation. We join profiles for display names.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: rows, error: fetchErr } = await supabase
          .from("assignment_attempts")
          .select(
            "id, student_id, started_at, student:profiles!assignment_attempts_student_id_fkey(display_name, email)",
          )
          .eq("assignment_id", data.assignmentId)
          .order("started_at", { ascending: true });
        if (cancelled) return;
        if (fetchErr || !rows) return;
        const mapped: SiblingAttempt[] = (rows as unknown as {
          id: string;
          student_id: string;
          student: { display_name: string | null; email: string } | null;
        }[]).map((r) => ({
          id: r.id,
          student_id: r.student_id,
          display_name:
            r.student?.display_name ?? r.student?.email ?? "Unknown student",
        }));
        setSiblings(mapped);
      } catch {
        // Non-fatal — prev/next will just hide.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Derive prev/next from the sibling list.
  const navInfo = useMemo(() => {
    if (siblings.length === 0) {
      return { index: -1, prevId: null, nextId: null, total: 0 } as const;
    }
    const index = siblings.findIndex((s) => s.id === attemptId);
    if (index === -1) {
      return { index: -1, prevId: null, nextId: null, total: siblings.length } as const;
    }
    return {
      index,
      total: siblings.length,
      prevId: index > 0 ? siblings[index - 1].id : null,
      nextId: index < siblings.length - 1 ? siblings[index + 1].id : null,
    } as const;
  }, [siblings, attemptId]);

  const navigateToSibling = useCallback(
    (siblingAttemptId: string) => {
      if (!data) return;
      if (courseShortCode) {
        navigate(
          classAssignmentAttemptPath(
            courseShortCode,
            data.assignmentId,
            siblingAttemptId,
          ),
        );
      } else {
        const path = window.location.pathname.replace(attemptId, siblingAttemptId);
        navigate(path);
      }
    },
    [data, navigate, attemptId, courseShortCode],
  );

  return { siblings, navInfo, navigateToSibling };
}
