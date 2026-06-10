/**
 * TeacherAttemptDetailView — types
 * ================================
 * Shared types for the attempt detail view. Moved verbatim from the
 * original single-file component during the behavior-preserving split.
 */

export interface TeacherAttemptDetailViewProps {
  attemptId: string;
  onBack: () => void;
  /**
   * Fired with the loaded assignment title (and null while loading / on
   * failure) so a route wrapper can surface it to the breadcrumb. Optional —
   * the view stays route-agnostic and renders identically without it.
   */
  onAssignmentTitle?: (title: string | null) => void;
}

export interface SiblingAttempt {
  id: string;
  student_id: string;
  display_name: string;
}
