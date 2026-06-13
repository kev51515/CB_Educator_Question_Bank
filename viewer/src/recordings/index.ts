/**
 * Recordings feature barrel.
 * Audio → transcript → AI "Fathom" notes → quiz. See docs/RECORDINGS_FEATURE.md.
 */
export { RecordingsListPage } from "./RecordingsListPage";
export { RecordingDetailPage } from "./RecordingDetailPage";
export { AuthoredQuizRunner } from "./AuthoredQuizRunner";
export { CourseRecordingsTab } from "./CourseRecordingsTab";
export { SharedRecordingView } from "./SharedRecordingView";
export { FollowUpsPage } from "./FollowUpsPage";
export { useSharedRecordings } from "./useSharedRecordings";
export { StudyAidsPanel } from "./StudyAidsPanel";
export { SessionInsightsPanel } from "./SessionInsightsPanel";
export { computeSessionInsights } from "./insights";
export type { SessionInsights, SpeakerStat } from "./insights";
export type * from "./studyAids";
export type * from "./types";
