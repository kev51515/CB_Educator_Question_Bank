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
import { useNavigate, useParams } from "react-router-dom";
import { useClassContext } from "./classLayoutContext";
import { TeacherAttemptDetailView } from "./TeacherAttemptDetailView";
import { classAssignmentPath } from "../lib/routes";

export function AttemptDetailPage() {
  const { assignmentId, attemptId } = useParams<{
    assignmentId: string;
    attemptId: string;
  }>();
  const { cls } = useClassContext();
  const navigate = useNavigate();

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
      onBack={() => navigate(classAssignmentPath(cls.short_code, assignmentId))}
    />
  );
}
