/**
 * Student module barrel. Surfaces only what AreaSelector / AuthGate need.
 */
export { JoinClassModal } from "./JoinClassModal";
export { MyClassesPanel } from "./MyClassesPanel";
export { useStudentClasses } from "./useStudentClasses";
export { AssignmentsPanel } from "./AssignmentsPanel";
export { useStudentAssignments } from "./useStudentAssignments";
export { AssignmentRunner } from "./AssignmentRunner";
export { StudentAttemptReview } from "./StudentAttemptReview";
export { CourseAnnouncementsList } from "./CourseAnnouncementsList";
export { useStudentAnnouncements } from "./useStudentAnnouncements";
export { CourseMaterialsList } from "./CourseMaterialsList";
export { useStudentMaterials } from "./useStudentMaterials";
export { StudentPortfolio } from "./StudentPortfolio";
export { PortfolioSubmissionForm } from "./PortfolioSubmissionForm";
export { SkillHeatmap } from "./SkillHeatmap";
export { RecentFeedbackWidget } from "./RecentFeedbackWidget";
export { useRecentFeedback } from "./useRecentFeedback";
export type { RecentFeedbackItem } from "./useRecentFeedback";
export { StudentCourseView } from "./StudentCourseView";
export { useStudentPortfolio } from "./useStudentPortfolio";
export type {
  StudentPortfolioItem,
  StudentPortfolioItemType,
  StudentPortfolioSubmission,
  StudentSubmissionStatus,
} from "./useStudentPortfolio";
export type { StudentClass } from "./useStudentClasses";
export type {
  StudentAssignment,
  StudentAssignmentAttempt,
} from "./useStudentAssignments";
