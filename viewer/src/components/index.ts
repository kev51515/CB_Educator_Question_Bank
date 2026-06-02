/**
 * Components barrel.
 *
 * One canonical import surface for every viewer UI component.
 *
 * Usage:
 *   import { Detail, Sidebar, CommandPalette } from "@/components";
 *
 * Avoid:
 *   import { Detail } from "@/components/Detail"
 *   import Detail from "../components/Detail"
 *
 * When you add a new component file in this directory, add it to this barrel
 * so it's discoverable at one well-known location.
 */
// ─── Lazy-loaded components ────────────────────────────────────────────────
// The following components are imported lazily from `./lazy` to keep them out
// of the initial JS chunk. If you need the eager version (e.g. a hook from one
// of these files), import directly from the source path rather than via the
// barrel: `import { useFoo } from "@/components/A11yPreferences"`.
//
// Eager re-export covers ONLY the small adjacent helpers (hooks, types,
// utilities) that ship in the same source file but don't pull in the heavy
// render-time code path.
export { useA11yPrefs } from "./A11yPreferences";
export { A11yToggle } from "./A11yPreferences";
export * from "./ActivityCalendar";
export * from "./AdaptiveLayout";
export * from "./Annotations";
export * from "./AnswerActions";
export * from "./AnswerOptions";
export * from "./BatchOps";
export * from "./BottomSheet";
export { useChoiceNotes } from "./ChoiceAnalysis";
export * from "./CommandPalette";
export * from "./ConfidenceRating";
export * from "./DarkModeToggle";
export * from "./Detail";
export * from "./DetailEmptyStates";
export * from "./DetailFootnote";
export * from "./DetailHeader";
export * from "./DetailIcons";
export * from "./DraggablePrintList";
export * from "./ErrorBoundary";
export * from "./ExportFormats";
export { FileDropzone } from "./FileDropzone";
export * from "./FilterControls";
export * from "./FilterDSL";
export * from "./FilterPresets";
export * from "./FilterShortcuts";
export * from "./HelpOverlay";
export * from "./Highlight";
export * from "./MarkdownEditor";
// KnowledgeGraph — eager via `@/components/KnowledgeGraph`, lazy via LazyKnowledgeGraph below.
export * from "./LanSync";
export * from "./lazy";
export * from "./ListExtras";
// MaintainerView — same lazy/eager split as KnowledgeGraph.
export * from "./MobileTabBar";
export * from "./NoteEditor";
export { PdfExportButton } from "./PdfExport"; // generateWorksheetHTML is fetched dynamically
export * from "./PracticeMode";
export * from "./PrintSet";
export * from "./PrintSetAnalytics";
// ProgressDashboard — lazy only.
export * from "./ProgressiveHints";
export * from "./QuestionFlags";
export * from "./QuestionHtml";
export * from "./QuestionList";
export * from "./QuestionSnapshot";
// QuickBuild — lazy only.
export * from "./RationaleBlock";
// ReadingMode — lazy only.
export * from "./SearchExtras";
export * from "./ShareSet";
export { useShortcuts } from "./ShortcutCustomizer"; // CustomizerPanel ships lazily.
export * from "./SidebarV2";
export * from "./SidebarShared";
export * from "./SidebarSetToggle";
export * from "./SidebarSearchBox";
export * from "./SidebarStatusFilter";
export * from "./SidebarDomainTree";
export * from "./SpacedRepetition";
export * from "./SplashScreen";
export * from "./SprAnswerInput";
// StateExport — lazy only.
export * from "./StatsPanel";
export * from "./StepRationale";
export * from "./StickyActions";
export * from "./SwipeNav";
export * from "./TagSystem";
export { TagInput } from "./TagInput";
export type { TagInputProps } from "./TagInput";
export * from "./TimeTracker";
export { TimerBar } from "./TimerSession"; // TimerSetup ships lazily.
export { ToastProvider, useToast } from "./Toast";
export { useOptimistic } from "./useOptimistic";
export { SafeHtml } from "./SafeHtml";
export { EmptyState } from "./EmptyState";
export { Skeleton, SkeletonRows } from "./Skeleton";
export { ShortcutHelpOverlay } from "./ShortcutHelpOverlay";
export type { ShortcutHelpOverlayProps } from "./ShortcutHelpOverlay";
export { SmartDatePicker } from "./SmartDatePicker";
export { KebabMenu } from "./KebabMenu";
export type { KebabMenuOption } from "./KebabMenu";
export { CourseCard, CardActionIcon, paletteFor } from "./CourseCard";
export type { CourseCardProps, CourseCardMetric } from "./CourseCard";
export { WeakSkillsToggle } from "./WeakSkillsToggle";
export { useWeakSkills } from "./useWeakSkills";
export * from "./VirtualList";
