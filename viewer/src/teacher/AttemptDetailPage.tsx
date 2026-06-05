/**
 * AttemptDetailPage
 * =================
 * Routed surface for a single submitted attempt, mounted at
 * /classes/:classId/assignments/:assignmentId/attempts/:attemptId.
 *
 * Pulls the attempt id from the URL and forwards everything else to the
 * existing TeacherAttemptDetailView. "Back" returns to the assignment
 * detail page (one level up).
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBreadcrumbLabel } from "@/components";
import { useClassContext } from "./classLayoutContext";
import { TeacherAttemptDetailView } from "./TeacherAttemptDetailView";
import { classAssignmentPath } from "@/lib/routes";

export function AttemptDetailPage() {
  const { assignmentId, attemptId } = useParams<{
    assignmentId: string;
    attemptId: string;
  }>();
  const { cls } = useClassContext();
  const navigate = useNavigate();

  // The assignment crumb on this deep route is keyed by the URL `assignmentId`
  // (the assignment short_code). The attempt view loads the title; we lift it
  // up via `onAssignmentTitle` and register it so the breadcrumb resolves to the
  // real assignment name instead of the generic "Assignment" fallback.
  const [assignmentTitle, setAssignmentTitle] = useState<string | null>(null);
  useBreadcrumbLabel(assignmentId, assignmentTitle);

  if (!attemptId || !assignmentId) {
    return (
      <p className="text-sm text-rose-600 dark:text-rose-400 py-6">
        Missing attempt or assignment id.
      </p>
    );
  }

  return (
    <TeacherAttemptDetailView
      attemptId={attemptId}
      onAssignmentTitle={setAssignmentTitle}
      onBack={() => navigate(classAssignmentPath(cls.short_code, assignmentId))}
    />
  );
}
