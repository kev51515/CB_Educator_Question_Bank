/**
 * ClassAssignmentsTab
 * ===================
 * Assignments tab inside ClassLayout. Thin wrapper around the existing
 * AssignmentsPage — same list / create / archive / delete behaviour —
 * but with all "back" / "open attempts" callbacks routed through the
 * URL via react-router-dom instead of an internal state machine.
 *
 * Clicking "View attempts" on an assignment card now navigates to
 * /classes/:classId/assignments/:assignmentId, which is owned by
 * AssignmentDetailPage.
 */
import { useNavigate } from "react-router-dom";
import { useClassContext } from "./classLayoutContext";
import { useProfile } from "@/lib/profile";
import { AssignmentsPage } from "./AssignmentsPage";
import { classAssignmentPath } from "@/lib/routes";

export function ClassAssignmentsTab() {
  const { cls } = useClassContext();
  const { profile } = useProfile();
  const navigate = useNavigate();

  return (
    <AssignmentsPage
      classId={cls.id}
      teacherId={profile?.id ?? ""}
      onOpenAttempts={(assignment) =>
        navigate(classAssignmentPath(cls.short_code, assignment.short_code))
      }
    />
  );
}
