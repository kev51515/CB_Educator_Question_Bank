/**
 * Teacher module barrel. Exports the routed course-detail surfaces and the
 * supporting hooks.
 *
 * The legacy `ClassDetailView` (a single-screen state machine for the per-
 * course drilldown) has been retired. The course detail surface now lives at
 * /classes/:classId/* and is owned by `ClassLayout` + a set of routed tabs
 * (Overview, Roster, Assignments, Announcements, Materials, Settings).
 */
export { TeacherConsole } from "./TeacherConsole";
export { ClassFormModal, CreateClassModal } from "./ClassFormModal";
export { DuplicateCourseModal } from "./DuplicateCourseModal";
export { useCourseTemplates } from "./useCourseTemplates";
export type { CourseTemplate } from "./useCourseTemplates";
export { ClassLayout } from "./ClassLayout";
export { QuickCreatePalette } from "./QuickCreatePalette";
export { ClassOverview } from "./ClassOverview";
export { ClassRoster } from "./ClassRoster";
export { BulkRosterModal } from "./BulkRosterModal";
export type { BulkRosterReport } from "./BulkRosterModal";
export { ClassAssignmentsTab } from "./ClassAssignmentsTab";
export { AssignmentDetailPage } from "./AssignmentDetailPage";
export { AttemptDetailPage } from "./AttemptDetailPage";
export { CourseAnnouncements } from "./CourseAnnouncements";
export { AnnouncementFormModal } from "./AnnouncementFormModal";
export { useAnnouncements } from "./useAnnouncements";
export type { Announcement } from "./useAnnouncements";
export { CourseMaterials } from "./CourseMaterials";
export { CourseGradebook } from "./CourseGradebook";
export { AddMaterialModal } from "./AddMaterialModal";
export { useMaterials } from "./useMaterials";
export { CoursePortfolio } from "./CoursePortfolio";
export { CourseDiscussions } from "./CourseDiscussions";
export { DiscussionTopicView } from "./DiscussionTopicView";
export { TopicFormModal } from "./TopicFormModal";
export { useDiscussions } from "./useDiscussions";
export type { DiscussionTopic } from "./useDiscussions";
export { useTopicPosts } from "./useTopicPosts";
export type { DiscussionPost } from "./useTopicPosts";
export { PortfolioItemFormModal } from "./PortfolioItemFormModal";
export { SubmissionDetailDrawer } from "./SubmissionDetailDrawer";
export { usePortfolio } from "./usePortfolio";
export type {
  PortfolioTemplate,
  PortfolioItem,
  PortfolioItemType,
  PortfolioItemSettings,
} from "./usePortfolio";
export { ClassSettings } from "./ClassSettings";
export { CourseSettings } from "./CourseSettings";
export { useClass } from "./useClass";
export { useTeacherClasses } from "./useTeacherClasses";
export { useClassRoster } from "./useClassRoster";
export { AssignmentsPage } from "./AssignmentsPage";
export {
  AssignmentFormModal,
  CreateAssignmentModal,
} from "./AssignmentFormModal";
export { useAssignments } from "./useAssignments";
export { AssignmentAttemptsView } from "./AssignmentAttemptsView";
export { useAssignmentAttempts } from "./useAssignmentAttempts";
export { TeacherAttemptDetailView } from "./TeacherAttemptDetailView";
export { ModulesPage } from "./ModulesPage";
export { AddModuleModal } from "./AddModuleModal";
export { EditModuleModal } from "./EditModuleModal";
export { AddItemModal } from "./AddItemModal";
export { useCourseModules } from "./useCourseModules";
export type {
  CourseModule,
  ModuleItem,
  ModuleItemType,
} from "./useCourseModules";
export type { TeacherClass } from "./useTeacherClasses";
export type { RosterStudent } from "./useClassRoster";
export type { CreatedClass, EditableClass } from "./ClassFormModal";
export type {
  Assignment,
  AssignmentSourceId,
  AssignmentDifficultyMix,
} from "./useAssignments";
export type { AssignmentAttempt } from "./useAssignmentAttempts";
